import { ElMessage } from "element-plus";

import { errorText } from "@/utils/error";
import { pickDirectory } from "@/wps/fileDialog";

export interface UseOutputDirOptions {
    title?: string;
    storageKey?: string;
    /** 选择目录失败时的额外回调（例如写入处理日志） */
    onError?: (message: string) => void;
}

/** 输出目录选择：负责 ref、记忆上次目录和失败提示 */
export function useOutputDir(options: UseOutputDirOptions = {}) {
    const outputDir = ref("");

    function pickOutputDir(): boolean {
        try {
            const dir = pickDirectory({
                title: options.title ?? "选择输出目录",
                storageKey: options.storageKey ?? "zdoc.batchOutputDir",
            });
            if (!dir) return false;
            outputDir.value = dir;
            return true;
        } catch (error) {
            const message = `选择目录失败：${errorText(error)}`;
            ElMessage.error(message);
            options.onError?.(message);
            return false;
        }
    }

    return { outputDir, pickOutputDir };
}
