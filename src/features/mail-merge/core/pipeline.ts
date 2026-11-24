import type { FormatterLookup } from "./formatters";
import type {
    FormatOp,
    FormatterArg,
    FormatterResult,
    FormatterResultObject,
    MergeIssue,
    PipeStep,
    Placeholder,
    RenderedFormatOp,
} from "./types";

import { BUILTIN_FORMATTERS, FORMATTER_HELPERS, toText } from "./formatters";

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const VARIABLE_RE = /^[^\s{}|]+(?:\.[^\s{}|]+)*$/;

/** 变量路径是否合法（允许中文、字母、数字、下划线、点路径） */
export function isValidVariableKey(key: string): boolean {
    return key === "this" || VARIABLE_RE.test(key);
}

/**
 * 解析一个占位符的内容，如 `金额 | "0.00" | padl(8, " ")`。
 *
 * 管道按引号 / 括号深度切分，不能直接 split("|")。
 */
export function parsePlaceholderContent(
    content: string,
    raw = content,
): {
    placeholder?: Placeholder;
    issues: MergeIssue[];
} {
    const issues: MergeIssue[] = [];
    const parts = splitTopLevel(content, "|");
    const key = (parts.shift() ?? "").trim();

    if (!key) {
        issues.push({
            level: "warn",
            code: "INVALID_PLACEHOLDER",
            message: `占位符「${raw}」缺少变量名`,
        });
        return { issues };
    }
    if (!isValidVariableKey(key)) {
        issues.push({
            level: "warn",
            code: "INVALID_PLACEHOLDER",
            message: `占位符变量名「${key}」非法`,
            key,
        });
        return { issues };
    }

    const steps: PipeStep[] = [];
    for (const part of parts) {
        steps.push(parsePipeStep(part, issues));
    }

    return {
        placeholder: {
            raw,
            key,
            steps,
        },
        issues,
    };
}

function parsePipeStep(source: string, issues: MergeIssue[]): PipeStep {
    const text = source.trim();

    if (text.startsWith('"') || text.startsWith("'")) {
        const literal = parseStringLiteral(text, 0);
        if (!literal || text.slice(literal.end).trim() !== "") {
            const reason = "字符串字面量后存在多余内容（字符串内使用引号请转义）";
            issues.push({
                level: "warn",
                code: "INVALID_PIPE",
                message: `无法解析管道段「${text}」：${reason}`,
            });
            return { kind: "invalid", source: text, reason };
        }
        return { kind: "format", pattern: literal.value, source: text };
    }

    // name(args)
    const call = /^([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)\s*$/.exec(text);
    if (call) {
        const name = call[1];
        const argsText = call[2].trim();
        const args: FormatterArg[] = [];

        if (argsText !== "") {
            for (const argText of splitTopLevel(argsText, ",")) {
                const parsed = parseLiteral(argText);
                if (!parsed.ok) {
                    const reason = "参数只支持数字、字符串字面量、true/false/null";
                    issues.push({
                        level: "warn",
                        code: "INVALID_PIPE",
                        message: `无法解析管道段「${text}」：${reason}`,
                    });
                    return { kind: "invalid", source: text, reason };
                }
                args.push(parsed.value);
            }
        }

        return { kind: "call", name, args, source: text };
    }

    // upper / lower / trim 这类无参函数允许省略括号
    if (IDENTIFIER_RE.test(text)) {
        return { kind: "call", name: text, args: [], source: text };
    }

    const reason = '只支持 "格式字符串" 或 函数名(字面量参数)';
    issues.push({
        level: "warn",
        code: "INVALID_PIPE",
        message: `无法解析管道段「${text}」：${reason}`,
    });
    return { kind: "invalid", source: text, reason };
}

/** 顶层切分：忽略引号内与括号内的分隔符 */
export function splitTopLevel(input: string, separator: string): string[] {
    const result: string[] = [];
    let buffer = "";
    let quote: string | null = null;
    let escaped = false;
    let depth = 0;

    for (const char of input) {
        if (quote) {
            buffer += char;
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            quote = char;
            buffer += char;
            continue;
        }
        if (char === "(") depth++;
        if (char === ")") depth = Math.max(0, depth - 1);
        if (char === separator && depth === 0) {
            result.push(buffer);
            buffer = "";
            continue;
        }
        buffer += char;
    }

    result.push(buffer);
    return result;
}

function parseStringLiteral(text: string, start: number): { value: string; end: number } | null {
    const quote = text[start];
    if (quote !== '"' && quote !== "'") return null;

    let value = "";
    let i = start + 1;
    while (i < text.length) {
        const char = text[i];
        if (char === "\\") {
            const next = text[i + 1];
            if (next == null) return null;
            value += unescapeChar(next);
            i += 2;
            continue;
        }
        if (char === quote) return { value, end: i + 1 };
        value += char;
        i++;
    }
    return null;
}

function unescapeChar(char: string): string {
    if (char === "n") return "\n";
    if (char === "r") return "\r";
    if (char === "t") return "\t";
    return char;
}

function parseLiteral(text: string): { ok: true; value: FormatterArg } | { ok: false } {
    const trimmed = text.trim();
    if (trimmed === "") return { ok: false };

    if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
        const literal = parseStringLiteral(trimmed, 0);
        if (!literal || trimmed.slice(literal.end).trim() !== "") return { ok: false };
        return { ok: true, value: literal.value };
    }
    if (trimmed === "true") return { ok: true, value: true };
    if (trimmed === "false") return { ok: true, value: false };
    if (trimmed === "null") return { ok: true, value: null };
    if (NUMBER_RE.test(trimmed)) {
        const n = Number(trimmed);
        if (Number.isFinite(n)) return { ok: true, value: n };
    }
    return { ok: false };
}

