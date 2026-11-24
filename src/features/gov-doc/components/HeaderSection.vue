<template>
    <SectionPanel :name="name" title="页眉设置" icon="./images/header.svg" :actions="actions">
        <HeaderSettings v-model="header" />
    </SectionPanel>
</template>

<script setup lang="ts">
import type { SectionAction } from "@/components/SectionPanel.vue";

import SectionPanel from "@/components/SectionPanel.vue";
import HeaderSettings from "@/features/gov-doc/components/HeaderSettings.vue";
import { useHeaderActions } from "@/features/gov-doc/composables/useHeaderActions";
import { useGovDocConfig } from "@/stores/govDocConfig";

defineProps<{
    name: string;
}>();

const { header } = useGovDocConfig();
const { apply, remove, reset } = useHeaderActions();

const actions: SectionAction[] = [
    { label: "删除", type: "warning", onClick: remove },
    { label: "应用", type: "primary", onClick: apply },
    { label: "重置", onClick: reset },
];
</script>
