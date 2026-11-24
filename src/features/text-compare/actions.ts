import { defineActions } from "#kernel/define";
import { openPane } from "#kernel/dispatch";

/** 文本对比 */
export const actions = defineActions({
    btnTextViewCompare: () => openPane("text-compare"),
});
