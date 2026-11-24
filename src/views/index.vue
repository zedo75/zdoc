<template>
    <div class="max-w-[600px] mx-auto p-5">
        <h2 class="text-xl font-bold mb-4">全部页面</h2>
        <el-menu class="border-none">
            <el-menu-item
                v-for="item in pages"
                :key="item.name"
                :index="item.featureId"
                @click="openPane(item.name)"
            >
                <span>{{ item.title }}</span>
                <span class="ml-2 text-xs text-gray-400">{{ item.featureName }}</span>
            </el-menu-item>
        </el-menu>
    </div>
</template>

<script setup lang="ts">
import { listPanes } from "#kernel/registry";

/** 导航项来自插件声明：插件新增任务窗格后，这里自动出现，不需要改页面 */
const pages = listPanes();

function openPane(pane: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("pane", pane);
    window.location.href = url.toString();
}
</script>

<style></style>
