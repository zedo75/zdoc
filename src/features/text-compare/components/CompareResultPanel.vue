<template>
    <aside class="result-panel">
        <header class="result-head">
            <div class="title-row">
                <h2 class="result-title">对比结果</h2>
                <span class="result-total">共 {{ stats.groupCount }} 处</span>
            </div>

            <div class="view-row">
                <div class="view-switch" role="tablist">
                    <button
                        type="button"
                        class="view-tab"
                        :class="{ active: viewMode === 'merged' }"
                        role="tab"
                        :aria-selected="viewMode === 'merged'"
                        @click="viewMode = 'merged'"
                    >
                        合并文本
                    </button>
                    <button
                        type="button"
                        class="view-tab"
                        :class="{ active: viewMode === 'list' }"
                        role="tab"
                        :aria-selected="viewMode === 'list'"
                        @click="viewMode = 'list'"
                    >
                        差异列表
                    </button>
                </div>
                <span class="view-hint">{{ viewMode === "merged" ? "增删同屏" : "逐条定位" }}</span>
            </div>

            <div v-if="viewMode === 'list'" class="filter-row" role="tablist">
                <button
                    v-for="item in filters"
                    :key="item.value"
                    type="button"
                    class="filter-chip"
                    :class="[`filter-${item.value}`, { active: filter === item.value }]"
                    role="tab"
                    :aria-selected="filter === item.value"
                    @click="emit('update:filter', item.value)"
                >
                    {{ item.label }}
                    <b>{{ item.count }}</b>
                </button>
            </div>
        </header>

        <div v-if="viewMode === 'merged'" ref="mergedRef" class="merged-body">
            <div v-if="!hasText" class="result-empty">
                <div class="empty-mark">≡</div>
                <p>输入两段文本后</p>
                <span>这里会把新增和删除放在同一段文字里</span>
            </div>
            <div v-else class="merged-diff" v-html="mergedHtml"></div>
        </div>

        <div v-else ref="listRef" class="result-list">
            <div v-if="!hasText" class="result-empty">
                <div class="empty-mark">≡</div>
                <p>输入两段文本后</p>
                <span>这里会列出每一处差异</span>
            </div>

            <div v-else-if="groups.length === 0" class="result-empty is-same">
                <el-icon :size="26" color="#16a34a"><CircleCheck /></el-icon>
                <p>两段文本完全一致</p>
                <span>没有发现增删改</span>
            </div>

            <div v-else-if="visibleGroups.length === 0" class="result-empty">
                <p>当前筛选下没有差异</p>
                <button type="button" class="link-btn" @click="emit('update:filter', 'all')">
                    查看全部 {{ stats.groupCount }} 处
                </button>
            </div>

            <template v-else>
                <button
                    v-for="group in visibleGroups"
                    :key="group.id"
                    type="button"
                    class="result-item"
                    :class="[`type-${group.type}`, { active: group.id === currentId }]"
                    :data-group-id="group.id"
                    :title="`原文第 ${group.oldLine} 行 · 修改版第 ${group.newLine} 行`"
                    @click="emit('select', group.id)"
                >
                    <span class="type-tag">{{ CHANGE_TYPE_LABELS[group.type] }}</span>
                    <span class="result-text">
                        <template v-if="group.type === 'replace'">
                            <del class="text-old">{{ preview(group.oldText) }}</del>
                            <span class="arrow">→</span>
                            <ins class="text-new">{{ preview(group.newText) }}</ins>
                        </template>
                        <template v-else-if="group.type === 'delete'">
                            <del class="text-old">{{ preview(group.oldText) }}</del>
                        </template>
                        <template v-else>
                            <ins class="text-new">{{ preview(group.newText) }}</ins>
                        </template>
                    </span>
                    <span class="item-index">{{ String(group.id + 1).padStart(2, "0") }}</span>
                </button>
            </template>
        </div>
    </aside>
</template>

