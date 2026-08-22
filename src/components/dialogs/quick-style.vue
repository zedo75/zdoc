<template>
    <div
        class="w-screen h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 p-4 flex flex-col overflow-auto"
        @click="refreshDocumentView"
    >
        <div class="flex items-center gap-2.5 pb-3 border-b flex-shrink-0">
            <span class="w-1 h-5 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full">
            </span>
            <span class="text-base font-semibold text-gray-700 tracking-wide">排版快捷设置</span>
            <span class="text-xs text-gray-400 ml-auto flex items-center gap-1">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse">
                </span>
                选中文本后单击应用样式
            </span>
        </div>

        <!-- 内容区域：垂直居中，均匀分布 -->
        <div class="flex-1 flex flex-col justify-center gap-2 max-w-2xl mx-auto w-full">
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2 w-12 flex-shrink-0">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    <span class="text-sm font-medium text-gray-500">字号</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button
                        v-for="item in quickFontSizes"
                        :key="item.value"
                        class="btn btn-blue"
                        @click="setFontSize(item.value)"
                        :title="item.title"
                    >
                        {{ item.label }}
                    </button>
                </div>
            </div>

            <!-- 中文字体 -->
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2 w-12 flex-shrink-0">
                    <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                    <span class="text-sm font-medium text-gray-500">中文</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button
                        class="btn btn-purple"
                        @click="setFontFZ"
                        title="对应排版设置中「标题」的中文字体"
                    >
                        小标宋
                    </button>
                    <button
                        class="btn btn-purple"
                        @click="setFontHei"
                        title="对应排版设置中「一级标题」的字体"
                    >
                        黑体
                    </button>
                    <button
                        class="btn btn-purple"
                        @click="setFontKai"
                        title="对应排版设置中「二级标题」的字体"
                    >
                        楷体
                    </button>
                    <button
                        class="btn btn-purple"
                        @click="setFontFS"
                        title="对应排版设置中「正文」的中文字体"
                    >
                        仿宋
                    </button>
                </div>
            </div>

            <!-- 西文字体 -->
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2 w-12 flex-shrink-0">
                    <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    <span class="text-sm font-medium text-gray-500">西文</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button
                        class="btn btn-cyan"
                        @click="setFontRoman"
                        title="设为「Times New Roman」或「Nimbus Roman」字体"
                    >
                        Roman 字体
                    </button>
                    <button class="btn btn-cyan" @click="setFontAsciiToEast" title="使用中文字体">
                        使用中文字体
                    </button>
                </div>
            </div>

            <!-- 行距 -->
            <div class="flex items-center gap-4 pt-2 border-t border-indigo-100/40">
                <div class="flex items-center gap-2 w-12 flex-shrink-0">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span class="text-sm font-medium text-gray-500">行距</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button
                        class="btn btn-amber"
                        @click="setLineExactly"
                        title="对应排版设置中「正文」的行距"
                    >
                        固定行距
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { refreshDocumentView } from "@/jsa/utils/document";
import {
    setFontAsciiToEast,
    setFontFS,
    setFontFZ,
    setFontHei,
    setFontKai,
    setFontRoman,
    setFontSize,
    setLineExactly,
} from "@/jsa/utils/styles";
import {
    FONT_SIZE_FOUR,
    FONT_SIZE_THREE,
    FONT_SIZE_TWO,
    getChineseFontSizeName,
} from "@/utils/fonts";

const quickFontSizes = ref(
    [FONT_SIZE_TWO, FONT_SIZE_THREE, FONT_SIZE_FOUR].map((pt) => ({
        value: pt,
        label: getChineseFontSizeName(pt),
        title: `设置为${getChineseFontSizeName(pt)}字（${pt}pt）`,
    })),
);
</script>

<style scoped>
/* ---------- 公共按钮基础样式 ---------- */
.btn {
    @apply px-4 py-1 text-sm font-medium rounded-lg border transition-colors duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2
    active:shadow-inner;
}

/* ---------- 蓝色 — 字号 ---------- */
.btn-blue {
    @apply border-blue-200/70 text-blue-700 bg-white/60 
    hover:bg-blue-100/70 hover:border-blue-300 hover:text-blue-800 
           focus:ring-blue-200/60 active:bg-blue-200/70;
}

/* ---------- 紫色 — 中文字体 ---------- */
.btn-purple {
    @apply border-purple-200/70 text-purple-700 bg-white/60 
    hover:bg-purple-100/70 hover:border-purple-300 hover:text-purple-800 
           focus:ring-purple-200/60 active:bg-purple-200/70;
}

/* ---------- 青色 — 西文字体 ---------- */
.btn-cyan {
    @apply border-cyan-200/70 text-cyan-700 bg-white/60 
    hover:bg-cyan-100/70 hover:border-cyan-300 hover:text-cyan-800
           focus:ring-cyan-200/60 active:bg-cyan-200/70;
}

/* ---------- 琥珀色 — 行距 ---------- */
.btn-amber {
    @apply border-amber-200/70 text-amber-700 bg-white/60 
    hover:bg-amber-100/70 hover:border-amber-300 hover:text-amber-800 
           focus:ring-amber-200/60 active:bg-amber-200/70;
}

/* ---------- 响应式微调 ---------- */
@media (max-width: 540px) {
    .btn {
        @apply px-3 py-1.5 text-xs;
    }
}
</style>
