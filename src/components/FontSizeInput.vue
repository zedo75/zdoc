<template>
    <div class="flex items-center gap-2">
        <label v-if="label" class="text-sm font-medium text-gray-700 whitespace-nowrap">
            {{ label }}
        </label>
        <el-input-number
            v-model="model"
            :min="min"
            :step="step"
            :precision="precision"
            size="small"
            controls-position="right"
            class="flex-1"
            style="width: 100%"
            v-wheel-change
        >
            <template #suffix>
                <span class="text-xs text-gray-400 whitespace-nowrap w-8">
                    {{ getChineseFontSizeName(model) }}
                </span>
            </template>
        </el-input-number>
    </div>
</template>

<script setup lang="ts">
import { getChineseFontSizeName } from "@/utils/fonts";

const model = defineModel<number>({ required: true });

withDefaults(
    defineProps<{
        label?: string;
        step?: number;
        min?: number;
        precision?: number;
    }>(),
    {
        label: "字号：",
        step: 1,
        min: 0,
        precision: undefined,
    },
);
</script>
