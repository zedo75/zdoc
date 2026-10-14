<template>
    <SectionPanel name="header" title="页眉设置" icon="./images/header.svg" :actions="actions">
        <HeaderSettings v-model="header" />
    </SectionPanel>
</template>

<script setup lang="ts">
import type { SectionAction } from "@/components/SectionPanel.vue";

import HeaderSettings from "@/components/HeaderSettings.vue";
import SectionPanel from "@/components/SectionPanel.vue";
import { useHeaderActions } from "@/composables/useHeaderActions";
import { useGovDocConfig } from "@/stores/govDocConfig";

const { header } = useGovDocConfig();
const { apply, remove, reset } = useHeaderActions();

const actions: SectionAction[] = [
    { label: "删除", type: "warning", onClick: remove },
    { label: "应用", type: "primary", onClick: apply },
    { label: "重置", onClick: reset },
];
</script>
