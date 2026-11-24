<template>
    <div class="compare-app">
        <!-- ── 顶部：品牌 / 文档读取 / 工具栏 / 页签 ───────────────────────── -->
        <header class="app-header">
            <div class="brand-row">
                <div class="brand">
                    <div class="brand-mark">比</div>
                    <div class="brand-copy">
                        <div class="brand-title">zdoc 文本对比</div>
                        <div class="brand-sub">文档智能比对</div>
                    </div>
                </div>

                <div class="brand-actions">
                    <el-tooltip content="编辑文本" placement="bottom" :show-after="300">
                        <el-button text class="icon-btn" :icon="EditPen" @click="openDrawer" />
                    </el-tooltip>

                    <el-dropdown trigger="click" @command="handleDocumentCommand">
                        <el-button text class="doc-btn" title="从文档读取">
                            <el-icon><Reading /></el-icon>
                            <span class="btn-text">从文档读取</span>
                            <el-icon class="caret"><ArrowDown /></el-icon>
                        </el-button>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item disabled>读取 WPS 当前内容</el-dropdown-item>
                                <el-dropdown-item command="selection:old" :disabled="!hasWps">
                                    选中文字 → 原始版本
                                </el-dropdown-item>
                                <el-dropdown-item command="selection:new" :disabled="!hasWps">
                                    选中文字 → 修改版本
                                </el-dropdown-item>
                                <el-dropdown-item
                                    divided
                                    command="document:old"
                                    :disabled="!hasWps"
                                >
                                    整篇文档 → 原始版本
                                </el-dropdown-item>
                                <el-dropdown-item command="document:new" :disabled="!hasWps">
                                    整篇文档 → 修改版本
                                </el-dropdown-item>
                                <el-dropdown-item
                                    v-if="bookmarkStatus === 'marked'"
                                    divided
                                    command="bookmark:old"
                                    :disabled="!hasWps"
                                >
                                    标记段落 → 原始版本
                                </el-dropdown-item>
                                <el-dropdown-item
                                    v-if="bookmarkStatus === 'marked'"
                                    command="bookmark:new"
                                    :disabled="!hasWps"
                                >
                                    标记段落 → 修改版本
                                </el-dropdown-item>
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>

                    <el-tooltip content="在独立窗口中对比" placement="bottom" :show-after="300">
                        <el-button
                            text
                            class="icon-btn"
                            :icon="FullScreen"
                            @click="openSplitDialog"
                        />
                    </el-tooltip>
                </div>
            </div>

            <div class="toolbar-row">
                <div class="page-title">
                    <span class="page-title-main">文本对比</span>
                    <span class="page-title-sub">逐处查看新增、删除与修改</span>
                </div>

                <div class="toolbar-actions">
                    <el-button
                        type="primary"
                        :icon="VideoPlay"
                        :loading="isComputing"
                        @click="handleStartCompare"
                    >
                        <span class="btn-text">开始比对</span>
                    </el-button>
                    <el-button :icon="Delete" title="清除" @click="clearAll">
                        <span class="btn-text">清除</span>
                    </el-button>
                    <el-button
                        :icon="Switch"
                        title="交换左右"
                        :disabled="!hasText"
                        @click="swapSides"
                    >
                        <span class="btn-text">交换左右</span>
                    </el-button>
                    <el-button
                        :icon="Download"
                        title="保存报告"
                        :disabled="!bothText"
                        @click="saveReport"
                    >
                        <span class="btn-text">保存报告</span>
                    </el-button>

                    <el-popover placement="bottom-end" :width="306" trigger="click">
                        <template #reference>
                            <el-button class="options-trigger">
                                <el-icon><Setting /></el-icon>
                                <span class="btn-text">比对选项</span>
                                <el-icon class="caret"><ArrowDown /></el-icon>
                            </el-button>
                        </template>

                        <div class="options-panel">
                            <div class="options-head">
                                <span>比对选项</span>
                                <small>修改后即时生效</small>
                            </div>

                            <label class="option-row">
                                <span>对比模式</span>
                                <el-select v-model="cleanupMode" size="small" style="width: 150px">
                                    <el-option label="语义优化" value="semantic" />
                                    <el-option label="效率优化" value="efficiency" />
                                    <el-option label="原始输出" value="none" />
                                </el-select>
                            </label>

                            <label v-if="cleanupMode === 'efficiency'" class="option-row">
                                <span>差异精度</span>
                                <el-input-number
                                    v-model="editCost"
                                    size="small"
                                    :min="1"
                                    :max="20"
                                    :step="1"
                                    controls-position="right"
                                    style="width: 150px"
                                    v-wheel-change
                                />
                            </label>

                            <div class="option-row">
                                <span>同步滚动</span>
                                <el-switch v-model="syncScrollEnabled" size="small" />
                            </div>

                            <p class="option-tip">
                                语义优化适合长句和段落改写；效率优化适合大段文字，精度越高差异块越大。
                            </p>
                        </div>
                    </el-popover>
                </div>
            </div>

            <div class="tab-row">
                <nav class="tabs" role="tablist">
                    <button
                        v-for="tab in tabs"
                        :key="tab.value"
                        type="button"
                        class="tab"
                        :class="{ active: activeTab === tab.value }"
                        role="tab"
                        :aria-selected="activeTab === tab.value"
                        @click="activeTab = tab.value"
                    >
                        {{ tab.label }}
                    </button>
                </nav>

                <div class="tab-meta">
                    <span class="mode-chip">{{ modeLabel }}</span>
                    <span v-if="isComputing" class="meta-busy">对比中…</span>
                    <span v-else-if="dirty" class="meta-dirty">文本已修改</span>
                    <span v-else-if="hasText && !bothText" class="meta-dirty">等待另一侧</span>
                    <span v-else-if="bothText" class="meta-done">耗时 {{ durationText }}</span>
                </div>
            </div>
        </header>

        <CompareStats :stats="result.stats" :has-text="bothText" />

        <!-- ── 文本比对 ─────────────────────────────────────────────────── -->
        <div v-if="activeTab === 'text'" class="main-area">
            <div class="workspace">
                <ComparePane
                    ref="oldPaneRef"
                    side="old"
                    title="原始版本"
                    :segments="result.oldSegments"
                    :text="oldText"
                    :current-id="currentId"
                    :sync-label="syncLabelFor('old')"
                    empty-title="还没有原始文本"
                    empty-hint="粘贴原文，或从 WPS 选区 / 文件读取"
                    @select="handlePaneSelect"
                    @request-input="openDrawer"
                    @scroll="handlePaneScroll"
                />

                <ComparePane
                    ref="newPaneRef"
                    side="new"
                    title="修改版本"
                    :segments="result.newSegments"
                    :text="newText"
                    :current-id="currentId"
                    :sync-label="syncLabelFor('new')"
                    empty-title="还没有修改文本"
                    empty-hint="粘贴改稿，或从 WPS 选区 / 文件读取"
                    @select="handlePaneSelect"
                    @request-input="openDrawer"
                    @scroll="handlePaneScroll"
                />

                <CompareResultPanel
                    class="workspace-result"
                    :groups="result.groups"
                    :stats="result.stats"
                    :merged-html="result.mergedHtml"
                    :current-id="currentId"
                    :filter="filter"
                    :has-text="bothText"
                    @select="handlePaneSelect"
                    @update:filter="filter = $event"
                />
            </div>
        </div>

        <!-- ── 文件比对 ─────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'file'" class="file-area">
            <div class="file-head">
                <h2>文件比对</h2>
                <p>选择两份文件，自动提取正文并切换到对比结果</p>
            </div>

            <div class="file-grid">
                <div
                    v-for="side in fileSides"
                    :key="side"
                    class="file-card"
                    :class="{ 'has-file': fileNames[side] }"
                    role="button"
                    tabindex="0"
                    @click="pickFile(side)"
                    @keydown.enter="pickFile(side)"
                    @keydown.space.prevent="pickFile(side)"
                    @dragover.prevent
                    @drop.prevent="handleDrop(side, $event)"
                >
                    <input
                        :ref="(el) => setFileInput(side, el)"
                        type="file"
                        class="hidden-input"
                        accept=".txt,.md,.markdown,.docx"
                        @click.stop
                        @change="handleFilePicked(side, $event)"
                    />

                    <div class="file-card-top">
                        <span class="file-badge" :class="`badge-${side}`">
                            {{ side === "old" ? "原文" : "修改版" }}
                        </span>
                        <span v-if="fileNames[side]" class="file-size">
                            {{ formatFileSize(fileSizes[side]) }}
                        </span>
                    </div>

                    <div class="file-icon">
                        <el-icon :size="24"><DocumentIcon /></el-icon>
                    </div>

                    <h3>
                        {{
                            fileNames[side] || (side === "old" ? "选择原始文件" : "选择修改后文件")
                        }}
                    </h3>
                    <p>
                        {{ fileNames[side] ? "已读取，可重新选择" : "点击选择，或把文件拖到这里" }}
                    </p>

                    <el-button
                        size="small"
                        :loading="fileBusy === side"
                        @click.stop="pickFile(side)"
                    >
                        选择文件
                    </el-button>
                </div>
            </div>

            <p class="file-note">
                <el-icon><InfoFilled /></el-icon>
                支持 .txt / .md / .docx，单个文件不超过 20 MB；文件只在本机解析，不会上传。
            </p>
        </div>

        <!-- ── 条款视图 ─────────────────────────────────────────────────── -->
        <div v-else class="clause-area">
            <ClauseCompareView :old-text="oldText" :new-text="newText" />
        </div>

        <!-- ── 底部状态栏 ───────────────────────────────────────────────── -->
        <footer class="statusbar">
            <div v-if="activeTab === 'text'" class="status-left">
                <el-button text size="small" :disabled="!canPrev" @click="stepGroup(-1)">
                    <el-icon><ArrowLeft /></el-icon>
                    <span class="btn-text">上一处</span>
                </el-button>
                <el-button text size="small" :disabled="!canNext" @click="stepGroup(1)">
                    <span class="btn-text">下一处</span>
                    <el-icon><ArrowRight /></el-icon>
                </el-button>
                <span class="step-count">{{ positionLabel }}</span>
                <span
                    v-if="currentGroup && currentPosition >= 0"
                    class="current-type"
                    :class="`type-${currentGroup.type}`"
                >
                    {{ changeTypeLabels[currentGroup.type] }}
                </span>
            </div>

            <div v-else class="status-left">
                <span class="status-hint">
                    {{
                        activeTab === "file"
                            ? "选择两份文件后自动开始比对"
                            : "条款视图 · 相同段落自动对齐"
                    }}
                </span>
            </div>

            <div class="status-right">
                <span v-if="hasText" class="status-meta">
                    {{ oldVisibleChars }} / {{ newVisibleChars }} 字符
                </span>
                <span v-if="hasText" class="status-dot">·</span>
                <span class="status-meta">{{ modeLabel }}</span>
            </div>
        </footer>

        <CompareInputDrawer
            v-model="drawerVisible"
            v-model:old-text="oldText"
            v-model:new-text="newText"
            v-model:sync-target="insertTarget"
            :has-wps="hasWps"
            :bookmark-status="bookmarkStatus"
            :bookmark-preview="bookmarkPreview"
            @mark="handleMark"
            @clear-mark="handleClearMark"
            @read-selection="handleReadSelection"
            @example="loadExample"
            @swap="swapSides"
            @clear="clearAll"
        />
    </div>
