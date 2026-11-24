import { defineActions } from "#kernel/define";

import { withUndoRecord } from "@/wps/withAction";

import {
    convertIndentToSpace,
    convertSpaceToIndent,
    deleteNonBuiltInStyles,
    removeShadingBackground,
} from "./commands/format";
import { convertNumberingToStatic } from "./commands/numbering";

/** 文档工具：清除格式、缩进、编号、修订等零散命令 */
export const actions = defineActions({
    btnClearFormat: () => {
        const sel = Application.Selection;
        const isWholeDoc = sel.Type === wdSelectionIP;
        const rangeToClear = isWholeDoc ? Application.ActiveDocument.Content : sel.Range;
        rangeToClear.Select();
        sel.ClearFormatting();
        if (isWholeDoc) {
            sel.SetRange(0, 0);
            Application.ActiveWindow.ActivePane.VerticalPercentScrolled = 0;
        }
    },

    btnClearNonBuiltinStyles: () => wpsAlert(deleteNonBuiltInStyles()),
    btnRemoveShading: () => withUndoRecord(removeShadingBackground),

    btnClearIndent: () => {
        const pf = Application.Selection.ParagraphFormat;
        pf.CharacterUnitFirstLineIndent = 0;
        pf.FirstLineIndent = 0;
        pf.CharacterUnitLeftIndent = 0;
        pf.LeftIndent = 0;
    },
    btnIndent2Char: () => {
        Application.Selection.ParagraphFormat.CharacterUnitFirstLineIndent = 2;
    },
    btnToggleIndentToSpace: () =>
        withUndoRecord("空格缩进互转", () => {
            const sel = Application.Selection;
            const hasIndent = sel.Paragraphs.Item(1).CharacterUnitFirstLineIndent > 0; // 只用首段判断
            if (hasIndent) convertIndentToSpace();
            else convertSpaceToIndent();
        }),

    btnNumberToStatic: convertNumberingToStatic,
    // TODO: 一、二级标题序号转动态尚未实现，先给用户明确的反馈而不是静默失败
    btnH1ToNumber: () => wpsAlert("「一级标题序号转动态」尚未实现"),
    btnH2ToNumber: () => wpsAlert("「二级标题序号转动态」尚未实现"),

    btnClearEmptyPara: () => {
        const sel = Application.Selection;
        if (sel.Type == wdSelectionIP) return wpsAlert("请选择需要清除空段的范围，避免误删！");
        const paras = sel.Paragraphs;
        const count = paras.Count;
        for (let i = count; i >= 1; i--) {
            const p = paras.Item(i);
            // \x0E 分栏符不会被删掉
            if (p.Range.Text.trim() === "") p.Range.Delete();
        }
    },

    btn接受所有修订: () => {
        const revisions = ActiveDocument.Revisions;
        if (revisions.Count === 0) {
            wpsAlert("文档中没有修订");
            return;
        }
        withUndoRecord("接受所有修订", () => revisions.AcceptAll());
    },
});
