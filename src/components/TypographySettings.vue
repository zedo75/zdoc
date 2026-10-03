<template>
    <div class="space-y-4">
        <div class="border rounded-md p-4 shadow">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-medium text-sm">📝 标题</h4>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">中文字体</label>
                    <FontPicker v-model="typography.title.zh" />
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">西文字体</label>
                    <FontPicker
                        lang="en"
                        v-model="typography.title.en"
                        :source="() => typography.title.zh"
                    />
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1"> 字号(pt) </label>
                    <FontSizeInput v-model="typography.title.size" label="" />
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">行距(固定值)</label>
                    <el-input-number
                        v-model="typography.title.spacing"
                        :min="0"
                        :step="0.05"
                        :precision="2"
                        size="small"
                        controls-position="right"
                        style="width: 100%"
                    />
                </div>
            </div>
        </div>

        <!-- 正文 -->
        <div class="border rounded-md p-4 shadow">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-medium text-sm">📄 正文</h4>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">中文字体</label>
                    <FontPicker v-model="typography.main.zh" />
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">西文字体</label>
                    <FontPicker
                        lang="en"
                        v-model="typography.main.en"
                        :source="() => typography.main.zh"
                    />
                </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">首行缩进(字符)</label>
                    <el-input-number
                        v-model="typography.main.indent"
                        :min="0"
                        :step="0.5"
                        :precision="1"
                        size="small"
                        controls-position="right"
                        v-wheel-change
                    />
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1"> 字号(pt) </label>
                    <FontSizeInput v-model="typography.main.size" label="" />
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">行距(固定值)</label>
                    <el-input-number
                        v-model="typography.main.spacing"
                        :min="0"
                        :step="0.05"
                        :precision="2"
                        size="small"
                        controls-position="right"
                        style="width: 100%"
                    />
                </div>
            </div>
        </div>

        <!-- 其他 -->
        <div class="border rounded-md p-4 shadow">
            <h4 class="font-medium text-sm mb-3">🔤 其他</h4>
            <div class="flex flex-col gap-2">
                <FontRow v-model="typography.salutation" label="主送机关" />
                <FontRow v-model="typography.h1" label="一级标题" />
                <FontRow v-model="typography.h2" label="二级标题" />
                <FontRow v-model="typography.h3" label="三级标题" />
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 w-16">小标题加粗</span>
                    <el-select
                        v-model="typography.topicBoldMode"
                        size="small"
                        class="flex-1 min-w-0"
                    >
                        <el-option
                            v-for="opt in TOPIC_BOLD_MODE_OPTIONS"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                    <div class="w-12" />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import FontRow from "@/components/FontRow.vue";
import { TOPIC_BOLD_MODE_OPTIONS } from "@/jsa/types";
import { useGovDocConfig } from "@/stores/govDocConfig";

const { typography } = useGovDocConfig();
</script>

<style scoped>
:deep(.el-select-dropdown__item) {
    font-size: 12px;
    height: 28px;
    line-height: 28px;
}
</style>
