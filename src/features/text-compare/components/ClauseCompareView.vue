<template>
    <section class="clause-view">
        <header class="clause-toolbar">
            <div class="clause-summary">
                <span class="summary-strong">条款视图</span>
                <span>按段落对齐 · 共 {{ rows.length }} 条</span>
                <span v-if="hasText" class="summary-diff">{{ diffCount }} 条存在差异</span>
            </div>
            <label class="only-diff">
                <el-switch v-model="onlyDiff" size="small" :disabled="!hasText" />
                <span>仅显示差异</span>
            </label>
        </header>

        <div v-if="!hasText" class="clause-empty">
            <div class="empty-mark">§</div>
            <p>输入文本后展示条款对照</p>
            <span>相同段落自动对齐，修改段落并排显示</span>
        </div>

        <div v-else class="clause-scroll">
            <table class="clause-table">
                <thead>
                    <tr>
                        <th class="col-no">#</th>
                        <th class="col-text">原始版本</th>
                        <th class="col-text">修改版本</th>
                        <th class="col-type">状态</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="row in visibleRows"
                        :key="row.id"
                        :class="[`row-${row.type}`, { 'is-equal': row.type === 'equal' }]"
                    >
                        <td class="col-no">{{ row.id + 1 }}</td>
                        <td
                            class="col-text col-old"
                            :class="{ 'cell-deleted': row.type === 'delete' }"
                        >
                            <span v-if="!row.oldText" class="placeholder">—</span>
                            <template v-else>
                                <template v-for="(segment, index) in row.oldSegments" :key="index">
                                    <span v-if="segment.type === 'equal'" v-text="segment.text" />
                                    <span
                                        v-else-if="segment.type === 'delete'"
                                        class="diff-del"
                                        v-text="segment.text"
                                    />
                                </template>
                            </template>
                        </td>
                        <td
                            class="col-text col-new"
                            :class="{ 'cell-inserted': row.type === 'insert' }"
                        >
                            <span v-if="!row.newText" class="placeholder">—</span>
                            <template v-else>
                                <template v-for="(segment, index) in row.newSegments" :key="index">
                                    <span v-if="segment.type === 'equal'" v-text="segment.text" />
                                    <span
                                        v-else-if="segment.type === 'insert'"
                                        class="diff-ins"
                                        v-text="segment.text"
                                    />
                                </template>
                            </template>
                        </td>
                        <td class="col-type">
                            <span class="row-tag" :class="`tag-${row.type}`">
                                {{ rowLabel[row.type] }}
                            </span>
                        </td>
                    </tr>
                    <tr v-if="visibleRows.length === 0">
                        <td colspan="4" class="no-diff">两段文本的段落完全一致</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>

<script setup lang="ts">
import type { ClauseRow, RenderSegment } from "@/features/text-compare/core/textCompare";

import { computed, ref } from "vue";

import { buildClauseRows, computeTextCompare } from "@/features/text-compare/core/textCompare";

interface DisplayRow extends ClauseRow {
    oldSegments: RenderSegment[];
    newSegments: RenderSegment[];
}

const props = defineProps<{
    oldText: string;
    newText: string;
}>();

const onlyDiff = ref(false);

const hasText = computed(() => props.oldText.length > 0 || props.newText.length > 0);

const rows = computed<DisplayRow[]>(() => {
    if (!hasText.value) return [];

    return buildClauseRows(props.oldText, props.newText).map((row) => {
        if (row.type === "equal" || row.type === "delete" || row.type === "insert") {
            return {
                ...row,
                oldSegments: row.oldText
                    ? ([{ type: "equal", text: row.oldText }] satisfies RenderSegment[])
                    : [],
                newSegments: row.newText
                    ? ([{ type: "equal", text: row.newText }] satisfies RenderSegment[])
                    : [],
            };
        }

        const result = computeTextCompare(row.oldText, row.newText, {
            cleanupMode: "semantic",
        });
        return {
            ...row,
            oldSegments: result.oldSegments,
            newSegments: result.newSegments,
        };
    });
});

const diffCount = computed(() => rows.value.filter((row) => row.type !== "equal").length);

const visibleRows = computed(() =>
    onlyDiff.value ? rows.value.filter((row) => row.type !== "equal") : rows.value,
);

const rowLabel = {
    equal: "相同",
    replace: "修改",
    insert: "新增",
    delete: "删除",
} as const;
</script>

<style scoped>
.clause-view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e8ecf4;
    border-radius: 12px;
    overflow: hidden;
    margin: 10px 14px 0;
    box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
}

.clause-toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid #eef1f7;
    background: linear-gradient(180deg, #fbfcfe 0%, #fff 100%);
}

.clause-summary {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 11.5px;
    color: #94a3b8;
    min-width: 0;
    flex-wrap: wrap;
}

.summary-strong {
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
}

.summary-diff {
    color: #d97706;
}

.only-diff {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: #64748b;
    cursor: pointer;
    white-space: nowrap;
}

.clause-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
}

