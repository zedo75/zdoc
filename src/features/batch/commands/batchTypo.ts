/**
 * 批量排版核心逻辑。
 *
 * 对每个文档依次执行：打开 → {@link applyFullFormat} 应用当前公文配置 → 按保存策略写盘。
 * 与批量转换/重命名一样，这里只做 WPS 与文件系统操作，不弹任何 UI，
 * 方便任务窗格、Ribbon 和单元测试复用。
 */

import type { GovDocConfig } from "@/config/types";

import { applyFullFormat } from "@/core/typeset";
import { delay } from "@/utils/async";
import { errorText } from "@/utils/error";
import { baseNameOf, dirOf, extOf, fileNameOf, joinPath, normalizePath } from "@/utils/filePath";
import { closeQuietly, findOpenDocument, openDocument } from "@/wps/document";

export type BatchSaveMode = "overwrite" | "sameDir" | "custom";

export interface BatchSaveOptions {
    mode: BatchSaveMode;
    /** mode === "custom" 时必填：输出目录（不带末尾反斜杠） */
    outputDir?: string;
    /**
     * 文件名模板（覆盖原件模式忽略）。支持变量：
     * - `{name}`     原文件名（不含扩展名）
     * - `{ext}`      扩展名（含点，如 `.docx`）
     * - `{date}`     日期 YYYYMMDD
     * - `{time}`     时间 HHmmss
     * - `{datetime}` 日期时间 YYYYMMDD_HHmmss
     * - `{index}`    批次序号（从 1 开始）
     *
     * 未提供时默认 `{name}_已排版{ext}`
     */
    template?: string;
}

export interface BatchTypoResult {
    success: boolean;
    fileName: string;
    sourcePath: string;
    savedPath?: string;
    error?: string;
}

export interface TemplateContext {
    name: string;
    ext: string;
    index: number;
    date: Date;
}

const DEFAULT_TEMPLATE = "{name}_已排版{ext}";
const pad2 = (n: number) => n.toString().padStart(2, "0");

/**
 * 展开文件名模板，同时清理文件系统非法字符。
 * 前后端共用，确保预览与实际结果一致。
 */
