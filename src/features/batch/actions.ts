import { defineActions } from "#kernel/define";
import { openDialog } from "#kernel/dispatch";

/** 批量处理 */
export const actions = defineActions({
    btnBatchTypo: () => openDialog("batch-typo"),
    btnBatchConvert: () => openDialog("batch-convert"),
    btnBatchRename: () => openDialog("batch-rename"),
});