export interface ApplyPipesOptions {
    registry?: FormatterLookup | Readonly<Record<string, import("./types").Formatter>>;
    key: string;
    issues: MergeIssue[];
}

/**
 * 从左到右执行管道。
 *
 * 每一步的 `value` 是上一步输出的文本；格式指令独立累积，
 * 最终由文档层施加到占位符完整渲染结果上。
 */
export function applyPipes(
    value: unknown,
    steps: readonly PipeStep[],
    options: ApplyPipesOptions,
): { text: string; ops: FormatOp[] } {
    const { registry = BUILTIN_FORMATTERS, key, issues } = options;
    const lookup = isLookup(registry) ? registry : asLookup(registry);

    let text = toText(value);
    const ops: FormatOp[] = [];

    for (const step of steps) {
        if (step.kind === "invalid") {
            // 解析阶段已经记过 warning，这里只跳过
            continue;
        }

        const name = step.kind === "format" ? "format" : step.name;
        const args: FormatterArg[] = step.kind === "format" ? [step.pattern] : step.args;
        const formatter = lookup.get(name);
        if (!formatter) {
            issues.push({
                level: "warn",
                code: "UNKNOWN_FORMATTER",
                message: `未知格式化器「${name}」，已跳过该步骤`,
                key,
            });
            continue;
        }

        const ctx = {
            key,
            helpers: FORMATTER_HELPERS,
            warn: (message: string) => {
                issues.push({
                    level: "warn",
                    code: "FORMATTER_WARNING",
                    message,
                    key,
                });
            },
        };

        try {
            const result = formatter(text, args, ctx);
            const normalized = normalizeResult(result, key, issues, text);
            text = normalized.text;
            ops.push(...normalized.ops);
        } catch (error) {
            issues.push({
                level: "warn",
                code: "FORMATTER_ERROR",
                message: `格式化器「${name}」执行失败：${
                    error instanceof Error ? error.message : String(error)
                }`,
                key,
            });
            return { text: toText(value), ops: [] };
        }
    }

    return { text, ops };
}

function isLookup(
    value: FormatterLookup | Readonly<Record<string, import("./types").Formatter>>,
): value is FormatterLookup {
    return typeof (value as FormatterLookup).get === "function";
}

function asLookup(
    registry: Readonly<Record<string, import("./types").Formatter>>,
): FormatterLookup {
    return {
        get: (name) => registry[name],
        has: (name) => name in registry,
        names: () => Object.keys(registry),
    };
}

function normalizeResult(
    result: FormatterResult,
    key: string,
    issues: MergeIssue[],
    fallback: string,
): { text: string; ops: FormatOp[] } {
    if (typeof result === "string") return { text: result, ops: [] };

    if (!result || typeof result !== "object" || typeof result.text !== "string") {
        issues.push({
            level: "warn",
            code: "INVALID_FORMATTER_RESULT",
            message: "格式化器必须返回字符串或 { text, ops } 对象，已回退原值",
            key,
        });
        return { text: fallback, ops: [] };
    }

    const obj = result as FormatterResultObject;
    const ops = Array.isArray(obj.ops) ? obj.ops.filter(isFormatOp) : [];
    if (obj.ops && !Array.isArray(obj.ops)) {
        issues.push({
            level: "warn",
            code: "INVALID_FORMATTER_RESULT",
            message: "格式化器返回的 ops 不是数组，已忽略",
            key,
        });
    }
    return { text: obj.text, ops };
}

function isFormatOp(op: unknown): op is FormatOp {
    if (!op || typeof op !== "object") return false;
    const candidate = op as Partial<FormatOp> & { type?: unknown };
    if (candidate.type === "fitWidth") {
        return Number.isFinite((candidate as { chars?: number }).chars);
    }
    if (candidate.type === "fontSpacing") {
        return Number.isFinite((candidate as { points?: number }).points);
    }
    return false;
}

/** 供模板渲染器把 ops 关联到最终文本位置 */
export function toRenderedOps(
    start: number,
    text: string,
    ops: readonly FormatOp[],
    key: string,
): RenderedFormatOp[] {
    const end = start + text.length;
    if (start === end) return [];
    return ops.map((op) => ({ start, end, op, key }));
}
