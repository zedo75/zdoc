<template>
    <div class="flex flex-col h-screen bg-gray-50 text-gray-800">
        <!-- 头部 -->
        <div class="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                        <h1 class="text-[15px] font-semibold leading-5 text-gray-800">格式检查</h1>
                        <span
                            class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] leading-none text-gray-500"
                        >
                            只读
                        </span>
                    </div>
                    <p
                        class="mt-0.5 truncate text-[11px] leading-4 text-gray-400"
                        :title="result?.docName"
                    >
                        {{ result?.docName ?? "当前文档" }}
                    </p>
                </div>
                <el-button size="small" :loading="loading" @click="refresh">重新检查</el-button>
            </div>

            <div
                v-if="result"
                class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500"
            >
                <span>{{ result.paragraphCount }} 段</span>
                <span>{{ checkedCount }} 段已检查</span>
                <span
                    v-if="result.issueCount"
                    class="font-medium text-red-600"
                    title="与「排版设置」中的中/西文字体、字号、加粗、对齐、首行缩进、行距、小标题加粗严格比对"
                >
                    {{ result.issueCount }} 项格式不符
                </span>
                <span v-else class="text-emerald-600">
                    {{ checkedCount ? "未发现格式异常" : "无段落可检查" }}
                </span>
                <span class="ml-auto text-gray-400">{{ checkedTime }}</span>
            </div>

            <div v-if="summaryTypes.length" class="mt-2 flex flex-wrap gap-1">
                <span
                    v-for="item in summaryTypes"
                    :key="item.kind"
                    class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-none"
                    :style="{ color: item.meta.color, backgroundColor: item.meta.bg }"
                >
                    {{ item.meta.label }}
                    <span class="font-semibold tabular-nums">{{ item.count }}</span>
                </span>
            </div>
        </div>

        <!-- 内容 -->
        <el-scrollbar class="flex-1 min-h-0">
            <div class="p-3">
                <div
                    v-if="loading && !result"
                    class="flex flex-col items-center justify-center px-6 py-16 text-center"
                >
                    <span
                        class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
                    ></span>
                    <p class="mt-3 text-xs text-gray-400">正在检查文档…</p>
                </div>

                <div
                    v-else-if="!result && error"
                    class="flex flex-col items-center justify-center px-6 py-14 text-center"
                >
                    <p class="text-sm font-medium text-red-600">检查失败</p>
                    <p class="mt-2 break-all text-xs leading-relaxed text-gray-500">
                        {{ error }}
                    </p>
                    <el-button class="mt-4" size="small" @click="refresh">重试</el-button>
                </div>

                <div
                    v-else-if="!result"
                    class="flex flex-col items-center justify-center px-6 py-14 text-center text-gray-400"
                >
                    <p class="text-xs">打开文档后会自动检查</p>
                </div>

                <template v-else>
                    <!-- 结构提示 -->
                    <div
                        v-if="result.notes.length"
                        class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700"
                    >
                        <p v-for="(note, index) in result.notes" :key="index" class="flex gap-1.5">
                            <span
                                class="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-amber-500"
                            ></span>
                            <span>{{ note }}</span>
                        </p>
                    </div>

                    <!-- 空状态 -->
                    <div
                        v-if="result.elements.length === 0"
                        class="flex flex-col items-center justify-center px-6 py-12 text-center"
                    >
                        <svg
                            width="36"
                            height="36"
                            viewBox="0 0 24 24"
                            fill="none"
                            class="text-gray-300"
                        >
                            <path
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                stroke="currentColor"
                                stroke-width="1.5"
                            />
                            <path
                                d="M9 14l2 2 4-4"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                        <p class="mt-3 text-sm text-gray-500">未读取到段落</p>
                        <p class="mt-1 text-[11px] text-gray-400">
                            当前文档可能为空，或没有正文内容
                        </p>
                        <el-button class="mt-4" size="small" @click="refresh">重新检查</el-button>
                    </div>

                    <template v-else>
                        <!-- 按文档自然顺序分段展示全部段落 -->
                        <div
                            v-for="section in sections"
                            :key="section.key"
                            class="mb-2 overflow-hidden rounded-md border border-gray-200 bg-white"
                        >
                            <button
                                type="button"
                                class="flex w-full cursor-pointer items-center gap-1.5 border-b border-gray-100 bg-gray-50/80 px-2.5 py-1.5 text-left"
                                @click="toggleGroup(section.key)"
                            >
                                <span
                                    class="text-[9px] text-gray-400 transition-transform"
                                    :class="{ 'rotate-90': !collapsed[section.key] }"
                                >
                                    ▶
                                </span>
                                <span class="text-[12px] font-medium text-gray-600">
                                    {{ section.label }}
                                </span>
                                <span
                                    class="rounded-full bg-gray-200/70 px-1.5 text-[10px] leading-4 text-gray-500 tabular-nums"
                                >
                                    {{ section.items.length }} 段
                                </span>
                                <span
                                    v-if="section.issueCount"
                                    class="ml-auto text-[10px] text-red-500 tabular-nums"
                                >
                                    {{ section.issueCount }} 项不符
                                </span>
                            </button>

                            <div v-show="!collapsed[section.key]" class="divide-y divide-gray-100">
                                <div
                                    v-for="item in section.items"
                                    :key="item.paraIndex"
                                    class="element-row"
                                    :class="{
                                        'is-active': activeIndex === item.paraIndex,
                                        'has-issue': item.issues.length > 0,
                                        'is-neutral':
                                            item.kind === 'empty' || item.kind === 'table',
                                    }"
                                    :style="{ borderLeftColor: metaOf(item.kind).color }"
                                    role="button"
                                    tabindex="0"
                                    title="点击定位到正文"
                                    @click="locate(item)"
                                    @keydown.enter.prevent="locate(item)"
                                    @keydown.space.prevent="locate(item)"
                                >
                                    <div class="flex items-center gap-1.5">
                                        <span
                                            class="type-badge"
                                            :style="{ backgroundColor: metaOf(item.kind).color }"
                                        >
                                            {{ metaOf(item.kind).label }}
                                        </span>
                                        <span v-if="item.readFailed" class="status status-error">
                                            读取失败
                                        </span>
                                        <span
                                            v-else-if="item.issues.length"
                                            class="status status-error"
                                        >
                                            {{ item.issues.length }} 项不符
                                        </span>
                                        <span
                                            v-else-if="!item.expected"
                                            class="status status-muted"
                                        >
                                            不检查
                                        </span>
                                        <span v-else-if="item.skipped" class="status status-muted">
                                            已跳过
                                        </span>
                                        <span
                                            v-else-if="item.inAttachmentBlock"
                                            class="status status-muted"
                                        >
                                            附件块
                                        </span>
                                        <span
                                            v-else-if="item.kind !== 'body'"
                                            class="status status-ok"
                                        >
                                            ✓ 无异常
                                        </span>
                                    </div>

                                    <p class="element-text">
                                        {{ item.text || emptyText(item) }}
                                    </p>
                                    <p class="element-meta" :title="formatDetail(item)">
                                        {{ formatSummary(item) }}
                                    </p>
                                    <p v-if="item.issues.length" class="element-issues">
                                        {{ issueSummary(item) }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </template>
                </template>
            </div>
        </el-scrollbar>

        <!-- 底栏 -->
        <div
            class="shrink-0 border-t border-gray-200 bg-white px-4 py-2 text-[11px] leading-relaxed text-gray-400"
        >
            点击段落定位到正文 · 按「排版设置」严格比对中/西文字体、字号、行距等 ·
            只读，不会修改文档 · 文档修改后请重新检查
        </div>
    </div>
</template>

<script setup lang="ts">
import type { ParagraphSemanticKind } from "@/core/types";
import type { CheckElement, InspectionResult } from "@/features/format-check/core/inspect";

import { locateParagraph } from "@/features/format-check/commands/inspect";
import { useFormatCheck } from "@/features/format-check/composables/useFormatCheck";
import {
    formatAlignment,
    formatBold,
    formatFontSize,
    formatIndent,
    formatLineSpacing,
} from "@/features/format-check/core/inspect";

interface TypeMeta {
    label: string;
    /** 徽标 / 左侧色条 */
    color: string;
    /** 统计标签的浅色背景 */
    bg: string;
}

/** 各语义类型的展示信息 */
const TYPE_META: Record<ParagraphSemanticKind, TypeMeta> = {
    letterhead: { label: "版头", color: "#c62828", bg: "#ffebee" },
    mainTitle: { label: "标题", color: "#1565c0", bg: "#e3f2fd" },
    subtitle: { label: "副标题", color: "#1e88e5", bg: "#e3f2fd" },
    salutation: { label: "抬头", color: "#00897b", bg: "#e0f2f1" },
    h1: { label: "一级标题", color: "#5e35b1", bg: "#ede7f6" },
    h2: { label: "二级标题", color: "#7e57c2", bg: "#ede7f6" },
    h3: { label: "三级标题", color: "#9575cd", bg: "#ede7f6" },
    topic: { label: "小标题", color: "#8d6e63", bg: "#efebe9" },
    listItem: { label: "列表项", color: "#78909c", bg: "#eceff1" },
    attachment: { label: "附件", color: "#43a047", bg: "#e8f5e9" },
    signatureUnit: { label: "落款", color: "#ef6c00", bg: "#fff3e0" },
    signatureDate: { label: "日期", color: "#e53935", bg: "#ffebee" },
    body: { label: "正文", color: "#90a4ae", bg: "#eceff1" },
    empty: { label: "空行", color: "#90a4ae", bg: "#eceff1" },
    table: { label: "表格", color: "#78909c", bg: "#eceff1" },
};

type SectionRegion = "head" | "body" | "tail";

interface SectionMeta {
    label: string;
}

const SECTION_META: Record<SectionRegion, SectionMeta> = {
    head: { label: "文档头部" },
    body: { label: "正文" },
    tail: { label: "附件与落款" },
};

/** 段落语义 → 文档自然分段 */
const REGION_BY_KIND: Record<ParagraphSemanticKind, SectionRegion> = {
    letterhead: "head",
    mainTitle: "head",
    subtitle: "head",
    salutation: "head",
    h1: "body",
    h2: "body",
    h3: "body",
    topic: "body",
    listItem: "body",
    body: "body",
    attachment: "tail",
    signatureUnit: "tail",
    signatureDate: "tail",
    empty: "body",
    table: "body",
};

interface Section {
    key: string;
    region: SectionRegion;
    label: string;
    items: CheckElement[];
    issueCount: number;
}

const { result, loading, error, refresh } = useFormatCheck();

/** 所有分段默认展开 */
const collapsed = reactive<Record<string, boolean>>({});
const activeIndex = ref<number | null>(null);

// 重新检查后，旧的定位高亮可能已经失效
watch(result, () => {
    activeIndex.value = null;
});

const checkedCount = computed(() => {
    const data = result.value;
    if (!data) return 0;
    return data.elements.filter((item) => item.expected && !item.skipped && !item.readFailed)
        .length;
});

const summaryTypes = computed(() => {
    const data: InspectionResult | null = result.value;
    if (!data) return [];
    return (Object.keys(TYPE_META) as ParagraphSemanticKind[])
        .filter((kind) => (data.counts[kind] ?? 0) > 0)
        .map((kind) => ({
            kind,
            count: data.counts[kind] ?? 0,
            meta: TYPE_META[kind],
        }));
});

function isNeutralKind(kind: ParagraphSemanticKind): boolean {
    return kind === "empty" || kind === "table";
}

/** 从 from 开始找下一个有明确语义的段落所属分段 */
function findNextRegion(items: CheckElement[], from: number): SectionRegion {
    for (let i = from; i < items.length; i++) {
        const kind = items[i].kind;
        if (!isNeutralKind(kind)) return REGION_BY_KIND[kind];
    }
    return "body";
}

/**
 * 按文档自然顺序把全部段落切成「文档头部 / 正文 / 附件与落款」分段。
 * 空行、表格跟随当前分段；分段内段落顺序与文档完全一致。
 */
const sections = computed<Section[]>(() => {
    const data = result.value;
    if (!data) return [];

    const items = data.elements;
    const output: Section[] = [];
    let current: Section | null = null;

    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        let region: SectionRegion;

        if (item.inAttachmentBlock) {
            region = "tail";
        } else if (isNeutralKind(item.kind)) {
            region = current ? current.region : findNextRegion(items, index);
        } else {
            region = REGION_BY_KIND[item.kind];
        }

        if (!current || current.region !== region) {
            current = {
                key: `${region}-${item.paraIndex}`,
                region,
                label: SECTION_META[region].label,
                items: [],
                issueCount: 0,
            };
            output.push(current);
        }

        const section = current;
        if (!section) continue;
        section.items.push(item);
        section.issueCount += item.issues.length;
    }

    return output;
});

