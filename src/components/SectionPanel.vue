<template>
    <el-collapse-item :name="name">
        <template #title>
            <div class="flex items-center justify-between w-full">
                <div class="flex items-center">
                    <img v-if="icon" :src="icon" class="w-4 h-4 inline-block mx-1" />
                    <span v-else-if="emoji" class="mx-1">{{ emoji }}</span>
                    <span>{{ title }}</span>
                </div>
                <div class="flex mr-4">
                    <el-tooltip
                        v-for="act in actions"
                        :key="act.label"
                        :content="act.tooltip"
                        :disabled="!act.tooltip"
                        placement="top-end"
                    >
                        <el-button size="small" round :type="act.type" @click.stop="act.onClick">
                            {{ act.label }}
                        </el-button>
                    </el-tooltip>
                </div>
            </div>
        </template>
        <slot />
    </el-collapse-item>
</template>

<script setup lang="ts">
import type { ButtonType } from "element-plus";

export type SectionAction = {
    label: string;
    type?: ButtonType;
    onClick: () => void;
    /** 鼠标悬浮提示，留空则不显示 */
    tooltip?: string;
};

defineProps<{
    name: string;
    title: string;
    icon?: string;
    emoji?: string;
    actions?: SectionAction[];
}>();
</script>
