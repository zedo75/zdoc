<template>
    <div class="max-w-[600px] mx-auto p-5">
        <h2 class="text-xl font-bold mb-4">全部页面</h2>
        <el-menu router class="border-none">
            <el-menu-item v-for="route in visibleRoutes" :key="route.path" :index="route.path">
                {{ String(route.name) || route.path }}
            </el-menu-item>
        </el-menu>
    </div>
</template>

<script setup lang="ts">
const router = useRouter();

const visibleRoutes = computed(() => {
    return router.getRoutes().filter((route) => {
        if (route.redirect) return false;
        if (route.path.includes("*")) return false;
        if (route.path.includes(":")) return false;
        if (route.meta?.hidden) return false;
        return true;
    });
});
</script>

<style></style>
