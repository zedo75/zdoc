<template>
    <div class="w-screen h-screen flex flex-col overflow-hidden bg-slate-100 text-slate-700">
        <!-- ========== 顶部 ========== -->
        <header
            class="shrink-0 flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200"
        >
            <div
                class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center font-bold text-lg shadow-sm"
            >
                排
            </div>
            <div class="min-w-0">
                <h1 class="text-base font-semibold leading-tight text-slate-800">批量排版</h1>
                <p class="text-[11px] text-slate-400">
                    批量打开 DOC / DOCX / WPS · 统一应用当前公文排版设置
                </p>
            </div>
        </header>

        <main class="flex-1 min-h-0 flex flex-col">
            <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                <!-- 文件 -->
                <section class="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div
                        class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100"
                    >
                        <span class="w-1 h-4 rounded-full bg-emerald-500"></span>
                        <span class="text-sm font-semibold">① 选择文档</span>
                        <span class="text-xs text-slate-400">支持 .doc / .docx / .wps</span>
                        <div class="ml-auto flex items-center gap-2">
                            <el-button
                                size="small"
                                type="primary"
                                :disabled="isProcessing"
                                @click="pickFiles"
                            >
                                选择文档
                            </el-button>
                            <el-button size="small" :disabled="isProcessing" @click="addActiveDoc">
                                添加当前文档
                            </el-button>
                            <el-button
                                size="small"
                                :disabled="isProcessing || fileList.length === 0"
                                @click="clearFiles"
                            >
                                清空
                            </el-button>
                        </div>
                    </div>

                    <div class="p-4">
                        <div
                            v-if="fileList.length === 0"
                            class="py-10 text-center text-xs text-slate-400"
                        >
                            <div class="mb-1 text-2xl">📚</div>
                            尚未添加文档，点击右上角「选择文档」可一次选择多个文件
                        </div>

                        <el-table
                            v-else
                            :data="fileList"
                            border
                            size="small"
                            row-key="path"
                            max-height="260"
                        >
                            <el-table-column type="index" label="#" width="42" align="center" />
                            <el-table-column label="源文件" min-width="160">
                                <template #default="{ row }">
                                    <div class="truncate" :title="row.path">{{ row.name }}</div>
                                </template>
                            </el-table-column>
                            <el-table-column label="状态" width="82" align="center">
                                <template #default="{ row }">
                                    <el-tag size="small" :type="statusType(row.status)">
                                        {{ statusLabel(row.status, typoStatusLabels) }}
                                    </el-tag>
                                </template>
                            </el-table-column>
                            <el-table-column label="输出 / 说明" min-width="280">
                                <template #default="{ row }">
                                    <div
                                        v-if="row.savedPath"
                                        class="flex items-center gap-1.5 min-w-0"
                                    >
                                        <el-tag size="small" type="success" effect="plain">
                                            结果
                                        </el-tag>
                                        <span
                                            class="flex-1 min-w-0 truncate text-xs text-slate-600"
                                            :title="row.savedPath"
                                        >
                                            {{ row.savedPath }}
                                        </span>
                                        <el-button
                                            link
                                            size="small"
                                            @click="openInWps(row.savedPath)"
                                        >
                                            打开
                                        </el-button>
                                    </div>
                                    <div
                                        v-else-if="row.error"
                                        class="text-xs break-all text-red-500"
                                    >
                                        {{ row.error }}
                                    </div>
                                    <span v-else class="text-xs text-slate-300">待处理</span>
                                </template>
                            </el-table-column>
                            <el-table-column label="操作" width="150" align="center">
                                <template #default="{ row, $index }">
                                    <el-tooltip content="打开源文档" placement="top">
                                        <el-button
                                            link
                                            size="small"
                                            :icon="Document"
                                            @click="openInWps(row.path)"
                                        />
                                    </el-tooltip>
                                    <el-tooltip content="打开排版结果" placement="top">
                                        <el-button
                                            link
                                            size="small"
                                            :icon="Folder"
                                            :disabled="!row.savedPath"
                                            @click="openInWps(row.savedPath)"
                                        />
                                    </el-tooltip>
                                    <el-tooltip content="定位文件夹" placement="top">
                                        <el-button
                                            link
                                            size="small"
                                            :icon="FolderOpened"
                                            @click="revealInFolder(row.savedPath || row.path)"
                                        />
                                    </el-tooltip>
                                    <el-tooltip content="对比排版前后" placement="top">
                                        <el-button
                                            link
                                            size="small"
                                            :icon="Search"
                                            :disabled="!row.savedPath"
                                            @click="compareWithRevision(row)"
                                        />
                                    </el-tooltip>
                                    <el-tooltip content="移除" placement="top">
                                        <el-button
                                            link
                                            size="small"
                                            type="danger"
                                            :icon="Close"
                                            :disabled="isProcessing"
                                            @click="removeFile($index)"
                                        />
                                    </el-tooltip>
                                </template>
                            </el-table-column>
                        </el-table>
                    </div>
                </section>

                <!-- 保存设置 -->
                <section class="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                        <span class="w-1 h-4 rounded-full bg-emerald-500"></span>
                        <span class="text-sm font-semibold">② 保存设置</span>
                    </div>

                    <div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div>
                            <div class="mb-2 text-xs font-medium text-slate-500">保存方式</div>
                            <el-radio-group
                                v-model="saveMode"
                                :disabled="isProcessing"
                                class="flex flex-col items-start gap-2"
                            >
                                <el-radio value="sameDir">同目录另存</el-radio>
                                <el-radio value="custom">指定目录</el-radio>
                                <el-radio value="overwrite">覆盖原件</el-radio>
                            </el-radio-group>

                            <div
                                v-if="saveMode === 'custom'"
                                class="mt-3 flex items-center gap-2 min-w-0"
                            >
                                <el-button
                                    size="small"
                                    :disabled="isProcessing"
                                    @click="pickOutputDir"
                                >
                                    选择目录
                                </el-button>
                                <span
                                    class="flex-1 min-w-0 truncate text-xs text-slate-500"
                                    :title="outputDir"
                                >
                                    {{ outputDir || "未选择" }}
                                </span>
                            </div>

                            <p class="mt-2 text-[11px] leading-relaxed text-slate-400">
                                {{ saveModeHint }}
                            </p>
                        </div>

                        <div v-if="saveMode !== 'overwrite'">
                            <div class="mb-2 text-xs font-medium text-slate-500">文件名模板</div>
                            <el-select
                                v-model="nameTemplate"
                                size="small"
                                filterable
                                allow-create
                                default-first-option
                                style="width: 100%"
                                :disabled="isProcessing"
                                placeholder="选择预设或输入自定义模板"
                            >
                                <el-option
                                    v-for="opt in templatePresets"
                                    :key="opt.value"
                                    :label="opt.label"
                                    :value="opt.value"
                                />
                            </el-select>

                            <p class="mt-2 text-[11px] leading-relaxed text-slate-400">
                                可用变量：{name} 原文件名 · {ext} 扩展名 · {date} 日期 · {time} 时间
                                · {datetime} 日期时间 · {index} 序号
                            </p>

                            <div
                                class="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                            >
                                <span class="text-slate-400">预览：</span>
                                <span class="font-mono text-emerald-600 break-all">
                                    {{ previewFileName }}
                                </span>
                            </div>
                        </div>

                        <div
                            v-else
                            class="rounded-xl border border-red-100 bg-red-50/60 p-4 text-xs leading-relaxed text-red-600"
                        >
                            <div class="mb-1 flex items-center gap-1.5 font-semibold">
                                <span>⚠️</span>
                                覆盖原件
                            </div>
                            处理结果将直接写回源文件，无法撤销。建议先备份，或使用「同目录另存」。
                        </div>
                    </div>
                </section>

                <!-- 日志 -->
                <section
                    v-if="logs.length > 0"
                    class="bg-white rounded-xl border border-slate-200 shadow-sm"
                >
                    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                        <span class="w-1 h-4 rounded-full bg-slate-400"></span>
                        <span class="text-sm font-semibold">处理日志</span>
                        <span class="text-xs text-slate-400">{{ logs.length }} 条</span>
                        <el-button class="ml-auto" link size="small" @click="clearLogs">
                            清空
                        </el-button>
                    </div>
                    <div
                        ref="logContainerRef"
                        class="max-h-32 overflow-y-auto p-3 space-y-1 bg-slate-50/60"
                    >
                        <div v-for="(log, index) in logs" :key="index" class="flex gap-2 text-xs">
                            <span class="shrink-0 font-mono text-slate-400">{{ log.time }}</span>
                            <span
                                :class="
                                    log.type === 'success'
                                        ? 'text-emerald-600'
                                        : log.type === 'error'
                                          ? 'text-red-500'
                                          : 'text-slate-500'
                                "
                            >
                                {{ log.message }}
                            </span>
                        </div>
                    </div>
                </section>
            </div>

            <!-- 底部操作栏 -->
            <footer
                class="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-t border-slate-200"
            >
                <template v-if="isProcessing">
                    <el-progress
                        class="flex-1"
                        :percentage="progress"
                        :stroke-width="8"
                        :show-text="false"
                    />
                    <span class="text-xs tabular-nums text-slate-500">
                        {{ currentIndex }} / {{ totalCount }}
                    </span>
                    <span
                        class="max-w-[260px] truncate text-xs text-slate-500"
                        :title="currentName"
                    >
                        {{ currentName }}
                    </span>
                </template>
                <div v-else class="flex-1 text-xs text-slate-400">
                    已选择 {{ fileList.length }} 个文档
                    <span v-if="fileList.length > 0"> · {{ saveModeLabel }}</span>
                    <span v-if="saveMode === 'custom' && !outputDir" class="text-amber-600">
                        · 请选择输出目录
                    </span>
                </div>

                <el-button
                    type="primary"
                    :loading="isProcessing"
                    :disabled="
                        fileList.length === 0 ||
                        isProcessing ||
                        (saveMode === 'custom' && !outputDir)
                    "
                    @click="startBatch"
                >
                    {{ isProcessing ? "排版中…" : "开始批量排版" }}
                </el-button>
            </footer>
        </main>
    </div>
