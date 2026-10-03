<template>
    <SectionPanel name="footer" title="页脚设置" icon="/images/footer.svg" :actions="actions">
        <FooterSettings />

        <!-- 页码状态 -->
        <div class="mt-2">
            <el-alert
                :type="hasPageNum ? 'primary' : 'warning'"
                :closable="false"
                :title="`当前文档${hasPageNum ? '已设置' : '未检测到'}页脚页码`"
            />
        </div>
    </SectionPanel>
</template>

<script setup lang="ts">
import type { SectionAction } from "@/components/SectionPanel.vue";

import FooterSettings from "@/components/FooterSettings.vue";
import SectionPanel from "@/components/SectionPanel.vue";
import { useActiveDocumentWatcher } from "@/composables/useActiveDocumentWatcher";
import { useFooterActions } from "@/composables/useFooterActions";

const { hasPageNum, refreshStatus, apply, remove, reset } = useFooterActions();

const actions: SectionAction[] = [
    { label: "删除", type: "warning", onClick: remove },
    { label: "应用", type: "primary", onClick: apply },
    { label: "重置", onClick: reset },
];

onMounted(refreshStatus);

useActiveDocumentWatcher(() => {
    refreshStatus();
});
</script>
