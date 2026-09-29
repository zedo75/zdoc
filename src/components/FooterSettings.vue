<template>
    <div class="border rounded-md p-4 shadow">
        <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center">
                <label class="text-sm font-medium text-gray-700">字体：</label>
                <el-select
                    v-model="localConfig.font"
                    size="small"
                    class="flex-1"
                    style="width: 100%"
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
                    :step="0.5"
                    size="small"
                    controls-position="right"
                    class="flex-1"
                    style="width: 100%"
                    v-wheel-change
                />
            </div>

            <div class="flex flex-col col-span-2">
                <label class="text-sm font-medium text-gray-700 mb-2">位置：</label>
                <div class="grid grid-cols-5 gap-2 justify-items-center">
                    <div
                        v-for="opt in positionOptions"
                        :key="opt.value"
                        class="flex flex-col items-center justify-center cursor-pointer border rounded-lg p-3 w-full min-w-0 transition-colors hover:border-blue-400"
                        :class="[
                            localConfig.position === opt.value
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-300 bg-white',
                        ]"
                        @click="localConfig.position = opt.value"
                    >
                        <img
                            :src="opt.icon"
                            class="h-10 max-w-full object-contain"
                            :alt="opt.label"
                        />
                        <span class="text-sm text-gray-700 truncate max-w-full">
                            {{ opt.label }}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { FooterConfig, PagenumPosition } from "@/jsa/types";

import { useFonts } from "@/composables/useFonts";
import { DEFAULT_FOOTER_CONFIG } from "@/config/defaults";
import { getChineseFontSizeName } from "@/utils/fonts";

// 位置选项（图标放在 public/images/ 目录下）
// 注意路径不能直接以 "/" 开头，否则 "file://"　协议会将其解析为盘符根目录
// 但在 img 标签中直接写的 src 反而不需要： <img src="/images/header.svg"/>
const positionOptions = <{ label: string; value: PagenumPosition; icon: string }[]>[
    { label: "内侧", value: "inside", icon: "./images/Pagenum_BottomInside.svg" },
    { label: "外侧", value: "outside", icon: "./images/Pagenum_BottomOutside.svg" },
    { label: "左侧", value: "left", icon: "./images/Pagenum_BottomLeft.svg" },
    { label: "居中", value: "middle", icon: "./images/Pagenum_BottomMid.svg" },
    { label: "右侧", value: "right", icon: "./images/Pagenum_BottomRight.svg" },
];

const props = defineProps<{
    modelValue: FooterConfig;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: FooterConfig];
}>();

const localConfig = reactive<FooterConfig>({ ...DEFAULT_FOOTER_CONFIG });

watch(
    () => props.modelValue,
    (newVal) => {
        if (newVal) Object.assign(localConfig, newVal);
    },
    { deep: true, immediate: true },
);

watch(
    localConfig,
    (newVals, oldVals) => {
        console.log("watch triggered", newVals, oldVals);
        emit("update:modelValue", { ...localConfig });
    },
    { immediate: true },
);

const { chineseFontOptions } = useFonts();
</script>

<style lang="css"></style>
