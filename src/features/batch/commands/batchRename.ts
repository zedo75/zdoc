/**
 * 批量重命名核心逻辑。
 *
 * 流程：读取文档主标题 → 生成合法文件名 → 另存为新文件（copy）或
 * 另存后删除原件（move）。删除前会确认目标文件已落盘；
 * 单个文件失败只记录在结果中，不中断整个批次。
 */

import { readMainTitleFromFile } from "@/features/batch/commands/mainTitle";
import { delay, yieldToUi } from "@/utils/async";
import { errorText } from "@/utils/error";
import { resolveOutputPath, sanitizeBaseName } from "@/utils/fileName";
import {
    baseNameOf,
    dirOf,
    extOf,
    fileNameOf,
    joinPath,
    normalizePath,
    samePath,
} from "@/utils/filePath";
import {
    closeQuietly,
    findOpenDocument,
    openHiddenDocument,
    saveAsSameFormat,
} from "@/wps/document";
import { pathExists, removeFile } from "@/wps/fileSystem";
import { withWpsQuiet } from "@/wps/withAction";

export type BatchRenameMode = "copy" | "move";

export interface BatchRenameInput {
    path: string;
    newBase: string;
}

export interface BatchRenameResult {
    success: boolean;
    /** 目标文件名与源文件相同（没有实际改名） */
    unchanged: boolean;
    /** 处理前的路径 */
    sourcePath: string;
    /** 处理后的路径；失败或未变化时等于 sourcePath */
    targetPath: string;
    fileName: string;
    baseName: string;
    dir: string;
    ext: string;
    message: string;
    error?: string;
}

export interface BatchRenameSummary {
    successCount: number;
    unchangedCount: number;
    failCount: number;
    results: BatchRenameResult[];
}

export interface BatchRenameHooks {
    onItemStart?: (index: number, total: number, filePath: string) => void;
    onProgress: (index: number, total: number, result: BatchRenameResult) => void;
}

export interface BatchDetectResult {
    /** 是否成功读取（不代表一定识别到标题） */
    success: boolean;
    sourcePath: string;
    title: string;
    error?: string;
}

export interface BatchDetectSummary {
    foundCount: number;
    failCount: number;
    results: BatchDetectResult[];
}

export interface BatchDetectHooks {
    onItemStart?: (index: number, total: number, filePath: string) => void;
    onProgress: (index: number, total: number, result: BatchDetectResult) => void;
}

/**
 * 实际执行重命名/另存，并校验结果。
 *
 * copy 模式保留源文件；move 模式在确认新文件已生成后才删除源文件，
 * 删除失败或源文件仍存在时抛出明确错误，避免用户误以为已经改名。
 */
function renameFile(sourcePath: string, target: string, ext: string, mode: BatchRenameMode): void {
    if (findOpenDocument(sourcePath)) {
        throw new Error("该文档已在 WPS 中打开，请先关闭后重试");
    }
    if (pathExists(target)) throw new Error("目标文件已存在，请更换文件名");

    const doc = openHiddenDocument(sourcePath);

    try {
        saveAsSameFormat(doc, target, ext);
    } finally {
        closeQuietly(doc);
    }

    if (!pathExists(target)) {
        throw new Error("另存成功但未找到目标文件，请检查磁盘状态");
    }

    if (mode !== "move") return;

    try {
        removeFile(sourcePath);
    } catch (error) {
        throw new Error(
            `新文件已保存为 ${target}，但删除原文件失败：${errorText(error)}。原文件仍在原处。`,
        );
    }

    if (pathExists(sourcePath)) {
        throw new Error(`新文件已保存为 ${target}，但原文件仍然存在，请手动确认`);
    }
}

