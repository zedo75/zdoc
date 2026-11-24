/**
 * 公文配置的文件持久化
 *
 * 配置文件固定放在用户主目录下的 `.zdoc/govDocConfig.json`；
 * 通用的文件读写见 `@/wps/fileSystem`。
 */

import type { GovDocConfig } from "@/config/types";

import { loadJsonFile, saveJsonFile } from "@/wps/fileSystem";

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
 * 将 GovDocConfig 保存到默认位置
 *
 * @param config - 要保存的配置对象
 */
export function saveGovDocConfigToFile(config: GovDocConfig): { success: boolean; path: string } {
    return saveJsonFile(getDefaultConfigPath(), config);
}

/**
 * 从默认位置加载 GovDocConfig
 *
 * @returns 解析成功的配置对象，否则为 `null`
 */
export function loadGovDocConfigFromFile(): GovDocConfig | null {
    return loadJsonFile<GovDocConfig>(getDefaultConfigPath());
}
