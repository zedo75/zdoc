<template>
    <div class="flex flex-col h-screen bg-gray-50">
        <el-scrollbar class="flex-1 min-h-0">
            <div class="p-5">
                <div class="mb-6 text-center">
                    <h1 class="text-xl font-semibold text-gray-800">文本对比工具</h1>
                </div>

                <el-collapse v-model="activeNames">
                    <!-- 配置面板：grid 两列均分，窄屏自动折叠 -->
                    <el-collapse-item name="config">
                        <template #title>
                            <span>⚙️ 对比配置</span>
                        </template>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="flex items-center justify-between gap-2">
                                <label class="text-sm font-medium text-gray-700 whitespace-nowrap">
                                    对比模式
                                </label>
                                <div class="flex flex-1 items-center gap-1">
                                    <el-select
                                        v-model="cleanupMode"
                                        class="flex-1"
                                        style="width: 100%"
                                    >
                                        <el-option
                                            v-for="opt in cleanupOptions"
                                            :key="opt.value"
                                            :label="opt.label"
                                            :value="opt.value"
                                        />
                                    </el-select>
                                </div>
                            </div>

                            <div
                                v-if="cleanupMode === 'efficiency'"
                                class="flex items-center justify-between gap-2"
                            >
                                <label
                                    class="text-sm font-medium text-gray-700 whitespace-nowrap flex items-center gap-1"
                                >
                                    差异精度
                                    <el-tooltip content="值越大，差异块长度越大" placement="top">
                                        <span
                                            class="text-xs text-gray-400 font-normal cursor-help border-b border-dashed border-gray-300"
                                        >
                                            🛈
                                        </span>
                                    </el-tooltip>
                                </label>
                                <div class="flex flex-1 items-center gap-1">
                                    <el-input-number
                                        v-model="editCost"
                                        :min="1"
                                        :step="1"
                                        size="default"
                                        controls-position="right"
                                        class="flex-1"
                                        style="width: 100%"
                                        v-wheel-change
                                    />
                                </div>
                            </div>
                        </div>
                    </el-collapse-item>
                    <!-- 输入面板 -->
                    <el-collapse-item name="input">
                        <template #title>
                            <span>📝 输入文本</span>
                        </template>
                        <div class="flex flex-wrap gap-4">
                            <div class="flex-1 min-w-[200px]">
                                <label class="block font-medium mb-1.5 text-sm text-gray-700">
                                    旧文本
                                </label>
                                <el-input
                                    v-model="oldText"
                                    type="textarea"
                                    :autosize="{ minRows: 8, maxRows: 8 }"
                                    placeholder="请输入旧文本（原始版本）"
                                />
                            </div>
                            <div class="flex-1 min-w-[200px]">
                                <label class="block font-medium mb-1.5 text-sm text-gray-700">
                                    新文本
                                </label>
                                <el-input
                                    v-model="newText"
                                    type="textarea"
                                    :autosize="{ minRows: 8, maxRows: 8 }"
                                    placeholder="请输入新文本（修订版本）"
                                />
                            </div>
                        </div>
                    </el-collapse-item>
                </el-collapse>

                <!-- 对比结果 -->
                <div class="mt-4">
                    <div v-if="duration > 0" class="text-left text-sm text-gray-500 mb-2 pl-2">
                        ⏱️ 对比耗时：{{ formattedDuration }}
                    </div>
                    <TextDiff
                        :old-text="oldText"
                        :new-text="newText"
                        :cleanup-mode="cleanupMode"
                        :edit-cost="editCost"
                        @update:duration="onDurationUpdate"
                    />
                </div>
            </div>
        </el-scrollbar>

        <div class="flex flex-wrap gap-2 p-5 border-t border-gray-200 bg-white">
            <el-button size="small" class="flex-1" @click="loadExample">加载示例</el-button>
            <el-button size="small" type="primary" class="flex-1" @click="clearText">
                清空文本
            </el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from "element-plus";

import TextDiff from "@/components/TextDiff.vue";

const EXAMPLE_OLD = `会议指出，各相关部门应认真执行上级部署，确保各项工作任务落到实处。
会议强调，要加强组织领导，明确责任分工，密切协调配合，形成工作合力。
会议决定，对本次会议确定的重点工作任务实行台账管理，定期通报进展情况。`;

const EXAMPLE_NEW = `会议指出，各相关部门要切实提高政治站位，不折不扣落实上级部署，确保各项工作任务落地见效。
会议强调，要健全组织领导机制，细化责任分工，强化协调配合，增强工作合力。
会议决定，对本次会议确定的重点任务实行清单化管理、项目化推进，定期调度通报进展情况。`;

const oldText = ref("");
const newText = ref("");
const cleanupMode = ref<"semantic" | "efficiency" | "none">("semantic");
const editCost = ref(4);
const duration = ref(0);

const activeNames = ref(["config", "input"]);

// 长句差异用语义优化效果较好
const cleanupOptions = [
    { label: "语义优化", value: "semantic" },
    { label: "效率优化", value: "efficiency" },
    { label: "原始输出", value: "none" },
];

function loadExample() {
    oldText.value = EXAMPLE_OLD;
    newText.value = EXAMPLE_NEW;
    ElMessage.success("已加载示例");
}

function clearText() {
    oldText.value = "";
    newText.value = "";
    ElMessage.primary("已清空文本");
}

function onDurationUpdate(ms: number) {
    duration.value = ms;
}

const formattedDuration = computed(() => {
    if (duration.value === 0) return "";
    if (duration.value >= 1000) {
        return `${(duration.value / 1000).toFixed(2)} s`;
    }
    return `${duration.value.toFixed(2)} ms`;
});
</script>

<style scoped></style>