</template>

<script setup lang="ts">
import type { BatchSaveMode, BatchSaveOptions } from "@/features/batch/commands/batchTypo";

import { Close, Document, Folder, FolderOpened, Search } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { computed, ref } from "vue";

import { batchFormatDocs, expandTemplate } from "@/features/batch/commands/batchTypo";
import { useBatchFileList } from "@/features/batch/composables/useBatchFileList";
import { useBatchFilePicker } from "@/features/batch/composables/useBatchFilePicker";
import { useBatchLog } from "@/features/batch/composables/useBatchLog";
import { useBatchProgress } from "@/features/batch/composables/useBatchProgress";
import { useFileActions } from "@/features/batch/composables/useFileActions";
import { useOutputDir } from "@/features/batch/composables/useOutputDir";
import { statusLabel, statusType } from "@/features/batch/utils/fileStatus";
import { useGovDocConfig } from "@/stores/govDocConfig";
import { errorText } from "@/utils/error";
import { baseNameOf, extOf, fileNameOf, normalizePath } from "@/utils/filePath";

type FileStatus = "pending" | "processing" | "success" | "error";

interface FileItem {
    name: string;
    path: string;
    status: FileStatus;
    savedPath?: string;
    error?: string;
}

const SUPPORTED_EXTS = [".doc", ".docx", ".wps"];
const typoStatusLabels = { pending: "等待" } as const;

