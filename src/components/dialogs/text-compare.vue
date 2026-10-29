<template>
    <div class="w-screen h-screen flex flex-col overflow-hidden bg-white">
        <header
            class="shrink-0 flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200"
        >
            <div
                class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white flex items-center justify-center font-bold text-lg shadow-sm"
            >
                对
            </div>
            <div class="min-w-0">
                <h1 class="text-base font-semibold leading-tight text-slate-800">分屏对比</h1>
                <p class="text-[11px] text-slate-400">
                    旧 {{ oldText.length }} 字 · 新 {{ newText.length }} 字
                </p>
            </div>

            <div class="ml-auto flex items-center gap-2">
                <el-button size="small" :disabled="!hasAny" @click="swap">交换</el-button>
            </div>
        </header>

        <main class="flex-1 min-h-0 flex flex-col">
            <!-- 上方：双文本框（可编辑） -->
            <div class="shrink-0 grid grid-cols-2 border-b border-slate-200" style="height: 38%">
                <div class="flex flex-col min-h-0 border-r border-slate-200">
                    <div
                        class="shrink-0 px-3 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-200"
                    >
                        原文（旧）
                    </div>
                    <textarea
                        ref="oldTaRef"
                        v-model="oldText"
                        class="flex-1 min-h-0 w-full p-2.5 text-sm font-mono leading-6 resize-none outline-none focus:bg-sky-50/30"
                        spellcheck="false"
                        @scroll="syncScroll('old')"
                        @click="handleTaInteract('old')"
                        @keyup="handleTaInteract('old', $event)"
                    />
                </div>
                <div class="flex flex-col min-h-0">
                    <div
                        class="shrink-0 px-3 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-200"
                    >
                        新文
                    </div>
                    <textarea
                        ref="newTaRef"
                        v-model="newText"
                        class="flex-1 min-h-0 w-full p-2.5 text-sm font-mono leading-6 resize-none outline-none focus:bg-sky-50/30"
                        spellcheck="false"
                        @scroll="syncScroll('new')"
                        @click="handleTaInteract('new')"
                        @keyup="handleTaInteract('new', $event)"
                    />
                </div>
            </div>

            <!-- 下方：DiffSplit，点击行联动上方 textarea -->
            <el-scrollbar ref="diffScrollbarRef" class="flex-1 min-h-0" @click="handleDiffClick">
                <DiffSplit
                    v-if="hasAny"
                    :old-text="oldText"
                    :new-text="newText"
                    :context-lines="Infinity"
                />
                <div
                    v-else
                    class="h-full flex items-center justify-center text-xs text-slate-400 py-16"
                >
                    <div class="text-center">
                        <div class="mb-1 text-2xl">📄</div>
                        未读到文本，请回到任务面板输入内容后再打开
                    </div>
                </div>
            </el-scrollbar>
        </main>
    </div>
</template>

<script setup lang="ts">
import type { ElScrollbar } from "element-plus";

import { StorageSerializers, useLocalStorage, useWindowSize } from "@vueuse/core";
import { computed, ref } from "vue";
import { DiffSplit } from "vue-diff-text";

import { useScrollLinkage } from "@/composables/useScrollLinkage";

import "vue-diff-text/dist/style.css";

import { useDialogTextCompareSize } from "@/composables/useDialogTextCompareSize";

const oldText = useLocalStorage<string>("diff-split:old-text", "", {
    serializer: StorageSerializers.string,
});
const newText = useLocalStorage<string>("diff-split:new-text", "", {
    serializer: StorageSerializers.string,
});

const hasAny = computed(() => !!oldText.value || !!newText.value);

function swap() {
    [oldText.value, newText.value] = [newText.value, oldText.value];
}

const oldTaRef = ref<HTMLTextAreaElement | null>(null);
const newTaRef = ref<HTMLTextAreaElement | null>(null);
const diffScrollbarRef = ref<InstanceType<typeof ElScrollbar> | null>(null);

const { syncScroll, handleDiffClick, handleTaInteract } = useScrollLinkage({
    oldTaRef,
    newTaRef,
    diffScrollbarRef,
});

// useWindowSize 自动响应窗口尺寸，并内置了防抖
const { width, height } = useWindowSize();

const { width: savedWidth, height: savedHeight } = useDialogTextCompareSize();

// 监听尺寸变化，自动保存
const stopWatch = watch([width, height], ([newW, newH]) => {
    savedWidth.value = newW;
    savedHeight.value = newH;
});

onUnmounted(() => stopWatch());
</script>

<style scoped>
/* 隐藏 textarea 原生滚动条轨道，只保留细滚动条 */
textarea {
    scrollbar-width: thin;
    /* Firefox */
    scrollbar-color: theme("colors.slate.300") transparent;
    /* Firefox */
}
textarea {
    cursor: auto;
}

textarea::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

textarea::-webkit-scrollbar-track {
    background: transparent;
}

textarea::-webkit-scrollbar-thumb {
    background-color: theme("colors.slate.300");
    border-radius: 3px;
}

textarea::-webkit-scrollbar-thumb:hover {
    background-color: theme("colors.slate.400");
}
</style>
