<template>
    <div class="flex flex-col h-screen bg-gray-50">
        <el-scrollbar class="flex-1 min-h-0" ref="scrollbarRef">
            <div class="p-2 min-[400px]:p-3 sm:p-5">
                <div class="mb-3 min-[400px]:mb-4 sm:mb-6 text-center">
                    <h1
                        class="text-base min-[400px]:text-lg sm:text-xl font-semibold text-gray-800"
                    >
                        文本对比工具
                    </h1>
                </div>

                <el-collapse v-model="activeNames" :before-collapse="beforeCollapse">
                    <!-- 配置面板 -->
                    <SectionPanel name="config" title="对比配置" emoji="⚙️">
                        <div class="flex flex-wrap gap-2 sm:gap-4">
                            <div class="flex items-center gap-1.5 grow basis-[150px] min-w-0">
                                <label
                                    class="text-sm font-medium text-gray-700 whitespace-nowrap shrink-0"
                                >
                                    对比模式
                                </label>
                                <div class="flex-1 min-w-0">
                                    <el-select v-model="cleanupMode" style="width: 100%">
                                        <el-option
                                            v-for="opt in cleanupOptions"
                                            :key="opt.value"
                                            :label="opt.label"
                                            :value="opt.value"
                                        />
                                    </el-select>
                                </div>
                            </div>

                            <div
                                v-if="cleanupMode === 'efficiency'"
                                class="flex items-center gap-1.5 grow basis-[150px] min-w-0"
                            >
                                <label
                                    class="text-sm font-medium text-gray-700 whitespace-nowrap shrink-0 flex items-center gap-1"
                                >
                                    差异精度
                                    <el-tooltip content="值越大，差异块长度越大" placement="top">
                                        <span
                                            class="text-xs text-gray-400 font-normal cursor-help border-b border-dashed border-gray-300"
                                        >
                                            🛈
                                        </span>
                                    </el-tooltip>
                                </label>
                                <div class="flex-1 min-w-0">
                                    <el-input-number
                                        v-model="editCost"
                                        :min="1"
                                        :step="1"
                                        size="default"
                                        controls-position="right"
                                        style="width: 100%"
                                        v-wheel-change
                                    />
                                </div>
                            </div>
                        </div>
                    </SectionPanel>

                    <!-- 输入面板 -->
                    <SectionPanel name="input" title="输入文本" emoji="📝">
                        <div
                            class="flex flex-wrap items-center gap-2 mb-3 px-2 min-[400px]:px-3 py-2 bg-gray-50 rounded-md border border-gray-100"
                        >
                            <!-- ① 数据流向选择：普通模式=选区同步；书签模式=书签内容同步 -->
                            <el-segmented
                                v-model="insertTarget"
                                size="small"
                                :options="[
                                    { label: '关闭', value: 'none' },
                                    { label: '旧文本', value: 'old' },
                                    { label: '新文本', value: 'new' },
                                ]"
                            />
                            <span class="text-sm text-gray-600 whitespace-nowrap">
                                {{
                                    bookmarkStatus === "marked"
                                        ? "与标记段落同步"
                                        : "与选中文本同步"
                                }}
                            </span>

                            <el-divider direction="vertical" class="!mx-1" />

                            <!-- ② 段落书签追踪 -->
                            <el-button
                                small
                                class="pill-btn"
                                :class="{ 'pill-btn--active': bookmarkStatus === 'marked' }"
                                @click="handleMark"
                            >
                                {{
                                    bookmarkStatus === "marked"
                                        ? "📌 重新标记段落"
                                        : "📌 标记选区段落"
                                }}
                            </el-button>

                            <template v-if="bookmarkStatus === 'marked'">
                                <el-button
                                    small
                                    class="pill-btn pill-btn--ghost"
                                    @click="handleClearMark"
                                >
                                    取消标记
                                </el-button>
                                <span class="text-xs text-gray-400 whitespace-nowrap">
                                    {{
                                        insertTarget === "none"
                                            ? "文档改动已暂停同步"
                                            : `文档改动将实时写入「${insertTarget === "old" ? "旧文本" : "新文本"}」`
                                    }}
                                </span>
                            </template>
                        </div>

                        <div class="flex flex-wrap gap-2 min-[400px]:gap-3">
                            <div
                                class="w-full min-[400px]:w-auto min-[400px]:flex-1 min-[400px]:min-w-0"
                            >
                                <label class="block font-medium mb-1.5 text-sm text-gray-700">
                                    旧文本
                                </label>
                                <el-input
                                    v-model="oldText"
                                    type="textarea"
                                    :autosize="{ minRows: 8, maxRows: 8 }"
                                    placeholder="请输入旧文本（原始版本）"
                                />
                            </div>
                            <div
                                class="w-full min-[400px]:w-auto min-[400px]:flex-1 min-[400px]:min-w-0"
                            >
                                <label class="block font-medium mb-1.5 text-sm text-gray-700">
                                    新文本
                                </label>
                                <el-input
                                    v-model="newText"
                                    type="textarea"
                                    :autosize="{ minRows: 8, maxRows: 8 }"
                                    placeholder="请输入新文本（修订版本）"
                                />
                            </div>
                        </div>
                    </SectionPanel>

                    <!-- 对比结果：header 吸顶 -->
                    <el-collapse-item name="result" class="result-collapse">
                        <template #title>
                            <span class="flex items-center gap-2">
                                📊 对比结果
                                <span v-if="duration > 0" class="text-xs font-normal text-gray-400">
                                    ⏱️ {{ formattedDuration }}
                                </span>
                            </span>
                        </template>
                        <TextDiff
                            :old-text="oldText"
                            :new-text="newText"
                            :cleanup-mode="cleanupMode"
                            :edit-cost="editCost"
                            @update:duration="onDurationUpdate"
                        />
                    </el-collapse-item>
                </el-collapse>
            </div>
        </el-scrollbar>

        <div
            class="flex flex-wrap gap-2 p-2 min-[400px]:p-3 sm:p-5 border-t border-gray-200 bg-white"
        >
            <el-button size="small" class="flex-1" @click="loadExample">加载示例</el-button>
            <el-button size="small" type="primary" class="flex-1" @click="clearText">
                清空文本
            </el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { ElMessage } from "element-plus";

