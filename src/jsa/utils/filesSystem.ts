import type { GovDocConfig } from "@/jsa/types";

/**
 * 返回默认配置文件的完整路径。
 * - 路径为：用户主目录下的 `.zdoc/govDocConfig.json`。
 * - 注意：此函数仅返回路径，不保证该目录或文件存在。
 *
 * @returns 绝对路径，例如：
 * - Linux: `/home/user/.zdoc/govDocConfig.json`
 * - Windows: `C:/Users/user/.zdoc/govDocConfig.json`
 */
function getDefaultConfigPath(): string {
    const home = Application.Env.GetHomePath();
    return `${home}/.zdoc/govDocConfig.json`;
}

/**
 * 将文本内容写入指定文件（自动创建目录）
 * @param filePath - 目标文件完整路径
 * @param content - 要写入的字符串
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
 * 读取指定文件的文本内容
 * @param filePath - 文件完整路径
 * @returns 若文件存在则返回内容字符串，否则返回 `null`
 */
function readTextFile(filePath: string): string | null {
    const fs = Application.FileSystem;
    return fs.Exists(filePath) ? fs.ReadFile(filePath) : null;
}

/**
 * 将任意类型的配置对象保存为 JSON 文件到指定路径
 *
 * 如果目标目录不存在，会自动创建
 *
 * @param filePath - 目标文件的完整路径
 * @param config  - 要保存的配置对象（泛型 T）
 * @returns 包含操作结果的对象：
 *          - `success`：布尔值，表示写入是否成功。
 *          - `path`：字符串，保存文件的完整路径。
 */
export function saveConfigToFile<T>(
    filePath: string,
    config: T,
): { success: boolean; path: string } {
    const content = JSON.stringify(config, null, 4);
    const ok = writeTextFile(filePath, content);
    return { success: ok, path: filePath };
}

/**
 * 从指定路径的 JSON 文件中加载任意类型的配置对象
 *
 * 若文件不存在或解析失败，则返回 `null`
 *
 * @param filePath - 配置文件完整路径
 * @returns 解析成功的配置对象（类型 T），否则为 `null`
 */
export function loadConfigFromFile<T>(filePath: string): T | null {
    const content = readTextFile(filePath);
    if (!content) return null;
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        console.error(`解析配置文件失败 (${filePath})`, e);
        return null;
    }
}

/**
 * 将 GovDocConfig 保存到默认位置
 *
 * @param config - 要保存的配置对象
 */
export function saveGovDocConfigToFile(config: GovDocConfig): { success: boolean; path: string } {
    return saveConfigToFile(getDefaultConfigPath(), config);
}

/**
 * 从默认位置加载 GovDocConfig
 *
 * @returns 解析成功的配置对象，否则为 `null`
 */
export function loadGovDocConfigFromFile(): GovDocConfig | null {
    return loadConfigFromFile<GovDocConfig>(getDefaultConfigPath());
}
