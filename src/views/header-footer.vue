<template>
    <div class="flex flex-col h-screen bg-gray-50">
        <el-scrollbar class="flex-1 min-h-0">
            <div class="p-4">
                <div class="mb-6 text-center">
                    <h1 class="text-xl font-semibold text-gray-800">页眉页脚设置</h1>
                </div>

                <div class="card-base p-4 flex flex-wrap gap-2 mb-4">
                    <div class="flex items-center justify-between gap-2 flex-1">
                        <label class="text-sm font-medium text-gray-700 whitespace-nowrap">
                            页眉距离
                        </label>
                        <div class="flex flex-1 items-center gap-1">
                            <el-input-number
                                v-model="header.distance"
                                :min="0"
                                :step="0.1"
                                size="default"
                                controls-position="right"
                                class="flex-1"
                                style="width: 100%"
                                v-wheel-change
                            />
                            <span class="text-sm text-gray-400">cm</span>
                        </div>
                    </div>

                    <div class="flex items-center justify-between gap-2 flex-1">
                        <label class="text-sm font-medium text-gray-700 whitespace-nowrap">
                            页脚距离
                        </label>
                        <div class="flex flex-1 items-center gap-1">
                            <el-input-number
                                v-model="footer.distance"
                                :min="0"
                                :step="0.1"
                                size="default"
                                controls-position="right"
                                class="flex-1"
                                style="width: 100%"
                                v-wheel-change
                            />
                            <span class="text-sm text-gray-400">cm</span>
                        </div>
                    </div>
                </div>

                <el-collapse v-model="activeNames" class="collapse-panel">
                    <el-collapse-item name="header">
                        <template #title>
                            <div class="flex items-center justify-between w-full">
                                <div class="flex items-center">
                                    <img
                                        src="/images/header.svg"
                                        alt="页眉设置"
                                        class="w-4 h-4 inline-block mr-1"
                                    />
                                    <span>页眉设置</span>
                                </div>
                                <div class="flex gap-2">
                                    <el-button
                                        size="small"
                                        round
                                        type="info"
                                        @click.stop="applyHeader"
                                    >
                                        应用
                                    </el-button>
                                    <el-button
                                        size="small"
                                        round
                                        type="warning"
                                        @click.stop="removeHeader"
                                    >
                                        删除
                                    </el-button>
                                    <el-button size="small" round @click.stop="resetDefaultHeader">
                                        重置
                                    </el-button>
                                </div>
                            </div>
                        </template>

                        <!-- 传入 store 中的 header 配置 -->
                        <HeaderSettings v-model="header" />
                    </el-collapse-item>

                    <el-collapse-item name="footer">
                        <template #title>
                            <div class="flex items-center justify-between w-full">
                                <div class="flex items-center">
                                    <img
                                        src="/images/footer.svg"
                                        alt="页脚设置"
                                        class="w-4 h-4 inline-block mr-1"
                                    />
                                    <span>页脚设置</span>
                                </div>
                                <div class="flex gap-2">
                                    <el-button
                                        size="small"
                                        round
                                        type="info"
                                        @click.stop="applyFooter"
                                    >
                                        应用
                                    </el-button>
                                    <el-button
                                        size="small"
                                        round
                                        type="warning"
                                        @click.stop="removeFooter"
                                    >
                                        删除
                                    </el-button>
                                    <el-button size="small" round @click.stop="resetDefaultFooter">
                                        重置
                                    </el-button>
                                </div>
                            </div>
                        </template>

                        <FooterSettings v-model="footer" />

                        <!-- 状态提示 -->
                        <el-alert
                            v-if="hasPageNum"
                            type="info"
                            class="mt-4"
                            :closable="false"
                            title="当前文档已设置页脚页码"
                        />
                        <el-alert
                            v-else
                            type="warning"
                            class="mt-4"
                            :closable="false"
                            title="当前文档未检测到页码"
                        />
                    </el-collapse-item>
                </el-collapse>
            </div>
        </el-scrollbar>

        <div
            class="flex flex-wrap items-center justify-around p-5 border-t border-gray-200 bg-white"
        >
            <el-button @click="importConfig">载入配置</el-button>
            <el-button @click="saveConfig">保存配置</el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ElMessage, ElNotification } from "element-plus";

import FooterSettings from "@/components/FooterSettings.vue";
import HeaderSettings from "@/components/HeaderSettings.vue";
import { DEFAULT_FOOTER_CONFIG, DEFAULT_HEADER_CONFIG } from "@/config/defaults";
import { removeAllHeaders, setHeader } from "@/jsa/commands/header";
import { addFooterPagenum, hasPagenum, removePagenum } from "@/jsa/commands/pagenum";
import { refreshDocumentView } from "@/jsa/utils/document";
import { useGovDocConfig } from "@/stores/govDocConfig";

const config = useGovDocConfig();
const { header, footer } = config;

const activeNames = ref(["header", "footer"]);
const hasPageNum = ref(false);

function checkPageNum() {
    try {
        hasPageNum.value = hasPagenum();
    } catch {
        hasPageNum.value = false;
    }
}

// ---- 页眉操作 ----
function applyHeader() {
    const { content, position, font, fontSize, distance } = header.value;
    setHeader(content, position, font, fontSize, distance);
    refreshDocumentView();
    ElMessage.primary("已修改页眉");
}

function removeHeader() {
    removeAllHeaders();
    refreshDocumentView();
    ElMessage.primary("已移除页眉");
}

function resetDefaultHeader() {
    header.value = { ...DEFAULT_HEADER_CONFIG };
    ElMessage.primary("页眉配置已恢复默认");
}

// ---- 页脚操作 ----
function applyFooter() {
    try {
        addFooterPagenum(footer.value);
        checkPageNum();
        ElMessage.success("页码已插入/更新");
    } catch (e) {
        console.warn(e);
        ElMessage.error("插入页码失败，请确认处于 WPS 环境中");
    }
}

function removeFooter() {
    try {
        removePagenum();
        checkPageNum();
        ElMessage.success("所有页码已删除");
        refreshDocumentView();
    } catch (e) {
        console.warn(e);
        ElMessage.error("删除页码失败");
    }
}

function resetDefaultFooter() {
    footer.value = { ...DEFAULT_FOOTER_CONFIG };
    ElMessage.primary("页脚配置已恢复默认");
}

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

onMounted(() => {
    checkPageNum();
});
</script>

<style scoped></style>