</template>

<script setup lang="ts">
import type { ResultFilter, SyncTarget } from "@/features/text-compare/components/types";
import type { CleanupMode, CompareResult } from "@/features/text-compare/core/textCompare";

import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    Delete,
    Document as DocumentIcon,
    Download,
    EditPen,
    FullScreen,
    InfoFilled,
    Reading,
    Setting,
    Switch,
    VideoPlay,
} from "@element-plus/icons-vue";
import { StorageSerializers, useDebounceFn, useLocalStorage } from "@vueuse/core";
import { ElMessage } from "element-plus";
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    reactive,
    ref,
    shallowRef,
    watch,
} from "vue";

import { useSelectionBookmark } from "@/composables/useSelectionBookmark";
import { useSelectionWatcher } from "@/composables/useSelectionWatcher";
import ClauseCompareView from "@/features/text-compare/components/ClauseCompareView.vue";
import CompareInputDrawer from "@/features/text-compare/components/CompareInputDrawer.vue";
import ComparePane from "@/features/text-compare/components/ComparePane.vue";
import CompareResultPanel from "@/features/text-compare/components/CompareResultPanel.vue";
import CompareStats from "@/features/text-compare/components/CompareStats.vue";
import { EXAMPLE_NEW_TEXT, EXAMPLE_OLD_TEXT } from "@/features/text-compare/components/example";
import { CHANGE_TYPE_LABELS } from "@/features/text-compare/components/types";
import { useDialogTextCompareSize } from "@/features/text-compare/composables/useDialogTextCompareSize";
import {
    buildCompareReportFileName,
    buildCompareReportHtml,
} from "@/features/text-compare/core/compareReport";
import {
    computeTextCompare,
    normalizeDocumentText,
} from "@/features/text-compare/core/textCompare";
import { downloadTextFile } from "@/utils/download";
import { errorText } from "@/utils/error";
import { formatFileSize, isSupportedDocumentFile, readDocumentFile } from "@/utils/readDocument";
import { getBookmarkText } from "@/wps/bookmark";