const checkedTime = computed(() => {
    const data = result.value;
    if (!data) return "";
    return new Date(data.checkedAt).toLocaleTimeString("zh-CN", {
        hour12: false,
    });
});

function metaOf(kind: ParagraphSemanticKind): TypeMeta {
    return TYPE_META[kind];
}

function toggleGroup(key: string): void {
    collapsed[key] = !collapsed[key];
}

function locate(item: CheckElement): void {
    activeIndex.value = item.paraIndex;
    try {
        locateParagraph(item.paraIndex);
    } catch (e) {
        console.warn("[format-check] 定位段落失败:", e);
    }
}

/** 空文本段落的占位文字 */
function emptyText(item: CheckElement): string {
    if (item.kind === "empty") return "（空行）";
    if (item.kind === "table") return "（表格）";
    return "（无文本）";
}

/** 简短的当前格式摘要 */
function formatSummary(item: CheckElement): string {
    if (item.readFailed) return "格式读取失败";
    if (item.kind === "empty") return "空段落";
    if (item.kind === "table") return "表格（不检查）";

    const format = item.format;
    const parts: string[] = [];
    if (format.styleName) parts.push(format.styleName);
    parts.push(format.fontName || "字体混合/未知");
    if (format.fontSize !== null) parts.push(formatFontSize(format.fontSize));
    if (format.alignment !== null) parts.push(formatAlignment(format.alignment));
    if (format.firstLineIndent !== null && format.firstLineIndent > 0 && !item.inAttachmentBlock) {
        parts.push(`首行缩进 ${formatIndent(format.firstLineIndent)}`);
    }
    return parts.join(" · ");
}

