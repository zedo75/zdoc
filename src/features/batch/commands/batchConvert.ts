import { delay, yieldToUi } from "@/utils/async";
import { errorText } from "@/utils/error";
import { resolveOutputPath } from "@/utils/fileName";
import {
    baseNameOf,
    dirOf,
    extOf,
    fileNameOf,
    joinPath,
    normalizePath,
    samePath,
} from "@/utils/filePath";
import { closeQuietly, findOpenDocument, openDocument } from "@/wps/document";
import { ensureDirectory, pathExists } from "@/wps/fileSystem";
import { withWpsQuiet } from "@/wps/withAction";

export type BatchOutputMode = "sameDir" | "custom";
export type BatchOutputKind = "docx" | "pdf";

export interface BatchConvertOptions {
    toDocx: boolean;
    toPdf: boolean;
    outputMode: BatchOutputMode;
    /** outputMode === "custom" 时必填 */
    outputDir: string;
    overwrite: boolean;
    pdfBookmarks: boolean;
}

export interface BatchConvertOutput {
    kind: BatchOutputKind;
    path: string;
}

export interface BatchConvertResult {
    success: boolean;
    /** 源文件已是目标格式，无需写盘 */
    skipped: boolean;
    sourcePath: string;
    fileName: string;
    outputs: BatchConvertOutput[];
    message: string;
    error?: string;
}

export interface BatchConvertSummary {
    successCount: number;
    skippedCount: number;
    failCount: number;
    results: BatchConvertResult[];
}

export interface BatchConvertHooks {
    /** 每个文档开始处理前调用，便于 UI 先画出“处理中” */
    onItemStart?: (index: number, total: number, filePath: string) => void;
    onProgress: (index: number, total: number, result: BatchConvertResult) => void;
}

/** 转换单个文档（同步 COM 调用），失败时返回带 error 的结果而不是抛出 */
function convertSingle(
    filePath: string,
    options: BatchConvertOptions,
    taken: Set<string>,
): BatchConvertResult {
    const fileName = fileNameOf(filePath);
    const baseName = baseNameOf(filePath);
    const dir = dirOf(filePath);
    const ext = extOf(filePath);

    try {
        if (!pathExists(filePath)) throw new Error("源文件不存在");

        const existing = findOpenDocument(filePath);
        const openedByUs = !existing;
        const doc = existing ?? openDocument(filePath, { visible: false });

        const outputDir = options.outputMode === "custom" ? options.outputDir : dir;
        if (!outputDir) throw new Error("无法确定输出目录");

        ensureDirectory(outputDir);

        const outputs: BatchConvertOutput[] = [];
        const generatedKinds: string[] = [];

        try {
            if (options.toDocx) {
                const desired = joinPath(outputDir, `${baseName}.docx`);

                if (ext === ".docx" && samePath(desired, filePath)) {
                    // 已经是 DOCX，且不需要移动位置：不重复写盘
                    outputs.push({ kind: "docx", path: filePath });
                } else {
                    if (!openedByUs) {
                        throw new Error("该文档已在 WPS 中打开，无法另存为 DOCX，请先关闭后重试");
                    }

                    const target = resolveOutputPath(outputDir, baseName, ".docx", {
                        taken,
                        overwrite: options.overwrite,
                        exists: pathExists,
                        errorHint: "输出目录",
                    });

                    doc.SaveAs2(target, wdFormatXMLDocument);
                    outputs.push({ kind: "docx", path: target });
                    generatedKinds.push("DOCX");
                }
            }

            if (options.toPdf) {
                const target = resolveOutputPath(outputDir, baseName, ".pdf", {
                    taken,
                    overwrite: options.overwrite,
                    exists: pathExists,
                    errorHint: "输出目录",
                });

                doc.ExportAsFixedFormat(
                    target,
                    wdExportFormatPDF,
                    false, // OpenAfterExport
                    wdExportOptimizeForPrint,
                    wdExportAllDocument,
                    1, // From
                    1, // To
                    wdExportDocumentContent,
                    true, // IncludeDocProps
                    true, // KeepIRM
                    options.pdfBookmarks
                        ? wdExportCreateHeadingBookmarks
                        : wdExportCreateNoBookmarks,
                    true, // DocStructureTags
                    true, // BitmapMissingFonts
                    false, // UseISO19005_1
                );

                outputs.push({ kind: "pdf", path: target });
                generatedKinds.push("PDF");
            }

            const message = generatedKinds.length
                ? `已生成 ${generatedKinds.join(" + ")}`
                : "源文件已是 DOCX，无需转换";

            return {
                success: true,
                skipped: generatedKinds.length === 0,
                sourcePath: filePath,
                fileName,
                outputs,
                message,
            };
        } finally {
            if (openedByUs) closeQuietly(doc);
        }
    } catch (error) {
        return {
            success: false,
            skipped: false,
            sourcePath: filePath,
            fileName,
            outputs: [],
            message: "",
            error: errorText(error),
        };
    }
}

/**
 * 批量转换文档。
 *
 * 与 `batchTypo.ts` 的分层保持一致：只负责 WPS/文件系统操作和进度回调，
 * 不弹任何 UI，方便任务窗格、ribbon 和单元测试复用。
 */
export async function batchConvertDocs(
    filePaths: string[],
    options: BatchConvertOptions,
    hooks: BatchConvertHooks,
): Promise<BatchConvertSummary> {
    const taken = new Set(filePaths.map((filePath) => normalizePath(filePath)));
    const results: BatchConvertResult[] = [];
    let successCount = 0;
    let skippedCount = 0;
    let failCount = 0;

    for (let i = 0; i < filePaths.length; i++) {
        hooks.onItemStart?.(i + 1, filePaths.length, filePaths[i]);
        // 先让 Vue 把“处理中”画出来，再进入同步 COM 调用
        await delay(20);

        const result = withWpsQuiet(() => convertSingle(filePaths[i], options, taken));
        results.push(result);

        if (!result.success) failCount++;
        else if (result.skipped) skippedCount++;
        else successCount++;

        hooks.onProgress(i + 1, filePaths.length, result);
        await yieldToUi();
    }

    return { successCount, skippedCount, failCount, results };
}
