<template>
    <div
        class="rule-row flex items-center gap-2 px-3 py-1.5 transition-colors"
        :class="{ 'rule-row--swapped': swapped }"
    >
        <el-checkbox
            class="rule-checkbox flex-1 min-w-0"
            :model-value="checked"
            @change="(v) => emit('update:checked', !!v)"
        >
            {{ displayLabel }}
        </el-checkbox>

        <div class="flex items-center gap-1 shrink-0">
            <span
                class="preview-cell inline-flex items-center justify-center min-w-7 px-1.5 py-0.5 rounded whitespace-nowrap font-mono text-[11px] leading-[1.4]"
            >
                {{ sideLeft }}
            </span>

            <button
                v-if="canSwap"
                type="button"
                class="swap-btn w-[22px] h-[22px] p-0 inline-flex items-center justify-center shrink-0 rounded border text-[13px] leading-none transition-colors cursor-pointer"
                :class="{ 'swap-btn--active': swapped }"
                title="交换两侧文本"
                @click="emit('toggle-swap')"
            >
                ⇄
            </button>
            <span
                v-else
                class="w-[22px] h-[22px] inline-flex items-center justify-center shrink-0 text-[13px] text-gray-300 select-none"
                aria-hidden="true"
            >
                →
            </span>

            <span
                class="preview-cell inline-flex items-center justify-center min-w-7 px-1.5 py-0.5 rounded whitespace-nowrap font-mono text-[11px] leading-[1.4]"
            >
                {{ sideRight }}
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { PunctuationRule } from "@/jsa/commands/punctuation";

import { canSwapRule } from "@/jsa/commands/punctuation";

const props = defineProps<{
    rule: PunctuationRule;
    checked: boolean;
    swapped: boolean;
}>();

const emit = defineEmits<{
    "update:checked": [value: boolean];
    "toggle-swap": [];
}>();

const canSwap = computed(() => canSwapRule(props.rule));

/** 按第一个 "→" 拆成 { left, right }，无箭头返回 null */
function splitArrow(text: string | undefined): { left: string; right: string } | null {
    if (!text) return null;
    const idx = text.indexOf("→");
    if (idx < 0) return null;
    return { left: text.slice(0, idx).trim(), right: text.slice(idx + 1).trim() };
}

/** label：有箭头且已交换就翻转 */
const displayLabel = computed(() => {
    const sp = splitArrow(props.rule.label);
    if (!sp) return props.rule.label;
    return props.swapped ? `${sp.right} → ${sp.left}` : props.rule.label;
});

const previewSides = computed(() => {
    const sp = splitArrow(props.rule.description) ?? {
        left: props.rule.findText,
        right: props.rule.replaceText,
    };
    return props.swapped ? { left: sp.right, right: sp.left } : sp;
});

const sideLeft = computed(() => previewSides.value.left);
const sideRight = computed(() => previewSides.value.right);
</script>

<style scoped>
/* ===== 规则行：hover 背景（交换时黄底） ===== */
.rule-row {
    @apply hover:bg-blue-50;
}

.rule-row--swapped {
    @apply bg-yellow-100 hover:bg-yellow-200;
}

/* ===== 勾选框：字号小、勾选后 label 不变蓝（CSS 变量必须留） ===== */
.rule-checkbox {
    --el-checkbox-font-size: 12px;
    --el-checkbox-text-color: #374151;
    --el-checkbox-checked-text-color: #374151;
}

/* ===== 预览格颜色（交换时琥珀色） ===== */
.preview-cell {
    @apply bg-gray-100 text-gray-600;
}

.rule-row--swapped .preview-cell {
    @apply bg-amber-200 text-amber-800;
}

/* ===== 交换按钮：默认 / active 两态 ===== */
.swap-btn {
    @apply bg-transparent text-gray-400 border-transparent hover:bg-gray-100 hover:text-gray-500;
}

.swap-btn--active {
    @apply text-blue-600 bg-blue-100 border-blue-200 hover:bg-blue-200 hover:text-blue-700;
}
</style>
