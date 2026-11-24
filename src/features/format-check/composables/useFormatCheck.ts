/**
 * @file 「格式检查」任务窗格状态
 *
 * 只读检查当前活动文档；不做任何 apply。
 */
import type { InspectionResult } from "@/features/format-check/core/inspect";

import { useActiveDocumentWatcher } from "@/composables/useActiveDocumentWatcher";
import { inspectDocument } from "@/features/format-check/commands/inspect";
import { useGovDocConfig } from "@/stores/govDocConfig";

/** 让出一帧，避免同步 COM 扫描前加载状态来不及渲染 */
function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error !== null) {
        const detail = error as { message?: unknown; description?: unknown };
        if (typeof detail.message === "string" && detail.message) return detail.message;
        if (typeof detail.description === "string" && detail.description) {
            return detail.description;
        }
    }
    return String(error);
}

export function useFormatCheck() {
    const { typography } = useGovDocConfig();

    const result = shallowRef<InspectionResult | null>(null);
    const loading = ref(false);
    const error = ref("");

    /** 重新检查当前活动文档 */
    async function refresh(): Promise<void> {
        if (loading.value) return;

        loading.value = true;
        error.value = "";
        await nextTick();
        await yieldToBrowser();

        try {
            if (typeof Application === "undefined") {
                throw new Error("当前不在 WPS 环境中，无法读取文档");
            }
            const doc = Application.ActiveDocument;
            if (!doc) throw new Error("请先打开一个文档");
            result.value = inspectDocument(typography.value, doc);
        } catch (e) {
            result.value = null;
            error.value = toErrorMessage(e);
            console.error("[format-check] 检查失败:", e);
        } finally {
            loading.value = false;
        }
    }

    // 切换文档窗口时自动重新检查
    useActiveDocumentWatcher(() => {
        void refresh();
    });

    onMounted(() => {
        void refresh();
    });

    return { result, loading, error, refresh };
}