import TextDiff from "@/components/TextDiff.vue";
import { useSelectionBookmark } from "@/composables/useSelectionBookmark";
import { useSelectionWatcher } from "@/composables/useSelectionWatcher";
import { getBookmarkText } from "@/jsa/commands/bookmark";

const EXAMPLE_OLD = `会议指出，各相关部门应认真执行上级部署，确保各项工作任务落到实处。
会议强调，要加强组织领导，明确责任分工，密切协调配合，形成工作合力。
会议决定，对本次会议确定的重点工作任务实行台账管理，定期通报进展情况。`;

const EXAMPLE_NEW = `会议指出，各相关部门要切实提高政治站位，不折不扣落实上级部署，确保各项工作任务落地见效。
会议强调，要健全组织领导机制，细化责任分工，强化协调配合，增强工作合力。
会议决定，对本次会议确定的重点任务实行清单化管理、项目化推进，定期调度通报进展情况。`;

const oldText = ref("");
const newText = ref("");
const cleanupMode = ref<"semantic" | "efficiency" | "none">("semantic");
const editCost = ref(4);
const duration = ref(0);

const activeNames = ref(["config", "input", "result"]);

// 长句差异用语义优化效果较好
const cleanupOptions = [
    { label: "语义优化", value: "semantic" },
    { label: "效率优化", value: "efficiency" },
    { label: "原始输出", value: "none" },
];

function loadExample() {
    oldText.value = EXAMPLE_OLD;
    newText.value = EXAMPLE_NEW;
    ElMessage.success("已加载示例");
}

function clearText() {
    oldText.value = "";
    newText.value = "";
    ElMessage.primary("已清空文本");
}

function onDurationUpdate(ms: number) {
    duration.value = ms;
}

// 滚动区域为 el-scrollbar 内部自己的容器
const scrollbarRef = ref<HTMLElement | null>(null);

const beforeCollapse = (name: string | number) => {
    const panelName = "result";
    // 结果面板已展开时，点击标题不折叠，而是平滑滚回顶部
    if (panelName === name && activeNames.value.includes(panelName)) {
        scrollbarRef.value?.scrollTo({ top: 0, behavior: "smooth" });
        return false;
    }
    return true;
};

const formattedDuration = computed(() => {
    if (duration.value === 0) return "";
    if (duration.value >= 1000) {
        return `${(duration.value / 1000).toFixed(2)} s`;
    }
    return `${duration.value.toFixed(2)} ms`;
});

type InsertTarget = "none" | "old" | "new";

const insertTarget = ref<InsertTarget>("none");

function writeToTarget(target: Exclude<InsertTarget, "none">, text: string) {
    if (target === "old") {
        oldText.value = text;
    } else {
        newText.value = text;
    }
}

const INSERT_DEBOUNCE_MS = 150;

/**
 * 防抖写入。
 * target 作为参数在调用时捕获，避免回调执行时 insertTarget 已经切走。
 */
const debouncedInsert = useDebounceFn((target: Exclude<InsertTarget, "none">, text: string) => {
    if (!text) return;
    writeToTarget(target, text);
}, INSERT_DEBOUNCE_MS);

watch(insertTarget, (target) => {
    // 切换目标时丢弃尚未落地的待插入内容，避免串到另一侧
    debouncedInsert.cancel();
    if (target === "none") return;

    // 书签模式：拉一次书签当前内容
    if (bookmarkStatus.value === "marked" && bookmarkSnapshot.value) {
        const text = getBookmarkText(bookmarkSnapshot.value.bookmarkName);
        if (text) writeToTarget(target, text);
        return;
    }

    // 事件只在选区变化时触发，
    // 「先选中文本、再切换目标」这条路径需要主动读一次
    const text = wpsSelection.Range.Text;
    if (!text) return;
    writeToTarget(target, text);
});

