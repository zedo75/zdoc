/**
 * 文档工具：清除格式类命令
 *
 * 这些命令只被 doc-utils 自己的 Ribbon 动作调用，且都是"对选区做一次性清理"，
 * 没有复用价值，因此留在插件内，不下沉到 `core/`。
 */

/**
 * 删除非内置的自定义样式，例如 "公文正文"、"公文标题"
 */
export function deleteNonBuiltInStyles(doc: Wps.Document = ActiveDocument) {
    const styles = doc.Styles;
    const nameArr = []; // 记录删除了哪些
    // 从后往前删
    for (let i = styles.Count; i >= 1; i--) {
        const s = styles.Item(i);
        // 避免删除字符样式（删了似乎不影响，但是计数有错误）
        if (s.Type == wdStyleTypeParagraph && !s.BuiltIn) {
            nameArr.push(s.NameLocal);
            s.Delete();
        }
    }
    return "共删除 " + nameArr.length + " 个样式：\n\n" + nameArr.join("、");
}

/**
 * 清除底纹背景
 *
 * 清除所选范围的底纹背景，若不选中段落则影响全文（常见白色背景）
 */
export function removeShadingBackground() {
    const sel = Application.Selection;
    const range = sel.Type == wdSelectionIP ? ActiveDocument.Content : sel.Range;

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
        const rng = para.Range;
        const text = rng.Text;

        // 正则匹配开头的全角+半角空格
        const match = text.match(/^[\u3000 ]+/);
        if (!match) continue;

        const spaces = match[0];
        const fullCount = (spaces.match(/\u3000/g) || []).length; // 全角空格数
        const halfCount = (spaces.match(/ /g) || []).length; // 半角空格数

        const spaceCount = fullCount + halfCount;
        if (spaceCount === 0) continue; // 无前导空格，跳过

        // 删除开头的空格
        const delRng = rng.Duplicate;
        delRng.End = delRng.Start + spaceCount;
        delRng.Delete();

        // 计算缩进单位
        const indentUnits = fullCount + halfCount / 2;
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
