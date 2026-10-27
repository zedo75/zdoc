import type { FooterConfig } from "@/config/types";

import { DEFAULT_FOOTER_CONFIG } from "@/config/defaults";

/**
 * 配置形状（文本框）的填充、边框、位置及文字环绕方式。
 * @param shape - 要配置的形状对象。
 */
function configureShape(shape: Wps.Shape, position: number): void {
    // 去除填充和边框，使其透明且无边框
    shape.Fill.Visible = msoFalse;
    shape.Line.Visible = msoFalse;

    // 配置文本框内部
    const textFrame = shape.TextFrame;
    textFrame.AutoSize = 1; // 自动调整大小以适应内容
    textFrame.WordWrap = 0; // 不换行，保持单行
    textFrame.MarginLeft = 0; // 左内边距 0
    textFrame.MarginRight = 0; // 右内边距 0
    textFrame.MarginTop = 0; // 上内边距 0
    textFrame.MarginBottom = 0; // 下内边距 0
    textFrame.Orientation = msoTextOrientationHorizontal; // 水平文字方向

    // 定位：相对于页边距，位于外侧（通常指左/右侧）
    shape.RelativeHorizontalPosition = wdRelativeHorizontalPositionMargin;
    shape.Left = position; // 位于页边距外侧
    console.log(position);
    // 垂直方向相对于段落，顶部对齐
    shape.RelativeVerticalPosition = wdRelativeVerticalPositionParagraph;
    shape.Top = 0;

    // 设置文字环绕为“无”，避免影响其他内容
    shape.WrapFormat.Type = wdWrapNone;
}

/**
 * 在给定的文本范围内插入页码域，并保持“— 页码 —”格式。
 * 先写入模板字符串“— X —”，然后将字母 X 替换为页码域。
 * @param textRange - 文本框的 TextRange 对象，用于插入内容。
 */
function insertPageNumber(textRange: Wps.Range, font?: string, fontSize?: number): void {
    // 一字线左右各空一字，这里用 1em 宽空格占位
    const template = "\u2003— X —\u2003";
    textRange.Text = template;
    // 设置字体样式：宋体、14磅
    textRange.Font.Name = font || "宋体";
    textRange.Font.Size = fontSize || 14;

    // 定位到字母 X 所在字符，替换为页码域
    const indexOfX = template.indexOf("X");
    const targetChar = textRange.Characters.Item(indexOfX + 1);
    targetChar.Fields.Add(targetChar, wdFieldPage, "", true);
}

/**
 * 将配置中的位置字符串映射为 WPS 对应的水平定位常量。
 * @param position - 位置字符串
 * @returns WPS 水平定位常量（如 wdShapeLeft, wdShapeRight 等）
 */
function mapPosition(position: FooterConfig["position"]): number {
    switch (position) {
        case "left":
            return wdShapeLeft;
        case "right":
            return wdShapeRight;
        case "middle":
            return wdShapeCenter;
        case "inside":
            return wdShapeInside;
        case "outside":
            return wdShapeOutside;
        default:
            // 防御性处理：若传入未预期值，默认外侧
            console.warn(`未知的位置值: ${position}，已默认使用 "outside"`);
            return wdShapeOutside;
    }
}

function removeFooterShape(footer: Wps.HeaderFooter) {
    // 删除所有包含页码域的文本框
    const shapes = footer.Shapes;
    for (let i = shapes.Count; i >= 1; i--) {
        const shape = shapes.Item(i);
        try {
            const textRange = shape.TextFrame?.TextRange;
            if (!textRange) continue;

            // 检查该文本框内是否有页码域
            const shapeFields = textRange.Fields;
            let hasPageField = false;
            for (let j = shapeFields.Count; j >= 1; j--) {
                if (shapeFields.Item(j).Type === wdFieldPage) {
                    hasPageField = true;
                    break;
                }
            }
            if (hasPageField) {
                shape.Delete();
            }
        } catch {
            // 忽略没有文本框的形状（如图片、线条、LOGO 等）
        }
    }
}

const PAGENUM_FIELD_TYPES = [wdFieldPage, wdFieldNumPages, wdFieldSectionPages];

/**
 * 清理指定页脚中的所有页码内容。
 *
 * 兼容三种来源：
 * 1. 本工具插入的 "ZdocPagenumBox" 文本框页码
 * 2. 用户手动插入的文本框页码
 * 3. WPS 内置 "插入页码" 生成的 Page/NumPages/SectionPages 域
 */
