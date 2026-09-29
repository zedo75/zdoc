<template>
    <div class="border rounded-md p-4 shadow grid grid-cols-2 gap-4">
        <div class="flex items-center justify-between gap-2">
            <label class="text-sm font-medium text-gray-700">上边距：</label>
            <div class="flex flex-1 items-center gap-1">
                <el-input-number
                    v-model="localConfig.top"
                    :min="0"
                    :step="0.1"
                    size="default"
                    controls-position="right"
                    class="flex-1"
                    style="width: 100%"
                    v-wheel-change
                />
                <span class="text-sm text-gray-400">cm</span>
            </div>
        </div>
        <div class="flex items-center justify-between gap-2">
            <label class="text-sm font-medium text-gray-700">下边距：</label>
            <div class="flex flex-1 items-center gap-1">
                <el-input-number
                    v-model="localConfig.bottom"
                    :min="0"
                    :step="0.1"
                    size="default"
                    controls-position="right"
                    class="flex-1"
                    style="width: 100%"
                    v-wheel-change
                />
                <span class="text-sm text-gray-400">cm</span>
            </div>
        </div>
        <div class="flex items-center justify-between gap-2">
            <label class="text-sm font-medium text-gray-700">左边距：</label>
            <div class="flex flex-1 items-center gap-1">
                <el-input-number
                    v-model="localConfig.left"
                    :min="0"
                    :step="0.1"
                    size="default"
                    controls-position="right"
                    class="flex-1"
                    style="width: 100%"
                    v-wheel-change
                />
                <span class="text-sm text-gray-400">cm</span>
            </div>
        </div>
        <div class="flex items-center justify-between gap-2">
            <label class="text-sm font-medium text-gray-700">右边距：</label>
            <div class="flex flex-1 items-center gap-1">
                <el-input-number
                    v-model="localConfig.right"
                    :min="0"
                    :step="0.1"
                    size="default"
                    controls-position="right"
                    class="flex-1"
                    style="width: 100%"
                    v-wheel-change
                />
                <span class="text-sm text-gray-400">cm</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { PageLayoutConfig } from "@/jsa/types";

import { DEFAULT_PAGE_LAYOUT_CONFIG } from "@/config/defaults";
import { setPageLayout } from "@/jsa/commands/document";

const props = defineProps<{
    modelValue: PageLayoutConfig;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: PageLayoutConfig];
}>();

const localConfig = reactive<PageLayoutConfig>({
    ...DEFAULT_PAGE_LAYOUT_CONFIG,
    ...props.modelValue,
});

watch(
    () => props.modelValue,
    (newVal) => {
        Object.assign(localConfig, newVal);
    },
    { deep: true },
);

watch(
    localConfig,
    (newVal) => {
        emit("update:modelValue", { ...newVal });
    },
    { deep: true },
);

const resetToDefault = () => {
    Object.assign(localConfig, DEFAULT_PAGE_LAYOUT_CONFIG);
};

const applyMargins = () => {
    try {
        setPageLayout(localConfig);
    } catch (error) {
        console.error("应用边距失败:", error);
    }
};

defineExpose({
    applyMargins,
    resetToDefault,
});
</script>

<style scoped></style>
