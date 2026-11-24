import { ElMessage } from "element-plus";

import { DEFAULT_HEADER_CONFIG } from "@/config/defaults";
import { removeAllHeaders, setHeader } from "@/core/header";
import { useGovDocConfig } from "@/stores/govDocConfig";
import { refreshDocumentView } from "@/wps/view";

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