/** 重命名单个文档（同步 COM 调用），失败时返回带 error 的结果而不是抛出 */
function renameSingle(
    item: BatchRenameInput,
    mode: BatchRenameMode,
    taken: Set<string>,
): BatchRenameResult {
    const sourcePath = item.path;
    const ext = extOf(sourcePath);
    const dir = dirOf(sourcePath);

    try {
        if (!pathExists(sourcePath)) throw new Error("源文件不存在");

        const base = sanitizeBaseName(item.newBase);
        if (!base) throw new Error("新文件名为空");

        const desired = joinPath(dir, `${base}${ext}`);
        if (samePath(desired, sourcePath)) {
            return {
                success: true,
                unchanged: true,
                sourcePath,
                targetPath: sourcePath,
                fileName: fileNameOf(sourcePath),
                baseName: baseNameOf(sourcePath),
                dir,
                ext,
                message: "文件名未变化",
            };
        }

        const target = resolveOutputPath(dir, base, ext, {
            taken,
            overwrite: false,
            exists: pathExists,
            errorHint: "原文件所在目录",
        });

        renameFile(sourcePath, target, ext, mode);

        return {
            success: true,
            unchanged: false,
            sourcePath,
            targetPath: target,
            fileName: fileNameOf(target),
            baseName: baseNameOf(target),
            dir: dirOf(target),
            ext,
            message: mode === "move" ? "已重命名原文件" : "已另存为新文件，原件保留",
        };
    } catch (error) {
        return {
            success: false,
            unchanged: false,
            sourcePath,
            targetPath: sourcePath,
            fileName: fileNameOf(sourcePath),
            baseName: baseNameOf(sourcePath),
            dir,
            ext,
            message: "",
            error: errorText(error),
        };
    }
}

/**
 * 批量重命名/另存文档。
 *
 * `reservedPaths` 用于传入本批次未参与处理、但也不能被覆盖的路径
 * （例如前几轮已经处理成功的文件）。
 */
export async function batchRenameFiles(
    items: BatchRenameInput[],
    mode: BatchRenameMode,
    hooks: BatchRenameHooks,
    reservedPaths: string[] = [],
): Promise<BatchRenameSummary> {
    // 源路径和保留路径先占位，避免某个文件改名后覆盖本批次的其他源文件
    const taken = new Set(
        [...reservedPaths, ...items.map((item) => item.path)].map((path) => normalizePath(path)),
    );
    const results: BatchRenameResult[] = [];
    let successCount = 0;
    let unchangedCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i++) {
        hooks.onItemStart?.(i + 1, items.length, items[i].path);
        // 先让 Vue 把“处理中”画出来，再进入同步 COM 调用
        await delay(20);

        const result = withWpsQuiet(() => renameSingle(items[i], mode, taken));
        results.push(result);

        if (!result.success) failCount++;
        else if (result.unchanged) unchangedCount++;
        else successCount++;

        hooks.onProgress(i + 1, items.length, result);
        await yieldToUi();
    }

    return { successCount, unchangedCount, failCount, results };
}

/** 批量读取文档主标题；只读文档结构，不修改文件 */
export async function detectMainTitles(
    filePaths: string[],
    hooks: BatchDetectHooks,
): Promise<BatchDetectSummary> {
    const results: BatchDetectResult[] = [];
    let foundCount = 0;
    let failCount = 0;

    for (let i = 0; i < filePaths.length; i++) {
        hooks.onItemStart?.(i + 1, filePaths.length, filePaths[i]);
        // 先让 Vue 把“处理中”画出来，再进入同步 COM 调用
        await delay(20);

        let title = "";
        let error: string | undefined;

        try {
            title = readMainTitleFromFile(filePaths[i]);
        } catch (caught) {
            error = errorText(caught);
        }

        const result: BatchDetectResult = {
            success: !error,
            sourcePath: filePaths[i],
            title,
            error,
        };
        results.push(result);

        if (error) failCount++;
        else if (title) foundCount++;

        hooks.onProgress(i + 1, filePaths.length, result);
        await yieldToUi();
    }

    return { foundCount, failCount, results };
}
