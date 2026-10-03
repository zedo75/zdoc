import { ElMessage } from "element-plus";

import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";
import { setupBodyStyle, setupTitleStyle } from "@/jsa/commands/govDoc";
import { withUndoRecord } from "@/jsa/utils/document";
import { useGovDocConfig } from "@/stores/govDocConfig";

export function useTypographyActions() {
    const { typography } = useGovDocConfig();

    function apply() {
        withUndoRecord("应用样式", () => {
            setupBodyStyle(typography.value);
            setupTitleStyle(typography.value);
            ElMessage.primary("已更新 WPS 样式");
        });
    }

    function reset() {
        // 深拷贝，避免外部对 default 常量的引用被污染
        Object.assign(typography.value, structuredClone(DEFAULT_TYPO_CONFIG));
    }

    return { apply, reset };
}
