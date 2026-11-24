/**
 * 排版引擎：正文 / 标题样式
 *
 * 「公文正文」「公文标题」两个段落样式是其它所有排版操作的基础：
 * 先建好样式，再让段落引用样式，比逐段设置字体快一个数量级。
 *
 * 本模块只操作 `Document.Styles`，不做语义识别（见 `core/analysis.ts`）。
 */

import type { TypographyConfig } from "@/config/types";

/**
 * 设置正文样式，避免频繁地直接操作 Range，优化运行效率
 * @param config 样式配置
 * @param doc 目标文档，默认为当前活动文档
 */
export function setupBodyStyle(
    config: TypographyConfig,
    doc: Wps.Document = ActiveDocument,
): Wps.Style {
    let style = doc.Styles.Item("公文正文");
    if (!style) {
        style = doc.Styles.Add("公文正文", wdStyleTypeParagraph);
    }
    // 设置默认字体格式
    const font = style.Font;
    font.Name = config.main.zh || "仿宋_GB2312"; // Name 属性会影响中文和西文
    font.NameFarEast = font.Name;
    font.NameAscii = config.main.en || "Times New Roman";
    font.Size = config.main.size || 16;
    // font.SizeBi = font.Size; // Bi 后缀的是复杂文种
    font.Bold = msoFalse;
    font.Italic = msoFalse;

    // 设置默认段落格式
    const pf = style.ParagraphFormat;
    pf.Alignment = wdAlignParagraphJustify; // 两端对齐
    pf.SpaceBefore = 0; // 段前间距
    pf.SpaceAfter = 0; // 段后间距
    pf.LineSpacingRule = wdLineSpaceExactly; // 固定行距
    pf.LineSpacing = config.main.spacing || 28.95; // 行距（磅）

    pf.CharacterUnitFirstLineIndent = config.main.indent || 2; // 首行缩进（字符）
    pf.FirstLineIndent = 0; // 非字符单位的首行缩进（磅）
    pf.WordWrap = msoTrue; // 西文换行
    pf.AddSpaceBetweenFarEastAndAlpha = msoTrue; // 中文、英文之间添加间距
    pf.AddSpaceBetweenFarEastAndDigit = msoTrue; // 中文、数字之间添加间距

    // todo : 应当只修改配置中指定的属性，目前的实现会覆盖默认值
    pf.WidowControl = msoFalse; // 孤行控制
    pf.KeepWithNext = msoFalse; // 与下段同页
    pf.KeepTogether = msoFalse; // 段中不分页
    pf.PageBreakBefore = msoFalse; // 段前分页
    // pf.WordWrap = msoTrue 表示允许西文在单词中间换行

    return style;
}

/**
 * 基于正文样式设置标题样式
 * @param config 样式配置
 * @param doc 目标文档，默认为当前活动文档
 */
export function setupTitleStyle(
    config: TypographyConfig,
    doc: Wps.Document = ActiveDocument,
): Wps.Style {
    let style = doc.Styles.Item("公文标题");
    if (!style) {
        style = doc.Styles.Add("公文标题", wdStyleTypeParagraph);
    }
    style.BaseStyle = "公文正文";
    style.NextParagraphStyle = "公文正文";
    const font = style.Font;
    font.Name = config.title.zh || "方正小标宋简体";
    font.NameFarEast = font.Name;
    font.NameAscii = config.title.en || "方正小标宋简体";
    font.Size = config.title.size || 22;
    font.Bold = msoFalse;

    const pf = style.ParagraphFormat;
    pf.LineSpacingRule = wdLineSpaceExactly;
    pf.LineSpacing = config.title.spacing || 28.95;

    pf.Alignment = wdAlignParagraphCenter;
    pf.CharacterUnitFirstLineIndent = 0;
    pf.FirstLineIndent = 0;

    return style;
}
