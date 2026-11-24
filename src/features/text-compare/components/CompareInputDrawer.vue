<template>
    <el-drawer
        v-model="visible"
        :size="drawerSize"
        :with-header="false"
        class="compare-input-drawer"
        append-to-body
    >
        <div class="drawer-shell">
            <header class="drawer-head">
                <div>
                    <h2 class="drawer-title">输入文本</h2>
                    <p class="drawer-sub">对比内容仅在本机处理，不会上传</p>
                </div>
                <el-button text circle :icon="Close" aria-label="关闭" @click="visible = false" />
            </header>

            <div class="drawer-scroll">
                <section class="sync-panel">
                    <div class="sync-head">
                        <span class="sync-title">文档同步</span>
                        <span class="sync-badge" :class="{ 'is-off': !hasWps }">
                            {{ hasWps ? "WPS 已连接" : "仅 WPS 可用" }}
                        </span>
                    </div>

                    <div class="sync-row">
                        <span class="sync-label">写入</span>
                        <el-segmented
                            v-model="syncTarget"
                            :options="syncOptions"
                            size="small"
                            :disabled="!hasWps"
                        />
                        <span class="sync-hint">{{ syncStateText }}</span>
                    </div>

                    <div class="sync-row">
                        <el-button
                            size="small"
                            :disabled="!hasWps"
                            :type="bookmarkStatus === 'marked' ? 'primary' : 'default'"
                            :plain="bookmarkStatus === 'marked'"
                            @click="emit('mark')"
                        >
                            📌
                            {{ bookmarkStatus === "marked" ? "重新标记段落" : "标记选区段落" }}
                        </el-button>
                        <el-button
                            v-if="bookmarkStatus === 'marked'"
                            size="small"
                            text
                            @click="emit('clear-mark')"
                        >
                            取消标记
                        </el-button>
                        <span v-if="bookmarkStatus === 'marked'" class="bookmark-preview">
                            {{ bookmarkPreview || "（空段落）" }}
                        </span>
                    </div>
                </section>

                <div class="field-grid">
                    <section class="field-card">
                        <header class="field-head">
                            <span class="field-dot dot-old" />
                            <span class="field-title">旧文本</span>
                            <span class="field-count">{{ oldText.length }} 字符</span>
                        </header>
                        <el-input
                            v-model="oldText"
                            type="textarea"
                            resize="none"
                            :autosize="{ minRows: 9, maxRows: 16 }"
                            placeholder="粘贴原始版本，或从 WPS 选区 / 文件读取"
                        />
                        <div class="field-actions">
                            <el-button
                                size="small"
                                text
                                :disabled="!hasWps"
                                @click="emit('read-selection', 'old')"
                            >
                                读取选区
                            </el-button>
                            <el-button
                                size="small"
                                text
                                :loading="importingSide === 'old'"
                                @click="oldFileInput?.click()"
                            >
                                导入文件
                            </el-button>
                        </div>
                    </section>

                    <section class="field-card">
                        <header class="field-head">
                            <span class="field-dot dot-new" />
                            <span class="field-title">新文本</span>
                            <span class="field-count">{{ newText.length }} 字符</span>
                        </header>
                        <el-input
                            v-model="newText"
                            type="textarea"
                            resize="none"
                            :autosize="{ minRows: 9, maxRows: 16 }"
                            placeholder="粘贴修改版本，或从 WPS 选区 / 文件读取"
                        />
                        <div class="field-actions">
                            <el-button
                                size="small"
                                text
                                :disabled="!hasWps"
                                @click="emit('read-selection', 'new')"
                            >
                                读取选区
                            </el-button>
                            <el-button
                                size="small"
                                text
                                :loading="importingSide === 'new'"
                                @click="newFileInput?.click()"
                            >
                                导入文件
                            </el-button>
                        </div>
                    </section>
                </div>

                <p class="file-tip">
                    支持 .txt / .md / .docx 文件；旧版 .doc 请先在 WPS 中另存为 .docx。
                </p>
            </div>

            <footer class="drawer-foot">
                <el-button size="small" text @click="emit('example')">加载示例</el-button>
                <el-button size="small" text @click="emit('swap')">交换左右</el-button>
                <el-button size="small" text @click="emit('clear')">清空</el-button>
                <span class="foot-spacer" />
                <el-button size="small" type="primary" @click="visible = false">完成</el-button>
            </footer>
        </div>

        <input
            ref="oldFileInput"
            type="file"
            class="hidden-input"
            accept=".txt,.md,.docx"
            @change="handleFile('old', $event)"
        />
        <input
            ref="newFileInput"
            type="file"
            class="hidden-input"
            accept=".txt,.md,.docx"
            @change="handleFile('new', $event)"
        />
    </el-drawer>
</template>

<script setup lang="ts">
import type { BookmarkStatus } from "@/composables/useSelectionBookmark";
import type { SyncTarget } from "./types";

import { Close } from "@element-plus/icons-vue";
import { useWindowSize } from "@vueuse/core";
import { ElMessage } from "element-plus";
import { computed, ref } from "vue";

import { errorText } from "@/utils/error";
import { readDocumentFile } from "@/utils/readDocument";

const props = defineProps<{
    hasWps: boolean;
    bookmarkStatus: BookmarkStatus;
    bookmarkPreview?: string;
}>();

