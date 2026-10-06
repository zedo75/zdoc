import type { TypographyConfig } from "@/jsa/types";

import { formatAttachments } from "@/jsa//commands/document";
import { withUndoRecord } from "@/jsa/utils/document";
import { scope } from "@/jsa/utils/performance";
import { DATE_REGEX } from "@/utils/typo";
import { analyzeDocument, applyModifications, parseParagraphs } from "@/utils/typo-engine";

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

/**
 * 排版公文
 *
 * - 处理正文样式、层级标题（一/二/三级、小标题）
 * - 若未传入 range（处理全文），额外执行：自动识别多行主标题（附件后、文档开头、换页符后等）并应用标题样式
 * - 若传入 range（用户选中局部区域），仅对范围内的段落应用正文和层级样式，
 *   不进行全局性的主标题识别、落款及附件处理，以避免脱离上下文的误判。
 *
 * @param config 排版配置
 * @param doc 目标文档，默认为当前活动文档
 * @param range 排版范围，不传则处理整个文档；传入则仅处理该范围内的段落
 */
function formatGovDoc(config: TypographyConfig, doc: Wps.Document = ActiveDocument) {
    const mainStyle = scope("准备正文样式", () => setupBodyStyle(config, doc));
    const titleStyle = scope("准备标题样式", () => setupTitleStyle(config, doc));
    const mainStyleName = mainStyle.NameLocal;
    const titleStyleName = titleStyle.NameLocal;

    const infos = scope("读取段落", () => parseParagraphs(doc));

    // 传入 doc：启用"按需读取深层快照 + 差异生成修改指令"
    // → 已完成排版的段落不再重复执行 COM 写操作（大幅加快二次/多次排版速度）
    const modifications = scope("分析+差异", () =>
        analyzeDocument(infos, config, true, mainStyleName, titleStyleName, doc),
    );

    scope("应用修改", () => applyModifications(doc, modifications, mainStyle, titleStyle));
    scope("多行标题", () => processMultiLineTitle(doc));
    scope("落款格式化", () => formatSignature(doc));
}

/**
 * 处理多行标题
 * - 搜索连续的「公文标题」样式段落，比较相邻段落的字体和字号
 * - 若字体字号一致，将前一段末尾的段落标记替换为软换行符（\r → \v）
 * @param doc 目标文档，默认为当前活动文档
 */
function processMultiLineTitle(doc: Wps.Document = ActiveDocument) {
    const paras = doc.Paragraphs;
    const count = paras.Count;
    const titleStyleName = "公文标题";

    for (let i = 1; i < count; i++) {
        const currentPara = paras.Item(i);
        const currentStyle = (currentPara.Style as Wps.Style)?.NameLocal;
        if (currentStyle !== titleStyleName) continue;

        const nextPara = paras.Item(i + 1);
        const nextStyle = (nextPara.Style as Wps.Style)?.NameLocal;
        if (nextStyle !== titleStyleName) continue;

        const currentText = currentPara.Range.Text;
        const isInTable = currentText.includes("\x07");
        if (isInTable) continue;

        const currentFont = currentPara.Range.Font;
        const nextFont = nextPara.Range.Font;

        if (
            currentFont.NameFarEast === nextFont.NameFarEast &&
            currentFont.Size === nextFont.Size
        ) {
            const rng = currentPara.Range;
            if (!rng.Text.endsWith("\r")) continue;
            rng.Text = rng.Text.slice(0, -1) + "\v";
        }
    }
}

/**
 * 落款：署名（发文机关）、成文日期
 * @param doc 目标文档，默认为当前活动文档
 */
function formatSignature(doc: Wps.Document = ActiveDocument) {
    let datePara = null,
        unitPara = null;

    const paras = doc.Paragraphs;
    const count = paras.Count;
    // 从后往前查找日期段落
    for (let i = count; i >= 1; i--) {
        const p = paras.Item(i);
        if (DATE_REGEX.test(p.Range.Text)) {
            datePara = p;
            unitPara = datePara.Previous();
            break;
        }
    }
    if (!datePara || !unitPara) return; // "未找到成文日期或署名"

    // 去除段落首位空白字符，使得多次运行的效果仍保持一致
    let unitText = unitPara.Range.Text.trim();
    let dateText = datePara.Range.Text.trim();
    // 等效长度：中文=2，半角（英文/数字/空格）=1
    const eqLen = (s: string) =>
        [...s].reduce((sum, cur) => sum + (/[\u0000-\u00ff]/.test(cur) ? 1 : 2), 0);

    const processPara = (para: Wps.Paragraph, text: string) => {
        if (!para || para.Range.Text.trim().length < 1) return;
        para.Range.Text = text;
        para.Alignment = wdAlignParagraphRight; // 右对齐
        para.WordWrap = 0; // 避免段落末尾空格不占空间
    };

    const unitLen = eqLen(unitText);
    const dateLen = eqLen(dateText);

    const diff = Math.round(dateLen / 2 + 4 * 2 + 5 / 4 - unitLen / 2);
    if (diff >= 0) {
        unitText = unitText + " ".repeat(diff) + "\r";
        dateText = dateText + " ".repeat(8) + "\r";
    } else {
        unitText = unitText + "\r";
        dateText = dateText + " ".repeat(8 - diff) + "\r";
    }
    processPara(unitPara, unitText);
    datePara = unitPara.Next(1); // 更新引用，因为手动添加了 "\r" 导致原引用失效
    processPara(datePara, dateText);
}

/**
 * 快速排版文本内容
 * - 根据预设或传入的配置，对目标文档（或选区）执行排版操作
 * - 本函数会尽量在短时间内完成排版，适用于实时交互场景
 * - 提示：为避免界面卡顿，请勿在 Vue 组件的主线程中直接调用涉及大量 COM 操作的函数
 *
 * @param config 排版配置
 * @param doc 目标文档，默认为当前活动文档
 */
export function quickFormat(
    config: TypographyConfig,
    doc: Wps.Document = Application.ActiveDocument,
) {
    withUndoRecord("一键排版", () =>
        scope("一键排版", () => {
            scope("编号转换", () => doc.Content.ListFormat.ConvertNumbersToText());
            scope("主排版", () => formatGovDoc(config, doc));
            scope("附件处理", () => formatAttachments(doc));
        }),
    );
}
