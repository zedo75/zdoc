import type { Formatter, FormatterArg, FormatterContext, FormatterResult } from "./types";

const NAME_RE = /^[A-Za-z_$][\w$]*$/;
const SLOW_CALL_MS = 50;

export interface CompileSuccess {
    ok: true;
    formatter: Formatter;
}

export interface CompileFailure {
    ok: false;
    error: string;
}

export type CompileResult = CompileSuccess | CompileFailure;

/** 自定义格式化器名称校验：只允许 ASCII 标识符，避免与内置函数混淆 */
export function validateFormatterName(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return "函数名不能为空";
    if (!NAME_RE.test(trimmed)) return "函数名只能包含字母、数字、下划线或 $，且不能以数字开头";
    return null;
}

/**
 * 编译用户编写的函数体。
 *
 * 使用 `new Function` 而非 eval：语法错误在构造期直接返回给编辑器，
 * 不会进入注册表；运行期错误由调用方 try/catch。
 */
export function compileCustomFormatter(body: string): CompileResult {
    const code = body.trim();
    if (!code) return { ok: false, error: "函数体不能为空" };

    let fn: (value: unknown, args: FormatterArg[], ctx: FormatterContext) => FormatterResult;
    try {
        fn = new Function("value", "args", "ctx", `"use strict";\n${body}`) as typeof fn;
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    const formatter: Formatter = (value, args, ctx) => {
        const started = now();
        const frozenCtx: FormatterContext = Object.freeze({
            key: ctx.key,
            warn: ctx.warn,
            helpers: ctx.helpers,
        });

        const result = fn(value, args, frozenCtx);
        const elapsed = now() - started;
        if (elapsed > SLOW_CALL_MS) {
            ctx.warn(
                `自定义函数执行耗时 ${elapsed.toFixed(1)}ms，超过 ${SLOW_CALL_MS}ms，` +
                    "可能影响批量合并性能",
            );
        }
        return result;
    };

    return { ok: true, formatter };
}

function now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}
