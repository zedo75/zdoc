<template>
    <div class="border rounded-md p-4 shadow grid grid-cols-2 gap-4">
        <div
            v-for="field in PAGE_FIELDS"
            :key="field.key"
            class="flex items-center justify-between gap-2"
        >
            <label class="text-sm font-medium text-gray-700">{{ field.label }}：</label>
            <div class="flex flex-1 items-center gap-1">
                <el-input-number
                    v-model="pageLayout[field.key]"
                    :min="0"
                    :step="0.1"
                    size="small"
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

import { useGovDocConfig } from "@/stores/govDocConfig";

const { pageLayout } = useGovDocConfig();

interface PageField {
    key: keyof PageLayoutConfig;
    label: string;
}

const PAGE_FIELDS: PageField[] = [
    { key: "top", label: "上边距" },
    { key: "bottom", label: "下边距" },
    { key: "left", label: "左边距" },
    { key: "right", label: "右边距" },
    { key: "header", label: "页　眉" },
    { key: "footer", label: "页　脚" },
];
</script>