const emit = defineEmits<{
    (e: "mark"): void;
    (e: "clear-mark"): void;
    (e: "read-selection", side: "old" | "new"): void;
    (e: "example"): void;
    (e: "swap"): void;
    (e: "clear"): void;
}>();

const visible = defineModel<boolean>({ required: true });
const oldText = defineModel<string>("oldText", { required: true });
const newText = defineModel<string>("newText", { required: true });
const syncTarget = defineModel<SyncTarget>("syncTarget", { required: true });

const { width } = useWindowSize();
const drawerSize = computed(() => `${Math.min(700, Math.max(320, width.value - 12))}px`);

const syncOptions = [
    { label: "关闭", value: "none" },
    { label: "旧文本", value: "old" },
    { label: "新文本", value: "new" },
];

const targetLabel = computed(() => (syncTarget.value === "old" ? "旧文本" : "新文本"));

const syncStateText = computed(() => {
    if (!props.hasWps) return "打开 WPS 后可自动读取选区";
    if (props.bookmarkStatus === "marked") {
        return syncTarget.value === "none"
            ? "已暂停写入，标记仍然保留"
            : `文档改动实时写入「${targetLabel.value}」`;
    }
    if (syncTarget.value === "none") return "不自动填入";
    return `选中文字后自动填入「${targetLabel.value}」`;
});

const oldFileInput = ref<HTMLInputElement | null>(null);
const newFileInput = ref<HTMLInputElement | null>(null);
const importingSide = ref<"old" | "new" | null>(null);

async function handleFile(side: "old" | "new", event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    importingSide.value = side;
    try {
        const text = await readDocumentFile(file);
        if (!text.trim()) throw new Error("文件里没有可读取的文字");
        if (side === "old") oldText.value = text;
        else newText.value = text;
        ElMessage.success(`已导入 ${file.name}`);
    } catch (error) {
        ElMessage.error(errorText(error));
    } finally {
        importingSide.value = null;
    }
}
</script>

<style scoped>
.drawer-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #f6f8fc;
}

.drawer-head {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 14px;
    background: #fff;
    border-bottom: 1px solid #edf1f7;
}

.drawer-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
}

.drawer-sub {
    margin: 3px 0 0;
    font-size: 11.5px;
    color: #94a3b8;
}

.drawer-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.sync-panel {
    background: #fff;
    border: 1px solid #e8ecf4;
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sync-head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.sync-title {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
}

.sync-badge {
    font-size: 10px;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 999px;
    color: #15803d;
    background: #f0fdf4;
    border: 1px solid #dcfce7;
}

.sync-badge.is-off {
    color: #94a3b8;
    background: #f8fafc;
    border-color: #eef2f7;
}

.sync-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.sync-label {
    font-size: 11.5px;
    color: #64748b;
    min-width: 28px;
}

.sync-hint {
    font-size: 11.5px;
    color: #94a3b8;
}

.bookmark-preview {
    flex: 1;
    min-width: 140px;
    font-size: 11.5px;
    color: #64748b;
    background: #f8fafc;
    border: 1px dashed #dbe3ef;
    border-radius: 6px;
    padding: 4px 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.field-card {
    background: #fff;
    border: 1px solid #e8ecf4;
    border-radius: 10px;
    padding: 10px 12px 8px;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.field-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
}

.field-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
}

.dot-old {
    background: #f87171;
}

.dot-new {
    background: #4ade80;
}

.field-title {
    font-size: 12.5px;
    font-weight: 600;
    color: #334155;
}

.field-count {
    margin-left: auto;
    font-size: 10.5px;
    color: #a8b3c4;
    font-variant-numeric: tabular-nums;
}

.field-actions {
    display: flex;
    justify-content: flex-end;
    gap: 2px;
    margin-top: 4px;
}

.file-tip {
    margin: 0;
    font-size: 11px;
    color: #a0acbd;
    line-height: 1.6;
}

.drawer-foot {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 10px 16px;
    background: #fff;
    border-top: 1px solid #edf1f7;
}

.foot-spacer {
    flex: 1;
}

.hidden-input {
    display: none;
}

:deep(.compare-input-drawer .el-drawer__body) {
    padding: 0;
    height: 100%;
}

:deep(.field-card .el-textarea__inner) {
    box-shadow: none;
    background: #f8fafc;
    border: 1px solid #eef2f7;
    border-radius: 8px;
    font-size: 12.5px;
    line-height: 1.8;
    font-family:
        "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", sans-serif;
    color: #334155;
    padding: 8px 10px;
}

:deep(.field-card .el-textarea__inner:focus) {
    background: #fff;
    border-color: #bfdbfe;
    box-shadow: 0 0 0 2px rgb(59 130 246 / 10%);
}

:deep(.compare-input-drawer .el-segmented) {
    --el-segmented-bg-color: #f1f5f9;
    --el-border-radius-base: 8px;
    --el-segmented-item-selected-color: #2563eb;
}

@media (max-width: 720px) {
    .field-grid {
        grid-template-columns: 1fr;
    }

    .drawer-head {
        padding: 14px;
    }

    .drawer-scroll {
        padding: 10px;
        gap: 10px;
    }

    .sync-panel {
        padding: 10px;
    }
}
</style>