type Side = "old" | "new";
type WorkspaceTab = "text" | "file" | "clause";

/* -------------------------------------------------------------------------- */
/*                                  基础状态                                   */
/* -------------------------------------------------------------------------- */

const oldText = useLocalStorage<string>("diff-split:old-text", "", {
    serializer: StorageSerializers.string,
});
const newText = useLocalStorage<string>("diff-split:new-text", "", {
    serializer: StorageSerializers.string,
});

const cleanupMode = useLocalStorage<CleanupMode>("zdoc:text-compare:cleanup", "semantic");
const editCost = useLocalStorage<number>("zdoc:text-compare:edit-cost", 4);
const syncScrollEnabled = useLocalStorage<boolean>("zdoc:text-compare:sync-scroll", true);

const activeTab = ref<WorkspaceTab>("text");
const filter = ref<ResultFilter>("all");
const drawerVisible = ref(false);

const insertTarget = ref<SyncTarget>("none");
const hasWps = ref(false);

const { width: savedDialogWidth, height: savedDialogHeight } = useDialogTextCompareSize();

const tabs: { value: WorkspaceTab; label: string }[] = [
    { value: "text", label: "文本对比" },
    { value: "file", label: "文件比对" },
    { value: "clause", label: "条款视图" },
];

const changeTypeLabels = CHANGE_TYPE_LABELS;

/* -------------------------------------------------------------------------- */
/*                                  对比结果                                   */
/* -------------------------------------------------------------------------- */

