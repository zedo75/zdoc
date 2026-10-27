/**
 * 把任意异常转换成可读字符串。
 *
 * WPS 的 COM 调用经常抛出普通对象或字符串，不能只判断 `instanceof Error`。
 */
export function errorText(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}
