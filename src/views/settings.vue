<template>
    <div class="flex flex-col h-screen bg-gray-50">
        <el-scrollbar class="flex-1 min-h-0">
            <div class="p-5">
                <h1 class="mb-6 text-center text-xl font-semibold text-gray-800">公文设置</h1>

                <el-collapse v-model="activeNames" class="collapse-panel">
                    <PageSection />
                    <TypographySection />
                    <HeaderSection />
                    <FooterSection />
                </el-collapse>
            </div>
        </el-scrollbar>

        <div class="flex flex-wrap gap-2 p-5 border-t border-gray-200 bg-white">
            <el-button size="small" class="flex-1" @click="loadConfig">载入配置</el-button>
            <el-button size="small" class="flex-1" @click="saveConfig">保存配置</el-button>
            <el-button size="small" type="primary" class="flex-1" @click="applyAll">
                应用所有设置
            </el-button>
            <el-button size="small" class="flex-1" @click="resetAll">恢复默认</el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from "element-plus";

import FooterSection from "@/components/FooterSection.vue";
import HeaderSection from "@/components/HeaderSection.vue";
import { useConfigFile } from "@/composables/useConfigFile";
import { useFooterActions, useHeaderActions } from "@/composables/useHeaderActions";
import { usePageActions } from "@/composables/usePageActions";
import { useTypographyActions } from "@/composables/useTypographyActions";

const activeNames = ref(["typography", "page", "header", "footer"]);

const { save: saveConfig, load: loadConfig } = useConfigFile();

const page = usePageActions();
const typo = useTypographyActions();
const header = useHeaderActions();
const footer = useFooterActions();

function applyAll() {
    page.apply();
    typo.apply();
    header.apply();
    footer.apply();
    ElMessage.primary("所有设置已应用");
}

function resetAll() {
    page.reset();
    typo.reset();
    header.reset();
    footer.reset();
    ElMessage.primary("已恢复默认设置");
}
</script>