function createEmptyResult(): CompareResult {
    return {
        groups: [],
        oldSegments: [],
        newSegments: [],
        mergedHtml: "",
        stats: {
            insertedChars: 0,
            deletedChars: 0,
            replaceCount: 0,
            insertCount: 0,
            deleteCount: 0,
            groupCount: 0,
            similarity: 100,
            rating: "暂无文本",
            oldLength: 0,
            newLength: 0,
            duration: 0,
            identical: false,
        },
    };
}

const result = shallowRef<CompareResult>(createEmptyResult());
const currentId = ref<number | null>(null);
const isComputing = ref(false);
const dirty = ref(false);

let compareToken = 0;

const hasText = computed(() => oldText.value.length > 0 || newText.value.length > 0);
const bothText = computed(() => oldText.value.length > 0 && newText.value.length > 0);

function countVisibleChars(text: string): number {
    let count = 0;
    for (const char of text) {
        if (!/\s/u.test(char)) count++;
    }
    return count;
}

const oldVisibleChars = computed(() => countVisibleChars(oldText.value));
const newVisibleChars = computed(() => countVisibleChars(newText.value));

const modeLabel = computed(() => {
    if (cleanupMode.value === "semantic") return "语义优化";
    if (cleanupMode.value === "efficiency") return "效率优化";
    return "原始输出";
});

const durationText = computed(() => {
    const duration = result.value.stats.duration;
    if (!hasText.value) return "—";
    if (duration < 1) return "<1 ms";
    if (duration >= 1000) return `${(duration / 1000).toFixed(2)} s`;
    return `${duration.toFixed(1)} ms`;
});

const filteredGroups = computed(() => {
    if (filter.value === "all") return result.value.groups;
    return result.value.groups.filter((group) => group.type === filter.value);
});

const currentPosition = computed(() =>
    filteredGroups.value.findIndex((group) => group.id === currentId.value),
);

const currentGroup = computed(
    () => result.value.groups.find((group) => group.id === currentId.value) ?? null,
);

const canPrev = computed(
    () =>
        filteredGroups.value.length > 0 && (currentPosition.value < 0 || currentPosition.value > 0),
);

const canNext = computed(
    () =>
        filteredGroups.value.length > 0 &&
        (currentPosition.value < 0 || currentPosition.value < filteredGroups.value.length - 1),
);

const positionLabel = computed(() => {
    if (!hasText.value) return "0 / 0";
    if (filteredGroups.value.length === 0) return "0 / 0";
    if (currentPosition.value < 0) return `— / ${filteredGroups.value.length}`;
    return `${currentPosition.value + 1} / ${filteredGroups.value.length}`;
});

async function runCompare(): Promise<void> {
    if (!hasText.value) {
        compareToken++;
        result.value = createEmptyResult();
        currentId.value = null;
        dirty.value = false;
        isComputing.value = false;
        return;
    }

    // 只有一侧有内容时先原样展示，避免把“还没填另一侧”误判成整篇删除 / 新增
    if (!bothText.value) {
        compareToken++;
        const pending = createEmptyResult();
        pending.stats.oldLength = oldText.value.length;
        pending.stats.newLength = newText.value.length;
        pending.oldSegments = oldText.value ? [{ type: "equal", text: oldText.value }] : [];
        pending.newSegments = newText.value ? [{ type: "equal", text: newText.value }] : [];
        pending.mergedHtml = "";
        result.value = pending;
        currentId.value = null;
        dirty.value = false;
        isComputing.value = false;
        return;
    }

    const token = ++compareToken;
    isComputing.value = true;

    // 给 loading 状态一个绘制机会（大文本对比是同步计算）
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (token !== compareToken) return;

    try {
        const next = computeTextCompare(oldText.value, newText.value, {
            cleanupMode: cleanupMode.value,
            editCost: editCost.value,
        });
        if (token !== compareToken) return;

        const previousId = currentId.value;
        result.value = next;

        if (next.groups.length === 0) {
            currentId.value = null;
        } else if (previousId !== null && next.groups.some((group) => group.id === previousId)) {
            currentId.value = previousId;
        } else {
            currentId.value = next.groups[0]?.id ?? null;
        }

        dirty.value = false;
    } catch (error) {
        ElMessage.error(`对比失败：${errorText(error)}`);
    } finally {
        if (token === compareToken) isComputing.value = false;
    }
}

const debouncedCompare = useDebounceFn(() => {
    void runCompare();
}, 280);

watch([oldText, newText, cleanupMode, editCost], () => {
    dirty.value = true;
    debouncedCompare();
});

/* -------------------------------------------------------------------------- */
/*                              差异定位与滚动联动                             */
/* -------------------------------------------------------------------------- */

const oldPaneRef = ref<InstanceType<typeof ComparePane> | null>(null);
const newPaneRef = ref<InstanceType<typeof ComparePane> | null>(null);

let scrollLockUntil = 0;

function scrollPanesTo(id: number): void {
    scrollLockUntil = performance.now() + 160;
    void nextTick(() => {
        oldPaneRef.value?.scrollToGroup(id);
        newPaneRef.value?.scrollToGroup(id);
    });
}

function selectGroup(id: number): void {
    currentId.value = id;
    scrollPanesTo(id);
}

