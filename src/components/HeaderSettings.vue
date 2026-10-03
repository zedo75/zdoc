<template>
    <div class="border rounded-md p-4 shadow">
        <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center col-span-2">
                <label class="text-sm font-medium text-gray-700 whitespace-nowrap">
                    页眉内容：
                </label>

                <el-input
                    v-model="header.content"
                    placeholder="请输入页眉内容"
                    size="small"
                    clearable
                >
                    <template #append>
                        <el-dropdown trigger="click" @command="onPickPreset" size="small">
                            <span class="cursor-pointer"> 预设 </span>
                            <template #dropdown>
                                <el-dropdown-menu>
                                    <el-dropdown-item
                                        v-for="p in CLASSIFICATION_PRESETS"
                                        :key="p"
                                        :command="p"
                                    >
                                        {{ p }}
                                    </el-dropdown-item>
                                </el-dropdown-menu>
                            </template>
                        </el-dropdown>
                    </template>
                </el-input>
            </div>

            <div class="flex items-center">
                <label class="text-sm font-medium text-gray-700">字体：</label>
                <el-select v-model="header.font" size="small" filterable class="flex-1">
                    <el-option
                        v-for="opt in chineseFontOptions"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                    />
                </el-select>
            </div>

            <FontSizeInput v-model="header.fontSize" />

            <div class="flex items-center w-full">
                <label class="text-sm font-medium text-gray-700">位置：</label>
                <el-select v-model="header.position" size="small" filterable class="flex-1">
                    <el-option
                        v-for="opt in HEADER_POSITIONS"
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
import { useGovDocConfig } from "@/stores/govDocConfig";

type HeaderPosition = HeaderConfig["position"];

const HEADER_POSITIONS: { label: string; value: HeaderPosition }[] = [
    { label: "左侧", value: "left" },
    { label: "居中", value: "center" },
    { label: "右侧", value: "right" },
];

const { header } = useGovDocConfig();
const { chineseFontOptions } = useFonts();

const CLASSIFICATION_PRESETS = ["内部★注意保管", "秘密★1年", "机密★5年", "绝密★长期"];

function onPickPreset(value: string) {
    header.value.content = value;
}
</script>
