<template>
    <RouterView />
</template>

<script setup lang="ts">
import { useGovDocConfig } from "@/stores/govDocConfig";

const store = useGovDocConfig();

// 挂载后从本地文件加载配置
onMounted(() => {
    store.loadFromFile();
});
</script>

<style></style>
