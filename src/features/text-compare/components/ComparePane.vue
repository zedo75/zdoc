<template>
    <section class="compare-pane" :class="`is-${side}`">
        <header class="pane-head">
            <span class="pane-dot" />
            <h2 class="pane-title">{{ title }}</h2>
            <span class="pane-count">{{ charCount }} 字符</span>
            <span v-if="syncLabel" class="pane-sync">
                <span class="sync-pulse" />
                {{ syncLabel }}
            </span>
        </header>

        <div
            ref="bodyRef"
            class="pane-body"
            :class="{ 'is-empty': !text }"
            @scroll="handleScroll"
            @click="handleClick"
        >
            <div v-if="!text" class="pane-empty">
                <div class="empty-icon">
                    <el-icon :size="26"><DocumentIcon /></el-icon>
                </div>
                <p class="empty-title">{{ emptyTitle }}</p>
                <span class="empty-hint">{{ emptyHint }}</span>
                <el-button size="small" type="primary" plain @click.stop="emit('request-input')">
                    输入文本
                </el-button>
            </div>

            <div v-else class="pane-text">
                <template v-for="(segment, index) in segments" :key="index">
                    <span
                        v-if="segment.type === 'equal'"
                        class="diff-equal"
                        v-text="segment.text"
                    />
                    <span
                        v-else-if="segment.type === 'anchor'"
                        class="diff-anchor"
                        :data-diff-id="segment.groupId"
                    />
                    <span
                        v-else
                        class="diff-mark"
                        :class="[
                            segment.type === 'delete' ? 'diff-del' : 'diff-ins',
                            { 'is-current': segment.groupId === currentId },
                        ]"
                        :data-diff-id="segment.groupId"
                        v-text="segment.text"
                    />
                </template>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import type { RenderSegment } from "@/features/text-compare/core/textCompare";

import { Document as DocumentIcon } from "@element-plus/icons-vue";
import { computed, ref } from "vue";

const props = defineProps<{
    side: "old" | "new";
    title: string;
    segments: RenderSegment[];
    text: string;
    currentId: number | null;
    syncLabel?: string;
    emptyTitle: string;
    emptyHint: string;
}>();

const emit = defineEmits<{
    (e: "select", id: number): void;
    (e: "request-input"): void;
    (e: "scroll", side: "old" | "new"): void;
}>();

const bodyRef = ref<HTMLElement | null>(null);

const charCount = computed(() => {
    let count = 0;
    for (const char of props.text) {
        if (!/\s/u.test(char)) count++;
    }
    return count;
});

function handleScroll(): void {
    emit("scroll", props.side);
}

function handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const mark = target?.closest<HTMLElement>("[data-diff-id]");
    if (!mark) return;

    const id = Number(mark.dataset.diffId);
    if (Number.isFinite(id)) emit("select", id);
}

/** 滚动到指定差异块，并把该块放在视口偏上位置 */
function scrollToGroup(id: number, behavior: ScrollBehavior = "smooth"): void {
    const container = bodyRef.value;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(`[data-diff-id="${id}"]`);
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const delta = targetRect.top - containerRect.top - container.clientHeight * 0.32;
    if (Math.abs(delta) < 12) return;

    container.scrollTo({
        top: Math.max(0, container.scrollTop + delta),
        behavior,
    });
}

/** 供父组件做滚动同步 */
function getScrollEl(): HTMLElement | null {
    return bodyRef.value;
}

defineExpose({ scrollToGroup, getScrollEl });
</script>

<style scoped>
.compare-pane {
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

.pane-head {
    flex-shrink: 0;
    height: 42px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #eef1f7;
    background: linear-gradient(180deg, #fbfcfe 0%, #fff 100%);
}

.pane-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}

.is-old .pane-dot {
    background: #f87171;
    box-shadow: 0 0 0 3px rgb(248 113 113 / 14%);
}

.is-new .pane-dot {
    background: #4ade80;
    box-shadow: 0 0 0 3px rgb(74 222 128 / 16%);
}

.pane-title {
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
    margin: 0;
    white-space: nowrap;
}

.pane-count {
    font-size: 11px;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.pane-sync {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #2563eb;
    background: #eff6ff;
    border: 1px solid #dbeafe;
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
}

.sync-pulse {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #3b82f6;
    animation: sync-pulse 1.8s ease-in-out infinite;
}

@keyframes sync-pulse {
    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }

    50% {
        opacity: 0.45;
        transform: scale(0.8);
    }
}

.pane-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
}

.pane-body::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

.pane-body::-webkit-scrollbar-track {
    background: transparent;
}

.pane-body::-webkit-scrollbar-thumb {
    background: #d7dee9;
    border-radius: 4px;
    border: 2px solid #fff;
}

.pane-body::-webkit-scrollbar-thumb:hover {
    background: #b9c4d4;
}

.pane-body.is-empty {
    display: flex;
}

.pane-text {
    padding: 16px 18px 28px;
    font-family:
        "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", sans-serif;
    font-size: 13.5px;
    line-height: 1.95;
    color: #334155;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    tab-size: 4;
    user-select: text;
}

.diff-equal {
    white-space: pre-wrap;
}

.diff-mark {
    border-radius: 3px;
    padding: 0 1px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    cursor: pointer;
    transition:
        background-color 0.15s,
        box-shadow 0.15s;
}

.diff-del {
    color: #b91c1c;
    background: #fef2f2;
    text-decoration: line-through;
    text-decoration-color: rgb(185 28 28 / 55%);
    text-decoration-thickness: 1.5px;
    box-shadow: inset 0 -1px 0 rgb(248 113 113 / 55%);
}

.diff-ins {
    color: #15803d;
    background: #ecfdf3;
    box-shadow: inset 0 -1px 0 rgb(74 222 128 / 65%);
}

.diff-del:hover {
    background: #fee2e2;
}

.diff-ins:hover {
    background: #dcfce7;
}

.diff-del.is-current,
.diff-ins.is-current {
    color: #92400e;
    background: #fef3c7;
    box-shadow: 0 0 0 2px rgb(245 158 11 / 60%);
    border-radius: 3px;
}

.diff-anchor {
    display: inline-block;
    width: 0;
    height: 1.2em;
    vertical-align: text-bottom;
}

.pane-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px 18px;
    text-align: center;
}

.empty-icon {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    background: #f4f7fb;
    border: 1px solid #eaeff7;
    margin-bottom: 2px;
}

.empty-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
}

.empty-hint {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.5;
    margin-bottom: 6px;
}

@media (max-width: 720px) {
    .pane-head {
        height: 38px;
        padding: 0 12px;
    }

    .pane-text {
        padding: 14px 14px 24px;
        font-size: 13px;
    }

    .pane-count {
        margin-left: auto;
    }

    .pane-sync {
        display: none;
    }
}

@media (max-width: 520px) {
    .pane-head {
        padding: 0 10px;
    }

    .pane-text {
        padding: 12px 10px 22px;
        font-size: 12.5px;
        line-height: 1.85;
    }

    .pane-count {
        font-size: 10px;
    }
}
</style>
