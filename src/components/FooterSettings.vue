<template>
    <div class="border rounded-md p-4 shadow">
        <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center">
                <label class="text-sm font-medium text-gray-700">字体：</label>
                <el-select v-model="footer.font" size="small" class="flex-1">
                    <el-option
                        v-for="opt in chineseFontOptions"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                    />
                </el-select>
            </div>

            <FontSizeInput v-model="footer.fontSize" :step="0.5" />

            <div class="flex flex-col col-span-2">
                <label class="text-sm font-medium text-gray-700 mb-2">位置：</label>
                <div class="grid grid-cols-5 gap-2 justify-items-center">
                    <div
                        v-for="opt in PAGENUM_POSITIONS"
                        :key="opt.value"
                        class="flex flex-col items-center justify-center cursor-pointer border rounded-lg p-3 w-full min-w-0 transition-colors hover:border-blue-400"
                        :class="
                            footer.position === opt.value
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-300 bg-white'
                        "
                        @click="footer.position = opt.value"
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
import type { FooterConfig } from "@/jsa/types";

import { useFonts } from "@/composables/useFonts";
import { useGovDocConfig } from "@/stores/govDocConfig";

type PagenumPosition = FooterConfig["position"];

interface PositionOption {
    label: string;
    value: PagenumPosition;
    icon: string;
}

/**
 * 位置选项（图标放在 public/images/ 目录下）
 * 注意路径不能直接以 "/" 开头，否则 "file://"　协议会将其解析为盘符根目录
 * 但在 img 标签中的 src 需要： <img src="/images/header.svg"/>
 */
const PAGENUM_POSITIONS: PositionOption[] = [
    { label: "内侧", value: "inside", icon: "./images/Pagenum_BottomInside.svg" },
    { label: "外侧", value: "outside", icon: "./images/Pagenum_BottomOutside.svg" },
    { label: "左侧", value: "left", icon: "./images/Pagenum_BottomLeft.svg" },
    { label: "居中", value: "middle", icon: "./images/Pagenum_BottomMid.svg" },
    { label: "右侧", value: "right", icon: "./images/Pagenum_BottomRight.svg" },
];

const { footer } = useGovDocConfig();
const { chineseFontOptions } = useFonts();
</script>
