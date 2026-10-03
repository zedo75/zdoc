<template>
    <el-select v-model="model" size="small" filterable style="width: 100%">
        <el-option v-for="opt in options" :key="opt.value" :label="opt.label" :value="opt.value" />
    </el-select>
</template>

<script setup lang="ts">
import { useFonts } from "@/composables/useFonts";

const props = withDefaults(
    defineProps<{
        lang?: "zh" | "en";
        /**
         * lang="en" 时传入中文来源：
         *  - 字符串（不推荐，会滞后一个 tick）
         *  - Ref<string>
         *  - getter: () => typography.title.zh
         */
        source?: () => string;
    }>(),
    { lang: "zh" },
);

const model = defineModel<string>({ required: true });

const { chineseFontOptions, westernFontOptions } = useFonts({ loadWestern: true });

const zh = computed(() => (props.source != null ? toValue(props.source) : ""));

const options = computed(() => {
    if (props.lang === "zh") return chineseFontOptions.value;
    if (!props.source) return westernFontOptions.value;
    return [{ label: `随中文：${zh.value}`, value: zh.value }, ...westernFontOptions.value];
});

watch(
    () => zh.value,
    (newZh, oldZh) => {
        if (props.lang !== "en") return;
        if (!oldZh || !newZh) return;
        if (model.value === oldZh) model.value = newZh;
    },
    { flush: "sync" },
);
</script>

<style scoped>
:deep(.el-select-dropdown__item) {
    font-size: 12px;
    height: 28px;
    line-height: 28px;
}
</style>
