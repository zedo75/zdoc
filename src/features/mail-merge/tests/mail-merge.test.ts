import { describe, expect, it } from "vitest";

import {
    createRegistry,
    expandTableRows,
    formatNumber,
    FormatterRegistry,
    integerToRmbUpper,
    parsePlaceholderContent,
    parseTemplate,
    renderTemplate,
    rmbUpper,
    splitTopLevel,
} from "@/features/mail-merge/core";

describe("formatNumber", () => {
    it("formats numeric values with Excel TEXT rules", () => {
        expect(formatNumber(1234.5, "0.00")).toBe("1234.50");
        expect(formatNumber("1234.5", "0.00")).toBe("1234.50");
        expect(formatNumber(7, "000")).toBe("007");
        expect(formatNumber(-12.3, "000")).toBe("-012");
    });

    it("falls back to original text and warns for non-numeric values", () => {
        const warnings: string[] = [];
        expect(formatNumber("abc", "0.00", (msg) => warnings.push(msg))).toBe("abc");
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("不是可格式化的数值");
    });

    it("falls back when the pattern is invalid", () => {
        const warnings: string[] = [];
        expect(formatNumber(12, "!!!invalid!!!", (msg) => warnings.push(msg))).toBe("12");
        expect(warnings[0]).toContain("无法应用");
    });
});

describe("pipeline parser", () => {
    it("splits only on top-level pipes", () => {
        expect(splitTopLevel('x | "a|b" | padl(3, "|")', "|")).toEqual([
            "x ",
            ' "a|b" ',
            ' padl(3, "|")',
        ]);
    });

    it("keeps a quoted format string containing a pipe as one step", () => {
        const parsed = parsePlaceholderContent('金额 | "a|b"');
        expect(parsed.placeholder?.steps).toEqual([
            { kind: "format", pattern: "a|b", source: '"a|b"' },
        ]);
        expect(parsed.issues.some((issue) => issue.code === "INVALID_PIPE")).toBe(false);
    });

    it("rejects variable references as pipe arguments", () => {
        const result = renderTemplate("{{ x | padl(n, '0') }}", { x: 1, n: 2 });
        expect(result.issues.some((issue) => issue.code === "INVALID_PIPE")).toBe(true);
        expect(result.text).toBe("1");
    });
});

describe("built-in formatters", () => {
    it("formats with a quoted Excel pattern", () => {
        expect(renderTemplate('{{金额 | "0.00"}}', { 金额: 1234.5 }).text).toBe("1234.50");
        const fallback = renderTemplate('{{金额 | "0.00"}}', { 金额: "abc" });
        expect(fallback.text).toBe("abc");
        expect(fallback.issues.some((issue) => issue.code === "FORMATTER_WARNING")).toBe(true);
    });

    it("pads at the string layer", () => {
        expect(renderTemplate('{{序号 | padl(3,"0")}}', { 序号: 7 }).text).toBe("007");
        expect(renderTemplate('{{序号 | padl(3,"0")}}', { 序号: 1234 }).text).toBe("1234");
        expect(renderTemplate('{{序号 | padl(3,"0")}}', { 序号: "ab" }).text).toBe("0ab");
        expect(renderTemplate('{{序号 | padr(4,"x")}}', { 序号: "ab" }).text).toBe("abxx");
    });

    it("carries fitWidth only when width differs", () => {
        const short = renderTemplate("{{姓名 | width(3)}}", { 姓名: "张三" });
        expect(short.text).toBe("张三");
        expect(short.ops).toEqual([
            expect.objectContaining({ op: { type: "fitWidth", chars: 3 } }),
        ]);

        const exact = renderTemplate("{{姓名 | width(3)}}", { 姓名: "欧阳修" });
        expect(exact.text).toBe("欧阳修");
        expect(exact.ops).toEqual([]);
    });

    it("chains format then padding", () => {
        const result = renderTemplate('{{金额 | "0.00" | padl(8," ")}}', { 金额: 1234.5 });
        expect(result.text).toBe(" 1234.50");
    });

    it("keeps accumulated ops when later steps only change text", () => {
        const result = renderTemplate('{{姓名 | width(3) | padr(4," ")}}', { 姓名: "张三" });
        expect(result.text).toBe("张三  ");
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0].op).toEqual({ type: "fitWidth", chars: 3 });
        expect(result.ops[0].end - result.ops[0].start).toBe(4);
    });

    it("applies upper / lower / trim and supports parentheses omission", () => {
        expect(renderTemplate("{{x | upper}}", { x: "Abc" }).text).toBe("ABC");
        expect(renderTemplate("{{x | lower}}", { x: "AbC" }).text).toBe("abc");
        expect(renderTemplate("{{x | trim}}", { x: "  a  " }).text).toBe("a");
    });

    it("warns and continues for unknown formatters", () => {
        const result = renderTemplate("{{x | nope(1) | upper}}", { x: "abc" });
        expect(result.text).toBe("ABC");
        expect(result.issues.some((issue) => issue.code === "UNKNOWN_FORMATTER")).toBe(true);
    });
});

