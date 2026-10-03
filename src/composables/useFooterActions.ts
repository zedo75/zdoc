import { ElMessage } from "element-plus";
import { ref } from "vue";

import { DEFAULT_FOOTER_CONFIG } from "@/config/defaults";
import { addFooterPagenum, hasPagenum, removePagenum } from "@/jsa/commands/pagenum";
import { refreshDocumentView } from "@/jsa/utils/document";
import { useGovDocConfig } from "@/stores/govDocConfig";

export function useFooterActions() {
    const { footer } = useGovDocConfig();
    const hasPageNum = ref(false);

    function refreshStatus() {
        try {
            hasPageNum.value = hasPagenum();
        } catch {
            hasPageNum.value = false;
        }
    }

    function apply() {
        try {
            addFooterPagenum(footer.value);
            refreshStatus();
            ElMessage.success("页码已插入/更新");
        } catch (e) {
            console.warn(e);
            ElMessage.warning("插入页码失败，请确认处于 WPS 环境中");
        }
    }

    function remove() {
        try {
            removePagenum();
            refreshStatus();
            refreshDocumentView();
            ElMessage.success("所有页码已删除");
        } catch (e) {
            console.warn(e);
            ElMessage.warning("删除页码失败");
        }
    }

    function reset() {
        Object.assign(footer.value, DEFAULT_FOOTER_CONFIG);
    }

    return { hasPageNum, refreshStatus, apply, remove, reset };
}
