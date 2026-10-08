<template>
    <div
        class="flex flex-col h-screen bg-gradient-to-b from-gray-50 to-gray-100/60"
        v-element-hover="refreshAllFromDocument"
    >
        <!-- ========== 顶部工具栏 ========== -->
        <div class="bg-white border-b border-gray-200/80 shadow-sm">
            <!-- 第一行：视图模式 + 底纹模式（两个独立分段控件） -->
            <div class="flex justify-start gap-2 px-3 pt-3 flex-wrap">
                <el-segmented
                    :model-value="viewMode"
                    @change="applyViewMode"
                    size="small"
                    :options="[
                        { label: '显示值', value: 0 },
                        { label: '显示域', value: 1 },
                    ]"
                />

                <el-segmented
                    :model-value="shadingState"
                    @change="applyShading"
                    size="small"
                    :options="[
                        { label: '隐藏底纹', value: 'never' },
                        { label: '选中显示', value: 'selected' },
                        { label: '始终显示', value: 'always' },
                    ]"
                />
            </div>

            <!-- 第二行：记录导航（独立一行，不拥挤） -->
            <div class="px-3 py-3">
                <div
                    class="flex items-center justify-center gap-2 px-2 py-2 rounded-xl border border-gray-200/80 bg-gray-50/70"
                >
                    <span class="pl-1 text-[11px] font-medium text-gray-400 whitespace-nowrap">
                        记录
                    </span>

                    <el-button-group class="shrink-0">
                        <el-button size="small" title="第一条" @click="moveRecord('first')">
                            <el-icon><DArrowLeft /></el-icon>
                        </el-button>
                        <el-button size="small" title="上一条" @click="moveRecord('previous')">
                            <el-icon><ArrowLeft /></el-icon>
                        </el-button>
                    </el-button-group>

                    <div
                        class="flex items-center h-7 px-2 rounded-lg bg-white border border-gray-200 transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"
                    >
                        <input
                            v-model="recordInput"
                            class="w-8 text-xs text-center text-gray-700 bg-transparent outline-none tabular-nums"
                            inputmode="numeric"
                            @keyup.enter="commitRecord"
                            @blur="commitRecord"
                        />
                        <span class="text-[11px] text-gray-400 whitespace-nowrap tabular-nums">
                            / {{ recordCount || "-" }}
                        </span>
                    </div>

                    <el-button-group class="shrink-0">
                        <el-button size="small" title="下一条" @click="moveRecord('next')">
                            <el-icon><ArrowRight /></el-icon>
                        </el-button>
                        <el-button size="small" title="最后一条" @click="moveRecord('last')">
                            <el-icon><DArrowRight /></el-icon>
                        </el-button>
                    </el-button-group>
                </div>
            </div>
        </div>

        <!-- ========== 字段列表 ========== -->
        <el-scrollbar class="flex-1 min-h-0">
            <div class="p-3">
                <div class="flex items-center gap-1.5 mb-2.5">
                    <span class="w-1 h-3 rounded-full bg-blue-500"></span>
                    <span class="text-[11px] font-medium text-gray-500">可用域</span>
                    <span class="text-[11px] text-gray-400">· 单击插入到光标位置</span>
                </div>

                <div v-if="fieldNames.length === 0" class="py-10 text-center text-sm text-gray-400">
                    当前文档未检测到可用的邮件合并域
                </div>

                <div v-else class="flex flex-wrap gap-1.5">
                    <el-tag
                        v-for="name in fieldNames"
                        :key="name"
                        :effect="lastPicked === name ? 'dark' : 'plain'"
                        class="cursor-pointer max-w-full transition-all duration-150 hover:-translate-y-px hover:shadow-sm"
                        :title="name"
                        @click="pick(name)"
                    >
                        <span class="truncate">{{ name }}</span>
                    </el-tag>
                </div>
            </div>
        </el-scrollbar>

        <!-- ========== 底部 ========== -->
        <div class="px-3 py-3 border-t border-gray-200/80 bg-white">
            <el-button size="small" round class="w-full" @click="close">关闭</el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ArrowLeft, ArrowRight, DArrowLeft, DArrowRight } from "@element-plus/icons-vue";
import { vElementHover } from "@vueuse/components";

import { useActiveDocumentWatcher } from "@/composables/useActiveDocumentWatcher";
import { useMergeFieldActions } from "@/composables/useMergeFieldActions";
import { useMergeFieldDisplay } from "@/composables/useMergeFieldDisplay";
import { useMergeRecordNavigation } from "@/composables/useMergeRecordNavigation";
import { getMergeFieldNames } from "@/jsa/commands/mergeMail";

const { insertFieldAtCursor } = useMergeFieldActions();

const { viewMode, shadingState, applyShading, applyViewMode, refreshDisplayState } =
    useMergeFieldDisplay();

const { recordCount, recordInput, moveRecord, commitRecord, refreshRecordState } =
    useMergeRecordNavigation();

// 可用合并域字段
const fieldNames = ref<string[]>([]);

/** 切换文档后：字段列表 + 显示状态 + 记录状态 全部刷新 */
function refreshAllFromDocument() {
    fieldNames.value = getMergeFieldNames();
    refreshDisplayState();
    refreshRecordState();
}

onMounted(refreshAllFromDocument);
useActiveDocumentWatcher(refreshAllFromDocument);

/** 用于“刚插入域”的高亮反馈 */
const lastPicked = ref<string | null>(null);

function pick(name: string) {
    insertFieldAtCursor(name);
    lastPicked.value = name;
    window.setTimeout(() => {
        if (lastPicked.value === name) lastPicked.value = null;
    }, 600);
}

function close() {
    window.close();
}
</script>

<style scoped>
/* el-segmented 统一外观：浅灰底 + 白色选中滑块 + 蓝色文字 */
:deep(.el-segmented) {
    --el-segmented-bg-color: rgb(243 244 246 / 0.8); /* gray-100/80 */
    --el-segmented-color: #6b7280; /* gray-500 */
    --el-segmented-item-hover-bg-color: transparent;
    --el-segmented-item-hover-color: #374151; /* gray-700 */
    --el-segmented-item-active-bg-color: transparent;
    --el-segmented-item-selected-bg-color: #fff;
    --el-segmented-item-selected-color: #2563eb; /* blue-600 */
    --el-border-radius-base: 16px;
    padding: 4px;
    box-shadow: none;
}

:deep(.el-segmented__item) {
    height: 28px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 500;
    transition: all 200ms;
}

:deep(.el-segmented__item-selected) {
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}
</style>