describe("variables and control flow", () => {
    it("resolves Chinese keys and dot paths", () => {
        const result = renderTemplate("{{部门.名称}}/{{标题}}", {
            标题: "通知",
            部门: { 名称: "办公室" },
        });
        expect(result.text).toBe("办公室/通知");
    });

    it("renders this as the current loop item", () => {
        const result = renderTemplate("{{#each 列表}}{{this}}{{/each}}", { 列表: ["A", "B"] });
        expect(result.text).toBe("AB");
    });

    it("renders undefined paths as empty and warns without stopping", () => {
        const result = renderTemplate("A{{部门.不存在}}B{{标题}}", { 标题: "ok" });
        expect(result.text).toBe("ABok");
        expect(result.issues.some((issue) => issue.code === "UNDEFINED_PATH")).toBe(true);
    });

    it("treats non-array each data as empty and warns", () => {
        const result = renderTemplate("{{#each 列表}}x{{/each}}", { 列表: "not-array" });
        expect(result.text).toBe("");
        expect(result.issues.some((issue) => issue.code === "EACH_NOT_ARRAY")).toBe(true);
    });

    it("renders nested loops without falling back to outer keys", () => {
        const template = "{{#each 主}}[{{名称}}:{{#each 明细}}{{名称}}/{{金额}}{{/each}}]{{/each}}";
        const result = renderTemplate(template, {
            主: [
                {
                    名称: "A",
                    明细: [{ 名称: "内1", 金额: 1 }],
                },
                {
                    名称: "B",
                    明细: [{ 金额: 2 }],
                },
            ],
        });

        expect(result.text).toBe("[A:内1/1][B:/2]");
        expect(result.issues.filter((issue) => issue.code === "UNDEFINED_PATH")).toHaveLength(1);
    });

    it("reports unclosed and extra loop markers as errors", () => {
        expect(
            parseTemplate("{{#each 列表}}x").issues.some(
                (issue) => issue.code === "UNCLOSED_EACH" && issue.level === "error",
            ),
        ).toBe(true);
        expect(
            parseTemplate("x{{/each}}").issues.some(
                (issue) => issue.code === "UNEXPECTED_EACH_END" && issue.level === "error",
            ),
        ).toBe(true);
    });
});

describe("custom formatters", () => {
    it("compiles a function body and runs it", () => {
        const registry = new FormatterRegistry();
        expect(
            registry.registerCustom(
                "yuanToFen",
                "const n = Number(value); return isNaN(n) ? String(value) : (n / 100).toFixed(2);",
            ).ok,
        ).toBe(true);

        const result = renderTemplate("{{金额 | yuanToFen}}", { 金额: 1234 }, { registry });
        expect(result.text).toBe("12.34");
    });

    it("rejects syntax errors without polluting the registry", () => {
        const registry = new FormatterRegistry();
        const result = registry.registerCustom("broken", "return (");
        expect(result.ok).toBe(false);
        expect(registry.has("broken")).toBe(false);
    });

    it("does not allow overriding built-ins", () => {
        const registry = new FormatterRegistry();
        const result = registry.registerCustom("padl", "return 'x';");
        expect(result.ok).toBe(false);
        expect(renderTemplate('{{x | padl(2,"0")}}', { x: "a" }, { registry }).text).toBe("0a");
    });

    it("falls back to the original value when a formatter throws", () => {
        const registry = new FormatterRegistry();
        expect(registry.registerCustom("boom", "return missing.value;").ok).toBe(true);

        const result = renderTemplate("{{x | boom}}", { x: 5 }, { registry });
        expect(result.text).toBe("5");
        expect(result.issues.some((issue) => issue.code === "FORMATTER_ERROR")).toBe(true);
    });

    it("collects compile errors per definition", () => {
        const { registry, errors } = createRegistry([
            { name: "good", body: "return String(value);" },
            { name: "bad name", body: "return 'x';" },
        ]);
        expect(registry.has("good")).toBe(true);
        expect(errors).toHaveLength(1);
    });
});

