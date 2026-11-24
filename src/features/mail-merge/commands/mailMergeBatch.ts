import type {
    CustomFormatterDefinition,
    DocxLoopMode,
    MergeIssue,
    MergeRecord,
} from "@/features/mail-merge/core";

import {
    analyzeDocxTemplate,
    createRegistry,
    expandMergeFileName,
    groupMergeRecords,
    renderDocx,
} from "@/features/mail-merge/core";
import { delay, yieldToUi } from "@/utils/async";
import { errorText } from "@/utils/error";
import { resolveOutputPath } from "@/utils/fileName";
import { baseNameOf, dirOf, extOf, joinPath, normalizePath } from "@/utils/filePath";
import { closeQuietly, findOpenDocument, openDocument } from "@/wps/document";
import { ensureDirectory, pathExists, removeFile } from "@/wps/fileSystem";
import { refreshDocumentView } from "@/wps/view";
import { withWpsQuiet } from "@/wps/withAction";

export type MailMergeItemStatus = "success" | "warning" | "error";

export interface DocMergeReport {
    status: MailMergeItemStatus;
    mode: DocxLoopMode;
    issues: MergeIssue[];
}

export interface MailMergeItemResult {
    index: number;
    /** Excel 实际行号（分组模式取首行） */
    rowNumber: number;
    status: MailMergeItemStatus;
    outputPath?: string;
    report?: DocMergeReport;
    error?: string;
}

export interface MailMergeBatchOptions {
    templatePath: string;
    /** 已被 UI 选择的行；A..B / 单条 / 全部在 UI 层筛好 */
    records: readonly MergeRecord[];
    rowNumbers: readonly number[];
    outputDir: string;
    /** 文件名模式，支持 {{列名}} / {index} / {row} / {date} / {time} */
    namePattern: string;
    overwrite?: boolean;
    customFunctions?: readonly CustomFormatterDefinition[];
}

export interface MailMergeBatchResult {
    status: MailMergeItemStatus;
    mode: DocxLoopMode;
    successCount: number;
    warningCount: number;
    failCount: number;
    results: MailMergeItemResult[];
    /** 模板级别的结构错误；出现时不会生成任何文件 */
    templateIssues: MergeIssue[];
}

export interface MailMergeHooks {
    onItemStart?: (index: number, total: number, record: MergeRecord) => void;
    onProgress?: (index: number, total: number, result: MailMergeItemResult) => void;
}

export interface PreviewMailMergeOptions {
    templatePath: string;
    record?: MergeRecord;
    /** group 模式下预览多条记录 */
    records?: readonly MergeRecord[];
    customFunctions?: readonly CustomFormatterDefinition[];
}

export interface PreviewMailMergeResult {
    success: boolean;
    previewPath?: string;
    report?: DocMergeReport;
    error?: string;
}

interface PreparedTemplate {
    path: string;
    name: string;
    ext: string;
    bytes: ArrayBuffer;
}

// ==================== 模板读取 ====================

/** 校验模板路径与文档状态 */
export function prepareTemplatePath(path: string): Omit<PreparedTemplate, "bytes"> {
    if (!path) throw new Error("模板文档还没有保存，请先保存当前文档");
    if (!pathExists(path)) throw new Error("模板文档不存在，请重新保存后再试");

    const ext = extOf(path);
    if (![".doc", ".docx", ".wps"].includes(ext)) {
        throw new Error("模板必须是 .doc / .docx / .wps 文档");
    }
    return { path, name: baseNameOf(path), ext };
}

/**
 * 读取模板 DOCX。.doc / .wps 先用 WPS 转成临时 DOCX，整个批次只转换一次。
 */
