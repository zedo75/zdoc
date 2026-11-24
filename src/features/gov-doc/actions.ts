import { defineActions } from "#kernel/define";
import { openDialog, openPane } from "#kernel/dispatch";

import { formatAttachments } from "@/core/attachments";
import { quickFormat } from "@/core/typeset";
import { useGovDocConfig } from "@/stores/govDocConfig";
import { withUndoRecord } from "@/wps/withAction";

/** 公文排版：一键排版、设置面板、快捷样式 */
export const actions = defineActions({
    btnGovDocTypo: () => quickFormat(useGovDocConfig().typography.value),
    btnTypoConfig: () => openPane("settings"),
    btnJustifyAttach: () => withUndoRecord(formatAttachments),
    btnQuickStyle: () => openDialog("quick-style"),
});