const config = useGovDocConfig();

// ==================== 状态 ====================
const { logs, addLog, clearLogs } = useBatchLog();

const fileListApi = useBatchFileList<FileItem>({
    supportedExts: SUPPORTED_EXTS,
    createItem: (path) => ({ name: fileNameOf(path), path, status: "pending" }),
});
const { files: fileList, addPaths, removeAt: removeFileAt, clear: clearFileList } = fileListApi;

const { pickFiles: openFilePicker } = useBatchFilePicker({
    title: "选择要批量排版的文档",
    storageKey: "zdoc.batchFileDir",
    onError: (message) => addLog(message, "error"),
});

const { outputDir, pickOutputDir } = useOutputDir({
    title: "选择排版结果的输出目录",
    storageKey: "zdoc.batchOutputDir",
    onError: (message) => addLog(message, "error"),
});

const fileActions = useFileActions({ onError: (message) => addLog(message, "error") });
const openInWps = fileActions.openInWps;
const revealInFolder = fileActions.revealInFolder;

const batchProgress = useBatchProgress();
const isProcessing = batchProgress.running;
const currentIndex = batchProgress.done;
const totalCount = batchProgress.total;
const progress = batchProgress.percent;
const currentName = ref("");

const saveMode = ref<BatchSaveMode>("sameDir");
const nameTemplate = ref("{name}_已排版{ext}");

