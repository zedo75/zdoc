import type { Ref } from "vue";

import { extOf, normalizePath } from "@/utils/filePath";

export interface AddPathsResult {
    /** 新增成功的数量 */
    added: number;
    /** 因扩展名不受支持而忽略的路径 */
    unsupported: string[];
    /** 因已在列表中而忽略的数量 */
    duplicates: number;
}

export interface UseBatchFileListOptions<T extends { path: string }> {
    /** 允许的扩展名（小写，含点） */
    supportedExts: string[];
    /** 根据路径创建列表行 */
    createItem: (path: string) => T;
}

/**
 * 批量文档列表的通用状态。
 *
 * 只负责扩展名过滤、去重和增删；提示文案由调用方决定，
 * 以便不同批量工具保留各自的措辞。
 */
export function useBatchFileList<T extends { path: string }>(options: UseBatchFileListOptions<T>) {
    const files = ref([]) as Ref<T[]>;
    const count = computed(() => files.value.length);

    /** 判断路径是否已在列表中（忽略斜杠方向和大小写） */
    function has(path: string): boolean {
        const target = normalizePath(path);
        return files.value.some((file) => normalizePath(file.path) === target);
    }

    function addPaths(paths: string[]): AddPathsResult {
        const unsupported: string[] = [];
        let added = 0;
        let duplicates = 0;

        for (const path of paths) {
            if (!options.supportedExts.includes(extOf(path))) {
                unsupported.push(path);
                continue;
            }
            if (has(path)) {
                duplicates++;
                continue;
            }
            files.value.push(options.createItem(path));
            added++;
        }

        return { added, unsupported, duplicates };
    }

    function addPath(path: string): boolean {
        return addPaths([path]).added > 0;
    }

    function removeAt(index: number): void {
        files.value.splice(index, 1);
    }

    function clear(): void {
        files.value = [];
    }

    return { files, count, has, addPath, addPaths, removeAt, clear };
}
