import { ElMessage } from "element-plus";

import { errorText } from "@/utils/error";
import { dirOf, samePath } from "@/utils/filePath";
import { compareDocuments, openDocument } from "@/wps/document";
import { pathExists } from "@/wps/fileSystem";

export interface UseFileActionsOptions {
    /** 失败时的额外回调（例如写入处理日志） */
    onError?: (message: string) => void;
}

export interface OpenInWpsOptions {
    /** 打开前检查文件是否存在，默认 false */
    requireExists?: boolean;
    /** 错误提示前缀，默认“打开文档失败” */
    errorLabel?: string;
}

async function revealFile(path: string) {
    return fetch("http://127.0.0.1:8765/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal_file", path }),
    }).then((r) => r.json());
}

/** 批量工具通用的文件操作：打开、定位、对比 */
export function useFileActions(options: UseFileActionsOptions = {}) {
    /** 在 WPS 中打开指定文档（只读，避免误改） */
    function openInWps(filePath?: string, openOptions: OpenInWpsOptions = {}): void {
        if (!filePath) {
            ElMessage.warning("文件路径为空");
            return;
        }
        if (openOptions.requireExists && !pathExists(filePath)) {
            ElMessage.warning("文件不存在");
            return;
        }

        try {
            openDocument(filePath, { readOnly: true });
        } catch (error) {
            const message = `${openOptions.errorLabel ?? "打开文档失败"}：${errorText(error)}`;
            ElMessage.error(message);
            options.onError?.(message);
        }
    }

    /** 打开所在文件夹；失败时退化为复制路径 */
    async function revealInFolder(filePath: string): Promise<void> {
        const dir = dirOf(filePath);
        if (!dir) {
            ElMessage.warning("无法解析文件夹路径");
            return;
        }

        try {
            /**
             * explorer 只支持 "\\" 分隔路径
             * 也可以用 {@link Application.PathSeparator}
             */
            const path = wps.FileSystem.toNativeSeparators(filePath);
            revealFile(path);
            // Application.OAAssist.ShellExecute("explorer.exe", `/select, "${path}"`);
        } catch {
            // 走降级方案
        }

        try {
            await navigator.clipboard.writeText(dir);
            ElMessage.success("文件夹路径已复制到剪贴板");
        } catch {
            ElMessage.info(`文件夹路径：${dir}`);
        }
    }

    /** 调用 WPS 对比两个文档；成功返回 true */
    function compare(originalPath: string, revisedPath: string): boolean {
        if (samePath(originalPath, revisedPath)) {
            ElMessage.warning("源文档与排版后文档为同一文件（覆盖模式），无需对比");
            return false;
        }

        try {
            compareDocuments(originalPath, revisedPath);
            ElMessage.success("已生成对比文档（含修订与批注）");
            return true;
        } catch (error) {
            const message = `文档对比失败：${errorText(error)}`;
            ElMessage.error(message);
            options.onError?.(message);
            return false;
        }
    }

    return { openInWps, revealInFolder, compare };
}
