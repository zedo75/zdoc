import { ElMessage } from "element-plus";

import { DEFAULT_PAGE_LAYOUT_CONFIG } from "@/config/defaults";
import { setPageLayout } from "@/jsa/commands/document";
import { refreshDocumentView } from "@/jsa/utils/document";
import { useGovDocConfig } from "@/stores/govDocConfig";

export function usePageActions() {
    const { pageLayout } = useGovDocConfig();

    function apply() {
        try {
            setPageLayout(pageLayout.value);
            refreshDocumentView();
            ElMessage.success("已应用页边距");
        } catch (error) {
            console.error("应用页边距失败:", error);
            ElMessage.error("应用页边距失败");
        }
    }

    function reset() {
        Object.assign(pageLayout.value, DEFAULT_PAGE_LAYOUT_CONFIG);
        ElMessage.success("页边距参数已恢复默认设置");
    }

    return { apply, reset };
}
