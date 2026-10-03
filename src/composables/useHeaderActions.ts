import { ElMessage } from "element-plus";

import { DEFAULT_FOOTER_CONFIG, DEFAULT_HEADER_CONFIG } from "@/config/defaults";
import { removeAllHeaders, setHeader } from "@/jsa/commands/header";
import { addFooterPagenum, hasPagenum } from "@/jsa/commands/pagenum";
import { refreshDocumentView } from "@/jsa/utils/document";
import { useGovDocConfig } from "@/stores/govDocConfig";

export function useHeaderActions() {
    const { header } = useGovDocConfig();

    function apply() {
        const { content, position, font, fontSize } = header.value;
        setHeader(content, position, font, fontSize);
        refreshDocumentView();
        ElMessage.success("已修改页眉");
    }
    function remove() {
        removeAllHeaders();
        refreshDocumentView();
        ElMessage.primary("已移除页眉");
    }
    function reset() {
        header.value = { ...DEFAULT_HEADER_CONFIG };
        ElMessage.success("页眉配置已恢复默认");
    }
    return { apply, remove, reset };
}

export function useFooterActions() {
    const { footer } = useGovDocConfig();
    const hasPageNum = ref(false);

    function checkPageNum() {
        try {
            hasPageNum.value = hasPagenum();
        } catch {
            hasPageNum.value = false;
        }
    }

    function refreshStatus() {
        try {
            hasPageNum.value = hasPagenum();
        } catch {
            hasPageNum.value = false;
        }
    }

    function apply() {
        addFooterPagenum(footer.value);
        checkPageNum();
        ElMessage.success("页码已插入/更新");
    }

    function remove() {
        removeAllHeaders();
        refreshDocumentView();
        ElMessage.primary("已移除页眉");
    }

    function reset() {
        footer.value = { ...DEFAULT_FOOTER_CONFIG };
    }

    return { hasPageNum, refreshStatus, apply, remove, reset };
}
