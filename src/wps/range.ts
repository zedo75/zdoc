import { refreshDocumentView } from "@/wps/view";
import { withUndoRecord } from "@/wps/withAction";

/**
 * 正则查找处理
 *
 * 对符合正则表达式的 **段落** 进行查找和处理
 * @param regexp 是正则表达式，应带有 "g" 标志
 * @param callback 是回调函数，如 (range) => {...}
 */
export function regexFindAndProcess(regexp: RegExp, callback: (range: Wps.Range) => void) {
    const doc = ActiveDocument;
    const paras = doc.Paragraphs;
    // 确保有 g 标志
    const globalRegex = new RegExp(
        regexp.source,
        regexp.flags.includes("g") ? regexp.flags : regexp.flags + "g",
    );
    for (let i = 1; i <= paras.Count; i++) {
        const para = paras.Item(i);
        const range = para.Range;

        let match: RegExpExecArray | null = null;
        while ((match = globalRegex.exec(range.Text)) !== null) {
            const startPos = range.Start + match.index;
            const endPos = startPos + match[0].length;
            const matchedRange = doc.Range(startPos, endPos); // 全文中匹配的范围
            callback(matchedRange);
        }
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

/** 给指定范围内的所有段落添加外边框 */
export function applyRangeBorder(range: Wps.Range): void {
    const paragraphs = range.Paragraphs;
    if (!paragraphs || paragraphs.Count === 0) return;

    withUndoRecord(() => {
        for (let i = 1; i <= paragraphs.Count; i++) {
            const para = paragraphs.Item(i);
            const borders = para.Borders;

            // 四条边统一设置
            borders.Item(wdBorderLeft).LineStyle = wdLineStyleSingle;
            borders.Item(wdBorderRight).LineStyle = wdLineStyleSingle;
            borders.Item(wdBorderTop).LineStyle = wdLineStyleSingle;
            borders.Item(wdBorderBottom).LineStyle = wdLineStyleSingle;

            // 颜色用 RGB 值，这里给一个明显的蓝色
            const color = RGB(37, 99, 235);
            borders.Item(wdBorderLeft).Color = color;
            borders.Item(wdBorderRight).Color = color;
            borders.Item(wdBorderTop).Color = color;
            borders.Item(wdBorderBottom).Color = color;

            // 线宽：中等
            borders.Item(wdBorderLeft).LineWidth = wdLineWidth050pt;
            borders.Item(wdBorderRight).LineWidth = wdLineWidth050pt;
            borders.Item(wdBorderTop).LineWidth = wdLineWidth050pt;
            borders.Item(wdBorderBottom).LineWidth = wdLineWidth050pt;
        }
    });

    refreshDocumentView();
}

/** 清除指定范围内所有段落的边框 */
export function clearRangeBorder(range: Wps.Range): void {
    const paragraphs = range.Paragraphs;
    if (!paragraphs || paragraphs.Count === 0) return;

    withUndoRecord(() => {
        for (let i = 1; i <= paragraphs.Count; i++) {
            const borders = paragraphs.Item(i).Borders;
            borders.Item(wdBorderLeft).LineStyle = wdLineStyleNone;
            borders.Item(wdBorderRight).LineStyle = wdLineStyleNone;
            borders.Item(wdBorderTop).LineStyle = wdLineStyleNone;
            borders.Item(wdBorderBottom).LineStyle = wdLineStyleNone;
        }
    });

    refreshDocumentView();
}
