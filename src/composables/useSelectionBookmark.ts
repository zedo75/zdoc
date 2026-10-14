import { useDebounceFn } from "@vueuse/core";
import { computed, onUnmounted, ref } from "vue";

import {
    addBookmark,
    applyRangeBorder,
    bookmarkExists,
    clearRangeBorder,
    deleteBookmark,
    generateBookmarkName,
    getBookmarkText,
} from "@/jsa/commands/bookmark";
import { getFullParagraphRange } from "@/jsa/commands/document";

/** 对外暴露的标记状态 */
export type BookmarkStatus = "idle" | "marked" | "error";

/** 选区段落快照 */
export interface SelectionSnapshot {
    bookmarkName: string;
    originalText: string;
    start: number;
    end: number;
}

/** 内容变化回调的 payload */
export interface ContentChangePayload {
    currentText: string;
    originalText: string;
    changed: boolean;
}

/** 防抖延迟（ms） */
const DEBOUNCE_MS = 400;

export function useSelectionBookmark() {
    const statusSource = ref<BookmarkStatus>("idle");
    const snapshotSource = ref<SelectionSnapshot | null>(null);

    const status = computed(() => statusSource.value);
    const snapshot = computed(() => snapshotSource.value);

    // 记录上一次已消费的文本，用于跳过内容未变的重复回调
    let lastCheckedText = "";

    /** 为选区所在完整段落添加书签 */
    function markSelection(): string | null {
        statusSource.value = "idle";

        // 先清理已有书签，避免重复标记时堆叠
        if (snapshotSource.value) {
            deleteBookmark(snapshotSource.value.bookmarkName);
            snapshotSource.value = null;
        }

        // 取选区所在第一个段落的完整 Range
        const range = getFullParagraphRange();
        if (!range) return null;

        // 先清除旧边框（如果之前标记过同一段落）
        clearRangeBorder(range);

        const name = generateBookmarkName();
        addBookmark(name, range);
        applyRangeBorder(range);

        snapshotSource.value = {
            bookmarkName: name,
            originalText: range.Text ?? "",
            start: range.Start ?? 0,
            end: range.End ?? 0,
        };
        lastCheckedText = snapshotSource.value.originalText;
        statusSource.value = "marked";
        return name;
    }

    /** 删除当前书签并重置状态 */
    function clearMark() {
        const snap = snapshotSource.value;
        if (!snap) return;

        deleteBookmark(snap.bookmarkName, (bk) => clearRangeBorder(bk.Range));

        snapshotSource.value = null;
        lastCheckedText = "";
        statusSource.value = "idle";
    }

    /** 真正的检查逻辑（已被防抖包裹） */
    function checkBookmark(callback: (payload: ContentChangePayload) => void) {
        const snap = snapshotSource.value;
        if (!snap || !bookmarkExists(snap.bookmarkName)) return;

        const currentText = getBookmarkText(snap.bookmarkName);

        // 内容未变则跳过，避免重复渲染
        if (currentText === lastCheckedText) return;
        lastCheckedText = currentText;

        callback({
            currentText,
            originalText: snap.originalText,
            changed: currentText !== snap.originalText,
        });
    }

    let debouncedCheck: ReturnType<typeof useDebounceFn> | null = null;

    /** 开始监听文档内容变化 */
    function startWatching(callback: (payload: ContentChangePayload) => void) {
        stopWatching();
        debouncedCheck = useDebounceFn(() => checkBookmark(callback), DEBOUNCE_MS);
        wps.ApiEvent.AddApiEventListener("ContentChange", debouncedCheck);
    }

    /** 停止监听 */
    function stopWatching() {
        if (!debouncedCheck) return;
        wps.ApiEvent.RemoveApiEventListener("ContentChange", debouncedCheck);
        debouncedCheck.cancel();
        debouncedCheck = null;
    }

    onUnmounted(stopWatching);

    return {
        status,
        snapshot,
        markSelection,
        clearMark,
        startWatching,
        stopWatching,
    };
}
