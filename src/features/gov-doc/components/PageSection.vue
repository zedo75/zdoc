<template>
    <SectionPanel :name="name" title="页面设置" emoji="📐" :actions="actions">
        <PageSettings />
    </SectionPanel>
</template>

<script setup lang="ts">
import type { SectionAction } from "@/components/SectionPanel.vue";

import SectionPanel from "@/components/SectionPanel.vue";
import PageSettings from "@/features/gov-doc/components/PageSettings.vue";
import { usePageActions } from "@/features/gov-doc/composables/usePageActions";

defineProps<{
    name: string;
}>();

const { apply, reset } = usePageActions();

const actions: SectionAction[] = [
    { label: "应用", type: "primary", onClick: apply },
    { label: "重置", onClick: reset },
];
</script>