function handleSelectionChange() {
    // 书签模式下不自动同步，避免打扰用户编辑文本框
    if (bookmarkStatus.value === "marked") return;

    const target = insertTarget.value;
    if (target === "none") return;

    // 立即取值：Selection 是实时对象，延迟读取可能已经指向新选区
    debouncedInsert(target, wpsSelection.Range.Text);
}

useSelectionWatcher(handleSelectionChange);

onBeforeUnmount(() => debouncedInsert.cancel());

const {
    status: bookmarkStatus,
    snapshot: bookmarkSnapshot,
    markSelection,
    clearMark,
    startWatching,
    stopWatching,
} = useSelectionBookmark();

function handleMark() {
    const name = markSelection();
    if (!name || !bookmarkSnapshot.value) {
        ElMessage.warning("请先在文档中选中一段文字");
        return;
    }

    // 首次标记时给个默认落点，用户可随时切走
    if (insertTarget.value === "none") {
        insertTarget.value = "old"; // 触发 watch，自动填充
    } else {
        // 保持用户当前选择，立刻填一次
        writeToTarget(insertTarget.value, bookmarkSnapshot.value.originalText);
    }

    // 文档中的改动 → 写入对象
    startWatching(({ currentText }) => {
        const target = insertTarget.value;
        if (target === "none") return;
        writeToTarget(target, currentText);
    });

    // 归零：视觉上告诉用户「手动同步已让位于书签」
    insertTarget.value = "none";
    debouncedInsert.cancel();

    ElMessage.success("已标记段落，文档改动将实时同步");
}

function handleClearMark() {
    stopWatching();
    clearMark();
    ElMessage.info("已取消段落标记");
}

onBeforeUnmount(() => {
    debouncedInsert.cancel();
    stopWatching();
});
</script>

<style scoped>
/* 容器：对齐自定义控件的圆角 / 内边距 / 底色 */
:deep(.el-segmented) {
    --el-segmented-bg-color: rgb(243 244 246 / 0.8);
    /* gray-100/80 */
    --el-segmented-color: #6b7280;
    /* gray-500 */
    --el-segmented-item-hover-bg-color: transparent;
    --el-segmented-item-hover-color: #374151;
    /* gray-700 */
    --el-segmented-item-active-bg-color: transparent;
    --el-segmented-item-selected-bg-color: #fff;
    --el-segmented-item-selected-color: #2563eb;
    /* blue-600 */
    --el-border-radius-base: 16px;

    padding: 4px;
    box-shadow: none;
}

/* 分段之间的间隔 */
:deep(.el-segmented__group) {
    gap: 2px;
    /* gap-0.5 */
}

/* 每段：高度 / 内边距 / 圆角 / 字号 */
:deep(.el-segmented__item) {
    height: 28px;
    padding: 0 10px;
    font-size: 14px;
}

/* 选中态额外加一点点投影，模拟 shadow-sm */
:deep(.el-segmented__item-selected) {
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

/* 让对比结果的 header 吸顶 */
.result-collapse :deep(.el-collapse-item__header) {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: #ffffff;
    /* 吸顶时与下方内容拉开层次 */
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* ── 药丸按钮：对齐 el-segmented 的尺寸与质感 ── */
:deep(.pill-btn) {
    /* 颜色四档，子类可覆盖 */
    --pill-c: #6b7280;
    --pill-c-hover: #60a5fa;
    --pill-c-focus: #2563eb;
    --pill-c-active: #1d4ed8;

    /* el-button 各交互态：统一白底、无边框 */
    --el-button-bg-color: #fff;
    --el-button-hover-bg-color: #fff;
    --el-button-active-bg-color: #fff;
    --el-button-border-color: transparent;
    --el-button-hover-border-color: transparent;
    --el-button-active-border-color: transparent;

    height: 28px;
    padding: 0 6px;
    border-radius: 16px;
    font-size: 14px;
    font-weight: 400;

    border: none;
    color: var(--pill-c);
    /* gray-500 */
    box-shadow: none;
    transition:
        color 0.15s,
        background-color 0.15s,
        box-shadow 0.15s;
}

/* 三层递进：hover 浅蓝 → focus / active 标准蓝 → active + 交互 深蓝 */
:deep(.pill-btn:hover) {
    color: var(--pill-c-hover);
}

:deep(.pill-btn:focus),
:deep(.pill-btn--active) {
    color: var(--pill-c-focus);
}

:deep(.pill-btn--active:hover),
:deep(.pill-btn--active:focus) {
    color: var(--pill-c-active);
}

/* ghost：只换基色，其余状态自动继承 */
:deep(.pill-btn--ghost) {
    --pill-c: #9ca3af;
}
</style>