const templatePresets = [
    { label: "已排版_{name}{ext}", value: "已排版_{name}{ext}" },
    { label: "{name}_已排版{ext}", value: "{name}_已排版{ext}" },
    { label: "{name}_{date}{ext}", value: "{name}_{date}{ext}" },
    { label: "{name}_{datetime}{ext}", value: "{name}_{datetime}{ext}" },
    { label: "{index}_{name}{ext}", value: "{index}_{name}{ext}" },
    { label: "{name}{ext}（保持原名）", value: "{name}{ext}" },
];

// ==================== 计算属性 ====================
const saveModeLabel = computed(() => {
    if (saveMode.value === "overwrite") return "覆盖原件";
    if (saveMode.value === "custom") return "指定目录";
    return "同目录另存";
});

const saveModeHint = computed(() => {
    if (saveMode.value === "overwrite") {
        return "直接写回源文件，处理完成后原文件即被替换，无法撤销。";
    }
    if (saveMode.value === "custom") {
        return "输出到指定目录，源文件保留。";
    }
    return "输出到源文件所在目录，源文件保留。";
});

/** 用列表第一项做样例，预览模板展开结果；规则与后端 expandTemplate 保持一致 */
const previewFileName = computed(() => {
    if (saveMode.value === "overwrite") return "（覆盖原件）";

    const sampleName = fileList.value[0]?.name || "示例文档.docx";
    const ext = extOf(sampleName) || ".docx";
    const baseName = baseNameOf(sampleName);
    const template = nameTemplate.value?.trim() || "{name}_已排版{ext}";
    const outName = expandTemplate(template, {
        name: baseName,
        ext,
        index: 1,
        date: new Date(),
    });

    if (!outName) return "（模板无效）";
    return template.includes("{ext}") || /\.[A-Za-z0-9]+$/.test(outName) ? outName : outName + ext;
});

// ==================== 文件选择 ====================
function pickFiles(): void {
    if (isProcessing.value) return;

    const paths = openFilePicker();
    if (paths.length === 0) return;

    let added = 0;
    // 逐个添加，才能针对不支持或重复的文件给出具体提示
    for (const path of paths) {
        const result = addPaths([path]);
        if (result.unsupported.length > 0) {
            ElMessage.warning(`不支持的文件格式：${fileNameOf(path)}`);
        } else if (result.added > 0) {
            added++;
        }
    }

    if (added > 0) {
        ElMessage.success(`已添加 ${added} 个文档`);
    } else {
        ElMessage.info("没有新增文档（可能已在列表中）");
    }
}

function addActiveDoc(): void {
    if (isProcessing.value) return;

    try {
        const doc = ActiveDocument;
        if (!doc) {
            ElMessage.warning("没有打开的文档");
            addLog("没有打开的文档", "error");
            return;
        }

        const filePath = doc.FullName;
        if (!filePath) {
            ElMessage.warning("当前文档未保存，请先保存文档");
            addLog("当前文档未保存，请先保存文档", "error");
            return;
        }

        if (fileListApi.has(filePath)) {
            ElMessage.info("当前文档已在列表中");
            return;
        }

        const result = addPaths([filePath]);
        if (result.added > 0) {
            addLog(`已添加当前文档：${fileNameOf(filePath)}`, "success");
        } else if (result.unsupported.length > 0) {
            ElMessage.warning(`不支持的文件格式：${fileNameOf(filePath)}`);
        } else {
            ElMessage.info("当前文档已在列表中");
        }
    } catch (error) {
        const message = errorText(error);
        addLog(`添加当前文档失败：${message}`, "error");
        ElMessage.error(`添加当前文档失败：${message}`);
    }
}

