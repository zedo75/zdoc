import type { PageLayoutConfig } from "@/jsa/types";

import { DEFAULT_PAGE_LAYOUT_CONFIG } from "@/config/defaults";
import { ATTACHMENT_LIST_REGEX, ATTACHMENT_LIST_WILDCARDS } from "@/utils/para-patterns";
import { handleAttachments } from "@/utils/typo";

/**
 * 设置当前文档的页面布局
 * @param options 页面参数
 */
export function setPageLayout(options: PageLayoutConfig, doc: Wps.Document = ActiveDocument) {
    const merged = Object.assign({}, DEFAULT_PAGE_LAYOUT_CONFIG, options);
    const { top, bottom, left, right, header, footer } = merged;

    const ps = doc.PageSetup; // 获取页面设置对象
    // 设置上下左右边距（厘米）
    ps.TopMargin = Application.CentimetersToPoints(top);
    ps.BottomMargin = Application.CentimetersToPoints(bottom);
    ps.LeftMargin = Application.CentimetersToPoints(left);
    ps.RightMargin = Application.CentimetersToPoints(right);
    // 页眉页脚
    ps.HeaderDistance = Application.CentimetersToPoints(header);
    ps.FooterDistance = Application.CentimetersToPoints(footer);
}

/**
 * 删除非内置的自定义样式，例如 "公文正文"、"公文标题"
 */
export function deleteNonBuiltInStyles(doc: Wps.Document = ActiveDocument) {
    const styles = doc.Styles;
    let nameArr = []; // 记录删除了哪些
    // 从后往前删
    for (let i = styles.Count; i >= 1; i--) {
        let s = styles.Item(i);
        // 避免删除字符样式（删了似乎不影响，但是计数有错误）
        if (s.Type == wdStyleTypeParagraph && !s.BuiltIn) {
            nameArr.push(s.NameLocal);
            s.Delete();
        }
    }
    let msg = "共删除 " + nameArr.length + " 个样式：\n\n" + nameArr.join("、");
    return msg;
}

/**
 * 清除底纹背景
 *
 * 清除所选范围的底纹背景，若不选中段落则影响全文（常见白色背景）
 */
export function removeShadingBackground() {
    const sel = Application.Selection;
    let range = sel.Type == wdSelectionIP ? ActiveDocument.Content : sel.Range;

    range.HighlightColorIndex = wdAuto; // 清除背景高亮

    // 根据不同文档录制，Shading 居然有 3 处入口，为了防止遗漏都需要重置
    const rs = range.Shading,
        ps = range.ParagraphFormat.Shading,
        fs = range.Font.Shading;

    rs.Texture = wdTextureNone; // 清除底纹纹理，下同
    rs.BackgroundPatternColor = wdColorAutomatic; // 背景色设为自动（清除颜色）

    ps.Texture = wdTextureNone;
    ps.BackgroundPatternColor = wdColorAutomatic;

    fs.Texture = wdTextureNone;
    fs.BackgroundPatternColor = wdColorAutomatic;

    const ts = range.Tables.Item(1)?.Shading; // 表格
    if (ts) {
        ts.Texture = wdTextureNone;
        ts.BackgroundPatternColor = wdColorAutomatic;
    }
}

/**
 * 将选定段落开头的空格转换为首行缩进（字符单位）
 *
 * 规则：1个全角空格 → 1字符缩进，2个半角空格 → 1字符缩进
 */
export function convertSpaceToIndent() {
    const paras = Application.Selection.Paragraphs;
    if (paras.Count === 0) {
        wpsAlert("请先选择需要处理的文本区域！");
        return;
    }

    for (let i = 1; i <= paras.Count; i++) {
        const para = paras.Item(i);
        let rng = para.Range;
        let text = rng.Text;

        // 正则匹配开头的全角+半角空格
        let match = text.match(/^[\u3000 ]+/);
        if (!match) continue;

        let spaces = match[0];
        let fullCount = (spaces.match(/\u3000/g) || []).length; // 全角空格数
        let halfCount = (spaces.match(/ /g) || []).length; // 半角空格数

        let spaceCount = fullCount + halfCount;
        if (spaceCount === 0) continue; // 无前导空格，跳过

        // 删除开头的空格
        let delRng = rng.Duplicate;
        delRng.End = delRng.Start + spaceCount;
        delRng.Delete();

        // 计算缩进单位
        let indentUnits = fullCount + halfCount / 2;
        if (indentUnits === 0) continue;

        // 设置段落的首行缩进
        para.Format.CharacterUnitFirstLineIndent = indentUnits;
        para.Format.FirstLineIndent = 0;
    }
}

/**
 * 将选定段落的首行缩进（字符单位）转换为全角空格
 */
export function convertIndentToSpace() {
    const paras = Application.Selection.Paragraphs;
    const count = paras.Count;
    if (count === 0) {
        wpsAlert("请先选择需要处理的文本区域！");
        return;
    }
    for (let i = 1; i <= count; i++) {
        const para = paras.Item(i);
        const indents = para.CharacterUnitFirstLineIndent;
        if (indents <= 0) continue; // 无缩进或负数缩进（悬挂缩进）则跳过
        para.CharacterUnitFirstLineIndent = 0;
        para.FirstLineIndent = 0;

        const prefix = "\u3000".repeat(indents);
        para.Range.InsertBefore(prefix);
    }
}

export interface RangeIndex {
    startIndex: number;
    endIndex: number;
    text: string;
}

