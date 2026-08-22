import type { TypographyConfig } from "@/jsa/types";

import { withUndoRecord } from "@/jsa/utils/document";
import { useGovDocConfig } from "@/stores/govDocConfig";

export function makeFarEastStyle(fontGetter: (config: TypographyConfig) => string, size?: number) {
    return () => {
        const { typography } = useGovDocConfig();

        const font = Application.Selection.Font;

        // 获取原始的中、西文字体名称，判断是否为“使用中文字体”
        const originalEast = font.NameFarEast;
        const originalAscii = font.NameAscii;
        const wasUnified = originalEast === originalAscii;

        const asciiFontName = typography.value.main.en || "Times New Roman";
        withUndoRecord("", () => {
            const newFont = fontGetter(typography.value);

            // 显式设置 font.Name 会覆盖 font.NameAscii，同时避免出现中文标点符号显示为半角
            font.Name = newFont;
            font.NameFarEast = newFont;
            if (wasUnified) {
                // 原本文档未区分中西文，则整体统一为新字体
                font.NameAscii = newFont;
            } else {
                // 原本有区分，则设为用户配置的西文字体
                font.NameAscii = asciiFontName;
            }
            // 6. 若有字号参数则设置
            if (size !== undefined) font.Size = size;
        });
    };
}

export function makeAsciiStyle(fontGetter: (config: TypographyConfig) => string) {
    return () => {
        const { typography } = useGovDocConfig();

        const font = Application.Selection.Font;
        font.NameAscii = fontGetter(typography.value);
    };
}

export function setFontSize(size: number) {
    Application.Selection.Font.Size = size;
}

export function setFontFZ() {
    return makeFarEastStyle((c) => c.title.zh)();
}

export function setFontHei() {
    return makeFarEastStyle((c) => c.h1.font || "黑体")();
}

export function setFontKai() {
    return makeFarEastStyle((c) => c.h2.font || "楷体_GB2312")();
}

export function setFontFS() {
    return makeFarEastStyle((c) => c.main.zh || "仿宋_GB2312")();
}

// 应用西文字体：Times New Roman（或 main 英文）
export function setFontRoman() {
    return makeAsciiStyle((c) => c.main.en || "Times New Roman")();
}

// 将西文字体设置为与远东字体相同
export function setFontAsciiToEast() {
    const font = Application.Selection.Font;
    font.NameAscii = font.NameFarEast;
}

// 设置行距为固定值（从配置获取）
export function setLineExactly() {
    const { typography } = useGovDocConfig();

    const pf = Application.Selection.ParagraphFormat;
    withUndoRecord("", () => {
        pf.LineSpacingRule = wdLineSpaceExactly;
        pf.LineSpacing = typography.value.main.spacing || 28.95;
        // 以下为针对未使用“公文正文”样式段落的补充设置
        pf.KeepWithNext = msoFalse;
        pf.KeepTogether = msoFalse;
        pf.SpaceBefore = 0;
        pf.SpaceAfter = 0;
    });
}
