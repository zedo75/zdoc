/**
 * 设置当前文档的主页眉
 * @param {string} content     页眉文本内容
 * @param {string} position    对齐方式：'left' | 'center' | 'right'
 * @param {string} fontName    字体名称，如 "宋体"、"黑体" 等
 * @param {number} fontSize    字号（磅值），如 14
 */
export function setHeader(
    content: string,
    position: string,
    fontName: string,
    fontSize: number,
    doc: Wps.Document = ActiveDocument,
) {
    if (!doc) {
        wpsAlert("未打开任何文档");
        return;
    }

    const section = doc.Sections.Item(1);
    const header = section.Headers.Item(1);

    header.Range.Text = content;

    if (fontName) {
        header.Range.Font.Name = fontName;
    }
    if (fontSize && fontSize > 0) {
        header.Range.Font.Size = fontSize;
    }

    let align = wdAlignParagraphLeft;
    if (position === "center") {
        align = wdAlignParagraphCenter;
    } else if (position === "right") {
        align = wdAlignParagraphRight;
    }
    header.Range.ParagraphFormat.Alignment = align;
}

/**
 * 删除所有页眉（全部节 + 全部类型）
 */
export function removeAllHeaders(doc: Wps.Document = ActiveDocument): void {
    if (!doc) {
        wpsAlert("没有打开的文档");
        return;
    }

    for (let i = 1; i <= doc.Sections.Count; i++) {
        const section = doc.Sections.Item(i);
        // 1=主页眉，2=首页页眉，3=偶数页页眉
        [wdHeaderFooterPrimary, wdHeaderFooterEvenPages, wdHeaderFooterFirstPage].forEach(
            (type) => {
                try {
                    const header = section.Headers.Item(type);
                    if (header) header.Range.Text = "";
                } catch {}
            },
        );
    }
}
