import { defineActions } from "#kernel/define";
import { openPane } from "#kernel/dispatch";

import { withUndoRecord } from "@/wps/withAction";

import {
    convertAlphaNumToHalfWidth,
    correctPunctuation,
    openWpsChangeCaseDialog,
} from "./commands/punctuation";

/** 标点与全半角 */
export const actions = defineActions({
    btnConvertPunctuation: () => openPane("punctuation-rules"),
    btnConvertAlphaNum: () => withUndoRecord(convertAlphaNumToHalfWidth),
    btnCorrectPunctuation: () => withUndoRecord(correctPunctuation),
    btnChangeCase: () => withUndoRecord(openWpsChangeCaseDialog),
});
