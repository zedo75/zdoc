import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
    defaultNamePattern,
    expandMergeFileName,
    listSheetNames,
    parseSpreadsheet,
    readSheetRecords,
} from "@/features/mail-merge/core";

function makeWorkbook(): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
        ["姓名", "金额", "明细", "姓名"],
        ["张三", 1234.5, '[{"项目":"打印","金额":12}]', "重复列"],
        [],
        ["李四", 7, "", "重复列2"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "人员");
    const empty = XLSX.utils.aoa_to_sheet([["标题"], []]);
    XLSX.utils.book_append_sheet(workbook, empty, "空白");
    return workbook;
}

describe("spreadsheet reading", () => {
    it("round-trips an xlsx ArrayBuffer through SheetJS", () => {
        const source = makeWorkbook();
        const buffer = XLSX.write(source, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        const parsed = parseSpreadsheet(buffer);

        expect(listSheetNames(parsed)).toEqual(["人员", "空白"]);
        const result = readSheetRecords(parsed, "人员");

        expect(result.headers).toEqual(["姓名", "金额", "明细", "姓名_2"]);
        expect(result.records).toHaveLength(2);
        expect(result.records[0]["姓名"]).toBe("张三");
        expect(result.records[0]["金额"]).toBe(1234.5);
        expect(result.records[0]["明细"]).toBe('[{"项目":"打印","金额":12}]');
        expect(result.records[1]["姓名_2"]).toBe("重复列2");
        expect(result.rowNumbers).toEqual([2, 4]);
    });

    it("supports a custom header row and warns for empty data", () => {
        const source = makeWorkbook();
        const buffer = XLSX.write(source, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        const parsed = parseSpreadsheet(buffer);

        const result = readSheetRecords(parsed, "人员", 1);
        expect(result.records.length).toBe(2);

        const empty = readSheetRecords(parsed, "空白");
        expect(empty.records).toHaveLength(0);
        expect(empty.issues.some((issue) => issue.code === "NO_RECORDS")).toBe(true);
    });

    it("returns a useful error for a missing sheet", () => {
        const result = readSheetRecords(makeWorkbook(), "不存在");
        expect(result.records).toEqual([]);
        expect(result.issues[0].code).toBe("SHEET_NOT_FOUND");
    });

    it("warns about merged cells and keeps the top-left value", () => {
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([
            ["姓名", "", "金额"],
            ["张三", "", 12],
        ]);
        sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
        XLSX.utils.book_append_sheet(workbook, sheet, "合并");

        const result = readSheetRecords(workbook, "合并");
        expect(result.issues.some((issue) => issue.code === "MERGED_CELLS")).toBe(true);
        expect(result.records[0]["姓名"]).toBe("张三");
    });
});

describe("output file naming", () => {
    it("expands Mustache fields and built-in placeholders", () => {
        const name = expandMergeFileName(
            '{{姓名}}_{{金额 | "0.00"}}_{index}_{row}',
            { 姓名: "张三", 金额: 7 },
            { index: 3, rowNumber: 5, date: new Date("2026-01-02T03:04:05") },
        );
        expect(name).toBe("张三_7.00_3_5");
    });

    it("sanitizes illegal path characters and strips document extensions", () => {
        const name = expandMergeFileName(
            "{{姓名}}.docx",
            { 姓名: 'A/B:C*"D?' },
            { index: 1, rowNumber: 2 },
        );
        expect(name).toBe("A B C D");
    });

    it("offers a first-column default", () => {
        expect(defaultNamePattern(["姓名", "金额"])).toBe("{{姓名}}");
        expect(defaultNamePattern([])).toBe("合并结果_{index}");
    });
});
