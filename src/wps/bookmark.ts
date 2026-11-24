/**
 * WPS 书签原语
 *
 * 只封装 `Document.Bookmarks` 的增删查改，不含任何业务判断：
 * 「为什么加书签、书签代表什么」由调用方（composable / 插件）决定。
 */

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