export function removePagenum(doc: Wps.Document = ActiveDocument): void {
    // 三种页脚类型
    const footerTypes = [
        wdHeaderFooterPrimary, // 主页脚
        wdHeaderFooterFirstPage, // 首页页脚
        wdHeaderFooterEvenPages, // 偶数页页脚
    ];

    for (let i = 1; i <= doc.Sections.Count; i++) {
        const section = doc.Sections.Item(i);
        for (const type of footerTypes) {
            try {
                const footer = section.Footers.Item(type);
                if (!footer) continue;

                // ① 删除 shape 中的页码文本框（本工具或用户手动加的）
                removeFooterShape(footer);

                // ② 删除 Range 中的页码域 —— 这是之前漏掉的关键步骤
                //    footer.Range.Text = "" 删不掉域本身，必须显式 Delete
                const fields = footer.Range.Fields;
                for (let j = fields.Count; j >= 1; j--) {
                    try {
                        const f = fields.Item(j);
                        if (PAGENUM_FIELD_TYPES.includes(Number(f.Type))) {
                            f.Delete();
                        }
                    } catch {
                        // 某个域访问异常，跳过
                    }
                }

                // ③ 清空残留可见文本（域删除后剩余的分隔符、空格等）
                footer.Range.Text = "";
            } catch {
                // 页脚不可访问（如首页不同但未启用等），跳过
            }
        }
    }
}

/**
 * 检测文档是否存在页码（同时检查页脚正文域和文本框中的页码域）
 */
export function hasPagenum(doc: Wps.Document = Application.ActiveDocument): boolean {
    if (!doc) return false;

    for (let i = 1; i <= doc.Sections.Count; i++) {
        const section = doc.Sections.Item(i);
        const footer = section.Footers.Item(wdHeaderFooterPrimary);
        if (!footer) continue;

        // 1. 检查页脚正文中的页码域
        const fields = footer.Range.Fields;
        for (let j = 1; j <= fields.Count; j++) {
            if (PAGENUM_FIELD_TYPES.includes(Number(fields.Item(j).Type))) return true;
        }

        // 2. 检查页脚中所有文本框内的页码域
        const shapes = footer.Shapes;
        for (let s = 1; s <= shapes.Count; s++) {
            try {
                const textRange = shapes.Item(s).TextFrame?.TextRange;
                if (!textRange) continue;
                const shapeFields = textRange.Fields;
                for (let f = 1; f <= shapeFields.Count; f++) {
                    if (PAGENUM_FIELD_TYPES.includes(Number(shapeFields.Item(f).Type))) {
                        return true;
                    }
                }
            } catch {
                // 忽略没有文本框的形状
            }
        }
    }
    return false;
}

/**
 * 在指定页脚中创建一个新的页码文本框（不检查是否已存在）
 * @returns 新创建的 Shape 对象
 */
function createPagenumShape(
    footer: Wps.HeaderFooter,
    position: number,
    font: string,
    fontSize: number,
): Wps.Shape {
    // 创建一个水平文本框
    const shape = footer.Shapes.AddTextbox(
        msoTextOrientationHorizontal,
        0,
        0,
        144,
        144,
        footer.Range,
    );
    shape.Name = "ZdocPagenumBox"; // 固定名称，用于后续查找

    // 配置样式和位置
    configureShape(shape, position);

    // 插入页码内容
    const textRange = shape.TextFrame.TextRange;
    insertPageNumber(textRange, font, fontSize);

    // 设置页码数字样式（仅新建时设置一次）
    footer.PageNumbers.NumberStyle = wdPageNumberStyleArabic;

    return shape;
}

/**
 * 添加页码（总是重建）
 *
 * 统一走 removePagenum + createPagenumShape，
 * 保证每次调用都用当前配置完整重设（位置、字体、模板一致）。
 */
export function addFooterPagenum(config?: FooterConfig, doc: Wps.Document = ActiveDocument): void {
    const finalConfig = { ...DEFAULT_FOOTER_CONFIG, ...config };

    // 关闭奇偶页不同
    doc.PageSetup.OddAndEvenPagesHeaderFooter = msoFalse;

    // 彻底清除所有页码
    removePagenum(doc);

    // 在第一节主页脚新建页码文本框
    const footer = doc.Sections.Item(1).Footers.Item(wdHeaderFooterPrimary);
    const position = mapPosition(finalConfig.position);
    createPagenumShape(footer, position, finalConfig.font, finalConfig.fontSize);
}