async function loadTemplateDocx(base: Omit<PreparedTemplate, "bytes">): Promise<PreparedTemplate> {
    if (base.ext === ".docx") {
        const buffer = Application.FileSystem.ReadFileAsArrayBuffer(base.path);
        if (!buffer) throw new Error("读取模板失败");
        return { ...base, bytes: buffer };
    }

    const sourceTemp = tempPath(base.ext);
    const docxTemp = tempPath(".docx");
    let doc: Wps.Document | null = null;

    try {
        if (!copyFile(base.path, sourceTemp)) throw new Error("复制模板失败");
        doc = openDocument(sourceTemp, { visible: false });
        doc.SaveAs2(docxTemp, wdFormatXMLDocument);
        closeQuietly(doc);
        doc = null;

        const buffer = Application.FileSystem.ReadFileAsArrayBuffer(docxTemp);
        if (!buffer) throw new Error("转换模板为 DOCX 失败");
        return { ...base, bytes: buffer };
    } finally {
        closeQuietly(doc);
        safeRemove(sourceTemp);
        safeRemove(docxTemp);
    }
}

/** 分析模板模式（row / group），供批量流程决定输出粒度 */
export async function detectMailMergeMode(templatePath: string): Promise<{
    mode: DocxLoopMode;
    issues: MergeIssue[];
}> {
    const base = prepareTemplatePath(templatePath);
    const template = await loadTemplateDocx(base);
    return analyzeDocxTemplate(template.bytes);
}

// ==================== 批量合并 ====================

/**
 * 一条数据 → 一个 DOCX（row 模式），或 group 模式下一次渲染所选行。
 *
 * 渲染直接在内存里完成，不再为每条记录打开 / 关闭 WPS 文档。
 */
export async function mergeExcelRecords(
    options: MailMergeBatchOptions,
    hooks: MailMergeHooks = {},
): Promise<MailMergeBatchResult> {
    const results: MailMergeItemResult[] = [];
    let templateIssues: MergeIssue[] = [];
    let mode: DocxLoopMode = "none";
    const { registry } = createRegistry(options.customFunctions ?? []);

    try {
        const base = prepareTemplatePath(options.templatePath);
        const template = await withWpsQuiet(() => loadTemplateDocx(base));
        const info = await analyzeDocxTemplate(template.bytes);
        templateIssues = info.issues;
        mode = info.mode;

        if (info.issues.some((issue) => issue.level === "error")) {
            return {
                status: "error",
                mode,
                successCount: 0,
                warningCount: 0,
                failCount: 0,
                results: [],
                templateIssues,
            };
        }

        const outputDir = options.outputDir.trim() || dirOf(template.path);
        ensureDirectory(outputDir);
        const taken = new Set<string>([normalizePath(template.path)]);
        const date = new Date();

        // group 模式：一个组一个文件；records 传所选全部行，groupIndex 负责选中组
        interface RenderTask {
            records: MergeRecord[];
            rowNumber: number;
            index: number;
            groupIndex?: number;
            nameRecord?: MergeRecord;
        }

        let tasks: RenderTask[];
        if (mode === "group") {
            if (!info.groupBy) {
                templateIssues = [
                    ...templateIssues,
                    {
                        level: "error",
                        code: "GROUP_BY_MISSING",
                        message: "group 模板缺少 by: 分组列",
                    },
                ];
                return {
                    status: "error",
                    mode,
                    successCount: 0,
                    warningCount: 0,
                    failCount: 0,
                    results: [],
                    templateIssues,
                };
            }

            const groups = groupMergeRecords(
                options.records,
                info.groupBy,
                info.groupKeep ?? false,
            );
            tasks = groups.map((group, groupIndex) => ({
                records: [...options.records],
                rowNumber:
                    options.rowNumbers[group.startIndex] ??
                    options.rowNumbers[0] ??
                    group.startIndex + 2,
                index: groupIndex + 1,
                groupIndex,
                nameRecord: group.rows[0],
            }));
        } else {
            tasks = options.records.map((record, index) => ({
                records: [record],
                rowNumber: options.rowNumbers[index] ?? index + 2,
                index: index + 1,
                nameRecord: record,
            }));
        }

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            hooks.onItemStart?.(i + 1, tasks.length, task.nameRecord ?? task.records[0]);
            await delay(6);

            const result = await renderOneTask(
                template,
                task.records,
                task.rowNumber,
                task.index,
                task.groupIndex,
                task.nameRecord,
                outputDir,
                options,
                registry,
                taken,
                date,
            ).catch((error: unknown) => ({
                index: task.index,
                rowNumber: task.rowNumber,
                status: "error" as const,
                error: errorText(error),
            }));
            results.push(result);
            hooks.onProgress?.(i + 1, tasks.length, result);
            await yieldToUi();
        }
    } catch (error) {
        templateIssues = [
            {
                level: "error",
                code: "TEMPLATE_PREPARE_FAILED",
                message: `模板准备失败：${errorText(error)}`,
            },
        ];
        return {
            status: "error",
            mode,
            successCount: 0,
            warningCount: 0,
            failCount: 0,
            results,
            templateIssues,
        };
    }

    const successCount = results.filter((item) => item.status === "success").length;
    const warningCount = results.filter((item) => item.status === "warning").length;
    const failCount = results.filter((item) => item.status === "error").length;

    return {
        status: failCount > 0 ? "error" : warningCount > 0 ? "warning" : "success",
        mode,
        successCount,
        warningCount,
        failCount,
        results,
        templateIssues,
    };
}

