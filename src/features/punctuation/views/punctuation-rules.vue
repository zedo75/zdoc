<template>
    <div class="flex flex-col h-screen bg-gray-50">
        <el-scrollbar class="flex-1 min-h-0">
            <div class="p-4">
                <h1 class="mb-3 text-center text-lg font-semibold text-gray-800">标点规则</h1>

                <!-- 快捷操作条 -->
                <div class="flex flex-wrap items-center gap-2 mb-3">
                    <el-button size="small" @click="selectAll">全选</el-button>
                    <el-button size="small" @click="selectNone">全不选</el-button>
                    <el-button size="small" @click="selectDefault">恢复默认</el-button>
                    <el-button size="small" :disabled="swapped.length === 0" @click="clearSwapped">
                        清除交换
                    </el-button>
                    <span class="ml-auto text-xs text-gray-500 tabular-nums">
                        已选 {{ checked.length }} / {{ PUNCTUATION_RULES.length }}
                        <span v-if="swapped.length" class="text-blue-600">
                            · {{ swapped.length }} 项交换
                        </span>
                    </span>
                </div>

                <el-collapse v-model="activeNames" class="punctuation-collapse">
                    <el-collapse-item
                        v-for="group in groupedRules"
                        :key="group.name"
                        :name="group.name"
                    >
                        <template #title>
                            <div
                                class="flex flex-1 items-center justify-between gap-2 min-w-0 pr-2"
                            >
                                <div class="flex items-center gap-1.5 min-w-0">
                                    <span class="w-1 h-3 rounded-full bg-blue-500 shrink-0"></span>
                                    <span class="text-[13px] font-medium text-gray-700 truncate">
                                        {{ group.name }}
                                    </span>
                                    <span class="text-[11px] text-gray-400 tabular-nums shrink-0">
                                        {{ countInGroup(group) }}/{{ group.rules.length }}
                                    </span>
                                </div>
                                <el-checkbox
                                    size="small"
                                    :model-value="isGroupAllChecked(group)"
                                    :indeterminate="isGroupIndeterminate(group)"
                                    @click.stop
                                    @change="(v) => toggleGroup(group, !!v)"
                                >
                                    全选
                                </el-checkbox>
                            </div>
                        </template>

                        <div class="divide-y divide-gray-100">
                            <PunctuationRuleRow
                                v-for="rule in group.rules"
                                :key="rule.id"
                                :rule="rule"
                                :checked="checked.includes(rule.id)"
                                :swapped="isSwapped(rule.id)"
                                @update:checked="(v) => toggleRule(rule.id, v)"
                                @toggle-swap="toggleSwap(rule.id)"
                            />
                        </div>
                    </el-collapse-item>

                    <!-- 自定义规则 -->
                    <el-collapse-item name="__custom__">
                        <template #title>
                            <div
                                class="flex flex-1 items-center justify-between gap-2 min-w-0 pr-2"
                            >
                                <div class="flex items-center gap-1.5 min-w-0">
                                    <span class="w-1 h-3 rounded-full bg-emerald-500 shrink-0">
                                    </span>
                                    <span class="text-[13px] font-medium text-gray-700 truncate">
                                        自定义规则
                                    </span>
                                    <span class="text-[11px] text-gray-400 tabular-nums shrink-0">
                                        {{ activeCustomCount }}
                                    </span>
                                </div>
                                <el-button size="small" link type="primary" @click.stop="addCustom">
                                    ＋ 添加
                                </el-button>
                            </div>
                        </template>

                        <div
                            v-if="customList.length === 0"
                            class="px-3 py-6 text-center text-xs text-gray-400"
                        >
                            暂无自定义规则，点击右上角「添加」输入自己的查找/替换文本
                        </div>
                        <div v-else class="divide-y divide-gray-100">
                            <div
                                v-for="rule in customList"
                                :key="rule.id"
                                class="flex items-center gap-1.5 px-3 py-1.5 transition-opacity"
                                :class="{ 'opacity-50': !rule.enabled }"
                            >
                                <el-checkbox
                                    v-model="rule.enabled"
                                    size="small"
                                    class="custom-enable shrink-0"
                                    title="启用此规则"
                                />
                                <el-input
                                    v-model="rule.find"
                                    size="small"
                                    placeholder="查找文本"
                                    class="flex-1 min-w-0"
                                    :disabled="!rule.enabled"
                                />
                                <button
                                    type="button"
                                    class="shrink-0 w-[22px] h-[22px] inline-flex items-center justify-center rounded text-gray-400 text-[13px] transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                    :disabled="!rule.enabled"
                                    title="交换两侧文本"
                                    @click="swapCustomRule(rule)"
                                >
                                    ⇄
                                </button>
                                <el-input
                                    v-model="rule.replace"
                                    size="small"
                                    placeholder="替换为"
                                    class="flex-1 min-w-0"
                                    :disabled="!rule.enabled"
                                />
                                <el-checkbox
                                    v-model="rule.useWildcards"
                                    size="small"
                                    :disabled="!rule.enabled"
                                >
                                    通配符
                                </el-checkbox>
                                <button
                                    type="button"
                                    class="shrink-0 w-[22px] h-[22px] inline-flex items-center justify-center rounded text-gray-400 text-[13px] transition-colors hover:bg-red-100 hover:text-red-600"
                                    title="删除此规则"
                                    @click="removeCustomRule(rule.id)"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    </el-collapse-item>
                </el-collapse>
            </div>
        </el-scrollbar>

        <div class="flex flex-wrap gap-2 p-4 border-t border-gray-200 bg-white">
            <el-button
                size="small"
                type="primary"
                class="flex-1"
                :disabled="checked.length === 0 && activeCustomCount === 0"
                @click="apply"
            >
                应用选中规则（{{ checked.length + activeCustomCount }}）
            </el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from "element-plus";

