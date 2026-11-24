import { defineActions } from "#kernel/define";
import { openPane } from "#kernel/dispatch";

/** 格式检查 */
export const actions = defineActions({
    btnFormatCheck: () => openPane("format-check"),
});
