<template>
    <div class="flex flex-col h-screen bg-gray-50">
        <el-scrollbar class="flex-1 min-h-0">
            <div class="p-5">
                <div class="mb-6 text-center">
                    <h1 class="text-xl font-semibold text-gray-800">公文设置</h1>
                </div>

                <el-collapse v-model="activeNames" class="collapse-panel">
                    <el-collapse-item name="page">
                        <template #title>
                            <span>📐 页面设置</span>
                        </template>
                        <PageSettings v-model="pageLayout" ref="pageRef" />
                    </el-collapse-item>
                    <el-collapse-item name="typography">
                        <template #title>
                            <span>📝 字体设置</span>
                        </template>
                        <TypographySettings v-model="typography" ref="typographyRef" />
                    </el-collapse-item>
                </el-collapse>
            </div>
        </el-scrollbar>

        <div class="flex flex-wrap gap-2 p-5 border-t border-gray-200 bg-white">
            <el-button size="small" class="flex-1" @click="importConfig">载入配置</el-button>
            <el-button size="small" class="flex-1" @click="saveConfig">保存配置</el-button>
            <el-button size="small" type="primary" class="flex-1" @click="applyAll">
                应用所有设置
            </el-button>
            <el-button size="small" class="flex-1" @click="resetAll">恢复默认</el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ElMessage, ElNotification } from "element-plus";

import PageSettings from "@/components/PageSettings.vue";
import TypographySettings from "@/components/TypographySettings.vue";
import { getDefaultConfigFull } from "@/config/defaults";
import { useGovDocConfig } from "@/stores/govDocConfig";

const typographyRef = ref<InstanceType<typeof TypographySettings> | null>(null);
const pageRef = ref<InstanceType<typeof PageSettings> | null>(null);

const config = useGovDocConfig();
const { pageLayout, typography, header, footer } = config;

const activeNames = ref(["typography", "page"]);

function saveConfig() {
    const result = config.saveToFile();
    if (result.success) {
        ElNotification.success({
            title: "保存成功",
            message: "文件路径：" + result.path,
            duration: 3000,
        });
    } else {
        ElMessage.error("保存失败，路径：" + result.path);
    }
}

function importConfig() {
    config.loadFromFile();
    ElMessage.success("已从配置文件重新载入");
}

async function applyAll() {
    pageRef.value?.applyMargins();
    typographyRef.value?.applyStyle();
    ElMessage.primary("所有设置已应用");
}

function resetAll() {
    const def = getDefaultConfigFull();
    pageLayout.value = def.pageLayout;
    typography.value = def.typography;
    header.value = def.header;
    footer.value = def.footer;
    ElMessage.primary("已恢复默认设置");
}
</script>

<style scoped></style>