import {
    applyPunctuationRules,
    PUNCTUATION_RULES,
    replaceAll,
} from "@/features/punctuation/commands/punctuation";
import PunctuationRuleRow from "@/features/punctuation/components/PunctuationRuleRow.vue";
import { useCustomRules } from "@/features/punctuation/composables/useCustomRules";
import { usePunctuationSelection } from "@/features/punctuation/composables/usePunctuationSelection";

/* ---------- 勾选 / 交换 ---------- */
const {
    checked,
    swapped,
    groupedRules,
    countInGroup,
    isGroupAllChecked,
    isGroupIndeterminate,
    toggleRule,
    toggleGroup,
    selectAll,
    selectNone,
    selectDefault,
    isSwapped,
    toggleSwap,
    clearSwapped,
} = usePunctuationSelection();

/* ---------- 自定义规则 ---------- */
const {
    list: customList,
    activeRules: activeCustomRules,
    activeCount: activeCustomCount,
    add: addCustomRule,
    remove: removeCustomRule,
    swap: swapCustomRule,
} = useCustomRules();

/* ---------- 折叠 ---------- */
const allGroupNames = groupedRules.value.map((g) => g.name);
const activeNames = ref<string[]>([...allGroupNames, "__custom__"]);

/** 添加自定义规则时顺手展开该组 */
function addCustom() {
    addCustomRule();
    if (!activeNames.value.includes("__custom__")) {
        activeNames.value = [...activeNames.value, "__custom__"];
    }
}

/* ---------- 执行 ---------- */
function apply() {
    const activeCustom = activeCustomRules.value;
    if (checked.value.length === 0 && activeCustom.length === 0) return;

    try {
        const { applied } = applyPunctuationRules(checked.value, {
            swappedIds: swapped.value,
        });

        let customApplied = 0;
        for (const c of activeCustom) {
            replaceAll(c.find, c.replace, c.useWildcards);
            customApplied++;
        }

        ElMessage.success(`已应用 ${applied + customApplied} 条规则`);
    } catch (e) {
        ElMessage.error("应用失败：" + (e instanceof Error ? e.message : String(e)));
    }
}
</script>

<style scoped>
/* el-collapse 卡片化 */
:deep(.punctuation-collapse .el-collapse-item) {
    margin-bottom: 12px;
    border: 1px solid;
    border-radius: 8px;
    overflow: hidden;
    @apply border-gray-200;
}

:deep(.punctuation-collapse .el-collapse-item__header) {
    padding: 0 12px;
    border-bottom: 1px solid;
    @apply bg-gray-50 border-gray-100;
}

:deep(.punctuation-collapse .el-collapse-item__wrap) {
    border-bottom: none;
}

:deep(.punctuation-collapse .el-collapse-item__content) {
    padding: 0;
}

/* 自定义规则行的勾选框：沿用规则行字号设定，勾选后不变蓝 */
.custom-enable {
    --el-checkbox-font-size: 12px;
}
</style>
