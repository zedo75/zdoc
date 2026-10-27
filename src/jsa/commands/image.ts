import { showFolderPicker } from "@/jsa/utils/wpsDocument";
import { cmToPoints } from "@/utils/typo";

/**
 * 批量修改文档中所有嵌入型图片的尺寸
 * @param heightCm 高度（厘米），0 或 null 表示自动按比例
 * @param widthCm 宽度（厘米），0 或 null 表示自动按比例
 */
export function batchResizeImages(
    heightCm: number | null,
    widthCm: number | null,
    doc: Wps.Document = ActiveDocument,
): { count: number; message: string } {
    const result = { count: 0, message: "" };
    if (!Application) {
        result.message = "无法访问 WPS 应用对象";
        return result;
    }
    if (!doc) {
        result.message = "未打开任何文档";
        return result;
    }
    const inlineShapes = doc.InlineShapes;
    const count = inlineShapes.Count;
    if (count === 0) {
        result.message = "文档中没有嵌入型图片";
        return result;
    }
    // 规范化输入：null, undefined, 0, NaN 都视为"自动"
    let h = typeof heightCm === "number" && !isNaN(heightCm) && heightCm !== 0 ? heightCm : 0;
    let w = typeof widthCm === "number" && !isNaN(widthCm) && widthCm !== 0 ? widthCm : 0;

    let hPt = h !== 0 ? cmToPoints(h) : 0;
    let wPt = w !== 0 ? cmToPoints(w) : 0;

    let modifiedCount = 0;
    for (let i = 1; i <= count; i++) {
        let shp = inlineShapes.Item(i);
        // 如果宽高都未指定，跳过（实际上不会发生，因为用户不可能同时输入 0 或 null，但防御处理）
        if (h === 0 && w === 0) {
            shp.Reset(); // 恢复原始尺寸
            // continue;
        } else {
            // 锁定比例：仅单边指定时锁定，两边都指定时不锁定
            shp.LockAspectRatio = h === 0 || w === 0 ? msoTrue : msoFalse;

            if (hPt !== 0) shp.Height = hPt;
            if (wPt !== 0) shp.Width = wPt;
        }
        modifiedCount++;
    }

    let msg = `修改完成！共处理 ${modifiedCount} 张图片。`;
    if (modifiedCount === 0) msg = "没有图片需要修改。";
    result.count = modifiedCount;
    result.message = msg;
    return result;
}

/**
 * 排版嵌入型图片
 * - 图片单独成段时（即不与文字混排），取消缩进并居中对齐
 */
export function formatInlineImages(doc: Wps.Document = ActiveDocument) {
    let count = doc.InlineShapes.Count;
    if (count < 1) {
        wpsAlert("该文档没有图片");
        return;
    }
    for (let i = 1; i <= count; i++) {
        // ActiveDocument.Shapes 包含插入的形状、浮动的图片
        let shp = doc.InlineShapes.Item(i);
        const pf = shp.Range.ParagraphFormat;
        // 将行距规则改为"最小值"，也可改为单倍行距：pf.Space1();
        pf.LineSpacingRule = wdLineSpaceAtLeast;
        // 以下用于判断段落中是否有其他文字
        // 如果不是纯图片则跳过居中设置，其中 "/" 是图片占位符
        // 考虑多张图片放在一个段落的情况：视觉上满足要求
        if (!/\//.test(shp.Range.Paragraphs.Item(1).Range.Text.trim())) continue;

        pf.Alignment = wdAlignParagraphCenter;
        pf.CharacterUnitFirstLineIndent = 0;
        pf.FirstLineIndent = 0;
    }
}

/**
 * 调用内置的压缩图片功能
 * - 仅当选中图片时有效
 */
export function compressImages() {
    Application.CommandBars.ExecuteMso("PicturesCompress");
}

/**
 * 导出所有图片
 */
export function exportAllImages(doc: Wps.Document = ActiveDocument) {
    const count = doc.InlineShapes.Count;
    if (count < 1) {
        wpsAlert("此文档不包含图片");
        return;
    }

    // 默认导出到桌面
    const defaultPath = Application.Env.GetDesktopPath() + "/导出图片/";
    try {
        Application.FileSystem.Mkdir(defaultPath);
    } catch (e) {}
    // 用户选择路径
    const savePath = showFolderPicker("请选择图片保存目录", defaultPath);
    if (!savePath) {
        return;
    }

    let saveName;
    for (let i = 1; i <= count; i++) {
        let p = doc.InlineShapes.Item(i);
        // 图片导入时的原始名称
        let imgPath = p.LinkFormat?.SourceFullName || p.AlternativeText;
        saveName = imgPath + ".png"; // 比 jpg 格式通用
        p.SaveAsPicture(savePath + saveName);
    }
    wpsConfirm(`已保存 ${count} 张图片到文件夹：\n${savePath}\n`);
}
