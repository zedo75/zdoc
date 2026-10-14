import { useLocalStorage } from "@vueuse/core";

import {
    DEFAULT_FOOTER_CONFIG,
    DEFAULT_HEADER_CONFIG,
    DEFAULT_PAGE_LAYOUT_CONFIG,
    DEFAULT_TYPO_CONFIG,
    getDefaultConfigFull,
} from "@/config/defaults";
import { validateGovDocConfig } from "@/config/validator";
import { loadGovDocConfigFromFile, saveGovDocConfigToFile } from "@/jsa/utils/filesSystem";

const KEY = {
    typo: "zdoc:typo",
    page: "zdoc:page",
    header: "zdoc:header",
    footer: "zdoc:footer",
} as const;

export function useGovDocConfig() {
    const typography = useLocalStorage(KEY.typo, DEFAULT_TYPO_CONFIG);
    const pageLayout = useLocalStorage(KEY.page, DEFAULT_PAGE_LAYOUT_CONFIG);
    const header = useLocalStorage(KEY.header, DEFAULT_HEADER_CONFIG);
    const footer = useLocalStorage(KEY.footer, DEFAULT_FOOTER_CONFIG);

    /**
     * 重置为默认值
     */
    const resetToDefault = () => {
        const def = getDefaultConfigFull();
        typography.value = def.typography;
        pageLayout.value = def.pageLayout;
        header.value = def.header!;
        footer.value = def.footer!;
    };

    /**
     * 从文件加载配置
     */
    const loadFromFile = () => {
        const saved = loadGovDocConfigFromFile();
        if (saved) {
            try {
                const validated = validateGovDocConfig(saved);
                typography.value = validated.typography || { ...DEFAULT_TYPO_CONFIG };
                pageLayout.value = validated.pageLayout || { ...DEFAULT_PAGE_LAYOUT_CONFIG };
                header.value = validated.header || { ...DEFAULT_HEADER_CONFIG };
                footer.value = validated.footer || { ...DEFAULT_FOOTER_CONFIG };
            } catch (error) {
                console.warn("配置校验失败，使用默认配置", error);
                resetToDefault();
            }
        } else {
            resetToDefault();
        }
    };

    /**
     * 保存到文件
     */
    const saveToFile = () => {
        const config = {
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
}
