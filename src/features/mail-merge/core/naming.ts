import type { FormatterRegistry } from "./formatters";

import { createRegistry, toText } from "./formatters";
import { renderTemplate } from "./template";

export interface MergeFileNameContext {
    /** 从 1 开始的记录序号 */
    index: number;
    /** Excel 实际行号（含表头） */
    rowNumber: number;
    date?: Date;
    templateName?: string;
}

const DEFAULT_PATTERN = "合并结果_{index}";

/**
 * 展开输出文件名（不含扩展名）。
 *
 * 支持：
 * - `{{列名}}` / `{{列名 | "000"}}`：与文档模板相同的变量与管道；
 * - `{index}`：记录序号（1 开始）；
 * - `{row}`：Excel 行号；
 * - `{date}` / `{time}` / `{template}`。
 *
 * 结果统一清理 Windows 非法字符；为空时回退到默认模式。
 */
export function expandMergeFileName(
    pattern: string,
    record: Record<string, unknown>,
    ctx: MergeFileNameContext,
    registry?: FormatterRegistry,
): string {
    const text = (pattern || "").trim() || DEFAULT_PATTERN;
    const date = ctx.date ?? new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");

    const builtins: Record<string, string> = {
        index: String(ctx.index),
        row: String(ctx.rowNumber),
        date: `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
        time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
        template: ctx.templateName ?? "",
    };

    let expanded = text;
    for (const [key, value] of Object.entries(builtins)) {
        expanded = expanded.split(`{${key}}`).join(value);
    }

    const activeRegistry = registry ?? createRegistry().registry;
    const rendered = renderTemplate(expanded, record, { registry: activeRegistry });
    if (rendered.text.trim() !== "") expanded = rendered.text;

    const stem = sanitizeFileStem(expanded)
        .replace(/\.(docx?|wps)$/i, "")
        .trim();
    return stem || `合并结果_${ctx.index}`;
}

/** 文件名校验/清理；空字符串表示调用方需要回退 */
export function sanitizeFileStem(raw: string): string {
    return (raw || "")
        .replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^[.\s]+|[.\s]+$/g, "")
        .slice(0, 120)
        .trim();
}

/** 根据表头生成一个可用的默认文件名模式 */
export function defaultNamePattern(headers: readonly string[]): string {
    const first = headers.find((header) => header.trim() !== "");
    return first ? `{{${first}}}` : DEFAULT_PATTERN;
}

/**
 * 记录中用于展示的“主键”文本。
 * 用于没有匹配到字段时的兜底文件名。
 */
export function recordFallbackName(record: Record<string, unknown>, index: number): string {
    for (const [key, value] of Object.entries(record)) {
        if (key.startsWith("__zdoc")) continue;
        const text = toText(value).trim();
        if (text) return `${text}_${index}`;
    }
    return `合并结果_${index}`;
}