export function expandTemplate(template: string, ctx: TemplateContext): string {
    const { name, ext, index, date } = ctx;
    const Y = date.getFullYear();
    const M = pad2(date.getMonth() + 1);
    const D = pad2(date.getDate());
    const h = pad2(date.getHours());
    const m = pad2(date.getMinutes());
    const s = pad2(date.getSeconds());

    const vars: Record<string, string> = {
        "{name}": name,
        "{ext}": ext,
        "{date}": `${Y}${M}${D}`,
        "{time}": `${h}${m}${s}`,
        "{datetime}": `${Y}${M}${D}_${h}${m}${s}`,
        "{index}": String(index),
    };

    let out = template;
    for (const [k, v] of Object.entries(vars)) {
        out = out.split(k).join(v);
    }

    // 清理非法字符、去掉首尾空白和点（Windows 不允许）
    out = out.replace(/[\\/:*?"<>|]/g, "_").replace(/^[\s.]+|[\s.]+$/g, "");
    return out;
}

/** 依据保存策略，计算本次输出的目标路径（含去重） */
function resolveTargetPath(
    sourcePath: string,
    options: BatchSaveOptions,
    usedPaths: Set<string>,
    index: number,
    now: Date,
): string {
    if (options.mode === "overwrite") {
        usedPaths.add(normalizePath(sourcePath));
        return sourcePath;
    }

    // 非覆盖模式：源路径先占位，避免模板生成与原文件同名导致意外覆盖
    usedPaths.add(normalizePath(sourcePath));

    const ext = extOf(sourcePath) || ".docx";
    const baseName = baseNameOf(sourcePath);
    const sourceDir = dirOf(sourcePath);

    const dir = options.mode === "custom" && options.outputDir ? options.outputDir : sourceDir;

    const template = options.template?.trim() || DEFAULT_TEMPLATE;
    let outName = expandTemplate(template, {
        name: baseName,
        ext,
        index: index + 1,
        date: now,
    });

    // 模板被清理后为空则回退
    if (!outName) {
        outName = expandTemplate(DEFAULT_TEMPLATE, {
            name: baseName,
            ext,
            index: index + 1,
            date: now,
        });
    }

    // 若模板未包含 {ext} 且结果无扩展名，追加原扩展名
    if (!template.includes("{ext}") && !/\.[A-Za-z0-9]+$/.test(outName)) {
        outName += ext;
    }

    let targetPath = joinPath(dir, outName);
    if (usedPaths.has(normalizePath(targetPath))) {
        const stem = outName.slice(0, outName.length - ext.length);
        let n = 1;
        do {
            targetPath = joinPath(dir, `${stem}_${n}${ext}`);
            n++;
        } while (usedPaths.has(normalizePath(targetPath)));
    }
    usedPaths.add(normalizePath(targetPath));
    return targetPath;
}

/**
 * 排版单个文档并按保存策略写盘。
 *
 * - 文档已打开时复用现有实例且不关闭，避免打断用户；
 * - 未打开时后台打开，处理结束后只关闭由本函数打开的实例；
 * - 覆盖模式优先 `Save()`，失败（如只读）时回退 `SaveAs2` 覆盖原路径；
 * - 失败不抛出，统一转成带 error 的结果，便于批量循环继续处理后续文档。
 */
export function formatSingleDoc(
    filePath: string,
    config: GovDocConfig,
    saveOptions: BatchSaveOptions,
    index = 0,
    usedPaths: Set<string> = new Set(),
    now: Date = new Date(),
): BatchTypoResult {
    const fileName = fileNameOf(filePath);

    let doc: Wps.Document | null = null;
    let openedByUs = false;

    try {
        // 1. 若文档已打开，直接复用其实例（不关闭，避免影响用户会话）
        const existing = findOpenDocument(filePath);
        if (existing) {
            doc = existing;
        } else {
            // 2. 后台打开：Visible=false + 空密码，避免弹窗
            doc = openDocument(filePath, { visible: false });
            openedByUs = true;
        }

        if (!doc) {
            return { success: false, fileName, sourcePath: filePath, error: "无法打开文档" };
        }

        // 3. 完整排版：
        //    - 页边距 / 页眉 / 页码（先删后加）/ 正文排版
        //    - 其中正文排版内部还包含：编号转换、正文/标题/落款/附件说明
        applyFullFormat(config, doc);

        // 4. 保存（使用 SaveAs2 显式指定路径，避免 Save 弹出另存对话框）
        const targetPath = resolveTargetPath(filePath, saveOptions, usedPaths, index, now);
        if (saveOptions.mode === "overwrite") {
            try {
                doc.Save();
            } catch {
                // Save 失败（例如只读）则回退到 SaveAs2 覆盖原路径
                doc.SaveAs2(targetPath);
            }
        } else {
            doc.SaveAs2(targetPath);
        }

        return { success: true, fileName, sourcePath: filePath, savedPath: targetPath };
    } catch (e) {
        return {
            success: false,
            fileName,
            sourcePath: filePath,
            error: errorText(e),
        };
    } finally {
        // 只关闭由我们打开的文档；显式 wdDoNotSaveChanges 避免二次弹窗
        if (openedByUs && doc) closeQuietly(doc);
    }
}

/**
 * 按顺序批量排版。
 *
 * 整批文档共享同一个 `usedPaths` 和起始时间，既保证 `{date}` 等模板变量一致，
 * 也保证生成的文件名在本批次内不重复；每处理完一个文档回调一次进度并让出主线程。
 */
export async function batchFormatDocs(
    filePaths: string[],
    config: GovDocConfig,
    saveOptions: BatchSaveOptions,
    onProgress: (index: number, total: number, result: BatchTypoResult) => void,
): Promise<{ successCount: number; failCount: number; results: BatchTypoResult[] }> {
    const results: BatchTypoResult[] = [];
    const usedPaths = new Set<string>();
    // 同一批次使用统一时间戳，便于文件名一致（如 {date}、{datetime}）
    const now = new Date();
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < filePaths.length; i++) {
        const result = formatSingleDoc(filePaths[i], config, saveOptions, i, usedPaths, now);
        results.push(result);

        if (result.success) {
            successCount++;
        } else {
            failCount++;
        }

        onProgress(i + 1, filePaths.length, result);

        // 让出主线程，UI 可刷新进度
        await delay(0);
    }

    return { successCount, failCount, results };
}