/** 悬停时展示完整的当前格式 */
function formatDetail(item: CheckElement): string {
    if (item.readFailed) return "格式读取失败";
    if (item.kind === "empty") return "空段落";
    if (item.kind === "table") return "表格段落，不参与格式检查";

    const format = item.format;
    const lines = [
        `样式：${format.styleName || "默认"}`,
        `中文字体：${format.fontName || "混合/未知"}`,
        `西文字体：${format.asciiFontName || "未知"}`,
        `字号：${formatFontSize(format.fontSize)}`,
        `加粗：${formatBold(format.bold)}`,
        `对齐：${formatAlignment(format.alignment)}`,
        `首行缩进：${formatIndent(format.firstLineIndent)}`,
    ];
    if (format.lineSpacing !== null || format.lineSpacingRule !== null) {
        lines.push(`行距：${formatLineSpacing(format.lineSpacing, format.lineSpacingRule)}`);
    }
    return lines.join("\n");
}

/** 把问题拼成一行，直接显示在要素下方 */
function issueSummary(item: CheckElement): string {
    return item.issues
        .map((issue) => `${issue.label}：${issue.actual}（应为 ${issue.expected}）`)
        .join("；");
}
</script>

<style scoped>
.element-row {
    border-left-width: 3px;
    border-left-style: solid;
    padding: 7px 10px 8px 9px;
    cursor: pointer;
    outline: none;
    transition:
        background-color 0.12s,
        box-shadow 0.12s;
}

