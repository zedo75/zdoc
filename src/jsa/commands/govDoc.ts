import type { TypographyConfig } from "@/jsa/types";
import type { DocumentStructure } from "@/utils/para-types";

import { formatAttachments } from "@/jsa//commands/document";
import { withUndoRecord } from "@/jsa/utils/document";
import { scope } from "@/jsa/utils/performance";
import { analyzeDocument, applyModifications, parseParagraphs } from "@/utils/para-pipeline";

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
    const { modifications, structure } = scope("分析+差异", () =>
        analyzeDocument(infos, config, true, mainStyleName, titleStyleName, doc),
    );

    scope("应用修改", () => applyModifications(doc, modifications));
    scope("落款格式化", () => formatSignature(doc, structure));
    if (config.softLineBreakForTitle) {
        scope("多行标题", () => softLineBreakTitle(doc));
    }
}

/**
 * 将 "连续公文标题段落" 的段末 \r 改为软换行 \v。
 *
 * - 搜索连续的「公文标题」样式段落，比较相邻段落的字体和字号
 * - 若字体字号一致，将前一段末尾的段落标记替换为软换行符（\r → \v）
 * - 普通公文排版不应调用，通常只在 "制作目录 / 汇编文件" 场景下需要
 * @param doc 目标文档，默认为当前活动文档
 */
function softLineBreakTitle(doc: Wps.Document = ActiveDocument) {
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
 * 1 个中文字符 ≈ 2 个半角空格宽度
 */
const HALF_WIDTH_PER_CJK = 2;

/**
 * 中西文混排紧排修正
 *
 * 年/月/日 前后共 5 处间距，中西文之间的间距约为 1/2 半角空格
 */
const CJK_LATIN_ADJUST = 5 / 2;

/**
 * 落款：署名（发文机关）、成文日期。
 *
 * @param doc 目标文档，默认为当前活动文档
 * @param structure 结构分析结果；传入则直接使用已识别的位置（可能多个）
 * @param chars 落款右侧留空字数（中文字符数）。加盖印章的公文：4（默认）；不加盖印章的公文：2。
 */
function formatSignature(
    doc: Wps.Document = ActiveDocument,
    structure?: DocumentStructure,
    chars = 4,
) {
    const signatures = structure?.signatures ?? [];
    if (signatures.length === 0) return; // 没有识别到任何落款

    const paras = doc.Paragraphs;

    // 右空边距，统一以半角空格为单位
    const rightMargin = chars * HALF_WIDTH_PER_CJK;

    // 等效长度：中文=2，半角（英文/数字/空格）=1
    const eqLen = (s: string) =>
        [...s].reduce((sum, cur) => sum + (/[\u0000-\u00ff]/.test(cur) ? 1 : 2), 0);

    const processPara = (para: Wps.Paragraph, padSpaces: number) => {
        const rng = para.Range;
        rng.MoveEnd(wdCharacter, -1); // 排除段落标记
        const text = rng.Text.trim();
        if (!text) return;
        rng.Text = text + " ".repeat(padSpaces);

        para.Alignment = wdAlignParagraphRight; // 右对齐
        para.WordWrap = 0; // 避免段落末尾空格悬挂在页边距外（不占实际空间）
    };

    const processSignature = (unitParas: Wps.Paragraph[], datePara: Wps.Paragraph) => {
        const dateText = datePara.Range.Text.trim();
        if (!dateText) return;

        // 无单位：只处理日期
        if (unitParas.length === 0) {
            processPara(datePara, rightMargin);
            return;
        }

        // 每行的等效长度，取最长单位行作为对齐基准
        const unitLens = unitParas.map((p) => eqLen(p.Range.Text.trim()));
        const maxUnitLen = Math.max(...unitLens);

        // diff 是落款单位右侧需要补齐的半角空格个数，计算思路是两行落款的“线段中点”与版芯右边的距离相等
        // 基于最长行计算 → 最长行的中心与日期中心对齐
        const diff = Math.round(
            (eqLen(dateText) + CJK_LATIN_ADJUST) / 2 + rightMargin - maxUnitLen / 2,
        );

        // 每行独立 padding：
        //   最长行 → diff
        //   短行   → diff + (maxUnitLen - len)，补齐到与最长行相同的总宽
        for (let k = 0; k < unitParas.length; k++) {
            const pad = Math.max(diff + (maxUnitLen - unitLens[k]), 0);
            processPara(unitParas[k], pad);
        }

        processPara(datePara, rightMargin + Math.max(-diff, 0));
    };

    // 倒序处理多个落款（避免未来扩展时索引偏移）
    for (let i = signatures.length - 1; i >= 0; i--) {
        const sig = signatures[i];
        const datePara = paras.Item(sig.dateIndex + 1);
        const unitParas = sig.unitIndices.map((idx) => paras.Item(idx + 1));
        processSignature(unitParas, datePara);
    }
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
