import type {
    CustomFormatterDefinition,
    FormatterRegistry,
    MergeIssue,
    RenderedFormatOp,
    RowLoop,
} from "@/features/mail-merge/core";

import {
    applyPipes,
    createRegistry,
    findRowLoops,
    parsePlaceholderContent,
    parseTemplate,
    renderCellTemplate,
    renderTemplateNodes,
    resolvePath,
} from "@/features/mail-merge/core";
import { refreshDocumentView } from "@/wps/view";
import { withUndoRecord, withWpsQuiet } from "@/wps/withAction";

// ==================== 对外类型 ====================

export type MergeResultStatus = "success" | "warning" | "error";

export interface MergeTemplateReport {
    status: MergeResultStatus;
    documentName: string;
    issues: MergeIssue[];
    /** 复制 / 插入的行次数（嵌套展开会累计，含中间标记行） */
    outputRows: number;
    error?: string;
}

export interface MergeMailTemplateOptions {
    document?: Wps.Document;
    /** UI 中的自定义函数定义；语法错误只记 warning，不影响合并 */
    customFunctions?: readonly CustomFormatterDefinition[];
    refresh?: boolean;
    /** 批量流程已将模板预检一次时跳过逐文档预检 */
    skipPreflight?: boolean;
}

export interface MergeMailTemplateBatchTask {
    document: Wps.Document;
    data: unknown;
    name?: string;
    customFunctions?: readonly CustomFormatterDefinition[];
}

export interface MergeMailTemplateBatchReport {
    status: MergeResultStatus;
    reports: MergeTemplateReport[];
    successCount: number;
    warningCount: number;
    errorCount: number;
}

export interface ScanMailTemplateResult {
    placeholders: string[];
    loops: string[];
    hasTables: boolean;
    issues: MergeIssue[];
}

// ==================== 内部状态 ====================

interface MergeState {
    doc: Wps.Document;
    registry: FormatterRegistry;
    issues: MergeIssue[];
    outputRows: number;
    warnedWidthFallback: boolean;
}

/** 文档是否支持 Range.FitTextWidth 的探测缓存（COM 属性探测较慢） */
const fitWidthSupportCache = new WeakMap<object, boolean>();
const fitWidthWarnedDocs = new WeakSet<object>();

// ==================== 数据源 ====================

/**
 * 读取当前邮件合并记录的字段值。
 *
 * 返回普通对象，供模板 `{{字段}}` / `{{#each}}` 使用。
 * 注意：这里只读取当前记录；循环所需的嵌套数组需要用户在 UI 中导入 JSON。
 */
export function getCurrentMailMergeRecord(
    doc: Wps.Document = ActiveDocument,
): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null);

    try {
        const fields = doc.MailMerge?.DataSource?.DataFields;
        if (!fields) return result;

        for (let i = 1; i <= fields.Count; i++) {
            const field = fields.Item(i);
            if (field?.Name) result[field.Name] = field.Value;
        }
    } catch (error) {
        console.warn("[mergeTemplate] 读取当前合并记录失败", error);
    }

    return result;
}

// ==================== 扫描 / 预览 ====================