describe("rmbUpper", () => {
    it.each([
        [0, "零元整"],
        [10, "壹拾元整"],
        [1001, "壹仟零壹元整"],
        [100000001, "壹亿零壹元整"],
        [100010001, "壹亿零壹万零壹元整"],
        [1.05, "壹元零伍分"],
        [1.5, "壹元伍角整"],
        [0.5, "伍角整"],
        [0.05, "伍分"],
        [0.55, "伍角伍分"],
        [-12.34, "负壹拾贰元叁角肆分"],
    ])("formats %s as %s", (value, expected) => {
        expect(rmbUpper(value)).toBe(expected);
    });

    it("formats integer sections", () => {
        expect(integerToRmbUpper(10010)).toBe("壹万零壹拾");
    });

    it("returns empty for invalid input", () => {
        expect(rmbUpper("abc")).toBe("");
    });
});

describe("table row expansion", () => {
    it("expands a single loop and removes marker rows", () => {
        const rows = [
            ["{{#each 列表}}"],
            ["{{姓名}}", "{{部门}}", '{{金额 | "0.00"}}'],
            ["{{/each}}"],
        ];
        const result = expandTableRows(rows, {
            列表: [
                { 姓名: "张三", 部门: "研发", 金额: 1234.5 },
                { 姓名: "李四", 部门: "财务", 金额: 7 },
            ],
        });

        expect(result.rows).toEqual([
            ["张三", "研发", "1234.50"],
            ["李四", "财务", "7.00"],
        ]);
        expect(result.issues.filter((issue) => issue.level === "error")).toEqual([]);
    });

    it("deletes the template region for an empty array", () => {
        const result = expandTableRows([["{{#each 列表}}"], ["{{姓名}}"], ["{{/each}}"]], {
            列表: [],
        });
        expect(result.rows).toEqual([]);
        expect(result.rows.join("")).not.toContain("{{");
    });

    it("expands nested loops bottom-up", () => {
        const rows = [
            ["{{#each 主表}}"],
            ["{{名称}}", ""],
            ["{{#each 明细}}"],
            ["", "{{项目}}", "{{金额}}"],
            ["{{/each}}"],
            ["{{/each}}"],
        ];
        const result = expandTableRows(rows, {
            主表: [
                {
                    名称: "A",
                    明细: [
                        { 项目: "a1", 金额: 1 },
                        { 项目: "a2", 金额: 2 },
                    ],
                },
                {
                    名称: "B",
                    明细: [
                        { 项目: "b1", 金额: 3 },
                        { 项目: "b2", 金额: 4 },
                    ],
                },
            ],
        });

        expect(result.rows).toEqual([
            ["A", ""],
            ["", "a1", "1"],
            ["", "a2", "2"],
            ["B", ""],
            ["", "b1", "3"],
            ["", "b2", "4"],
        ]);
    });

    it("supports multiple inline loops in one cell without cloning the row", () => {
        const rows = [["{{#each 甲}}{{姓名}}{{/each}}|{{#each 乙}}{{姓名}}{{/each}}"]];
        const result = expandTableRows(rows, {
            甲: [{ 姓名: "A" }, { 姓名: "B" }],
            乙: [{ 姓名: "C" }],
        });
        expect(result.rows).toEqual([["AB|C"]]);
    });

    it("does not fall back to an outer key inside a nested loop", () => {
        const rows = [
            ["{{#each 主}}"],
            ["{{名称}}", "{{#each 明细}}{{名称}}{{/each}}"],
            ["{{/each}}"],
        ];
        const result = expandTableRows(rows, {
            主: [{ 名称: "外层", 明细: [{ 其他: 1 }] }],
        });
        expect(result.rows).toEqual([["外层", ""]]);
        expect(result.issues.some((issue) => issue.code === "UNDEFINED_PATH")).toBe(true);
    });
});