async function renderOneTask(
    template: PreparedTemplate,
    records: readonly MergeRecord[],
    rowNumber: number,
    index: number,
    groupIndex: number | undefined,
    nameRecord: MergeRecord | undefined,
    outputDir: string,
    options: MailMergeBatchOptions,
    registry: ReturnType<typeof createRegistry>["registry"],
    taken: Set<string>,
    date: Date,
): Promise<MailMergeItemResult> {
    const first = nameRecord ?? records[0] ?? (Object.create(null) as MergeRecord);
    const stem = expandMergeFileName(
        options.namePattern,
        first,
        {
            index,
            rowNumber,
            date,
            templateName: template.name,
        },
        registry,
    )
        .replace(/\.(docx?|wps)$/i, "")
        .trim();

    const target = resolveOutputPath(outputDir, stem || `合并结果_${index}`, ".docx", {
        taken,
        overwrite: options.overwrite ?? false,
        exists: pathExists,
        errorHint: "输出目录",
    });

    try {
        const rendered = await renderDocx(template.bytes, records, {
            customFunctions: options.customFunctions,
            rootRecord: first,
            groupIndex,
        });

        if (rendered.issues.some((issue) => issue.level === "error")) {
            throw new Error(
                rendered.issues.find((issue) => issue.level === "error")?.message ?? "模板渲染失败",
            );
        }

        if (!writeBinaryFile(target, rendered.bytes)) {
            throw new Error("写入输出文件失败");
        }

        return {
            index,
            rowNumber,
            status: rendered.issues.some((issue) => issue.level === "warn") ? "warning" : "success",
            outputPath: target,
            report: {
                status: rendered.issues.some((issue) => issue.level === "warn")
                    ? "warning"
                    : "success",
                mode: rendered.mode,
                issues: rendered.issues,
            },
        };
    } catch (error) {
        safeRemove(target);
        return {
            index,
            rowNumber,
            status: "error",
            error: errorText(error),
        };
    }
}

// ==================== 预览 ====================

/**
 * 预览：渲染到临时 DOCX → 打开新窗口 → 标记为未保存。
 */
