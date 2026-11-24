import type { FileDialogFilter } from "@/wps/fileDialog";

import { ElMessage } from "element-plus";

import { errorText } from "@/utils/error";
import { pickDocuments } from "@/wps/fileDialog";

export interface UseBatchFilePickerOptions {
    title: string;
    storageKey?: string;
    filters?: FileDialogFilter[];
    /** 选择文件失败时的额外回调（例如写入处理日志） */
    onError?: (message: string) => void;
}

/** 批量文档选择器：负责 JSA 文件对话框、上次目录记忆和失败提示 */
export function useBatchFilePicker(options: UseBatchFilePickerOptions) {
    function pickFiles(): string[] {
        try {
            return pickDocuments({
                title: options.title,
                storageKey: options.storageKey ?? "zdoc.batchFileDir",
                filters: options.filters,
            });
        } catch (error) {
            const message = `选择文件失败：${errorText(error)}`;
            ElMessage.error(message);
            options.onError?.(message);
            return [];
        }
    }

    return { pickFiles };
}
