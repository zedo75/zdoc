<template>
    <div class="space-y-4">
        <div class="border rounded-md p-4 shadow">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-medium text-sm">📝 标题</h4>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">中文字体</label>
                    <el-select
                        v-model="localConfig.title.zh"
                        size="small"
                        filterable
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
                <div>
                    <label class="block text-xs text-gray-500 mb-1">西文字体</label>
                    <el-select
                        v-model="localConfig.title.en"
                        size="small"
                        filterable
                        style="width: 100%"
                    >
                        <el-option
                            v-for="opt in titleWesternOptions"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">
                        字号(pt)
                        <span class="text-gray-400 ml-1">
                            {{ getChineseFontSizeName(localConfig.title.size) }}
                        </span>
                    </label>
                    <el-input-number
                        v-model="localConfig.title.size"
                        :min="0"
                        :step="1"
                        size="small"
                        controls-position="right"
                        class="w-full"
                        style="width: 100%"
                        v-wheel-change
                    />
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">行距(固定值)</label>
                    <el-input-number
                        v-model="localConfig.title.spacing"
                        :min="0"
                        :step="0.05"
                        size="small"
                        controls-position="right"
                        :precision="2"
                        class="w-full"
                        style="width: 100%"
                    />
                </div>
            </div>
        </div>

        <div class="border rounded-md p-4 shadow">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-medium text-sm">📄 正文</h4>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">中文字体</label>
                    <el-select v-model="localConfig.main.zh" size="small" style="width: 100%">
                        <el-option
                            v-for="opt in chineseFontOptions"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">西文字体</label>
                    <el-select v-model="localConfig.main.en" size="small" style="width: 100%">
                        <el-option
                            v-for="opt in mainWesternOptions"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">首行缩进(字符)</label>
                    <el-input-number
                        v-model="localConfig.main.indent"
                        :min="0"
                        :step="0.5"
                        size="small"
                        controls-position="right"
                        :precision="1"
                        class="w-full"
                        style="width: 100%"
                        v-wheel-change
                    />
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">
                        字号(pt)
                        <span class="text-gray-400 ml-1">
                            {{ getChineseFontSizeName(localConfig.main.size) }}
                        </span>
                    </label>
                    <el-input-number
                        v-model="localConfig.main.size"
                        :min="0"
                        :step="1"
                        size="small"
                        controls-position="right"
                        class="w-full"
                        style="width: 100%"
                        v-wheel-change
                    />
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">行距(固定值)</label>
                    <el-input-number
                        v-model="localConfig.main.spacing"
                        :min="0"
                        :step="0.05"
                        size="small"
                        controls-position="right"
                        :precision="2"
                        class="w-full"
                        style="width: 100%"
                    />
                </div>
            </div>
        </div>

        <div class="border rounded-md p-4 shadow">
            <h4 class="font-medium text-sm mb-3">🔤 其他</h4>
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 w-16">主送机关</span>
                    <el-select
                        v-model="localConfig.salutation.font"
                        size="small"
                        class="flex-1 min-w-0"
                        style="width: 100%"
                    >
                        <el-option
                            v-for="opt in chineseFontOptions"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                    <el-checkbox v-model="localConfig.salutation.bold">加粗</el-checkbox>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 w-16">一级标题</span>
                    <el-select
                        v-model="localConfig.h1.font"
                        size="small"
                        class="flex-1 min-w-0"
                        style="width: 100%"
                    >
                        <el-option
                            v-for="opt in chineseFontOptions"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                    <el-checkbox v-model="localConfig.h1.bold">加粗</el-checkbox>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 w-16">二级标题</span>
                    <el-select
                        v-model="localConfig.h2.font"
                        size="small"
                        class="flex-1 min-w-0"
                        style="width: 100%"
                    >
                        <el-option
                            v-for="opt in chineseFontOptions"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                    <el-checkbox v-model="localConfig.h2.bold">加粗</el-checkbox>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 w-16">三级标题</span>
                    <el-select
                        v-model="localConfig.h3.font"
                        size="small"
                        class="flex-1 min-w-0"
                        style="width: 100%"
                    >
                        <el-option
                            v-for="opt in chineseFontOptions"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                    <el-checkbox v-model="localConfig.h3.bold">加粗</el-checkbox>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 w-16">小标题加粗</span>
                    <el-select
                        v-model="localConfig.topicBoldMode"
                        size="small"
                        class="flex-1 min-w-0"
                        style="width: 100%"
                    >
                        <el-option
                            v-for="opt in topicBoldModeOptions"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                    <div class="w-8"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { TypographyConfig } from "@/jsa/types";

import { useFonts } from "@/composables/useFonts";
import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";
import { setupBodyStyle, setupTitleStyle } from "@/jsa/commands/govDoc";
import { withUndoRecord } from "@/jsa/utils/document";
import { getChineseFontSizeName } from "@/utils/fonts";

const props = defineProps<{
    modelValue: TypographyConfig;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: TypographyConfig];
}>();

const topicBoldModeOptions = [
    { label: "自动（短句整句加粗，长句仅前缀）", value: "auto" },
    { label: "仅前缀（如“一是”、“二是”）", value: "prefix" },
    { label: "不加粗", value: "none" },
];

const localConfig = reactive<TypographyConfig>({ ...props.modelValue });

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

const { chineseFontOptions, westernFontOptions: rawWesternOptions } = useFonts({
    loadWestern: true,
});

const titleWesternOptions = computed(() => [
    { label: "随中文：" + localConfig.title.zh, value: localConfig.title.zh },
    ...rawWesternOptions.value,
]);

const mainWesternOptions = computed(() => [
    { label: "随中文：" + localConfig.main.zh, value: localConfig.main.zh },
    ...rawWesternOptions.value,
]);

watch(
    () => localConfig.title.zh,
    (newZh, oldZh) => {
        if (localConfig.title.en === oldZh) localConfig.title.en = newZh;
    },
);

watch(
    () => localConfig.main.zh,
    (newZh, oldZh) => {
        if (localConfig.main.en === oldZh) localConfig.main.en = newZh;
    },
);

const applyStyle = () => {
    withUndoRecord("应用样式", () => {
        setupBodyStyle(localConfig);
        setupTitleStyle(localConfig);
    });
};

const resetToDefault = () => {
    const def = { ...DEFAULT_TYPO_CONFIG };
    Object.assign(localConfig, def);
};

defineExpose({
    applyStyle,
    resetToDefault,
});
</script>

<style scoped>
/* 缩小 Select 下拉菜单的字体和间距（Element Plus 版） */
:deep(.el-select-dropdown__item) {
    font-size: 12px;
    height: 28px;
    line-height: 28px;
}
</style>