<script setup lang="ts">
import type { CompareStats, DiffGroup } from "@/features/text-compare/core/textCompare";
import type { ResultFilter } from "./types";

import { CircleCheck } from "@element-plus/icons-vue";
import { computed, nextTick, ref, watch } from "vue";

import { CHANGE_TYPE_LABELS, RESULT_FILTER_LABELS } from "./types";

const props = defineProps<{
    groups: DiffGroup[];
    stats: CompareStats;
    mergedHtml: string;
    currentId: number | null;
    filter: ResultFilter;
    hasText: boolean;
}>();

const emit = defineEmits<{
    (e: "select", id: number): void;
    (e: "update:filter", filter: ResultFilter): void;
}>();

const listRef = ref<HTMLElement | null>(null);
const viewMode = ref<"merged" | "list">("merged");

const filters = computed(() => {
    const values: ResultFilter[] = ["all", "replace", "insert", "delete"];
    return values.map((value) => ({
        value,
        label: RESULT_FILTER_LABELS[value],
        count:
            value === "all"
                ? props.stats.groupCount
                : value === "replace"
                  ? props.stats.replaceCount
                  : value === "insert"
                    ? props.stats.insertCount
                    : props.stats.deleteCount,
    }));
});

const visibleGroups = computed(() => {
    if (props.filter === "all") return props.groups;
    return props.groups.filter((group) => group.type === props.filter);
});

function preview(text: string): string {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return "（空白字符）";
    return clean.length > 90 ? `${clean.slice(0, 90)}…` : clean;
}

/** 当前差异变化时，把结果列表里的对应项滚进视野 */
watch(
    () => props.currentId,
    (id) => {
        if (id === null || viewMode.value !== "list") return;
        void nextTick(() => {
            const item = listRef.value?.querySelector<HTMLElement>(`[data-group-id="${id}"]`);
            item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
    },
);

// 从合并视图切回列表时，把当前差异滚进视野
watch(viewMode, (mode) => {
    if (mode !== "list" || props.currentId === null) return;
    void nextTick(() => {
        const item = listRef.value?.querySelector<HTMLElement>(
            `[data-group-id="${props.currentId}"]`,
        );
        item?.scrollIntoView({ block: "nearest" });
    });
});
</script>

<style scoped>
.result-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: #fff;
    border: 1px solid #e8ecf4;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
    overflow: hidden;
}

.result-head {
    flex-shrink: 0;
    padding: 10px 12px 9px;
    border-bottom: 1px solid #eef1f7;
    background: linear-gradient(180deg, #fbfcfe 0%, #fff 100%);
}

.title-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 7px;
}

.result-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
}

.result-total {
    font-size: 11px;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
}

.view-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.view-switch {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background: #f1f5f9;
}

.view-tab {
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #64748b;
    font: inherit;
    font-size: 10.5px;
    line-height: 1;
    padding: 5px 8px;
    cursor: pointer;
    transition:
        background-color 0.15s,
        color 0.15s,
        box-shadow 0.15s;
}

.view-tab:hover {
    color: #334155;
}

.view-tab.active {
    color: #2563eb;
    background: #fff;
    font-weight: 600;
    box-shadow: 0 1px 2px rgb(15 23 42 / 8%);
}

.view-hint {
    font-size: 9.5px;
    color: #a8b3c4;
    white-space: nowrap;
}

.filter-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 8px;
}

.filter-chip {
    border: 1px solid transparent;
    background: #f6f8fc;
    color: #64748b;
    border-radius: 6px;
    font-size: 11px;
    line-height: 1;
    padding: 5px 7px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.15s;
}

.filter-chip b {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #94a3b8;
}

.filter-chip:hover {
    background: #eef3fb;
    color: #475569;
}

.filter-chip.active {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #2563eb;
}

.filter-chip.active b {
    color: #2563eb;
}

.filter-replace.active {
    background: #fffbeb;
    border-color: #fde68a;
    color: #b45309;
}

