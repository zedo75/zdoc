import type { MergeRecord } from "@/features/mail-merge/core";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
    analyzeDocumentXml,
    evaluateExpression,
    renderDocumentXml,
    renderDocx,
} from "@/features/mail-merge/core";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function esc(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function p(text: string): string {
    return `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function cell(text: string): string {
    return `<w:tc>${p(text)}</w:tc>`;
}

function row(cells: string[]): string {
    return `<w:tr>${cells.map(cell).join("")}</w:tr>`;
}

function table(rows: string[][]): string {
    return `<w:tbl><w:tblPr/><w:tblGrid/>${rows.map(row).join("")}</w:tbl>`;
}

function doc(body: string): string {
    return `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;
}

function paragraphTexts(xml: string): string[] {
    const result: string[] = [];
    const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
    for (const para of paras) {
        const texts = [...para.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
        result.push(
            texts.join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        );
    }
    return result;
}

function tableRows(xml: string): string[][][] {
    const tables = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) ?? [];
    return tables.map((tbl) => {
        const rows = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
        return rows.map((tr) => {
            const cells = tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
            return cells.map((tc) => {
                const texts = [...tc.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(
                    (m) => m[1],
                );
                return texts.join("");
            });
        });
    });
}

function rowRecord(cells: string[]): MergeRecord {
    const record: MergeRecord = Object.create(null) as MergeRecord;
    Object.defineProperty(record, "__zdocCells", { value: cells, enumerable: false });
    return record;
}

describe("DOCX loop engine", () => {
    it("expands row mode across a horizontal column range and repeats template rows", () => {
        const template = doc(
            [
                p("家人信息如下："),
                p("{{#each row in:E..T cols:4 as:姓名,关系,单位,电话}}"),
                p("第{{@index}}组"),
                table([
                    ["姓名", "关系", "单位", "电话"],
                    ["{{姓名}}", "{{关系}}", "{{单位}}", "{{电话}}"],
                ]),
                p("{{/each}}"),
            ].join(""),
        );

        const record = rowRecord([
            "小王",
            "男",
            "科员",
            "2000.01",
            "A",
            "父子",
            "无",
            "111",
            "B",
            "母子",
            "无",
            "222",
            "C",
            "夫妻",
            "无",
            "333",
            "D",
            "姐弟",
            "无",
            "444",
        ]);

        const result = renderDocumentXml(template, [record]);
        expect(result.issues.filter((issue) => issue.level === "error")).toEqual([]);
        expect(result.mode).toBe("row");

        const rows = tableRows(result.xml)[0];
        expect(rows[0]).toEqual(["姓名", "关系", "单位", "电话"]);
        expect(rows.slice(1)).toEqual([
            ["A", "父子", "无", "111"],
            ["B", "母子", "无", "222"],
            ["C", "夫妻", "无", "333"],
            ["D", "姐弟", "无", "444"],
        ]);
        const texts = paragraphTexts(result.xml).filter((text) => text.trim());
        expect(texts).toContain("家人信息如下：");
        expect(texts.filter((text) => text.startsWith("第"))).toEqual([
            "第1组",
            "第2组",
            "第3组",
            "第4组",
        ]);
        expect(result.xml).not.toContain("#each");
    });

    it("expands group mode with @group, @index, @count and removes false if paragraphs", () => {
        const template = doc(
            [
                p("{{#each group by:姓名 keep:true}}"),
                p("{{#if @index == 1}}姓名：{{@group.姓名}}（共 {{@count}} 行）{{/if}}"),
                p("{{@index}}. {{家人姓名}} — {{家人关系}} — {{家人工作单位}}"),
                p("{{/each}}"),
            ].join(""),
        );

        const records: MergeRecord[] = [
            { 姓名: "小王", 家人姓名: "A", 家人关系: "父子", 家人工作单位: "无" },
            { 姓名: "", 家人姓名: "B", 家人关系: "母子", 家人工作单位: "无" },
            { 姓名: "", 家人姓名: "C", 家人关系: "夫妻", 家人工作单位: "无" },
            { 姓名: "小李", 家人姓名: "E", 家人关系: "父子", 家人工作单位: "无" },
            { 姓名: "", 家人姓名: "F", 家人关系: "母子", 家人工作单位: "无" },
        ];

        const result = renderDocumentXml(template, records);
        expect(result.issues.filter((issue) => issue.level === "error")).toEqual([]);
        expect(result.mode).toBe("group");

        const texts = paragraphTexts(result.xml).filter((text) => text.trim() !== "");
        expect(texts).toEqual([
            "姓名：小王（共 3 行）",
            "1. A — 父子 — 无",
            "2. B — 母子 — 无",
            "3. C — 夫妻 — 无",
            "姓名：小李（共 2 行）",
            "1. E — 父子 — 无",
            "2. F — 母子 — 无",
        ]);
    });

    it("outputs a table without placeholders only once", () => {
        const template = doc(
            [
                p("{{#each row in:A..D cols:2 as:x,y}}"),
                table([
                    ["固定表头", ""],
                    ["固定表尾", "只出现一次"],
                ]),
                p("{{/each}}"),
            ].join(""),
        );
        const record = rowRecord(["1", "2", "3", "4"]);

        const result = renderDocumentXml(template, [record]);
        expect(tableRows(result.xml)).toHaveLength(1);
        expect(tableRows(result.xml)[0]).toHaveLength(2);
    });

    it("reports markers inside table cells as each-crosses-table", () => {
        const template = doc(table([["{{#each row in:A..B cols:1 as:x}}"], ["x"]]));
        const info = analyzeDocumentXml(template);
        expect(info.issues.some((issue) => issue.code === "each-crosses-table")).toBe(true);
    });

    it("reports multiple tables in one loop", () => {
        const template = doc(
            [
                p("{{#each row in:A..B cols:1 as:x}}"),
                table([["{{x}}"]]),
                table([["static"]]),
                p("{{/each}}"),
            ].join(""),
        );
        const result = renderDocumentXml(template, [rowRecord(["1", "2"])]);
        expect(result.issues.some((issue) => issue.code === "each-multiple-tables")).toBe(true);
    });

    it("reports non-contiguous template rows", () => {
        const template = doc(
            [
                p("{{#each row in:A..B cols:1 as:x}}"),
                table([["header"], ["{{x}}"], ["static"], ["{{x}}"]]),
                p("{{/each}}"),
            ].join(""),
        );
        const result = renderDocumentXml(template, [rowRecord(["1", "2"])]);
        expect(result.issues.some((issue) => issue.code === "template-rows-not-contiguous")).toBe(
            true,
        );
    });

    it("rejects a column range that is not divisible by cols", () => {
        const template = doc(
            [p("{{#each row in:E..T cols:5 as:a,b,c,d,e}}"), p("{{a}}"), p("{{/each}}")].join(""),
        );
        const result = renderDocumentXml(template, [rowRecord(new Array(20).fill("x"))]);
        expect(result.issues.some((issue) => issue.code === "row-column-range-error")).toBe(true);
    });

    it("evaluates #if expressions with parentheses, &&, || and group metadata", () => {
        const scope = {
            fields: { 姓名: "小王" },
            index: 1,
            count: 3,
            groupIndex: 0,
            group: { 姓名: "小王" },
        };
        expect(
            evaluateExpression('(@index == 2 || @index == 3) && @group.姓名 == "小王"', scope)
                .value,
        ).toBe(true);
        expect(evaluateExpression("@groupIndex == 1 && @count == 3", scope).value).toBe(true);
        expect(evaluateExpression('@group.姓名 != "小李"', scope).value).toBe(true);
    });

    it("replaces a placeholder split across multiple runs", () => {
        const template = doc("<w:p><w:r><w:t>{{姓</w:t></w:r><w:r><w:t>名}}</w:t></w:r></w:p>");
        const result = renderDocumentXml(template, [{ 姓名: "张三" }]);
        expect(paragraphTexts(result.xml).filter((text) => text.trim())).toEqual(["张三"]);
    });

    it("renders only the requested group while keeping the original groupIndex", () => {
        const template = doc(
            [
                p("{{#each group by:姓名 keep:true}}"),
                p("{{@groupIndex}}:{{@index}} {{家人姓名}}"),
                p("{{/each}}"),
            ].join(""),
        );
        const records: MergeRecord[] = [
            { 姓名: "小王", 家人姓名: "A" },
            { 姓名: "", 家人姓名: "B" },
            { 姓名: "小李", 家人姓名: "E" },
            { 姓名: "", 家人姓名: "F" },
        ];

        const result = renderDocumentXml(template, records, { groupIndex: 1 });
        expect(paragraphTexts(result.xml).filter((text) => text.trim())).toEqual([
            "2:1 E",
            "2:2 F",
        ]);
    });

    it("resets @index per group when grouping by the household column", () => {
        const template = doc(
            [
                p("{{#each group by:姓名 keep:true}}"),
                p("{{#if @index == 1}}{{@group.姓名}}家庭（共{{@count}}行）{{/if}}"),
                table([
                    ["序号", "姓名", "关系"],
                    ["{{@index}}", "{{家人姓名}}", "{{家人关系}}"],
                ]),
                p("{{/each}}"),
            ].join(""),
        );

        const records: MergeRecord[] = [
            { 姓名: "小王", 家人姓名: "A", 家人关系: "父子" },
            { 姓名: "", 家人姓名: "B", 家人关系: "母子" },
            { 姓名: "", 家人姓名: "C", 家人关系: "夫妻" },
            { 姓名: "小李", 家人姓名: "E", 家人关系: "父子" },
            { 姓名: "", 家人姓名: "F", 家人关系: "母子" },
            { 姓名: "", 家人姓名: "G", 家人关系: "夫妻" },
            { 姓名: "", 家人姓名: "H", 家人关系: "姐弟" },
        ];

        const result = renderDocumentXml(template, records);
        expect(result.issues.some((issue) => issue.code === "group-all-singletons")).toBe(false);
        const rows = tableRows(result.xml)[0];
        expect(rows.slice(1).map((row) => row[0])).toEqual(["1", "2", "3", "1", "2", "3", "4"]);
        const texts = paragraphTexts(result.xml).filter((text) => text.trim());
        expect(texts.slice(0, 2)).toEqual(["小王家庭（共3行）", "小李家庭（共4行）"]);
    });

    it("warns when group by a unique column makes every group a single row", () => {
        const template = doc(
            [
                p("{{#each group by:家人姓名 keep:true}}"),
                p("{{#if @index == 1}}{{姓名}}家庭（共{{@count}}行）{{/if}}"),
                table([
                    ["序号", "姓名", "关系", "单位", "电话"],
                    [
                        "{{@index}}",
                        "{{家人姓名}}",
                        "{{家人关系}}",
                        "{{家人工作单位}}",
                        "{{家人联系方式}}",
                    ],
                ]),
                p("{{/each}}"),
            ].join(""),
        );

        const records: MergeRecord[] = [
            {
                姓名: "小王",
                家人姓名: "A",
                家人关系: "父子",
                家人工作单位: "无",
                家人联系方式: "1",
            },
            { 姓名: "", 家人姓名: "B", 家人关系: "母子", 家人工作单位: "无", 家人联系方式: "2" },
            { 姓名: "", 家人姓名: "C", 家人关系: "夫妻", 家人工作单位: "无", 家人联系方式: "3" },
            {
                姓名: "小李",
                家人姓名: "E",
                家人关系: "父子",
                家人工作单位: "无",
                家人联系方式: "4",
            },
            { 姓名: "", 家人姓名: "F", 家人关系: "母子", 家人工作单位: "无", 家人联系方式: "5" },
            { 姓名: "", 家人姓名: "G", 家人关系: "夫妻", 家人工作单位: "X", 家人联系方式: "6" },
            { 姓名: "", 家人姓名: "H", 家人关系: "姐弟", 家人工作单位: "大学", 家人联系方式: "7" },
        ];

        const result = renderDocumentXml(template, records);
        expect(result.issues.some((issue) => issue.code === "group-all-singletons")).toBe(true);
        const rows = tableRows(result.xml)[0];
        expect(rows).toHaveLength(8);
        expect(rows.slice(1).map((row) => row[0])).toEqual(["1", "1", "1", "1", "1", "1", "1"]);
    });

    it("renders a DOCX zip end-to-end, including headers", async () => {
        const template = doc(p("姓名：{{姓名}}"));
        const zip = new JSZip();
        zip.file("word/document.xml", template);
        zip.file("word/header1.xml", `<w:hdr xmlns:w="${W}">${p("页眉：{{姓名}}")}</w:hdr>`);
        const buffer = await zip.generateAsync({ type: "arraybuffer" });

        const result = await renderDocx(buffer, [{ 姓名: "张三" }]);
        expect(result.mode).toBe("none");

        const output = await JSZip.loadAsync(result.bytes);
        const xml = await output.file("word/document.xml")?.async("string");
        expect(xml).toContain("姓名：张三");
        const header = await output.file("word/header1.xml")?.async("string");
        expect(header).toContain("页眉：张三");
    });
});
