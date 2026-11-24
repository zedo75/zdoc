import type { TypographyConfig } from "@/config/types";

import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";
import { withUndoRecord } from "@/wps/withAction";

/**
 * Macro1 Macro
 * 宏由 专题班 录制，时间: 2026/8/21
 */
export function formatSimpleTable(_doc: Wps.Document = ActiveDocument) {
    const sel = Application.Selection;
    // 2. 设置段落格式
    const table = sel.Tables.Item(1);
    table.Select();
    let pf = sel.ParagraphFormat;
    // 重置段落格式为常用默认状态
    pf.Alignment = wdAlignParagraphCenter;
    pf.CharacterUnitFirstLineIndent = 0; // 首行缩进字符数设为 0（取消首行缩进）
    pf.FirstLineIndent = 0; // 首行缩进磅值设为 0（确保无缩进）
    pf.CharacterUnitLeftIndent = 0; // 左缩进
    pf.LeftIndent = 0;
    pf.CharacterUnitRightIndent = 0; // 右缩进
    pf.RightIndent = 0;
    pf.WidowControl = 0; // 孤行控制关闭（允许段落首尾行单独出现）
    pf.KeepWithNext = 0; // 不与下段同页（关闭）
    pf.KeepTogether = 0; // 段中不分页关闭（允许段落跨页断开）
    pf.PageBreakBefore = 0; // 段前分页关闭（不在段前强制分页）
    pf.HalfWidthPunctuationOnTopOfLine = 0; // 不允许行首出现半角标点（关闭）
    pf.AddSpaceBetweenFarEastAndAlpha = -1; // 自动调整中文与西文字符间距（启用）
    pf.AddSpaceBetweenFarEastAndDigit = -1; // 自动调整中文与数字间距（启用）
    pf.BaseLineAlignment = wdBaselineAlignAuto; // 基线对齐方式设为自动
    pf.LineSpacingRule = wdLineSpaceExactly; // 行高用固定值
    pf.LineSpacing = 20; // 行高 20 磅

    // 获取该表格的所有行
    let rows = table.Rows;
    rows.HeightRule = wdRowHeightAtLeast;
    rows.Height = Application.CentimetersToPoints(1.1); // 行高最小值 1.1cm
    rows.AllowBreakAcrossPages = msoTrue; // 允许跨页断行

    // 4. 设置字体格式
    let font = Application.Selection.Font;
    font.NameFarEast = "仿宋_GB2312";
    font.NameAscii = "Times New Roman";
    font.Size = 14;

    // 表头（首行）用黑体
    const tableHeader = table.Rows.First; // WPS bug: Rows.Item(1) 可能得到 null
    tableHeader.Select();
    Application.Selection.Font.Name = "黑体";
    Application.Selection.Font.NameAscii = "Times New Roman";
    Application.Selection.Collapse(wdCollapseEnd);

    // 7. 设置行对齐与缩进
    rows.Alignment = wdAlignRowCenter;
    rows.WrapAroundText = 0; // 取消文字环绕
    rows.LeftIndent = 0; // 取消左缩进

    // 6. 设置单元格垂直对齐
    sel.Cells.VerticalAlignment = wdCellAlignVerticalCenter;
}

export function formatTables(doc: Wps.Document = ActiveDocument) {
    const tables = doc.Tables;
    const tableCount = tables.Count;
    if (tableCount === 0) {
        wpsAlert("文档中没有表格");
        return;
    }
    const config: TypographyConfig = DEFAULT_TYPO_CONFIG;
    const mainFont = config.main.zh || "仿宋_GB2312";
    const mainSize = config.main.size || 16;
    const headerFont = config.h1.font || "黑体";

    withUndoRecord("排版表格", () => {
        for (let i = 1; i <= tableCount; i++) {
            const table = tables.Item(i);

            const rowCount = table.Rows.Count;
            const colCount = table.Columns.Count;

            for (let r = 1; r <= rowCount; r++) {
                for (let c = 1; c <= colCount; c++) {
                    const cell = table.Cell(r, c);
                    const range = cell.Range;
                    const font = range.Font;

                    font.NameFarEast = r === 1 ? headerFont : mainFont;
                    font.Name = font.NameFarEast;
                    font.NameAscii =
                        r === 1 ? "Times New Roman" : config.main.en || "Times New Roman";
                    font.Size = mainSize;
                    font.Bold = r === 1 ? msoTrue : msoFalse;

                    const pf = range.ParagraphFormat;
                    pf.Alignment = wdAlignParagraphCenter;
                    pf.SpaceBefore = 0;
                    pf.SpaceAfter = 0;
                    pf.LineSpacingRule = wdLineSpaceExactly;
                    pf.LineSpacing = mainSize * 1.8;
                    pf.CharacterUnitFirstLineIndent = 0;
                }
            }

            table.AutoFitBehavior(wdAutoFitWindow);
        }
    });

    wpsConfirm(
        `已排版 ${tableCount} 个表格。\n- 表头：${headerFont}，${mainSize}pt，加粗，居中\n- 内容：${mainFont}，${mainSize}pt，居中`,
    );
}
