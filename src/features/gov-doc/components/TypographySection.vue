<template>
    <SectionPanel :name="name" title="字体设置" emoji="📝" :actions="actions">
        <TypographySettings />
    </SectionPanel>
</template>

<script setup lang="ts">
import type { SectionAction } from "@/components/SectionPanel.vue";

import SectionPanel from "@/components/SectionPanel.vue";
import TypographySettings from "@/features/gov-doc/components/TypographySettings.vue";
import { useTypographyActions } from "@/features/gov-doc/composables/useTypographyActions";

defineProps<{
    name: string;
}>();

const { apply, reset } = useTypographyActions();

const actions: SectionAction[] = [
    {
        label: "应用",
        type: "primary",
        onClick: apply,
        tooltip: "修改“公文正文”和“公文标题”样式",
    },
    { label: "重置", onClick: reset },
];
</script>