export async function previewMailMergeRecord(
    options: PreviewMailMergeOptions,
): Promise<PreviewMailMergeResult> {
    let template: PreparedTemplate;
    try {
        const base = prepareTemplatePath(options.templatePath);
        const existing = findOpenDocument(base.path);
        if (existing && !existing.Saved) {
            return { success: false, error: "模板文档有未保存修改，请先保存后再预览" };
        }
        template = await withWpsQuiet(() => loadTemplateDocx(base));
    } catch (error) {
        return { success: false, error: errorText(error) };
    }

    const records = options.records?.length
        ? [...options.records]
        : options.record
          ? [options.record]
          : [];

    if (records.length === 0) {
        return { success: false, error: "没有可用于预览的记录" };
    }

    const info = await analyzeDocxTemplate(template.bytes);
    let groupIndex: number | undefined;
    let rootRecord = records[0];
    if (info.mode === "group") {
        if (!info.groupBy) {
            return { success: false, error: "group 模板缺少 by: 分组列" };
        }
        const groups = groupMergeRecords(records, info.groupBy, info.groupKeep ?? false);
        if (groups.length === 0) {
            return { success: false, error: "所选记录没有可预览的分组" };
        }
        groupIndex = 0;
        rootRecord = groups[0].rows[0];
    }

    const previewPath = tempPath(".docx", "zdoc-预览-");
    try {
        const rendered = await renderDocx(template.bytes, records, {
            customFunctions: options.customFunctions,
            rootRecord,
            groupIndex,
        });

        if (rendered.issues.some((issue) => issue.level === "error")) {
            return {
                success: false,
                report: {
                    status: "error",
                    mode: rendered.mode,
                    issues: rendered.issues,
                },
                error:
                    rendered.issues.find((issue) => issue.level === "error")?.message ??
                    "预览合并失败",
            };
        }

        if (!writeBinaryFile(previewPath, rendered.bytes)) {
            return { success: false, error: "写入预览文件失败" };
        }

        const doc = openDocument(previewPath, { visible: true });
        try {
            // 让用户看到的是一份“已合并但尚未保存”的文档
            doc.Saved = false;
            doc.Activate();
        } catch {
            // 部分版本 ActiveWindow / Saved 不可写，忽略
        }

        return {
            success: true,
            previewPath,
            report: {
                status: rendered.issues.some((issue) => issue.level === "warn")
                    ? "warning"
                    : "success",
                mode: rendered.mode,
                issues: rendered.issues,
            },
        };
    } catch (error) {
        safeRemove(previewPath);
        return { success: false, error: errorText(error) };
    }
}

// ==================== 快速插入占位符 ====================

/**
 * 在模板文档当前光标处插入 `{{列名}}`。
 *
 * 预览会打开新的临时文档，因此这里必须按模板路径找回原文档，
 * 不能直接用 ActiveDocument。
 */
export function insertMailMergePlaceholder(placeholder: string, templatePath?: string): void {
    const doc = templatePath ? findOpenDocument(templatePath) : ActiveDocument;
    if (!doc) throw new Error("模板文档未打开，无法插入占位符");

    try {
        doc.Activate();
    } catch {
        // 部分版本不支持 Activate，继续尝试用其 ActiveWindow
    }
    const selection = doc.ActiveWindow.Selection;
    selection.Range.Text = placeholder;
    refreshDocumentView();
}

// ==================== 文件 / 报告辅助 ====================

function writeBinaryFile(path: string, bytes: Uint8Array): boolean {
    try {
        return Application.FileSystem.writeAsBinaryString(path, bytesToBinaryString(bytes));
    } catch (error) {
        console.warn("[mailMerge] 写入文件失败", path, error);
        return false;
    }
}

function bytesToBinaryString(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    let result = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        result += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return result;
}

function copyFile(source: string, target: string): boolean {
    try {
        return Application.FileSystem.copyFileSync(source, target);
    } catch (error) {
        console.warn("[mailMerge] 复制文件失败", source, target, error);
        return false;
    }
}

function safeRemove(path: string): void {
    if (!path) return;
    try {
        if (pathExists(path)) removeFile(path);
    } catch {
        // 删除临时文件失败不影响主流程
    }
}

function tempPath(ext: string, prefix = "zdoc-mm-"): string {
    const tempDir = Application.Env.GetTempPath();
    const stamp = new Date()
        .toISOString()
        .replace(/[^0-9]/g, "")
        .slice(0, 14);
    const random = Math.random().toString(36).slice(2, 8);
    return joinPath(tempDir, `${prefix}${stamp}-${random}${ext}`);
}

/** 批量报告转成日志文本 */
export function formatMailMergeLog(result: MailMergeBatchResult): string {
    const lines = [
        `合并完成：成功 ${result.successCount}，有告警 ${result.warningCount}，失败 ${result.failCount}`,
    ];
    for (const item of result.results) {
        if (item.status === "error") {
            lines.push(`- 第 ${item.rowNumber} 行：失败 - ${item.error ?? "未知错误"}`);
        } else {
            const suffix = item.status === "warning" ? "（有告警）" : "";
            lines.push(`- 第 ${item.rowNumber} 行：${item.outputPath}${suffix}`);
        }
    }
    return lines.join("\n");
}
