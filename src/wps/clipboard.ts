/**
 * WPS 剪切板读取
 *
 * WPS JSA 没有直接的剪切板 API：临时插一个文本框、粘贴、读文本、删掉，
 * 这是目前唯一稳定的做法。
 */
export function getClipboardText(): string {
    // 插入临时文本框
    const shape = ActiveDocument.Shapes.AddTextbox(1, 100, 100, 200, 30);
    shape.TextFrame.TextRange.Select();
    // 执行粘贴操作
    Application.Selection.Paste();

    const clipText = shape.TextFrame.TextRange.Text;
    shape.Delete();
    return clipText;
}
