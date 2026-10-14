import { refreshDocumentView, withUndoRecord } from "../utils/document";

/** 生成唯一书签名（≤ 40 字符） */
export function generateBookmarkName(prefix = "zdoc"): string {
    return `${prefix}_${Date.now().toString(36)}`;
}

/** 书签是否存在 */
export function bookmarkExists(name: string): boolean {
    return ActiveDocument.Bookmarks.Exists(name);
}

/** 删除书签 */
export function deleteBookmark(
    name: string,
    beforeDelete?: (bookmark: Wps.Bookmark) => void,
): void {
    const bms = ActiveDocument.Bookmarks;
    if (!bms.Exists(name)) return;

    const bookmark = bms.Item(name);
    beforeDelete?.(bookmark);
    bookmark.Delete();
}

/** 读取书签当前文本 */
export function getBookmarkText(name: string): string {
    const bms = ActiveDocument.Bookmarks;
    if (!bms.Exists(name)) return "";
    return bms.Item(name).Range.Text ?? "";
}

/** 添加书签 */
export function addBookmark(name: string, range: Wps.Range): void {
    ActiveDocument.Bookmarks.Add(name, range);
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
