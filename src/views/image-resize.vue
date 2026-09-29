<template>
    <div class="p-5 font-sans bg-white min-h-screen">
        <h3 class="text-xl font-semibold text-gray-800 mb-5">批量修改图片尺寸</h3>

        <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">高度 (cm)</label>
            <el-input-number
                v-model="height"
                :step="1"
                controls-position="right"
                placeholder="自动"
                :min="0"
                class="w-full"
                style="width: 100%"
                v-wheel-change
            />
        </div>

        <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">宽度 (cm)</label>
            <el-input-number
                v-model="width"
                :step="1"
                controls-position="right"
                placeholder="自动"
                :min="0"
                class="w-full"
                style="width: 100%"
                v-wheel-change
            />
        </div>

        <p class="text-xs text-gray-500 mb-1">
            输入 0 或留空表示自动按比例 <br />
            宽、高均为 0 时表示重置原始大小
        </p>

        <el-button type="primary" size="large" class="w-full my-3 shadow-lg" @click="handleResize">
            开始修改
        </el-button>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from "element-plus";

import { batchResizeImages } from "@/jsa/commands/image";

const height = ref(0);
const width = ref(0);

function handleResize() {
    const result = batchResizeImages(height.value, width.value);
    ElMessage.primary(result.message);
}
</script>

<style></style>
