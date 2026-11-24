<template>
    <div>
        <div
            v-if="diffHtml"
            class="diff-result p-4 whitespace-pre-wrap rounded-md border text-sm"
            v-html="diffHtml"
        ></div>
        <div v-else class="text-gray-400 text-center py-10">输入文本后自动显示差异</div>
    </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import {
    diff,
    diffCleanupEfficiency,
    diffCleanupSemantic,
    diffPrettyHtml,
} from "diff-match-patch-es";

const props = defineProps<{
    oldText: string;
    newText: string;
    cleanupMode?: "semantic" | "efficiency" | "none";
    editCost?: number; // 仅当 cleanupMode === 'efficiency' 时有效
}>();

const emit = defineEmits<{
    (e: "update:duration", duration: number): void;
}>();

const diffHtml = ref<string>("");

function computeDiff() {
    if (!props.oldText && !props.newText) {
        diffHtml.value = "";
        emit("update:duration", 0);
        return;
    }

    const startTime = performance.now();

    let diffs = diff(props.oldText, props.newText);

    const mode = props.cleanupMode || "semantic";
    switch (mode) {
        case "semantic":
            diffCleanupSemantic(diffs);
            break;
        case "efficiency":
            diffCleanupEfficiency(diffs, { diffEditCost: props.editCost ?? 4 });
            break;
        case "none":
            break;
    }

    diffHtml.value = diffPrettyHtml(diffs);

    const endTime = performance.now();
    emit("update:duration", endTime - startTime);
}

// 文本及对比模式变更：立即计算
watch(
    () => [props.oldText, props.newText, props.cleanupMode],
    () => computeDiff(),
    { immediate: true },
);

const DEBOUNCE_DELAY = 300; // 防抖延迟

const debouncedDiff = useDebounceFn(computeDiff, DEBOUNCE_DELAY);

// editCost 变更时防抖：滚轮/长按会连续触发
watch(
    () => [props.editCost],
    () => debouncedDiff(),
);

onBeforeUnmount(() => {
    debouncedDiff.cancel();
});
</script>

<style>
/* 全局样式，覆盖 diff_prettyHtml 生成的标签 */
.diff-result del {
    color: #b91c1c;
    text-decoration: line-through;
    padding: 0 2px;
}

.diff-result ins {
    color: #0b7e3d;
    text-decoration: none;
    padding: 0 2px;
}
</style>