.filter-replace.active b {
    color: #b45309;
}

.filter-insert.active {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #15803d;
}

.filter-insert.active b {
    color: #15803d;
}

.filter-delete.active {
    background: #fef2f2;
    border-color: #fecaca;
    color: #b91c1c;
}

.filter-delete.active b {
    color: #b91c1c;
}

.result-list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 6px;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
}

/* 旧版「合并文本」视图：同一段文字里同时显示删除与新增 */
.merged-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 14px 28px;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
}

.merged-body::-webkit-scrollbar {
    width: 8px;
}

.merged-body::-webkit-scrollbar-thumb {
    background: #d7dee9;
    border-radius: 4px;
    border: 2px solid #fff;
}

.merged-diff {
    font-size: 13.5px;
    line-height: 1.9;
    color: #334155;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    user-select: text;
}

.merged-diff :deep(del) {
    color: #b91c1c !important;
    background: #fef2f2 !important;
    text-decoration: line-through;
    text-decoration-color: rgb(185 28 28 / 50%);
    padding: 0 1px;
    border-radius: 2px;
}

.merged-diff :deep(ins) {
    color: #15803d !important;
    background: #ecfdf3 !important;
    text-decoration: none;
    padding: 0 1px;
    border-radius: 2px;
}

.result-list::-webkit-scrollbar {
    width: 8px;
}

.result-list::-webkit-scrollbar-thumb {
    background: #d7dee9;
    border-radius: 4px;
    border: 2px solid #fff;
}

.result-item {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 8px 8px 8px 6px;
    border: 1px solid transparent;
    border-left: 3px solid transparent;
    border-radius: 8px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition:
        background-color 0.15s,
        border-color 0.15s;
    font: inherit;
}

.result-item + .result-item {
    margin-top: 2px;
}

.result-item:hover {
    background: #f8fafc;
}

.result-item.active {
    background: #eff6ff;
    border-color: #bfdbfe;
    border-left-color: #2563eb;
    box-shadow: 0 4px 10px -8px rgb(37 99 235 / 65%);
}

.type-tag {
    flex-shrink: 0;
    font-size: 10px;
    line-height: 1;
    padding: 4px 5px;
    border-radius: 4px;
    font-weight: 600;
    letter-spacing: 0.02em;
}

.type-delete .type-tag {
    color: #b91c1c;
    background: #fee2e2;
}

.type-insert .type-tag {
    color: #15803d;
    background: #dcfce7;
}

.type-replace .type-tag {
    color: #b45309;
    background: #fef3c7;
}

.result-text {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    line-height: 1.6;
    color: #475569;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
}

.text-old {
    color: #b91c1c;
    text-decoration: line-through;
    text-decoration-color: rgb(185 28 28 / 45%);
    background: #fef2f2;
}

.text-new {
    color: #15803d;
    text-decoration: none;
    background: #f0fdf4;
}

.arrow {
    color: #94a3b8;
    padding: 0 2px;
    font-size: 10px;
}

.item-index {
    flex-shrink: 0;
    font-size: 10px;
    color: #cbd5e1;
    font-variant-numeric: tabular-nums;
    padding-top: 3px;
}

.result-item.active .item-index {
    color: #93c5fd;
}

.result-empty {
    padding: 34px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 5px;
    color: #94a3b8;
}

.result-empty p {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: #64748b;
}

.result-empty span {
    font-size: 11px;
    color: #a8b3c4;
}

.result-empty.is-same p {
    color: #15803d;
}

.empty-mark {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: #f6f8fc;
    color: #c3ccda;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 3px;
}

.link-btn {
    border: none;
    background: none;
    color: #2563eb;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
}

@media (max-width: 720px) {
    .result-head {
        padding: 8px 10px;
    }

    .result-list {
        padding: 4px;
    }

    .merged-body {
        padding: 10px;
    }

    .result-item {
        padding: 7px 6px;
    }
}
</style>
