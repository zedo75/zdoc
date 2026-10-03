<template>
    <SectionPanel name="typography" title="字体设置" emoji="📝" :actions="actions">
        <TypographySettings />
    </SectionPanel>
</template>

<script setup lang="ts">
import type { SectionAction } from "@/components/SectionPanel.vue";

import SectionPanel from "@/components/SectionPanel.vue";
import TypographySettings from "@/components/TypographySettings.vue";
import { useTypographyActions } from "@/composables/useTypographyActions";

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
