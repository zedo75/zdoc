<template>
    <section class="stats-grid" :class="{ 'is-empty': !hasText }">
        <article class="stat-card">
            <div class="stat-value value-insert">{{ display(stats.insertedChars) }}</div>
            <div class="stat-label">新增字符</div>
        </article>

        <article class="stat-card">
            <div class="stat-value value-delete">{{ display(stats.deletedChars) }}</div>
            <div class="stat-label">删除字符</div>
        </article>

        <article class="stat-card">
            <div class="stat-value value-replace">{{ display(stats.replaceCount) }}</div>
            <div class="stat-label">修改处数</div>
        </article>

        <article class="stat-card">
            <div class="gauge">
                <svg class="gauge-ring" viewBox="0 0 44 44" aria-hidden="true">
                    <circle class="gauge-track" cx="22" cy="22" r="18" />
                    <circle
                        v-if="hasText"
                        class="gauge-value"
                        cx="22"
                        cy="22"
                        r="18"
                        pathLength="100"
                        :stroke="gaugeColor"
                        :stroke-dasharray="`${stats.similarity} 100`"
                    />
                </svg>
                <span class="gauge-text">{{ hasText ? similarityText : "—" }}</span>
            </div>
            <div class="stat-label">文档相似度</div>
        </article>

        <article class="stat-card">
            <div class="stat-value value-rating" :class="ratingClass">
                {{ hasText ? stats.rating : "等待比对" }}
            </div>
            <div class="stat-label">相似度评价</div>
        </article>
    </section>
</template>

<script setup lang="ts">
import type { CompareStats } from "@/features/text-compare/core/textCompare";

import { computed } from "vue";

const props = defineProps<{
    stats: CompareStats;
    hasText: boolean;
}>();

const similarityText = computed(() => `${props.stats.similarity.toFixed(2)}%`);

const gaugeColor = computed(() => {
    const value = props.stats.similarity;
    if (value >= 90) return "#22c55e";
    if (value >= 70) return "#84cc16";
    if (value >= 50) return "#f59e0b";
    return "#ef4444";
});

const ratingClass = computed(() => {
    if (!props.hasText) return "rating-muted";
    if (props.stats.identical) return "rating-green";
    if (props.stats.similarity >= 90) return "rating-green";
    if (props.stats.similarity >= 70) return "rating-lime";
    if (props.stats.similarity >= 50) return "rating-amber";
    return "rating-red";
});

/** 空文本时用占位符，避免出现“0 字符”的误导 */
function display(value: number): string | number {
    return props.hasText ? value : "—";
}
</script>

<style scoped>
.stats-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
    padding: 12px 14px 0;
    flex-shrink: 0;
}

.stat-card {
    height: 88px;
    background: #fff;
    border: 1px solid #e8ecf4;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    transition:
        border-color 0.2s,
        box-shadow 0.2s;
}

.stat-card:hover {
    border-color: #dbe3ef;
    box-shadow: 0 8px 18px -14px rgb(15 23 42 / 40%);
}

.stat-value {
    font-size: 27px;
    line-height: 1.1;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: #0f172a;
    max-width: 100%;
    padding: 0 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.value-insert {
    color: #16a34a;
}

.value-delete {
    color: #dc2626;
}

.value-replace {
    color: #d97706;
}

.value-rating {
    font-size: 21px;
    letter-spacing: 0;
}

.rating-green {
    color: #16a34a;
}

.rating-lime {
    color: #65a30d;
}

.rating-amber {
    color: #d97706;
}

.rating-red {
    color: #dc2626;
}

.rating-muted {
    color: #94a3b8;
    font-size: 17px;
    font-weight: 600;
}

.stat-label {
    font-size: 12px;
    color: #64748b;
    line-height: 1;
    white-space: nowrap;
}

.gauge {
    position: relative;
    width: 54px;
    height: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.gauge-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
}

.gauge-track,
.gauge-value {
    fill: none;
    stroke-width: 4.5;
}

.gauge-track {
    stroke: #edf1f7;
}

.gauge-value {
    stroke-linecap: round;
    transition: stroke-dasharray 0.45s ease;
}

.gauge-text {
    position: relative;
    font-size: 11px;
    font-weight: 700;
    color: #334155;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
}

.stats-grid.is-empty .stat-value {
    color: #cbd5e1;
}

@media (max-width: 720px) {
    .stats-grid {
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
        padding: 10px 12px 0;
    }

    .stat-card {
        grid-column: span 2;
        height: 70px;
        gap: 4px;
    }

    .stat-card:nth-child(4),
    .stat-card:nth-child(5) {
        grid-column: span 3;
    }

    .stat-value {
        font-size: 22px;
    }

    .value-rating {
        font-size: 17px;
    }

    .gauge {
        width: 46px;
        height: 46px;
    }

    .gauge-text {
        font-size: 10px;
    }
}
</style>