.clause-scroll::-webkit-scrollbar {
    width: 9px;
    height: 9px;
}

.clause-scroll::-webkit-scrollbar-thumb {
    background: #d7dee9;
    border-radius: 5px;
    border: 2px solid #fff;
}

.clause-table {
    width: 100%;
    min-width: 680px;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    font-size: 12.5px;
}

.clause-table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: #f8fafd;
    border-bottom: 1px solid #e8eef7;
    padding: 8px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    letter-spacing: 0.02em;
}

.col-no {
    width: 44px;
    text-align: center !important;
    color: #a5b1c2;
    font-variant-numeric: tabular-nums;
}

.col-type {
    width: 68px;
    text-align: center !important;
}

.col-text {
    width: calc((100% - 112px) / 2);
}

.clause-table td {
    padding: 9px 12px;
    vertical-align: top;
    border-bottom: 1px solid #f1f5f9;
    line-height: 1.7;
    color: #334155;
    overflow-wrap: anywhere;
}

.clause-table tbody tr:hover td {
    background: #fbfcfe;
}

.clause-table tbody tr.row-replace td {
    background: #fffdf6;
}

.clause-table tbody tr.row-delete td {
    background: #fffafa;
}

.clause-table tbody tr.row-insert td {
    background: #fafefa;
}

.cell-deleted {
    color: #b91c1c;
    text-decoration: line-through;
    text-decoration-color: rgb(185 28 28 / 35%);
}

.cell-inserted {
    color: #15803d;
}

.diff-del {
    color: #b91c1c;
    background: #fee2e2;
    text-decoration: line-through;
    border-radius: 2px;
    padding: 0 1px;
    box-decoration-break: clone;
}

.diff-ins {
    color: #15803d;
    background: #dcfce7;
    border-radius: 2px;
    padding: 0 1px;
    box-decoration-break: clone;
}

.placeholder {
    color: #cbd5e1;
}

.row-tag {
    display: inline-block;
    font-size: 10px;
    line-height: 1;
    padding: 4px 6px;
    border-radius: 4px;
    font-weight: 600;
}

.tag-equal {
    color: #94a3b8;
    background: #f1f5f9;
}

.tag-replace {
    color: #b45309;
    background: #fef3c7;
}

.tag-insert {
    color: #15803d;
    background: #dcfce7;
}

.tag-delete {
    color: #b91c1c;
    background: #fee2e2;
}

.no-diff {
    text-align: center;
    color: #94a3b8;
    padding: 40px 12px !important;
}

.clause-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 30px;
    color: #94a3b8;
    text-align: center;
}

.clause-empty p {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
}

.clause-empty span {
    font-size: 11.5px;
}

.empty-mark {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f4f7fb;
    border: 1px solid #eaeff7;
    color: #b6c2d3;
    font-size: 22px;
    margin-bottom: 4px;
}

@media (max-width: 720px) {
    .clause-view {
        margin: 8px 10px 0;
    }

    .clause-toolbar {
        padding: 8px 10px;
    }

    .clause-scroll {
        overflow-x: hidden;
    }

    .clause-table {
        display: block;
        min-width: 0;
        width: 100%;
        font-size: 12.5px;
    }

    .clause-table thead {
        display: none;
    }

    .clause-table tbody {
        display: block;
    }

    .clause-table tbody tr {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-areas:
            "no type"
            "old old"
            "new new";
        gap: 3px 8px;
        padding: 9px 12px;
        border-bottom: 1px solid #f1f5f9;
    }

    .clause-table tbody tr td {
        display: block;
        width: auto;
        padding: 0;
        border: none;
        background: transparent;
    }

    .clause-table tbody tr.row-replace {
        background: #fffdf6;
    }

    .clause-table tbody tr.row-delete {
        background: #fffafa;
    }

    .clause-table tbody tr.row-insert {
        background: #fafefa;
    }

    .clause-table tbody tr:hover td {
        background: transparent;
    }

    .clause-table td.col-no {
        grid-area: no;
        text-align: left !important;
        font-size: 10px;
        color: #a5b1c2;
        align-self: center;
    }

    .clause-table td.col-type {
        grid-area: type;
        justify-self: end;
        width: auto;
        padding: 0;
    }

    .clause-table td.col-old {
        grid-area: old;
    }

    .clause-table td.col-new {
        grid-area: new;
        margin-top: 4px;
        padding-top: 6px;
        border-top: 1px dashed #e8eef7;
    }

    .clause-table td.col-old::before,
    .clause-table td.col-new::before {
        display: block;
        font-size: 9.5px;
        line-height: 1.4;
        color: #a8b3c4;
        margin-bottom: 2px;
    }

    .clause-table td.col-old::before {
        content: "原文";
    }

    .clause-table td.col-new::before {
        content: "修改后";
    }

    .clause-table tbody tr.is-equal td.col-new {
        display: none;
    }

    .clause-table tbody tr.is-equal td.col-old::before {
        display: none;
    }
}
</style>
