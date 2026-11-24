import { format as numfmtFormat } from "numfmt";

/**
 * 数值格式化适配层。
 *
 * 对外只暴露 `formatNumber(value, fmt)`；内部封装 numfmt（纯 JS，支持 zh_CN），
 * 任何解析 / 格式化异常都回退 `String(value)` 并通过 `onWarn` 报告。
 */
export function formatNumber(
    value: unknown,
    fmt: string,
    onWarn?: (message: string) => void,
): string {
    if (value == null) return "";

    const numeric = toFiniteNumber(value);
    if (numeric == null) {
        onWarn?.(`值「${safeString(value)}」不是可格式化的数值，已回退原值`);
        return safeString(value);
    }

    try {
        return numfmtFormat(fmt, numeric, {
            locale: "zh_CN",
            throws: true,
            nbsp: false,
        });
    } catch (error) {
        onWarn?.(
            `数字格式「${fmt}」无法应用：${error instanceof Error ? error.message : String(error)}`,
        );
        return safeString(value);
    }
}

/** 判断一个值能否按数值参与 Excel TEXT 规则格式化 */
export function toFiniteNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
    }
    if (typeof value === "boolean") return value ? 1 : 0;
    return null;
}

function safeString(value: unknown): string {
    try {
        return String(value);
    } catch {
        return "";
    }
}