// 切换筛选后，如果当前差异被筛掉，自动落到该筛选的第一条
watch(filter, (value) => {
    if (currentId.value === null || result.value.groups.length === 0) return;
    const groups =
        value === "all"
            ? result.value.groups
            : result.value.groups.filter((group) => group.type === value);
    if (groups.length === 0) return;
    if (groups.some((group) => group.id === currentId.value)) return;
    const first = groups[0];
    if (first) selectGroup(first.id);
});

function handlePaneSelect(id: number): void {
    const group = result.value.groups.find((item) => item.id === id);
    if (!group) return;

    if (filter.value !== "all" && group.type !== filter.value) {
        filter.value = "all";
    }
    selectGroup(id);
}

function stepGroup(direction: -1 | 1): void {
    const groups = filteredGroups.value;
    if (groups.length === 0) return;

    const position = currentPosition.value;
    let nextIndex: number;
    if (position < 0) {
        nextIndex = direction > 0 ? 0 : groups.length - 1;
    } else {
        nextIndex = Math.min(groups.length - 1, Math.max(0, position + direction));
    }

    const group = groups[nextIndex];
    if (group) selectGroup(group.id);
}

function handlePaneScroll(side: Side): void {
    if (!syncScrollEnabled.value) return;
    const now = performance.now();
    if (now < scrollLockUntil) return;

    const source = side === "old" ? oldPaneRef.value : newPaneRef.value;
    const target = side === "old" ? newPaneRef.value : oldPaneRef.value;
    const sourceEl = source?.getScrollEl();
    const targetEl = target?.getScrollEl();
    if (!sourceEl || !targetEl) return;

    const sourceMax = sourceEl.scrollHeight - sourceEl.clientHeight;
    const targetMax = targetEl.scrollHeight - targetEl.clientHeight;
    if (sourceMax <= 0 || targetMax <= 0) return;

    scrollLockUntil = now + 90;
    targetEl.scrollTop = (sourceEl.scrollTop / sourceMax) * targetMax;
}

/* -------------------------------------------------------------------------- */
/*                                顶部工具栏动作                               */
/* -------------------------------------------------------------------------- */

function openDrawer(): void {
    drawerVisible.value = true;
}

function handleStartCompare(): void {
    if (!bothText.value) {
        openDrawer();
        if (hasText.value) ElMessage.info("请补充另一侧文本后再开始比对");
        return;
    }
    void runCompare();
}

function swapSides(): void {
    [oldText.value, newText.value] = [newText.value, oldText.value];
    [fileNames.old, fileNames.new] = [fileNames.new, fileNames.old];
    [fileSizes.old, fileSizes.new] = [fileSizes.new, fileSizes.old];
    currentId.value = null;
    debouncedCompare.cancel();
    void runCompare();
    ElMessage.success("已交换左右文本");
}

function clearAll(): void {
    debouncedCompare.cancel();
    compareToken++;
    isComputing.value = false;
    oldText.value = "";
    newText.value = "";
    result.value = createEmptyResult();
    currentId.value = null;
    dirty.value = false;
    filter.value = "all";
    fileNames.old = "";
    fileNames.new = "";
    fileSizes.old = 0;
    fileSizes.new = 0;
    void nextTick(() => {
        debouncedCompare.cancel();
        dirty.value = false;
    });
}

function loadExample(): void {
    debouncedCompare.cancel();
    oldText.value = EXAMPLE_OLD_TEXT;
    newText.value = EXAMPLE_NEW_TEXT;
    currentId.value = null;
    activeTab.value = "text";
    filter.value = "all";
    drawerVisible.value = false;
    void runCompare();
    ElMessage.success("已加载示例");
}

async function saveReport(): Promise<void> {
    if (!bothText.value) {
        ElMessage.warning("请先补齐两侧文本");
        return;
    }
    if (dirty.value) await runCompare();

    const html = buildCompareReportHtml({
        oldText: oldText.value,
        newText: newText.value,
        result: result.value,
        cleanupLabel: modeLabel.value,
    });

    try {
        downloadTextFile(html, buildCompareReportFileName(), "text/html;charset=utf-8");
        ElMessage.success("对比报告已生成");
    } catch (error) {
        ElMessage.error(`报告保存失败：${errorText(error)}`);
    }
}

function openSplitDialog(): void {
    if (typeof Application === "undefined") {
        ElMessage.error("当前环境不支持独立窗口");
        return;
    }

    const base = window.location.origin + window.location.pathname;
    Application.ShowDialog(
        `${base}?dialog=text-compare-split`,
        "文本分屏对比",
        savedDialogWidth.value,
        savedDialogHeight.value,
        false,
    );
}

/* -------------------------------------------------------------------------- */
/*                              WPS 选区 / 书签同步                            */
/* -------------------------------------------------------------------------- */

const {
    status: bookmarkStatus,
    snapshot: bookmarkSnapshot,
    markSelection,
    clearMark,
    startWatching,
    stopWatching,
} = useSelectionBookmark();

