<template>
    <div class="max-w-[600px] mx-auto p-5">
        <h2 class="text-xl font-bold mb-4">全部页面</h2>
        <el-menu class="border-none">
            <el-menu-item
                v-for="item in menuItems"
                :index="item.title"
                :key="item.pane"
                @click="openPane(item.pane)"
            >
                {{ item.title }}
            </el-menu-item>
        </el-menu>
    </div>
</template>

<script setup lang="ts">
const menuItems = [
    { title: "公文设置", pane: "settings" },
    { title: "页眉页脚", pane: "header-footer" },
    { title: "图片调整", pane: "image-resize" },
    { title: "文本对比", pane: "text-compare" },
];

function openPane(pane: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("pane", pane);
    window.location.href = url.toString();
}
</script>

<style></style>