function removeFile(index: number): void {
    if (isProcessing.value) return;
    removeFileAt(index);
}

function clearFiles(): void {
    if (isProcessing.value) return;
    clearFileList();
}

/** el-table 的 row 运行时就是 FileItem，只是 Element Plus 类型没带上 */
function asFileItem(row: unknown): FileItem {
    return row as FileItem;
}

// ==================== 单文件操作 ====================
/** 调用 WPS 文档对比，把排版前后的差异生成一份带修订的新文档 */
function compareWithRevision(row: unknown): void {
    const file = asFileItem(row);
    if (!file.savedPath) {
        ElMessage.warning("该文档尚未完成排版");
        return;
    }

    if (fileActions.compare(file.path, file.savedPath)) {
        addLog(`已生成对比文档：${file.name}`, "success");
    }
}

// ==================== 批量排版 ====================
/**
 * 开始批量排版。
 *
 * 先清空上一轮结果并快照当前公文配置，避免处理过程中用户改设置导致前后不一致；
 * 覆盖原件模式不使用文件名模板，其余模式按模板生成输出名。
 */
async function startBatch(): Promise<void> {
    if (fileList.value.length === 0 || isProcessing.value) return;

    if (saveMode.value === "custom" && !outputDir.value) {
        ElMessage.warning("请先选择指定的输出文件夹");
        return;
    }

    batchProgress.start(fileList.value.length);
    currentName.value = "";
    clearLogs();

    // 重置上一轮状态，保证重复运行时列表不会残留旧的输出路径或错误
    fileList.value.forEach((file) => {
        file.status = "pending";
        delete file.savedPath;
        delete file.error;
    });

    addLog(`开始批量排版，共 ${totalCount.value} 个文档`, "info");

    try {
        const configLocal = {
            pageLayout: config.pageLayout.value,
            typography: config.typography.value,
            header: config.header.value,
            footer: config.footer.value,
        };

        const saveOptions: BatchSaveOptions = {
            mode: saveMode.value,
            outputDir: saveMode.value === "custom" ? outputDir.value : undefined,
            template: saveMode.value !== "overwrite" ? nameTemplate.value : undefined,
        };

        const summary = await batchFormatDocs(
            fileList.value.map((file) => file.path),
            configLocal,
            saveOptions,
            (index, total, result) => {
                batchProgress.update(index, total);
                currentName.value = result.fileName;

                const item = fileList.value.find(
                    (file) => normalizePath(file.path) === normalizePath(result.sourcePath),
                );

                if (item) {
                    item.status = result.success ? "success" : "error";
                    if (result.success) {
                        item.savedPath = result.savedPath;
                    } else {
                        item.error = result.error || "未知错误";
                    }
                }

                if (result.success) {
                    const target =
                        result.savedPath && result.savedPath !== result.sourcePath
                            ? ` → ${result.savedPath}`
                            : "";
                    addLog(`✓ ${result.fileName}${target}`, "success");
                } else {
                    addLog(`✗ ${result.fileName}：${result.error || "未知错误"}`, "error");
                }
            },
        );

        addLog(
            `批量排版完成：成功 ${summary.successCount}，失败 ${summary.failCount}`,
            summary.failCount === 0 ? "success" : "info",
        );

        if (summary.failCount > 0) {
            ElMessage.warning(
                `批量排版完成：成功 ${summary.successCount}，失败 ${summary.failCount}`,
            );
        } else {
            ElMessage.success(`批量排版完成：成功 ${summary.successCount} 个文档`);
        }
    } catch (error) {
        const message = errorText(error);
        addLog(`批量排版过程出错：${message}`, "error");
        ElMessage.error(`批量排版过程出错：${message}`);
    } finally {
        batchProgress.stop();
        currentName.value = "";
    }
}
</script>

<style scoped></style>
