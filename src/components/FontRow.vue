<template>
    <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500 w-16">{{ label }}</span>
        <FontPicker v-model="font" :lang="lang" :source="source" class="flex-1 min-w-0" />
        <el-checkbox v-model="bold">加粗</el-checkbox>
    </div>
</template>

<script setup lang="ts">
import type { SimpleFontConfig } from "@/jsa/types/index.js";

import FontPicker from "@/components/FontPicker.vue";

const model = defineModel<SimpleFontConfig>({ required: true });

const props = withDefaults(
    defineProps<{
        label: string;
        lang?: "zh" | "en";
        /** 仅 lang="en" 时使用，传入中文 getter */
        source?: () => string;
    }>(),
    { lang: "zh" },
);

const font = computed({
    get: () => model.value.font,
    set: (v) => (model.value = { ...model.value, font: v }),
});

const bold = computed({
    get: () => model.value.bold,
    set: (v) => (model.value = { ...model.value, bold: v }),
});
</script>
