<template>
    <SectionPanel name="page" title="页面设置" emoji="📐" :actions="actions">
        <PageSettings />
    </SectionPanel>
</template>

<script setup lang="ts">
import type { SectionAction } from "@/components/SectionPanel.vue";

import PageSettings from "@/components/PageSettings.vue";
import SectionPanel from "@/components/SectionPanel.vue";
import { usePageActions } from "@/composables/usePageActions";

const { apply, reset } = usePageActions();

const actions: SectionAction[] = [
    { label: "应用", type: "primary", onClick: apply },
    { label: "重置", onClick: reset },
];
</script>
