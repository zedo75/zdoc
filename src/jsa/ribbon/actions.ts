import {
    convertIndentToSpace,
    convertSpaceToIndent,
    deleteNonBuiltInStyles,
    formatAttachments,
    removeShadingBackground,
} from "@/jsa/commands/document";
import { convertNumberingToStatic } from "@/jsa/commands/field";
import { quickFormat } from "@/jsa/commands/govDoc";
import { exportAllImages, formatInlineImages } from "@/jsa/commands/image";
import { viewMailSourceInfo } from "@/jsa/commands/mergeMail";
import {
    convertAlphaNumToHalfWidth,
    convertPunctuationToFullWidth,
    correctPunctuation,
    openWpsChangeCaseDialog,
} from "@/jsa/commands/punctuation";
import { toggleTaskPane } from "@/jsa/ribbon/taskPane";
import { withUndoRecord } from "@/jsa/utils/document";
import {
    setFontAsciiToEast,
    setFontFS,
    setFontFZ,
    setFontHei,
    setFontKai,
    setFontRoman,
    setFontSize,
    setLineExactly,
} from "@/jsa/utils/styles";
import { useGovDocConfig } from "@/stores/govDocConfig";
import { FONT_SIZE_THREE, FONT_SIZE_TWO } from "@/utils/fonts";

interface RibbonAction {
    (): void;
}

function initConfig(): void {
    try {
        useGovDocConfig().loadFromFile();
    } catch (e) {
        console.warn("加载配置失败（非 WPS 环境？）:", e);
    }
}

function getTypoConfig() {
    const config = useGovDocConfig();
    return config.typography.value;
}

const actionHandlers: Partial<Record<RibbonControlId, RibbonAction>> = {
    // 文档处理
    btnGovDocTypo: () => {
        const config = getTypoConfig();
        quickFormat(config);
    },
    btnTypoConfig: () => toggleTaskPane("settings", "公文设置"),
    btnImageTypo: () => withUndoRecord(formatInlineImages),
    btnTableTypo: () => {},
    btnJustifyAttach: () => withUndoRecord(formatAttachments),

    // 格式专区
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
    btnClearNonBuiltinStyles: () => {
        const msg = deleteNonBuiltInStyles();
        wpsAlert(msg);
    },
    btnRemoveShading: () => withUndoRecord(removeShadingBackground),

    // 快捷样式
    btnQuickStyle: () => {
        const url = window.location.origin + window.location.pathname + "?dialog=quick-style";
        Application.ShowDialog(url, "快捷样式", 360, 240, false);
    },
    btnFontSize2: () => setFontSize(FONT_SIZE_TWO),
    btnFontSize3: () => setFontSize(FONT_SIZE_THREE),
    btnFontFZ: setFontFZ,
    btnFontHei: setFontHei,
    btnFontKai: setFontKai,
    btnFontFS: setFontFS,
    btnFontRoman: setFontRoman,
    btnFontAsciiToEast: setFontAsciiToEast,
    btnLineExactly: setLineExactly,

    // 辅助
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

    btnConvertPunctuation: () => withUndoRecord(convertPunctuationToFullWidth),
    btnConvertAlphaNum: () => withUndoRecord(convertAlphaNumToHalfWidth),
    btnCorrectPunctuation: () => withUndoRecord(correctPunctuation),
    btnChangeCase: () => withUndoRecord(openWpsChangeCaseDialog),

    btnTextViewCompare: () => toggleTaskPane("text-compare", "文本对比"),

    btnNumberToStatic: convertNumberingToStatic,
    btnMailMergeDialog: () => {
        const url = window.location.origin + window.location.pathname + "?dialog=mail-merge-field";
        Application.ShowDialog(url, "插入合并域", 360, 320, false);
    },
    btnViewMailSource: viewMailSourceInfo,
    btnUpdateFiled: () => {
        const doc = ActiveDocument;
        const fld = doc.Fields;
        for (let i = 1; i <= fld.Count; i++) {
            let f = fld.Item(i);
            f.Update();
            // f.Unlink();
        }
    },

    // 图片工具
    btnPictureResize: () => toggleTaskPane("image-resize", "图片调整"),
    btnExportPicture: exportAllImages,

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
};

function onAction(control: Kso.RibbonControl): boolean {
    const eleId = control.Id as RibbonControlId;
    const handler = actionHandlers[eleId];
    if (handler) {
        try {
            handler();
        } catch (e) {
            console.error(`执行按钮 ${eleId} 动作失败`, e);
        }
    }
    return true;
}

function getImage(control: Kso.RibbonControl): string {
    const eleId = control.Id as RibbonControlId;

    const imageMap: Partial<Record<RibbonControlId, ImageFileName>> = {
        btnRemoveShading: "DelDocBackground.svg",
        btnTypoConfig: "OfficialVersionSettings.svg",
        btnExportPicture: "ExportChartAsPicture.svg",
        btnTextViewCompare: "ReviewCompare.svg",
    };
    return `images/${imageMap[eleId] ?? `${eleId}.png`}`;
}

function onGetEnabled(control: Kso.RibbonControl): boolean {
    const eleId = control.Id as RibbonControlId;
    switch (eleId) {
        default:
            return true;
    }
}

function onGetLabel(control: Kso.RibbonControl): string {
    const eleId = control.Id as RibbonControlId;

    switch (eleId) {
        case "btnFontFS":
            return "设为仿宋三号字体";
        default:
            return "";
    }
}

/**
 * 绑定 CustomUI 与自定义事件
 */
export function setupRibbonBindings(): void {
    const bindings = {
        onAction,
        getImage,
        onGetLabel,
        onGetEnabled,
    };

    // 挂载全局对象，可在 ribbon.xml 中绑定事件
    Object.entries(bindings).forEach(([key, value]) => {
        // @ts-ignore
        window[key] = value;
    });

    initConfig();
}
