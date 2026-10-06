<template>
    <div
        class="flex flex-col h-screen bg-gradient-to-b from-gray-50 to-gray-100/60"
        v-element-hover="refreshRecordState"
    >
        <!-- ========== 顶部工具栏 ========== -->
        <div class="bg-white border-b border-gray-200/80 shadow-sm">
            <!-- 第一行：视图模式 + 底纹模式（两个独立分段控件） -->
            <div class="flex items-center gap-2 px-3 pt-3 flex-wrap">
                <!-- 左：视图模式（两态） -->
                <div class="flex items-center gap-0.5 p-1 rounded-xl bg-gray-100/80">
                    <button
                        type="button"
                        class="flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-medium transition-all duration-200"
                        :class="
                            viewMode === 0
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        "
                        @click="viewMode !== 0 && toggleView()"
                    >
                        <el-icon :size="14"><View /></el-icon>
                        显示值
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-medium transition-all duration-200"
                        :class="
                            viewMode === 1
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        "
                        @click="viewMode !== 1 && toggleView()"
                    >
                        <el-icon :size="14"><Document /></el-icon>
                        显示域
                    </button>
                </div>

                <!-- 右：底纹三态（无 / 选中 / 始终） -->
                <div class="flex items-center gap-1.5 ml-auto shrink-0">
                    <span class="text-[11px] text-gray-400 select-none">底纹</span>
                    <div class="flex items-center gap-0.5 p-1 rounded-xl bg-gray-100/80">
                        <el-tooltip
                            v-for="opt in [
                                { key: 'never', label: '无', tip: '不显示域底纹' },
                                { key: 'selected', label: '选中', tip: '选中时显示域底纹' },
                                { key: 'always', label: '始终', tip: '始终显示域底纹' },
                            ]"
                            :key="opt.key"
                            :content="opt.tip"
                            placement="bottom"
                            :show-after="400"
                        >
                            <button
                                type="button"
                                class="flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium transition-all duration-200"
                                :class="
                                    shadingState === opt.key
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                "
                                @click="setShading(opt.key)"
                            >
                                {{ opt.label }}
                            </button>
                        </el-tooltip>
                    </div>
                </div>
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
import {
    ArrowLeft,
    ArrowRight,
    DArrowLeft,
    DArrowRight,
    Document,
    View,
} from "@element-plus/icons-vue";
import { vElementHover } from "@vueuse/components";

import { useActiveDocumentWatcher } from "@/composables/useActiveDocumentWatcher";
import { useMergeFieldActions } from "@/composables/useMergeFieldActions";
import { useMergeFieldDisplay } from "@/composables/useMergeFieldDisplay";
import { useMergeRecordNavigation } from "@/composables/useMergeRecordNavigation";
import { getMergeFieldNames } from "@/jsa/commands/mergeMail";

const { insertFieldAtCursor } = useMergeFieldActions();

const { viewMode, shadingState, toggleView, setShading, refreshDisplayState } =
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
/* el-input 内部 padding 收紧，让输入框更紧凑 */
.record-input :deep(.el-input__wrapper) {
    padding: 0 2px;
}
</style>
