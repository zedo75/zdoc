/**
 * 自动编号转静态
 * - 将选中部分的动态编号列表转为静态
 * - 不选中内容则全文转换
 */
export function convertNumberingToStatic(doc: Wps.Document = ActiveDocument) {
    let range =
        Application.Selection.Type === wdSelectionIP ? doc.Content : Application.Selection.Range;
    range.ListFormat.ConvertNumbersToText();
    // 部分域也可以表示编号
    const fld = range.Fields; // 若遍历则需要逆序，因为 Unlink 后索引有变化
    fld.Update();
    fld.Unlink();
}