/** 扫描文档中的占位符与循环键（供弹窗展示，不做结构校验） */
export function scanMailMergeTemplate(doc: Wps.Document = ActiveDocument): ScanMailTemplateResult {
    const placeholders = new Set<string>();
    const loops = new Set<string>();
    const issues: MergeIssue[] = [];
    let hasTables = false;

    try {
        // 隐藏文字里的占位符也要能被扫描到
        try {
            doc.Content.TextRetrievalMode.IncludeHiddenText = true;
        } catch {
            // 部分版本不允许设置，忽略
        }

        const text = doc.Content.Text;
        const variableRe = /\{\{\s*([^#/][^}]*?)\s*\}\}/g;
        let match: RegExpExecArray | null;
        while ((match = variableRe.exec(text)) !== null) {
            const key = match[1].split("|")[0].trim();
            if (key) placeholders.add(key);
        }

        const loopRe = /\{\{\s*#each\s+([^}]+?)\s*\}\}/g;
        while ((match = loopRe.exec(text)) !== null) {
            const key = match[1].trim();
            if (key) loops.add(key);
        }

        // 页眉 / 页脚中的字段也要出现在扫描结果里
        try {
            for (let i = 1; i <= doc.Sections.Count; i++) {
                const section = doc.Sections.Item(i);
                for (const collection of [section.Headers, section.Footers]) {
                    for (const type of [
                        wdHeaderFooterPrimary,
                        wdHeaderFooterFirstPage,
                        wdHeaderFooterEvenPages,
                    ]) {
                        try {
                            const hf = collection.Item(type);
                            if (!hf || hf.Exists === false) continue;
                            const headerText = hf.Range.Text ?? "";
                            let m: RegExpExecArray | null;
                            variableRe.lastIndex = 0;
                            while ((m = variableRe.exec(headerText)) !== null) {
                                const key = m[1].split("|")[0].trim();
                                if (key) placeholders.add(key);
                            }
                            loopRe.lastIndex = 0;
                            while ((m = loopRe.exec(headerText)) !== null) {
                                const key = m[1].trim();
                                if (key) loops.add(key);
                            }
                        } catch {
                            // 忽略不可读的页眉类型
                        }
                    }
                }
            }
        } catch {
            // 文档模型没有 Sections 时忽略
        }

        hasTables = countTopLevelTables(doc) > 0;
        if (!hasTables && placeholders.size === 0 && loops.size === 0) {
            issues.push({
                level: "warn",
                code: "NO_TEMPLATE_CONTENT",
                message: "当前文档没有扫描到占位符",
            });
        }
    } catch (error) {
        issues.push({
            level: "warn",
            code: "SCAN_FAILED",
            message: `扫描模板失败：${error instanceof Error ? error.message : String(error)}`,
        });
    }

    return {
        placeholders: [...placeholders],
        loops: [...loops],
        hasTables,
        issues,
    };
}

/**
 * 把数据合并到模板文档：先展开表格行，再替换表格、正文、页眉页脚中的占位符。
 *
 * 写入前先做结构预检；存在 error 时不会修改文档。
 * 单个单元格 / 格式化器出错只记 warning，不中断。
 */
export function mergeMailTemplate(
    data: unknown,
    options: MergeMailTemplateOptions = {},
): MergeTemplateReport {
    const doc = options.document ?? ActiveDocument;
    const documentName = safeDocumentName(doc);
    const issues: MergeIssue[] = [];

    if (!doc) {
        return {
            status: "error",
            documentName,
            issues: [
                {
                    level: "error",
                    code: "NO_DOCUMENT",
                    message: "没有活动文档",
                },
            ],
            outputRows: 0,
            error: "没有活动文档",
        };
    }

    const { registry, errors } = createRegistry(options.customFunctions ?? []);
    for (const error of errors) {
        issues.push({
            level: "warn",
            code: "CUSTOM_FORMATTER_ERROR",
            message: `自定义函数「${error.name}」注册失败：${error.message}`,
            key: error.name,
        });
    }

    try {
        const structuralIssues = options.skipPreflight ? [] : validateDocumentStructure(doc);
        issues.push(...structuralIssues);
        if (structuralIssues.some((issue) => issue.level === "error")) {
            return {
                status: "error",
                documentName,
                issues,
                outputRows: 0,
                error: "模板结构非法，未写入文档",
            };
        }

        const tables = getTopLevelTables(doc);
        const state: MergeState = {
            doc,
            registry,
            issues,
            outputRows: 0,
            warnedWidthFallback: false,
        };

        withUndoRecord("邮件合并", () => {
            for (const table of tables) processTable(table, data, state);
            replaceBodyParagraphs(doc, data, state);
            replaceHeaderFooterParagraphs(doc, data, state);
        });

        if (options.refresh !== false) refreshDocumentView();

        const status: MergeResultStatus = issues.some((issue) => issue.level === "error")
            ? "error"
            : issues.some((issue) => issue.level === "warn")
              ? "warning"
              : "success";

        return {
            status,
            documentName,
            issues,
            outputRows: state.outputRows,
            error:
                status === "error"
                    ? issues.find((issue) => issue.level === "error")?.message
                    : undefined,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({
            level: "error",
            code: "MERGE_FAILED",
            message: `合并失败：${message}`,
        });
        return {
            status: "error",
            documentName,
            issues,
            outputRows: 0,
            error: message,
        };
    }
}

/**
 * 批量合并：每个文档独立 try/catch，任何单个文档失败都不会中断整批。
 * 调用方负责打开 / 关闭文档。
 */
export function mergeMailTemplateBatch(
    tasks: readonly MergeMailTemplateBatchTask[],
): MergeMailTemplateBatchReport {
    const reports: MergeTemplateReport[] = [];

    withWpsQuiet(() => {
        for (const task of tasks) {
            try {
                reports.push(
                    mergeMailTemplate(task.data, {
                        document: task.document,
                        customFunctions: task.customFunctions,
                        refresh: false,
                    }),
                );
            } catch (error) {
                reports.push({
                    status: "error",
                    documentName: task.name ?? safeDocumentName(task.document),
                    issues: [
                        {
                            level: "error",
                            code: "BATCH_DOCUMENT_FAILED",
                            message: error instanceof Error ? error.message : String(error),
                        },
                    ],
                    outputRows: 0,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    });

    const errorCount = reports.filter((report) => report.status === "error").length;
    const warningCount = reports.filter((report) => report.status === "warning").length;
    const successCount = reports.filter((report) => report.status === "success").length;

    return {
        status: errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "success",
        reports,
        successCount,
        warningCount,
        errorCount,
    };
}

/** 把批量报告转成适合日志 / 弹窗的中文摘要 */
export function formatBatchReport(report: MergeMailTemplateBatchReport): string {
    const lines = [
        `批量合并完成：成功 ${report.successCount}，有告警 ${report.warningCount}，失败 ${report.errorCount}`,
    ];
    for (const item of report.reports) {
        const label =
            item.status === "success" ? "成功" : item.status === "warning" ? "有告警" : "失败";
        lines.push(
            `- [${label}] ${item.documentName}（${item.outputRows} 行）` +
                (item.error ? `：${item.error}` : ""),
        );
    }
    return lines.join("\n");
}

// ==================== 结构预检 ====================

/** 对模板文档做一次结构预检；批量合并可复用，避免每个记录重复扫描 */
export function validateMailTemplateStructure(doc: Wps.Document = ActiveDocument): MergeIssue[] {
    return validateDocumentStructure(doc);
}

function validateDocumentStructure(doc: Wps.Document): MergeIssue[] {
    const issues: MergeIssue[] = [];

    const visitTable = (table: Wps.Table, depth: number) => {
        if (depth > 10) {
            issues.push({
                level: "error",
                code: "TABLE_DEPTH_EXCEEDED",
                message: "表格嵌套层级过深",
            });
            return;
        }

        try {
            const rows = readTableRows(table);
            const snapshots = rows.map(readRowSnapshot);
            const scan = findRowLoops(snapshots);
            issues.push(...scan.issues.filter((issue) => issue.level === "error"));

            const masked = maskedRowTexts(snapshots, scan.loops);
            for (const cells of masked) {
                for (const cell of cells) {
                    if (!cell.includes("{{")) continue;
                    const parsed = parseTemplate(cell);
                    issues.push(...parsed.issues.filter((issue) => issue.level === "error"));
                }
            }

            for (const row of rows) {
                for (const cell of readCells(row)) {
                    for (const nested of readNestedTables(cell)) visitTable(nested, depth + 1);
                }
            }
        } catch (error) {
            issues.push({
                level: "error",
                code: "TABLE_READ_FAILED",
                message: `读取表格结构失败：${
                    error instanceof Error ? error.message : String(error)
                }`,
            });
        }
    };

    for (const table of getTopLevelTables(doc)) visitTable(table, 0);
    issues.push(...validateBodyParagraphs(doc));
    return issues;
}

/** 正文段落里的内联循环也需要在写入前校验闭合 */
function validateBodyParagraphs(doc: Wps.Document): MergeIssue[] {
    const issues: MergeIssue[] = [];
    try {
        const content = doc.Content;
        const tableIntervals = collectTableIntervals(content);
        const count = content.Paragraphs.Count;

        for (let i = 1; i <= count; i++) {
            const paragraph = content.Paragraphs.Item(i);
            const range = paragraph?.Range;
            if (!range || isInsideTables(range.Start, tableIntervals)) continue;

            const text = stripParagraphMark(range.Text ?? "");
            if (!/\{\{\s*[#/]each\b/.test(text)) continue;

            const parsed = parseTemplate(text);
            issues.push(...parsed.issues.filter((issue) => issue.level === "error"));
        }
    } catch {
        // 部分文档模型不提供 Content.Paragraphs，忽略
    }
    return issues;
}

/** 去掉跨行循环标记，避免单元格级解析把它们误判为未闭合 */
function maskedRowTexts(snapshots: readonly string[][], loops: readonly RowLoop[]): string[][] {
    const copy = snapshots.map((cells) => [...cells]);
    for (const loop of loops) {
        const removals = [loop.start, loop.end].sort((a, b) => {
            if (a.rowIndex !== b.rowIndex) return b.rowIndex - a.rowIndex;
            if (a.cellIndex !== b.cellIndex) return b.cellIndex - a.cellIndex;
            return b.offset - a.offset;
        });
        for (const token of removals) {
            const cell = copy[token.rowIndex]?.[token.cellIndex];
            if (cell == null) continue;
            copy[token.rowIndex][token.cellIndex] =
                cell.slice(0, token.offset) + cell.slice(token.offset + token.length);
        }
    }
    return copy;
}

// ==================== 表格执行 ====================

function processTable(table: Wps.Table, context: unknown, state: MergeState): void {
    const rows = readTableRows(table);
    processRows(table, rows, context, state);
}

function processRows(table: Wps.Table, rows: Wps.Row[], context: unknown, state: MergeState): void {
    if (rows.length === 0) return;

    const snapshots = rows.map(readRowSnapshot);
    const scan = findRowLoops(snapshots);
    state.issues.push(...scan.issues);
    if (scan.issues.some((issue) => issue.level === "error")) return;

    const topLevel = scan.loops.filter((loop) => loop.depth === 0);
    const covered = new Set<number>();
    for (const loop of topLevel) {
        for (let i = loop.start.rowIndex; i <= loop.end.rowIndex; i++) covered.add(i);
    }

    // 循环外的行只渲染一次，使用当前上下文
    rows.forEach((row, index) => {
        if (!covered.has(index)) renderRow(row, context, state);
    });

    // 从后往前处理，避免前面的插入 / 删除影响后面的行号
    for (const loop of [...topLevel].sort((a, b) => b.start.rowIndex - a.start.rowIndex)) {
        expandRowLoop(table, rows, loop, context, state);
    }
}

function expandRowLoop(
    table: Wps.Table,
    rows: Wps.Row[],
    loop: RowLoop,
    context: unknown,
    state: MergeState,
): void {
    const start = loop.start.rowIndex;
    const end = loop.end.rowIndex;
    if (start == null || end == null || start < 0 || end >= rows.length) return;

    const originalRows = rows.slice(start, end + 1);
    const after = getNextRow(originalRows[originalRows.length - 1]);
    const value = resolvePath(context, loop.key, [], start + 1, false);

    if (!Array.isArray(value) || value.length === 0) {
        if (!Array.isArray(value)) {
            state.issues.push({
                level: "warn",
                code: "EACH_NOT_ARRAY",
                message: `循环「${loop.key}」不是数组，按空数组处理`,
                key: loop.key,
                templateRow: start + 1,
            });
        }
        removeRows(originalRows);
        return;
    }

    // 先去掉模板标记；只剩标记的行直接删除，有内容的标记行保留。
    const sourceRows = cleanLoopMarkers(originalRows, loop, start);
    if (sourceRows.length === 0) {
        removeRows(originalRows);
        return;
    }

    for (const row of originalRows) {
        if (!sourceRows.includes(row)) {
            try {
                row.Delete();
            } catch (error) {
                console.warn("[mergeTemplate] 删除标记行失败", error);
            }
        }
    }

    // 保留模板源行作为第一条数据，仅插入 items.length - 1 组新行；
    // 全部插入完成后再逐行填充，避免边插边改导致 Range 失效。
    const rowsForItems: Wps.Row[][] = [sourceRows];
    for (let i = 1; i < value.length; i++) {
        rowsForItems.push(cloneRows(table, sourceRows, after));
    }
    state.outputRows += sourceRows.length * value.length;

    for (let i = 0; i < value.length; i++) {
        // 内层循环基于当前 item 的上下文展开（不回退外层同名键）
        processRows(table, rowsForItems[i], value[i], state);
    }
}

/**
 * 去掉起止标记，并丢弃“只剩标记”的行。
 *
 * 返回实际要复制的源行；有内容的标记行会保留。
 */
function cleanLoopMarkers(rows: Wps.Row[], loop: RowLoop, rowOffset: number): Wps.Row[] {
    const removals = [loop.start, loop.end].sort((a, b) => {
        if (a.rowIndex !== b.rowIndex) return b.rowIndex - a.rowIndex;
        if (a.cellIndex !== b.cellIndex) return b.cellIndex - a.cellIndex;
        return b.offset - a.offset;
    });

    for (const token of removals) {
        const row = rows[token.rowIndex - rowOffset];
        if (!row) continue;
        const cell = getCell(row, token.cellIndex + 1);
        if (!cell) continue;

        const text = visibleCellText(cell);
        const cleaned = text.slice(0, token.offset) + text.slice(token.offset + token.length);
        writeCellText(cell, cleaned);
    }

    const markerRowIndexes = new Set([loop.start.rowIndex, loop.end.rowIndex]);
    return rows.filter((row, index) => {
        const absolute = index + rowOffset;
        if (!markerRowIndexes.has(absolute)) return true;
        return readRowSnapshot(row).some((cell) => cell.trim() !== "");
    });
}

/**
 * 复制行：必须通过 FormattedText 赋值，才能继承边框 / 底纹 / 列宽 / 行高。
 */
function cloneRows(
    table: Wps.Table,
    sourceRows: readonly Wps.Row[],
    after: Wps.Row | null,
): Wps.Row[] {
    const clones: Wps.Row[] = [];
    for (const source of sourceRows) {
        const row = after ? table.Rows.Add(after) : table.Rows.Add();
        row.Range.FormattedText = source.Range.FormattedText;
        clones.push(row);
    }
    return clones;
}

function removeRows(rows: readonly Wps.Row[]): void {
    for (let i = rows.length - 1; i >= 0; i--) {
        try {
            rows[i].Delete();
        } catch (error) {
            console.warn("[mergeTemplate] 删除模板行失败", error);
        }
    }
}

// ==================== 单元格渲染 ====================

function renderRow(row: Wps.Row, context: unknown, state: MergeState): void {
    const rowIndex = safeRowIndex(row);
    for (const cell of readCells(row)) {
        const nested = readNestedTables(cell);
        if (nested.length > 0) {
            // 嵌套表格整体复制后再用当前 item 递归展开；不重写承载它的单元格
            for (const table of nested) processTable(table, context, state);
            continue;
        }

        const text = visibleCellText(cell);
        if (!text.includes("{{")) continue;

        const rendered = renderCellTemplate(text, context, {
            registry: state.registry,
            templateRow: rowIndex,
        });
        state.issues.push(...rendered.issues);
        if (rendered.issues.some((issue) => issue.level === "error")) continue;

        writeCellText(cell, rendered.text);
        applyFormatOps(cell, rendered.text, rendered.ops, state);
    }
}

// ==================== 正文 / 页眉页脚占位符 ====================

/**
 * 替换表格之外的普通段落。
 *
 * 简单变量走“最小 Range 替换”，保留占位符前后的 run 格式；
 * 段落内联 `#each` 才整段重写（保留段落标记）。
 */
function replaceBodyParagraphs(doc: Wps.Document, context: unknown, state: MergeState): void {
    try {
        const content = doc.Content;
        replaceParagraphsInRange(content, context, state, collectTableIntervals(content));
    } catch (error) {
        state.issues.push({
            level: "warn",
            code: "BODY_REPLACE_FAILED",
            message: `正文占位符替换失败：${
                error instanceof Error ? error.message : String(error)
            }`,
        });
    }

    // 文本框是独立 story，单独处理；失败只告警
    if (!doc.Shapes) return;
    try {
        for (let i = 1; i <= doc.Shapes.Count; i++) {
            const shape = doc.Shapes.Item(i);
            const frame = shape.TextFrame;
            if (!frame || !frame.HasText) continue;
            replaceParagraphsInRange(frame.TextRange, context, state, []);
        }
    } catch (error) {
        state.issues.push({
            level: "warn",
            code: "SHAPE_REPLACE_FAILED",
            message: `文本框占位符替换失败：${
                error instanceof Error ? error.message : String(error)
            }`,
        });
    }
}

function replaceHeaderFooterParagraphs(
    doc: Wps.Document,
    context: unknown,
    state: MergeState,
): void {
    // 兼容测试用文档模型 / 极简 WPS 环境
    if (!doc.Sections) return;

    const types = [wdHeaderFooterPrimary, wdHeaderFooterFirstPage, wdHeaderFooterEvenPages];

    try {
        for (let i = 1; i <= doc.Sections.Count; i++) {
            const section = doc.Sections.Item(i);
            const collections = [
                { name: "页眉", collection: section.Headers },
                { name: "页脚", collection: section.Footers },
            ];

            for (const { name, collection } of collections) {
                for (const type of types) {
                    let hf: Wps.HeaderFooter | null = null;
                    try {
                        hf = collection.Item(type);
                    } catch {
                        continue;
                    }
                    if (!hf || hf.Exists === false) continue;

                    try {
                        // 页眉 / 页脚里的表格也先按行循环处理
                        try {
                            for (let t = 1; t <= hf.Range.Tables.Count; t++) {
                                processTable(hf.Range.Tables.Item(t), context, state);
                            }
                        } catch {
                            // 无表格或版本不支持时忽略
                        }

                        replaceParagraphsInRange(
                            hf.Range,
                            context,
                            state,
                            collectTableIntervals(hf.Range),
                        );
                    } catch (error) {
                        state.issues.push({
                            level: "warn",
                            code: "HEADER_REPLACE_FAILED",
                            message: `${name}占位符替换失败：${
                                error instanceof Error ? error.message : String(error)
                            }`,
                        });
                    }
                }
            }
        }
    } catch (error) {
        state.issues.push({
            level: "warn",
            code: "HEADER_REPLACE_FAILED",
            message: `遍历页眉 / 页脚失败：${
                error instanceof Error ? error.message : String(error)
            }`,
        });
    }
}

function replaceParagraphsInRange(
    container: Wps.Range,
    context: unknown,
    state: MergeState,
    tableIntervals: ReadonlyArray<[number, number]>,
): void {
    let count = 0;
    try {
        count = container.Paragraphs.Count;
    } catch {
        return;
    }

    // 从后往前：替换文本可能引入换行 / 新段落，倒序保证前面的段落位置不漂移
    for (let i = count; i >= 1; i--) {
        let paragraph: Wps.Paragraph | null = null;
        try {
            paragraph = container.Paragraphs.Item(i);
        } catch {
            continue;
        }
        if (!paragraph) continue;

        const range = paragraph.Range;
        if (isInsideTables(range.Start, tableIntervals)) continue;

        try {
            range.TextRetrievalMode.IncludeHiddenText = true;
        } catch {
            // 忽略
        }

        const rawText = range.Text ?? "";
        if (!rawText.includes("{{")) continue;
        const text = stripParagraphMark(rawText);
        if (text === "") continue;

        const hasInlineLoop = /\{\{\s*[#/]each\b/.test(text);
        if (hasInlineLoop) {
            replaceWholeParagraph(range, text, context, state);
        } else {
            replaceSimpleParagraph(range, text, context, state);
        }
    }
}

function replaceSimpleParagraph(
    paragraphRange: Wps.Range,
    text: string,
    context: unknown,
    state: MergeState,
): void {
    const matches: Array<{ index: number; raw: string; content: string }> = [];
    const baseStart = paragraphRange.Start;
    const regex = /\{\{([\s\S]*?)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        matches.push({ index: match.index, raw: match[0], content: match[1] });
    }

    // 从后往前替换，前面匹配的绝对偏移不受影响
    for (let i = matches.length - 1; i >= 0; i--) {
        const item = matches[i];
        const parsed = parsePlaceholderContent(item.content, item.raw);
        state.issues.push(...parsed.issues);
        if (!parsed.placeholder) continue;

        const value = resolvePath(context, parsed.placeholder.key, state.issues);
        const rendered = applyPipes(value, parsed.placeholder.steps, {
            registry: state.registry,
            key: parsed.placeholder.key,
            issues: state.issues,
        });

        try {
            const target = paragraphRange.Duplicate;
            const start = baseStart + item.index;
            target.SetRange(start, start + item.raw.length);
            target.Text = rendered.text;
            for (const op of rendered.ops) {
                applyFormatOp(target, op, rendered.text, state);
            }
        } catch (error) {
            state.issues.push({
                level: "warn",
                code: "PARAGRAPH_REPLACE_FAILED",
                message: `替换占位符「${item.raw}」失败，尝试整段替换：${
                    error instanceof Error ? error.message : String(error)
                }`,
                key: parsed.placeholder.key,
            });
            replaceWholeParagraph(paragraphRange, text, context, state);
            return;
        }
    }
}

function replaceWholeParagraph(
    paragraphRange: Wps.Range,
    text: string,
    context: unknown,
    state: MergeState,
): void {
    const parsed = parseTemplate(text);
    const rendered = renderTemplateNodes(parsed.nodes, context, {
        registry: state.registry,
    });
    state.issues.push(...parsed.issues, ...rendered.issues);
    if ([...parsed.issues, ...rendered.issues].some((issue) => issue.level === "error")) {
        return;
    }

    try {
        const content = paragraphRange.Duplicate;
        if ((content.Text ?? "").endsWith("\r")) content.End = content.End - 1;
        content.Text = rendered.text;
        applyOpsToRange(content, rendered.ops, rendered.text, state);
    } catch (error) {
        state.issues.push({
            level: "warn",
            code: "PARAGRAPH_REPLACE_FAILED",
            message: `段落模板替换失败：${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

function applyOpsToRange(
    base: Wps.Range,
    ops: readonly RenderedFormatOp[],
    renderedText: string,
    state: MergeState,
): void {
    for (const rendered of ops) {
        if (rendered.end <= rendered.start) continue;
        try {
            const target = base.Duplicate;
            target.SetRange(base.Start + rendered.start, base.Start + rendered.end);
            applyFormatOp(
                target,
                rendered.op,
                renderedText.slice(rendered.start, rendered.end),
                state,
            );
        } catch (error) {
            state.issues.push({
                level: "warn",
                code: "FORMAT_APPLY_FAILED",
                message: `应用格式失败：${error instanceof Error ? error.message : String(error)}`,
                key: rendered.key,
            });
        }
    }
}

function collectTableIntervals(container: Wps.Range): Array<[number, number]> {
    const intervals: Array<[number, number]> = [];
    try {
        for (let i = 1; i <= container.Tables.Count; i++) {
            const table = container.Tables.Item(i);
            intervals.push([table.Range.Start, table.Range.End]);
        }
    } catch {
        // 忽略
    }
    return intervals;
}

function isInsideTables(position: number, intervals: ReadonlyArray<[number, number]>): boolean {
    return intervals.some(([start, end]) => position >= start && position < end);
}

function stripParagraphMark(text: string): string {
    return text.replace(/\r$/u, "").replace(/\u0007$/u, "");
}

function applyFormatOps(
    cell: Wps.Cell,
    text: string,
    ops: readonly RenderedFormatOp[],
    state: MergeState,
): void {
    if (ops.length === 0) return;

    for (const rendered of ops) {
        if (rendered.end <= rendered.start) continue;
        try {
            const start = cell.Range.Start + rendered.start;
            const end = cell.Range.Start + rendered.end;
            const range = state.doc.Range(start, end);
            applyFormatOp(range, rendered.op, text.slice(rendered.start, rendered.end), state);
        } catch (error) {
            state.issues.push({
                level: "warn",
                code: "FORMAT_APPLY_FAILED",
                message: `应用格式失败：${error instanceof Error ? error.message : String(error)}`,
                key: rendered.key,
            });
        }
    }
}

function applyFormatOp(
    range: Wps.Range,
    op: RenderedFormatOp["op"],
    text: string,
    state: MergeState,
): void {
    if (op.type === "fontSpacing") {
        range.Font.Spacing = op.points;
        return;
    }

    if (supportsFitTextWidth(state.doc)) {
        try {
            range.FitTextWidth = op.chars;
            return;
        } catch (error) {
            fitWidthSupportCache.set(state.doc as object, false);
            console.warn("[mergeTemplate] FitTextWidth 设置失败，降级 Font.Spacing", error);
        }
    }

    // 降级：用字距近似“宽度为 n 字符”，同一文档只提示一次
    const delta = op.chars - [...text].length;
    range.Font.Spacing = Math.max(-2, Math.min(8, delta));
    if (!state.warnedWidthFallback && !fitWidthWarnedDocs.has(state.doc as object)) {
        state.warnedWidthFallback = true;
        fitWidthWarnedDocs.add(state.doc as object);
        state.issues.push({
            level: "warn",
            code: "WIDTH_FALLBACK",
            message:
                "当前 WPS 版本不支持 Range.FitTextWidth，width(n) 已降级为 Font.Spacing 近似效果",
        });
    }
}

function supportsFitTextWidth(doc: Wps.Document): boolean {
    const key = doc as object;
    const cached = fitWidthSupportCache.get(key);
    if (cached != null) return cached;

    let supported = false;
    try {
        const probe = doc.Range(0, 0) as unknown as Record<string, unknown>;
        supported = "FitTextWidth" in probe || typeof probe.FitTextWidth === "number";
    } catch {
        supported = false;
    }

    fitWidthSupportCache.set(key, supported);
    return supported;
}

// ==================== WPS 访问辅助 ====================

function getTopLevelTables(doc: Wps.Document): Wps.Table[] {
    const tables: Wps.Table[] = [];
    try {
        for (let i = 1; i <= doc.Tables.Count; i++) {
            const table = doc.Tables.Item(i);
            const level = (table as Wps.Table & { NestingLevel?: number }).NestingLevel;
            if (level == null || level <= 1) tables.push(table);
        }
    } catch (error) {
        console.warn("[mergeTemplate] 枚举表格失败", error);
    }
    return tables;
}

function countTopLevelTables(doc: Wps.Document): number {
    return getTopLevelTables(doc).length;
}

function readTableRows(table: Wps.Table): Wps.Row[] {
    const rows: Wps.Row[] = [];
    const count = table.Rows.Count;
    for (let i = 1; i <= count; i++) {
        try {
            const row = i === 1 && table.Rows.First ? table.Rows.First : table.Rows.Item(i);
            if (row) rows.push(row);
        } catch (error) {
            console.warn("[mergeTemplate] 读取表格行失败", i, error);
        }
    }
    return rows;
}

function readCells(row: Wps.Row): Wps.Cell[] {
    const cells: Wps.Cell[] = [];
    try {
        for (let i = 1; i <= row.Cells.Count; i++) {
            const cell = row.Cells.Item(i);
            if (cell) cells.push(cell);
        }
    } catch (error) {
        console.warn("[mergeTemplate] 读取行单元格失败", error);
    }
    return cells;
}

function getCell(row: Wps.Row, index1: number): Wps.Cell | null {
    try {
        return row.Cells.Item(index1) ?? null;
    } catch {
        return null;
    }
}

function getNextRow(row: Wps.Row | undefined): Wps.Row | null {
    if (!row) return null;
    try {
        return row.Next ?? null;
    } catch {
        return null;
    }
}

function readRowSnapshot(row: Wps.Row): string[] {
    return readCells(row).map((cell) => cellTextForTemplate(cell));
}

function cellTextForTemplate(cell: Wps.Cell): string {
    let text = visibleCellText(cell);

    // 从快照中抹掉嵌套表格内容，避免外层解析器误识别内层循环标记
    const nested = readNestedTables(cell);
    if (nested.length === 0 || text === "") return text;

    const base = cell.Range.Start;
    const chars = text.split("");
    for (const table of nested) {
        try {
            const start = Math.max(0, table.Range.Start - base);
            const end = Math.min(chars.length, table.Range.End - base);
            for (let i = start; i < end; i++) chars[i] = " ";
        } catch {
            // 忽略不可读的嵌套表格
        }
    }
    return chars.join("");
}

function readNestedTables(cell: Wps.Cell): Wps.Table[] {
    const tables: Wps.Table[] = [];
    try {
        const count = cell.Tables?.Count ?? 0;
        for (let i = 1; i <= count; i++) {
            const table = cell.Tables.Item(i);
            if (table) tables.push(table);
        }
    } catch {
        // 部分 WPS 版本 Cell.Tables 不可读
    }
    return tables;
}

/** 读取单元格可见文本，去掉表格结束标记 `\r\a` */
export function visibleCellText(cell: Wps.Cell): string {
    // 模板标记可能被设置为隐藏文字；显式开启隐藏文本检索再读取
    try {
        cell.Range.TextRetrievalMode.IncludeHiddenText = true;
    } catch {
        // 部分版本不允许设置，忽略
    }

    let text = cell.Range.Text ?? "";
    text = text.replace(/\r\u0007$/u, "");
    text = text.replace(/\r$/u, "");
    return text;
}

/**
 * 写入单元格文本。
 *
 * 必须先清理结束标记 `\r\a`，否则会把单元格标记写进内容里。
 */
export function writeCellText(cell: Wps.Cell, text: string): void {
    const clean = text.replace(/\r\u0007/gu, "").replace(/\r$/u, "");
    cell.Range.Text = clean;
}

function safeRowIndex(row: Wps.Row): number {
    try {
        return row.Index;
    } catch {
        return 0;
    }
}

function safeDocumentName(doc: Wps.Document | null | undefined): string {
    try {
        return doc?.Name ?? "当前文档";
    } catch {
        return "当前文档";
    }
}
