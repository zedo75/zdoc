/**
 * 文件路径字符串工具。
 *
 * 只做纯字符串解析，不访问 WPS、文件系统或浏览器 API，
 * 因此可以同时被 ribbon 命令、任务窗格和单元测试复用。
 */

/** 统一为“正斜杠 + 小写”，用于路径比较 */
export function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").toLowerCase();
}

/** 忽略斜杠方向和大小写比较两个路径 */
export function samePath(a: string, b: string): boolean {
    return normalizePath(a) === normalizePath(b);
}

/** 取文件名（含扩展名） */
export function fileNameOf(path: string): string {
    const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
    return index >= 0 ? path.slice(index + 1) : path;
}

/** 取所在目录（不含末尾分隔符） */
export function dirOf(path: string): string {
    const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
    return index >= 0 ? path.slice(0, index) : "";
}

/** 取小写扩展名（含点），无扩展名时返回空串 */
export function extOf(path: string): string {
    const match = fileNameOf(path).match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : "";
}

/** 取不含扩展名的文件名 */
export function baseNameOf(path: string): string {
    const name = fileNameOf(path);
    const ext = extOf(path);
    return ext ? name.slice(0, name.length - ext.length) : name;
}

/** 拼接目录与文件名，尽量沿用目录已有的分隔符风格 */
export function joinPath(dir: string, name: string): string {
    const separator = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
    return `${dir.replace(/[\\/]+$/, "")}${separator}${name}`;
}