const bookmarkPreview = computed(() => {
    const text = bookmarkSnapshot.value?.originalText ?? "";
    return text.replace(/\s+/g, " ").trim().slice(0, 80);
});

function syncLabelFor(side: Side): string | undefined {
    if (insertTarget.value !== side) return undefined;
    return bookmarkStatus.value === "marked" ? "标记段落同步" : "选区同步";
}

function readSelectionText(): string {
    if (!hasWps.value) return "";
    try {
        return normalizeDocumentText(wpsSelection.Range?.Text ?? "").trim();
    } catch (error) {
        console.warn("读取选区失败", error);
        return "";
    }
}

function readFullDocumentText(): string {
    if (!hasWps.value || typeof Application === "undefined") return "";
    try {
        const document = Application.ActiveDocument as unknown as {
            Content?: { Text?: string };
        };
        return normalizeDocumentText(document.Content?.Text ?? "").trim();
    } catch (error) {
        console.warn("读取整篇文档失败", error);
        return "";
    }
}

function readBookmarkText(): string {
    if (!hasWps.value) return "";
    const snapshot = bookmarkSnapshot.value;
    if (!snapshot) return "";
    try {
        return normalizeDocumentText(getBookmarkText(snapshot.bookmarkName) ?? "").trim();
    } catch (error) {
        console.warn("读取书签内容失败", error);
        return "";
    }
}

function writeText(side: Side, text: string): void {
    if (side === "old") oldText.value = text;
    else newText.value = text;
}

function fillFromText(side: Side, text: string, sourceLabel: string): void {
    if (!text) {
        ElMessage.warning("没有读取到内容，请先在文档中选中文字");
        return;
    }
    writeText(side, text);
    ElMessage.success(`已将${sourceLabel}填入${side === "old" ? "原始版本" : "修改版本"}`);
}

function handleReadSelection(side: Side): void {
    if (!hasWps.value) {
        ElMessage.warning("仅支持在 WPS 中读取选区");
        return;
    }
    fillFromText(side, readSelectionText(), "选中文字");
}

function handleDocumentCommand(command: string): void {
    const [source, side] = command.split(":") as ["selection" | "document" | "bookmark", Side];

    if (source === "selection") {
        fillFromText(side, readSelectionText(), "选中文字");
    } else if (source === "document") {
        fillFromText(side, readFullDocumentText(), "整篇文档");
    } else {
        fillFromText(side, readBookmarkText(), "标记段落");
    }
}

const pendingSelection = useDebounceFn((target: Side, text: string) => {
    writeText(target, text);
}, 140);

useSelectionWatcher(() => {
    if (bookmarkStatus.value === "marked") return;

    const target = insertTarget.value;
    if (target === "none") return;

    const text = readSelectionText();
    if (text) pendingSelection(target, text);
});

watch(insertTarget, (target) => {
    pendingSelection.cancel();
    if (target === "none") return;

    if (bookmarkStatus.value === "marked" && bookmarkSnapshot.value) {
        const text = readBookmarkText();
        if (text) writeText(target, text);
        return;
    }

    const text = readSelectionText();
    if (text) writeText(target, text);
});

function handleMark(): void {
    if (!hasWps.value) {
        ElMessage.warning("请先在 WPS 中打开文档");
        return;
    }

    const name = markSelection();
    if (!name || !bookmarkSnapshot.value) {
        ElMessage.warning("请先在文档中选中一段文字");
        return;
    }

    if (insertTarget.value === "none") {
        insertTarget.value = "old";
    } else {
        writeText(
            insertTarget.value,
            normalizeDocumentText(bookmarkSnapshot.value.originalText).trim(),
        );
    }

    startWatching(({ currentText }) => {
        const target = insertTarget.value;
        if (target === "none") return;
        writeText(target, normalizeDocumentText(currentText).trim());
    });

    ElMessage.success("已标记段落，文档改动将实时同步");
}

function handleClearMark(): void {
    stopWatching();
    clearMark();
    ElMessage.info("已取消段落标记");
}

/* -------------------------------------------------------------------------- */
/*                                  文件比对                                   */
/* -------------------------------------------------------------------------- */

const fileNames = reactive<Record<Side, string>>({ old: "", new: "" });
const fileSizes = reactive<Record<Side, number>>({ old: 0, new: 0 });
const fileBusy = ref<Side | null>(null);
const fileInputs = reactive<Record<Side, HTMLInputElement | null>>({ old: null, new: null });
const fileSides: Side[] = ["old", "new"];

function setFileInput(side: Side, element: unknown): void {
    fileInputs[side] = element instanceof HTMLInputElement ? element : null;
}

function pickFile(side: Side): void {
    fileInputs[side]?.click();
}

async function loadFile(side: Side, file: File): Promise<void> {
    if (!isSupportedDocumentFile(file.name)) {
        ElMessage.error("仅支持 .txt / .md / .docx 文件");
        return;
    }

    fileBusy.value = side;
    try {
        const text = await readDocumentFile(file);
        if (!text.trim()) throw new Error("文件里没有可读取的文字");

        writeText(side, text);
        fileNames[side] = file.name;
        fileSizes[side] = file.size;
        ElMessage.success(`已读取 ${file.name}`);

        if (oldText.value.trim() && newText.value.trim()) {
            activeTab.value = "text";
            currentId.value = null;
            void runCompare();
        }
    } catch (error) {
        ElMessage.error(errorText(error));
    } finally {
        fileBusy.value = null;
    }
}