.element-row:hover {
    background-color: #f7f9fc;
}

.element-row:focus-visible {
    background-color: #f0f6ff;
    box-shadow: inset 0 0 0 1px #91caff;
}

.element-row.is-active {
    background-color: #eff6ff;
}

.element-row.has-issue {
    background-color: #fff8f8;
}

.element-row.has-issue:hover,
.element-row.has-issue.is-active {
    background-color: #fff0f0;
}

/* 空行 / 表格：压低视觉权重，但仍保留在自然段落顺序中 */
.element-row.is-neutral {
    padding-top: 4px;
    padding-bottom: 5px;
    background-color: #fcfcfd;
}

.element-row.is-neutral .element-text,
.element-row.is-neutral .element-meta {
    color: #b6bec8;
}

.type-badge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 10px;
    line-height: 14px;
    font-weight: 500;
    color: #fff;
    white-space: nowrap;
}

.status {
    font-size: 10px;
    line-height: 14px;
    white-space: nowrap;
}

.status-error {
    color: #dc2626;
}

.status-ok {
    color: #059669;
}

.status-muted {
    color: #9ca3af;
}

.element-text {
    margin-top: 3px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 12px;
    line-height: 1.55;
    color: #374151;
    word-break: break-all;
}

.element-meta {
    margin-top: 2px;
    font-size: 10px;
    line-height: 1.5;
    color: #9ca3af;
    word-break: break-all;
}

.element-issues {
    margin-top: 3px;
    font-size: 10px;
    line-height: 1.5;
    color: #dc2626;
    word-break: break-all;
}
</style>
