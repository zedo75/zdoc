<template>
    <div class="border rounded-md p-4 shadow">
        <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center col-span-2">
                <label class="text-sm font-medium text-gray-700 whitespace-nowrap">
                    页眉内容：
                </label>
                <el-input
                    v-model="localConfig.content"
                    placeholder="请输入页眉内容"
                    size="small"
                    class="flex-1"
                    style="width: 100%"
                    clearable
                />
            </div>

            <div class="flex items-center">
                <label class="text-sm font-medium text-gray-700">字体：</label>
                <el-select
                    v-model="localConfig.font"
                    size="small"
                    class="flex-1"
                    style="width: 100%"
                    placeholder="选择字体"
                >
                    <el-option
                        v-for="opt in chineseFontOptions"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                    />
                </el-select>
            </div>

            <div class="flex items-center">
                <label class="text-sm font-medium text-gray-700">
                    字号：
                    <span class="text-gray-400 text-xs ml-1">
                        {{ getChineseFontSizeName(localConfig.fontSize) }}
                    </span>
                </label>
                <el-input-number
                    v-model="localConfig.fontSize"
                    :min="0"
                    :step="1"
                    size="small"
                    controls-position="right"
                    class="flex-1"
                    style="width: 100%"
                    v-wheel-change
                />
            </div>

            <div class="flex items-center w-full">
                <label class="text-sm font-medium text-gray-700">位置：</label>
                <el-select
                    v-model="localConfig.position"
                    size="small"
                    filterable
                    class="flex-1"
                    style="width: 100%"
                >
                    <el-option
                        v-for="opt in positionOptions"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                    />
                </el-select>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { HeaderConfig } from "@/jsa/types";

import { useFonts } from "@/composables/useFonts";
import { DEFAULT_HEADER_CONFIG } from "@/config/defaults";
import { getChineseFontSizeName } from "@/utils/fonts";

const positionOptions = [
    { label: "左侧", value: "left" },
    { label: "居中", value: "center" },
    { label: "右侧", value: "right" },
];

const props = defineProps<{
    modelValue: HeaderConfig;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: HeaderConfig];
}>();

// 必须创建配置副本
const localConfig = reactive<HeaderConfig>({ ...DEFAULT_HEADER_CONFIG });

watch(
    () => props.modelValue,
    (newVal) => {
        if (newVal) Object.assign(localConfig, newVal);
    },
    { deep: true, immediate: true },
);

watch(
    [
        () => localConfig.content,
        () => localConfig.font,
        () => localConfig.fontSize,
        () => localConfig.position,
    ],
    () => {
        emit("update:modelValue", { ...localConfig });
    },
    { immediate: true },
);

const { chineseFontOptions } = useFonts();
</script>

<style scoped></style>