function handleFilePicked(side: Side, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void loadFile(side, file);
}

function handleDrop(side: Side, event: DragEvent): void {
    const file = event.dataTransfer?.files?.[0];
    if (file) void loadFile(side, file);
}

/* -------------------------------------------------------------------------- */
/*                                   生命周期                                  */
/* -------------------------------------------------------------------------- */

onMounted(() => {
    hasWps.value = typeof Application !== "undefined";
    if (hasText.value) void runCompare();
});

onBeforeUnmount(() => {
    debouncedCompare.cancel();
    pendingSelection.cancel();
    stopWatching();
    compareToken++;
});
</script>

<style scoped>
.compare-app {
    height: 100vh;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #f4f6fb;
    color: #1f2937;
    font-family:
        "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", "Segoe UI",
        sans-serif;
}

/* ── 顶部 ─────────────────────────────────────────────────────────────── */

.app-header {
    flex-shrink: 0;
    background: #fff;
    border-bottom: 1px solid #e8ecf4;
    padding: 0 14px;
    position: relative;
    z-index: 6;
}

.brand-row {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid #f3f5fa;
}

.brand {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
}

.brand-mark {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%);
    box-shadow: 0 4px 10px -5px rgb(37 99 235 / 65%);
}

.brand-copy {
    min-width: 0;
    line-height: 1.15;
}

.brand-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.01em;
}

.brand-sub {
    font-size: 10px;
    color: #a3aec0;
    margin-top: 1px;
}

.brand-actions {
    display: flex;
    align-items: center;
    gap: 2px;
}

.doc-btn {
    color: #475569;
    font-size: 12px;
}

.icon-btn {
    color: #64748b;
}

.caret {
    font-size: 10px;
    color: #94a3b8;
    margin-left: 2px;
}

.toolbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 0 8px;
    flex-wrap: wrap;
}

.page-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
}

.page-title-main {
    font-size: 19px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.01em;
}

.page-title-sub {
    font-size: 11.5px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.toolbar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.toolbar-actions :deep(.el-button) {
    height: 32px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 500;
    margin-left: 0;
}

.toolbar-actions :deep(.el-button--primary) {
    box-shadow: 0 7px 16px -10px rgb(37 99 235 / 85%);
}

.options-trigger {
    color: #475569;
}

.tab-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-top: 1px solid #f5f7fb;
}

.tabs {
    display: flex;
    gap: 2px;
    margin-bottom: -1px;
}

.tab {
    position: relative;
    border: none;
    background: none;
    font: inherit;
    font-size: 12.5px;
    color: #64748b;
    padding: 10px 12px 9px;
    cursor: pointer;
    border-radius: 7px 7px 0 0;
    transition:
        color 0.15s,
        background-color 0.15s;
}

.tab:hover {
    color: #334155;
    background: #f8fafd;
}

.tab.active {
    color: #2563eb;
    font-weight: 600;
    background: #f7faff;
}

.tab.active::after {
    content: "";
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 0;
    height: 2px;
    border-radius: 2px;
    background: #2563eb;
}

.tab-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #94a3b8;
    white-space: nowrap;
}

.mode-chip {
    font-size: 10.5px;
    line-height: 1;
    padding: 4px 7px;
    border-radius: 999px;
    color: #3b82f6;
    background: #eff6ff;
    border: 1px solid #dbeafe;
}

.meta-busy {
    color: #2563eb;
}

.meta-dirty {
    color: #d97706;
}

.meta-done {
    color: #94a3b8;
}

/* ── 选项面板 ─────────────────────────────────────────────────────────── */

.options-panel {
    padding: 2px 2px 0;
}

.options-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f1f5f9;
    margin-bottom: 10px;
    font-size: 12.5px;
    font-weight: 600;
    color: #334155;
}

.options-head small {
    font-size: 10px;
    font-weight: 400;
    color: #a3aec0;
}

.option-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    color: #475569;
    padding: 5px 0;
}

.option-tip {
    margin: 8px 0 0;
    padding-top: 8px;
    border-top: 1px solid #f1f5f9;
    font-size: 10.5px;
    line-height: 1.6;
    color: #94a3b8;
}

/* ── 主区域 ───────────────────────────────────────────────────────────── */

.main-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 14px;
}

.workspace {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(300px, 38%);
    gap: 10px;
    padding: 10px 0;
}

/* 窄窗格：原文 / 修改并排，对比结果独占一行；再窄则单列堆叠。
   任何宽度下都同时渲染三个面板，不再用“点击切换”。 */
@media (max-width: 880px) {
    .workspace {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-auto-rows: 340px;
        align-content: start;
        overflow-y: auto;
        padding: 8px 0;
    }

    .workspace-result {
        grid-column: 1 / -1;
    }
}

