import type {
    FooterConfig,
    GovDocConfig,
    HeaderConfig,
    PageLayoutConfig,
    TypographyConfig,
} from "@/config/types";

import { createGlobalState, useLocalStorage } from "@vueuse/core";

import {
    DEFAULT_FOOTER_CONFIG,
    DEFAULT_HEADER_CONFIG,
    DEFAULT_PAGE_LAYOUT_CONFIG,
    DEFAULT_TYPO_CONFIG,
    getDefaultConfigFull,
} from "@/config/defaults";
import { loadGovDocConfigFromFile, saveGovDocConfigToFile } from "@/config/persist";
import { validateGovDocConfig } from "@/config/validator";
import { clonePlainData } from "@/utils/clone";

const KEY = {
    typo: "zdoc:typo",
    page: "zdoc:page",
    header: "zdoc:header",
    footer: "zdoc:footer",
} as const;

export type LoadFromFileResult = { ok: true } | { ok: false; error: unknown };

export const useGovDocConfig = createGlobalState(() => {
    // 默认值用 getter：每次初始化都返回全新对象，避免多实例共享引用。
    // mergeDefaults: 未来默认结构新增字段时，旧 localStorage 数据会自动合并新字段。
    const typography = useLocalStorage<TypographyConfig>(
        KEY.typo,
        () => clonePlainData(DEFAULT_TYPO_CONFIG),
        { mergeDefaults: true },
    );
    const pageLayout = useLocalStorage<PageLayoutConfig>(
        KEY.page,
        () => clonePlainData(DEFAULT_PAGE_LAYOUT_CONFIG),
        { mergeDefaults: true },
    );
    const header = useLocalStorage<HeaderConfig>(
        KEY.header,
        () => clonePlainData(DEFAULT_HEADER_CONFIG),
        { mergeDefaults: true },
    );
    const footer = useLocalStorage<FooterConfig>(
        KEY.footer,
        () => clonePlainData(DEFAULT_FOOTER_CONFIG),
        { mergeDefaults: true },
    );

    /** 把一份完整配置写入响应式状态（唯一写入口） */
    const applyConfig = (config: GovDocConfig): void => {
        typography.value = config.typography;
        pageLayout.value = config.pageLayout;
        header.value = config.header;
        footer.value = config.footer;
    };

    /** 重置为默认值 */
    const resetToDefault = (): void => {
        applyConfig(getDefaultConfigFull());
    };

    /**
     * 从文件加载配置。
     * - 返回 { ok: true }：成功（含文件不存在时回退默认值）
     * - 返回 { ok: false, error }：读取或校验失败，已自动回退默认值
     */
    const loadFromFile = (): LoadFromFileResult => {
        try {
            const saved = loadGovDocConfigFromFile();
            if (!saved) {
                resetToDefault();
                return { ok: true };
            }
            const validated = validateGovDocConfig(saved);
            // 防御性兜底：即使 validator 返回字段不全，也能得到可用配置
            applyConfig({
                pageLayout: validated.pageLayout ?? clonePlainData(DEFAULT_PAGE_LAYOUT_CONFIG),
                typography: validated.typography ?? clonePlainData(DEFAULT_TYPO_CONFIG),
                header: validated.header ?? clonePlainData(DEFAULT_HEADER_CONFIG),
                footer: validated.footer ?? clonePlainData(DEFAULT_FOOTER_CONFIG),
            });
            return { ok: true };
        } catch (error) {
            console.warn("配置加载失败，已重置为默认", error);
            resetToDefault();
            return { ok: false, error };
        }
    };

    /**
     * 保存到文件。
     */
    const saveToFile = () => {
        const config: GovDocConfig = {
            pageLayout: pageLayout.value,
            typography: typography.value,
            header: header.value,
            footer: footer.value,
        };
        return saveGovDocConfigToFile(config);
    };

    return {
        typography,
        pageLayout,
        header,
        footer,
        // 方法
        loadFromFile,
        saveToFile,
        resetToDefault,
    };
});

let configInitialized = false;

/**
 * 启动时读取一次配置文件（幂等）。
 *
 * 由 `main.ts` 在空闲时调用；非 WPS 环境（浏览器调试）读取失败只告警，继续用默认值。
 */
export function initGovDocConfig(): void {
    if (configInitialized) return;
    configInitialized = true;

    try {
        useGovDocConfig().loadFromFile();
    } catch (error) {
        console.warn("加载配置失败（非 WPS 环境？）:", error);
    }
}