/**
 * 提取所有附件段落
 * @param doc 文档
 */
export function getAttachmentsRangesIndex(doc: Wps.Document = ActiveDocument): RangeIndex[] {
    const ranges = [];
    const rng = doc.Content;

    const find = rng.Find;
    find.ClearFormatting();
    // 对应正则表达式 attachmentList
    find.Text = ATTACHMENT_LIST_WILDCARDS; // 这里只找“附件”开头到结尾，^p 只用于定位
    find.MatchCase = false; // 不区分大小写
    find.MatchWildcards = true; // 使用通配符

    while (find.Execute()) {
        // 获取当前匹配所在段落的起始位置（即前一个 ^p 的后面）
        const paraStart = rng.Paragraphs.Item(1).Range.Start;

        rng.Start = paraStart; // 其下一空段仅用于搜索定位，不应包含在处理范围

        const trimmed = rng.Duplicate;
        trimmed.End = trimmed.End - 2; // 去掉末尾的 2 个段落符

        ranges.push({
            startIndex: trimmed.Start,
            endIndex: trimmed.End,
            text: trimmed.Text, // 此时末尾只有单个 \r
        });

        rng.Collapse(0); // 折叠到匹配文本之后，继续向下查找
    }
    return ranges;
}

/**
 * 提取所有附件段落
 * @deprecated 已弃用，基于 `doc.Content.Text`，当文档中有表格、图形、文本框、域时，文本索引会发生偏移
 */
export function getAttachmentsRangeIndex(doc: Wps.Document = ActiveDocument): RangeIndex[] {
    const selection = Application.Selection;

    const ranges: RangeIndex[] = [];
    if (!doc.Content.Text.includes("附件")) return ranges;
    // 要求附件说明之后必须有 1 个空段落
    const regex = ATTACHMENT_LIST_REGEX;
    // 判断选区是否有效（有选中文本，且不是插入点）
    const hasSelection = selection.Type !== wdSelectionIP;

    let fullText: string;
    let baseOffset = 0; // 匹配文本在全文中的起始偏移量

    if (hasSelection) {
        // 仅处理选中的范围
        const selRange = selection.Range;
        baseOffset = selRange.Start; // 选区在全文中的起始索引
        // 去掉选区末尾的段落符
        fullText = selRange.Text.replace(/\r+$/, "");
    } else {
        // 处理整个文档
        baseOffset = 0;
        fullText = doc.Content.Text;
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(fullText)) !== null) {
        const startIndex = baseOffset + match.index;
        const endIndex = startIndex + match[0].length;
        ranges.push({ startIndex, endIndex, text: match[0] });
    }

    return ranges;
}

/**
 * 对齐附件列表
 *
 * 格式化公文中的“附件说明”
 * @param doc 文档
 */
export function formatAttachments(doc: Wps.Document = ActiveDocument) {
    const rangeIndex = getAttachmentsRangesIndex();
    for (let i = rangeIndex.length - 1; i >= 0; i--) {
        const item = rangeIndex[i];
        const result = handleAttachments(item.text);
        const range = doc.Range(item.startIndex, item.endIndex);
        // handleAttachments 是幂等性的，因此只需要额外判断缩进是否满足条件
        if (item.text == result.replace(/\n/g, "\r").replace(/\u3000/g, "")) {
            const paras = range.Paragraphs;
            let shouldSkip = false;
            // 段落数≥2 且 第二段缩进<5 时才执行排版，否则跳过（不逐段检查缩进）
            if (paras.Count < 2 || paras.Item(2).Format.CharacterUnitFirstLineIndent >= 5) {
                shouldSkip = true;
            }
            if (shouldSkip) {
                continue;
            }
            // 缩进不对，继续走排版流程
        }

        range.Text = result;
        // 对该块进行缩进转换
        convertIndentForRange(range);
    }
}

/**
 * 对指定Range内的所有段落进行缩进转换（将行首全角空格转为段落缩进）
 */
function convertIndentForRange(range: Wps.Range) {
    const doc = range.Parent as Wps.Document;
    const paras = range.Paragraphs;
    const count = paras.Count;
    // 使用 For Each 遍历，比索引快，但 JS/TS 加载项不支持
    for (let j = 1; j <= count; j++) {
        const para = paras.Item(j);
        const rng = para.Range;
        const text = rng.Text;
        // 只检查前几个字符，不用正则
        if (!text.startsWith("\u3000")) continue;

        // 统计连续全角空格数
        let spaceCount = 0;
        while (spaceCount < text.length && text[spaceCount] === "\u3000") {
            spaceCount++;
        }

        // 删除这些空格
        if (spaceCount > 0) {
            const delRange = doc.Range(rng.Start, rng.Start + spaceCount);
            delRange.Delete();
        }

        // 设置段落缩进（全角空格数作为缩进字符数）
        para.Format.CharacterUnitFirstLineIndent = spaceCount;
    }
}

/**
 * 获取选区覆盖的所有完整段落组成的 Range
 */
export function getFullParagraphRange(): Wps.Range | null {
    const sel = Application.Selection;
    if (!sel || sel.Type === wdSelectionIP) return null;

    const paras = sel.Paragraphs;
    if (!paras || paras.Count === 0) return sel.Range;

    const start = paras.Item(1).Range.Start;
    const end = paras.Item(paras.Count).Range.End;
    return ActiveDocument.Range(start, end);
}