@media (max-width: 380px) {
    .workspace {
        grid-template-columns: minmax(0, 1fr);
    }

    .workspace-result {
        grid-column: auto;
    }
}

/* ── 文件比对 ─────────────────────────────────────────────────────────── */

.file-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 14px 10px;
}

.file-head {
    text-align: center;
    margin-bottom: 16px;
}

.file-head h2 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
}

.file-head p {
    margin: 0;
    font-size: 11.5px;
    color: #94a3b8;
}

.file-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    max-width: 820px;
    margin: 0 auto;
}

.file-card {
    background: #fff;
    border: 1.5px dashed #d7e0ec;
    border-radius: 14px;
    padding: 18px 18px 16px;
    text-align: center;
    cursor: pointer;
    transition:
        border-color 0.2s,
        background-color 0.2s,
        box-shadow 0.2s;
    min-width: 0;
}

.file-card:hover,
.file-card:focus-visible {
    border-color: #93c5fd;
    background: #f8fbff;
    box-shadow: 0 12px 26px -22px rgb(37 99 235 / 55%);
    outline: none;
}

.file-card.has-file {
    border-style: solid;
    border-color: #bfdbfe;
    background: #f8fbff;
}

.file-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
}

.file-badge {
    font-size: 10px;
    line-height: 1;
    padding: 4px 7px;
    border-radius: 999px;
    font-weight: 600;
}

.badge-old {
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fee2e2;
}

.badge-new {
    color: #15803d;
    background: #f0fdf4;
    border: 1px solid #dcfce7;
}

.file-size {
    font-size: 10px;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
}

.file-icon {
    width: 46px;
    height: 46px;
    margin: 8px auto 10px;
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #eff6ff;
    color: #2563eb;
}

.file-card h3 {
    margin: 0 0 5px;
    font-size: 13.5px;
    font-weight: 600;
    color: #334155;
    overflow-wrap: anywhere;
}

.file-card p {
    margin: 0 0 14px;
    font-size: 11px;
    color: #94a3b8;
}

.file-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    max-width: 820px;
    margin: 14px auto 0;
    font-size: 10.5px;
    color: #a3aec0;
    line-height: 1.6;
    text-align: center;
}

.hidden-input {
    display: none;
}

/* ── 条款视图 ─────────────────────────────────────────────────────────── */

.clause-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

/* ── 状态栏 ───────────────────────────────────────────────────────────── */

.statusbar {
    flex-shrink: 0;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 14px;
    background: #fff;
    border-top: 1px solid #e8ecf4;
}

.status-left {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
}

.status-hint {
    font-size: 11px;
    color: #94a3b8;
}

.status-left :deep(.el-button) {
    margin-left: 0;
    font-size: 12px;
    color: #475569;
    padding: 0 6px;
}

.status-left :deep(.el-button.is-disabled) {
    color: #cbd5e1;
}

.step-count {
    font-size: 11px;
    color: #64748b;
    background: #f1f5f9;
    border-radius: 999px;
    padding: 3px 8px;
    margin-left: 4px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.current-type {
    margin-left: 6px;
    font-size: 10px;
    line-height: 1;
    padding: 4px 6px;
    border-radius: 4px;
    font-weight: 600;
}

.current-type.type-delete {
    color: #b91c1c;
    background: #fee2e2;
}

.current-type.type-insert {
    color: #15803d;
    background: #dcfce7;
}

.current-type.type-replace {
    color: #b45309;
    background: #fef3c7;
}

.status-right {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 10.5px;
    color: #a3aec0;
}

.status-dot {
    color: #cbd5e1;
}

.status-meta {
    white-space: nowrap;
}

/* ── 响应式 ───────────────────────────────────────────────────────────── */

@media (max-width: 1100px) {
    .page-title-sub {
        display: none;
    }
}

@media (max-width: 860px) {
    .toolbar-actions :deep(.el-button:not(.el-button--primary)) .btn-text,
    .doc-btn .btn-text {
        display: none;
    }

    .toolbar-actions :deep(.el-button) {
        padding: 0 9px;
    }

    .toolbar-row {
        gap: 8px;
    }

    .page-title-main {
        font-size: 17px;
    }

    .status-right {
        display: none;
    }
}

@media (max-width: 640px) {
    .app-header {
        padding: 0 10px;
    }

    .brand-sub {
        display: none;
    }

    .toolbar-row {
        justify-content: flex-end;
        padding: 7px 0;
    }

    .tab-meta .mode-chip {
        display: none;
    }

    .main-area {
        padding: 0 10px;
    }

    .workspace {
        padding: 8px 0;
    }

    .file-area {
        padding: 12px 10px;
    }

    .file-grid {
        grid-template-columns: 1fr;
    }

    .statusbar {
        padding: 0 8px;
    }

    .step-count {
        margin-left: 2px;
    }
}

@media (max-width: 360px) {
    .page-title {
        display: none;
    }

    .tabs {
        gap: 0;
    }

    .tab {
        padding: 9px 9px 8px;
        font-size: 12px;
    }

    .tab-meta {
        display: none;
    }
}
</style>
