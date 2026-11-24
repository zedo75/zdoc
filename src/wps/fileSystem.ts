/**
 * WPS 文件系统原语
 *
 * WPS JSA 没有 `fs`，文件读写统一走 `Application.FileSystem`；
 * 这里只做「通用文件操作」，不含任何业务路径约定（配置路径见 `config/persist.ts`）。
 */

/** 判断路径是否存在；非 WPS 环境或空路径时返回 false */
export function pathExists(path: string): boolean {
    if (!path) return false;
    try {
        return Application.FileSystem.Exists(path);
    } catch {
        return false;
    }
}

/** 确保目录存在（不存在则创建） */
export function ensureDirectory(dir: string): void {
    if (!dir) return;
    const fs = Application.FileSystem;
    if (!fs.Exists(dir)) fs.Mkdir(dir);
}

/** 删除文件；失败时抛出原始异常，由调用方决定提示文案 */
export function removeFile(path: string): void {
    Application.FileSystem.Remove(path);
}

/**
 * 写入文本文件（目录不存在时自动创建）
 * @param filePath 目标文件完整路径
 * @param content 要写入的字符串
 * @returns 是否写入成功
 */
function writeTextFile(filePath: string, content: string): boolean {
    const fs = Application.FileSystem;
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (!fs.Exists(dir)) {
        fs.Mkdir(dir);
    }
    return fs.WriteFile(filePath, content);
}

/**
 * 读取文本文件
 * @param filePath 文件完整路径
 * @returns 文件存在时返回内容，否则返回 `null`
 */
function readTextFile(filePath: string): string | null {
    const fs = Application.FileSystem;
    return fs.Exists(filePath) ? fs.ReadFile(filePath) : null;
}

/**
 * 把任意对象序列化为 JSON 写入文件（目录不存在时自动创建）
 *
 * @returns `success` 是否写入成功；`path` 实际写入的完整路径
 */
export function saveJsonFile<T>(filePath: string, data: T): { success: boolean; path: string } {
    const content = JSON.stringify(data, null, 4);
    const ok = writeTextFile(filePath, content);
    return { success: ok, path: filePath };
}

/**
 * 读取并解析 JSON 文件；文件不存在或解析失败时返回 `null`
 */
export function loadJsonFile<T>(filePath: string): T | null {
    const content = readTextFile(filePath);
    if (!content) return null;
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        console.error(`解析配置文件失败 (${filePath})`, e);
        return null;
    }
}
