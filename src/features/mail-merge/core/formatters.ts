import type {
    Formatter,
    FormatterArg,
    FormatterContext,
    FormatterHelpers,
    FormatterResult,
} from "./types";

import { compileCustomFormatter, validateFormatterName } from "./custom";
import { formatNumber } from "./format";
import { rmbUpper } from "./rmb";

/** 按码点计算字符串长度，`[...text].length`，不做全角 / 半角折算 */
export function displayWidth(text: unknown): number {
    return [...toText(text)].length;
}

/** 无法格式化的值统一转成可读文本 */
export function toText(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value);
    }
    if (value instanceof Date) return value.toISOString();

    try {
        return JSON.stringify(value) ?? "";
    } catch {
        return String(value);
    }
}

/** 供格式化器 / 自定义函数使用的只读 helpers */
export const FORMATTER_HELPERS: Readonly<FormatterHelpers> = Object.freeze({
    displayWidth,
});

/** 兼容中文括号等常见“看起来像数字”的输入 */
function numericArg(arg: FormatterArg | undefined, fallback: number): number {
    if (typeof arg === "number" && Number.isFinite(arg)) return arg;
    if (typeof arg === "string" && arg.trim() !== "") {
        const n = Number(arg);
        if (Number.isFinite(n)) return n;
    }
    return fallback;
}

function pad(value: unknown, args: FormatterArg[], side: "left" | "right"): FormatterResult {
    const text = toText(value);
    const length = Math.max(0, Math.trunc(numericArg(args[0], 0)));
    let char = args[1] == null ? "0" : toText(args[1]);
    if (char === "") char = "0";

    const current = displayWidth(text);
    if (current >= length) return text;

    const charWidth = Math.max(1, displayWidth(char));
    const count = Math.ceil((length - current) / charWidth);
    const padding = char.repeat(count);
    return side === "left" ? padding + text : text + padding;
}

function format(value: unknown, args: FormatterArg[], ctx: FormatterContext): FormatterResult {
    const pattern = args[0];
    if (typeof pattern !== "string") {
        ctx.warn("format 需要一个字符串格式参数");
        return toText(value);
    }
    return formatNumber(value, pattern, ctx.warn);
}

function width(value: unknown, args: FormatterArg[], ctx: FormatterContext): FormatterResult {
    const chars = Math.trunc(numericArg(args[0], -1));
    if (chars < 0) {
        ctx.warn("width(n) 需要一个非负整数参数");
        return toText(value);
    }

    const text = toText(value);
    if (ctx.helpers.displayWidth(text) === chars) return text;
    return { text, ops: [{ type: "fitWidth", chars }] };
}

function rmb(value: unknown, _args: FormatterArg[], ctx: FormatterContext): FormatterResult {
    const text = rmbUpper(value);
    if (!text) {
        ctx.warn(`金额「${toText(value)}」无法转换为人民币大写`);
        return toText(value);
    }
    return text;
}

/**
 * 内置格式化器。键名大小写敏感，避免 `PADL` / `padl` 两套行为。
 */
export const BUILTIN_FORMATTERS: Readonly<Record<string, Formatter>> = Object.freeze({
    format,
    padl: (value, args) => pad(value, args, "left"),
    padr: (value, args) => pad(value, args, "right"),
    upper: (value) => toText(value).toUpperCase(),
    lower: (value) => toText(value).toLowerCase(),
    trim: (value) => toText(value).trim(),
    width,
    rmbUpper: rmb,
});

export const BUILTIN_FORMATTER_NAMES: ReadonlySet<string> = new Set(
    Object.keys(BUILTIN_FORMATTERS),
);

/** 模板里允许出现的函数名（含自定义） */
export interface FormatterLookup {
    get(name: string): Formatter | undefined;
    has(name: string): boolean;
    names(): string[];
}

export interface CustomFormatterDefinition {
    name: string;
    body: string;
}

export interface CustomFormatterError {
    name: string;
    message: string;
}

export interface CreateRegistryResult {
    registry: FormatterRegistry;
    errors: CustomFormatterError[];
}

/** 内置 + 自定义格式化器注册表 */
export class FormatterRegistry implements FormatterLookup {
    private readonly formatters = new Map<string, Formatter>();

    constructor(seed: Readonly<Record<string, Formatter>> = BUILTIN_FORMATTERS) {
        for (const [name, formatter] of Object.entries(seed)) {
            this.formatters.set(name, formatter);
        }
    }

    get(name: string): Formatter | undefined {
        return this.formatters.get(name);
    }

    has(name: string): boolean {
        return this.formatters.has(name);
    }

    names(): string[] {
        return [...this.formatters.keys()];
    }

    /** 注册自定义函数；内置函数名不可覆盖，语法错误不会污染注册表 */
    registerCustom(name: string, body: string): { ok: true } | { ok: false; error: string } {
        const nameError = validateFormatterName(name);
        if (nameError) return { ok: false, error: nameError };
        if (BUILTIN_FORMATTER_NAMES.has(name.trim())) {
            return { ok: false, error: `「${name.trim()}」是内置函数，不能覆盖` };
        }

        const compiled = compileCustomFormatter(body);
        if (!compiled.ok) return { ok: false, error: compiled.error };

        this.formatters.set(name.trim(), compiled.formatter);
        return { ok: true };
    }

    unregisterCustom(name: string): boolean {
        if (BUILTIN_FORMATTER_NAMES.has(name)) return false;
        return this.formatters.delete(name);
    }

    /** 除内置函数外的全部函数名 */
    customNames(): string[] {
        return this.names().filter((name) => !BUILTIN_FORMATTER_NAMES.has(name));
    }
}

/**
 * 从 UI 持久化的定义构造注册表。
 * 每个定义都独立编译，错误只影响该定义本身。
 */
export function createRegistry(
    custom: readonly CustomFormatterDefinition[] = [],
): CreateRegistryResult {
    const registry = new FormatterRegistry();
    const errors: CustomFormatterError[] = [];

    for (const def of custom) {
        const result = registry.registerCustom(def.name, def.body);
        if (!result.ok) errors.push({ name: def.name, message: result.error });
    }

    return { registry, errors };
}
