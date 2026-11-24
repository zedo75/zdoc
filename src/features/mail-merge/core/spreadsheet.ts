import type { MergeIssue } from "./types";

import * as XLSX from "xlsx";

/** 一行 Excel 数据；键为去重后的表头 */
export type MergeRecord = Record<string, unknown>;

export interface SheetRecords {
    sheetName: string;
    headers: string[];
    records: MergeRecord[];
    /** Excel 中的实际行号（从 1 开始），用于报告与文件名 {row} */
    rowNumbers: number[];
    issues: MergeIssue[];
}

/** 供 UI 展示的预览行，避免把整本工作簿塞进响应式状态 */
export interface SheetPreview {
    headers: string[];
    rows: MergeRecord[];
    rowNumbers: number[];
    total: number;
}

/**
 * 用 SheetJS 解析 xls / xlsx（以及 WPS 的 .et，若其内部结构可被 SheetJS 识别）。
 *
 * 传入 ArrayBuffer 而不是文本，避免二进制表格被错误解码。
 */
export function parseSpreadsheet(buffer: ArrayBuffer | Uint8Array): XLSX.WorkBook {
    try {
        return XLSX.read(buffer, {
            type: "array",
            cellDates: false,
            cellText: false,
            dense: false,
        });
    } catch (error) {
        throw new Error(
            `无法读取表格文件：${error instanceof Error ? error.message : String(error)}。` +
                "请确认文件是 .xlsx / .xls 或可被识别的 .et 表格。",
        );
    }
}

/** 工作簿中的工作表名 */
export function listSheetNames(workbook: XLSX.WorkBook): string[] {
    return workbook.SheetNames.slice();
}

/**
 * 读取工作表：第一行（或指定表头行）作为字段名，之后每行一条记录。
 *
 * - 表头去空格、空表头补 `列N`、重复表头加 `_2`；
 * - 整行为空的行跳过；
 * - 空值保留为空字符串；
 * - 合并单元格按左上角取值并记 warning。
 */
export function readSheetRecords(
    workbook: XLSX.WorkBook,
    sheetName: string,
    headerRow = 1,
): SheetRecords {
    const issues: MergeIssue[] = [];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        return {
            sheetName,
            headers: [],
            records: [],
            rowNumbers: [],
            issues: [
                {
                    level: "error",
                    code: "SHEET_NOT_FOUND",
                    message: `工作表「${sheetName}」不存在`,
                },
            ],
        };
    }

    if (!Number.isInteger(headerRow) || headerRow < 1) {
        return {
            sheetName,
            headers: [],
            records: [],
            rowNumbers: [],
            issues: [
                {
                    level: "error",
                    code: "INVALID_HEADER_ROW",
                    message: "表头行必须是大于等于 1 的整数",
                },
            ],
        };
    }

    if ((sheet["!merges"]?.length ?? 0) > 0) {
        issues.push({
            level: "warn",
            code: "MERGED_CELLS",
            message: "数据源包含合并单元格，已按左上角单元格取值；请尽量使用规则二维表",
        });
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: true,
    });

    if (matrix.length < headerRow) {
        return {
            sheetName,
            headers: [],
            records: [],
            rowNumbers: [],
            issues: [
                {
                    level: "error",
                    code: "EMPTY_SHEET",
                    message: `工作表「${sheetName}」中没有第 ${headerRow} 行表头`,
                },
            ],
        };
    }

    const headerCells = matrix[headerRow - 1] ?? [];
    const headers = normalizeHeaders(headerCells);
    if (headers.length === 0) {
        return {
            sheetName,
            headers: [],
            records: [],
            rowNumbers: [],
            issues: [
                {
                    level: "error",
                    code: "EMPTY_HEADER",
                    message: `工作表「${sheetName}」第 ${headerRow} 行没有可用表头`,
                },
            ],
        };
    }

    const records: MergeRecord[] = [];
    const rowNumbers: number[] = [];

    for (let index = headerRow; index < matrix.length; index++) {
        const row = matrix[index] ?? [];
        if (row.every((cell) => cell == null || String(cell).trim() === "")) continue;

        const record: MergeRecord = Object.create(null) as MergeRecord;
        headers.forEach((header, column) => {
            record[header] = row[column] ?? "";
        });

        // 非枚举元数据，模板里不会误取；批量流程用它做 {row}
        Object.defineProperty(record, "__zdocRow", {
            value: index + 1,
            enumerable: false,
            configurable: true,
        });
        Object.defineProperty(record, "__zdocCells", {
            value: row,
            enumerable: false,
            configurable: true,
        });

        records.push(record);
        rowNumbers.push(index + 1);
    }

    if (records.length === 0) {
        issues.push({
            level: "warn",
            code: "NO_RECORDS",
            message: `工作表「${sheetName}」表头之后没有数据行`,
        });
    }

    return { sheetName, headers, records, rowNumbers, issues };
}

/** 只取前 limit 条记录用于 UI 预览 */
export function previewSheetRecords(
    workbook: XLSX.WorkBook,
    sheetName: string,
    headerRow = 1,
    limit = 20,
): SheetPreview {
    const result = readSheetRecords(workbook, sheetName, headerRow);
    return {
        headers: result.headers,
        rows: result.records.slice(0, limit),
        rowNumbers: result.rowNumbers.slice(0, limit),
        total: result.records.length,
    };
}

function normalizeHeaders(cells: readonly unknown[]): string[] {
    const seen = new Map<string, number>();
    const headers: string[] = [];

    cells.forEach((cell, index) => {
        let name = cell == null ? "" : String(cell).trim();
        if (!name) name = `列${index + 1}`;

        const count = seen.get(name) ?? 0;
        seen.set(name, count + 1);
        if (count > 0) name = `${name}_${count + 1}`;
        headers.push(name);
    });

    return headers;
}

/** 保留为数据清洗扩展点；当前原样返回 Excel 值 */
export function parseCellValue(value: unknown): unknown {
    return value;
}
