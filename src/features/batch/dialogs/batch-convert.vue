<template>
    <div class="w-screen h-screen flex flex-col overflow-hidden bg-slate-100 text-slate-700">
        <!-- ========== 顶部 ========== -->
        <header
            class="shrink-0 flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200"
        >
            <div
                class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center font-bold text-lg shadow-sm"
            >
                批
            </div>
            <div class="min-w-0">
                <h1 class="text-base font-semibold leading-tight text-slate-800">批量转换</h1>
                <p class="text-[11px] text-slate-400">
                    批量转换 DOCX / 导出 PDF · 所有处理均在本机完成
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
                        <span class="w-1 h-4 rounded-full bg-indigo-500"></span>
                        <span class="text-sm font-semibold">① 选择文档</span>
                        <span class="text-xs text-slate-400">支持 .doc / .docx / .wps</span>
                        <div class="ml-auto flex items-center gap-2">
                            <el-button
                                size="small"
                                type="primary"
                                :disabled="convertRunning"
                                @click="pickFiles"
                            >
                                选择文档
                            </el-button>
                            <el-button
                                size="small"
                                :disabled="convertRunning"
                                @click="addActiveDoc"
                            >
                                添加当前文档
                            </el-button>
                            <el-button
                                size="small"
                                :disabled="convertRunning || convertFiles.length === 0"
                                @click="clearConvertFiles"
                            >
                                清空
                            </el-button>
                        </div>
                    </div>

                    <div class="p-4">
                        <div
                            v-if="convertFiles.length === 0"
                            class="py-10 text-center text-xs text-slate-400"
                        >
                            <div class="mb-1 text-2xl">📄</div>
                            尚未添加文档，点击右上角「选择文档」可一次选择多个文件
                        </div>

                        <el-table
                            v-else
                            :data="convertFiles"
                            border
                            size="small"
                            row-key="id"
                            max-height="260"
                        >
                            <el-table-column type="index" label="#" width="42" align="center" />
                            <el-table-column
                                prop="name"
                                label="源文件"
                                min-width="170"
                                show-overflow-tooltip
                            />
                            <el-table-column label="状态" width="82" align="center">
                                <template #default="{ row }">
                                    <el-tooltip
                                        :content="row.message || statusLabel(row.status)"
                                        placement="top"
                                        :disabled="!row.message"
                                    >
                                        <el-tag size="small" :type="statusType(row.status)">
                                            {{ statusLabel(row.status) }}
                                        </el-tag>
                                    </el-tooltip>
                                </template>
                            </el-table-column>
                            <el-table-column label="输出 / 说明" min-width="300">
                                <template #default="{ row }">
                                    <div class="space-y-1">
                                        <div
                                            v-for="out in row.outputs"
                                            :key="out.path"
                                            class="flex items-center gap-1.5 min-w-0"
                                        >
                                            <el-tag
                                                size="small"
                                                effect="plain"
                                                :type="out.kind === 'pdf' ? 'danger' : 'info'"
                                            >
                                                {{ out.kind.toUpperCase() }}
                                            </el-tag>
                                            <span
                                                class="flex-1 min-w-0 truncate text-xs text-slate-600"
                                                :title="out.path"
                                            >
                                                {{ out.path }}
                                            </span>
                                            <el-button
                                                link
                                                size="small"
                                                @click="openPath(out.path)"
                                            >
                                                打开
                                            </el-button>
                                            <el-button
                                                link
                                                size="small"
                                                @click="revealInFolder(out.path)"
                                            >
                                                定位
                                            </el-button>
                                        </div>

                                        <div
                                            v-if="row.message"
                                            class="text-xs break-all"
                                            :class="
                                                row.status === 'error'
                                                    ? 'text-red-500'
                                                    : 'text-slate-500'
                                            "
                                        >
                                            {{ row.message }}
                                        </div>
                                    </div>
                                </template>
                            </el-table-column>
                            <el-table-column label="操作" width="64" align="center">
                                <template #default="{ $index }">
                                    <el-button
                                        link
                                        size="small"
                                        type="danger"
                                        :disabled="convertRunning"
                                        @click="removeConvertFile($index)"
                                    >
                                        移除
                                    </el-button>
                                </template>
                            </el-table-column>
                        </el-table>
                    </div>
                </section>

                <!-- 输出设置 -->
                <section class="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                        <span class="w-1 h-4 rounded-full bg-indigo-500"></span>
                        <span class="text-sm font-semibold">② 输出设置</span>
                    </div>

                    <div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div>
                            <div class="mb-2 text-xs font-medium text-slate-500">目标格式</div>
                            <div class="flex flex-wrap gap-4">
                                <el-checkbox
                                    v-model="convertOptions.toDocx"
                                    :disabled="convertRunning"
                                >
                                    转换为 DOCX
                                </el-checkbox>
                                <el-checkbox
                                    v-model="convertOptions.toPdf"
                                    :disabled="convertRunning"
                                >
                                    导出 PDF
                                </el-checkbox>
                            </div>
                            <p class="mt-2 text-[11px] leading-relaxed text-slate-400">
                                至少选择一项。源文件已是 DOCX 且输出到同目录时不会重复保存。
                            </p>
                        </div>

                        <div>
                            <div class="mb-2 text-xs font-medium text-slate-500">输出位置</div>
                            <el-radio-group
                                v-model="convertOptions.outputMode"
                                :disabled="convertRunning"
                            >
                                <el-radio value="sameDir">与源文件同目录</el-radio>
                                <el-radio value="custom">指定目录</el-radio>
                            </el-radio-group>

                            <div
                                v-if="convertOptions.outputMode === 'custom'"
                                class="mt-2 flex items-center gap-2 min-w-0"
                            >
                                <el-button
                                    size="small"
                                    :disabled="convertRunning"
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
                        </div>

                        <div
                            class="lg:col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 border-t border-slate-100"
                        >
                            <el-checkbox
                                v-model="convertOptions.overwrite"
                                :disabled="convertRunning"
                            >
                                覆盖已存在的同名输出
                            </el-checkbox>
                            <el-checkbox
                                v-model="convertOptions.pdfBookmarks"
                                :disabled="convertRunning || !convertOptions.toPdf"
                            >
                                PDF 生成标题书签
                            </el-checkbox>
                            <span
                                v-if="convertOptions.overwrite"
                                class="text-[11px] text-amber-600"
                            >
                                已存在的 DOCX / PDF 会被直接覆盖；本批次的源文件始终受保护。
                            </span>
                        </div>
                    </div>
                </section>
            </div>

            <!-- 底部操作栏 -->
            <footer
                class="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-t border-slate-200"
            >
                <el-progress
                    v-if="convertRunning"
                    class="flex-1"
                    :percentage="convertProgress"
                    :stroke-width="8"
                    :show-text="false"
                />
                <div v-else class="flex-1 text-xs text-slate-400">
                    已选择 {{ convertFiles.length }} 个文档
                    <span v-if="convertFiles.length > 0"> · 目标：{{ targetSummary }} </span>
                </div>
                <span v-if="convertRunning" class="text-xs tabular-nums text-slate-500">
                    {{ convertDone }} / {{ convertTotal }}
                </span>
                <el-button
                    type="primary"
                    :loading="convertRunning"
                    :disabled="!canConvert"
                    @click="startConvert"
                >
                    {{ convertRunning ? "转换中…" : "开始转换" }}
                </el-button>
            </footer>
        </main>
    </div>
</template>

<script setup lang="ts">
import type {
    BatchConvertOptions,
    BatchConvertOutput,
} from "@/features/batch/commands/batchConvert";
import type { BatchFileStatus } from "@/features/batch/utils/fileStatus";

import { ElMessage } from "element-plus";
import { computed, reactive } from "vue";

import { batchConvertDocs } from "@/features/batch/commands/batchConvert";
import { useBatchFileList } from "@/features/batch/composables/useBatchFileList";
import { useBatchFilePicker } from "@/features/batch/composables/useBatchFilePicker";
import { useBatchProgress } from "@/features/batch/composables/useBatchProgress";
import { useFileActions } from "@/features/batch/composables/useFileActions";
import { useOutputDir } from "@/features/batch/composables/useOutputDir";
import { statusLabel, statusType } from "@/features/batch/utils/fileStatus";
import { errorText } from "@/utils/error";
import { baseNameOf, dirOf, extOf, fileNameOf } from "@/utils/filePath";

// ==================== 类型 ====================
interface ConvertFile {
    id: number;
    path: string;
    name: string;
    baseName: string;
    dir: string;
    ext: string;
    status: BatchFileStatus;
    message: string;
    outputs: BatchConvertOutput[];
}

const SUPPORTED_EXTS = [".doc", ".docx", ".wps"];

let nextId = 1;

function createConvertFile(path: string): ConvertFile {
    return {
        id: nextId++,
        path,
        name: fileNameOf(path),
        baseName: baseNameOf(path),
        dir: dirOf(path),
        ext: extOf(path),
        status: "pending",
        message: "",
        outputs: [],
    };
}

// ==================== 状态 ====================
const convertList = useBatchFileList<ConvertFile>({
    supportedExts: SUPPORTED_EXTS,
    createItem: createConvertFile,
});
const {
    files: convertFiles,
    removeAt: removeConvertFile,
    clear: clearConvertFiles,
    has: hasConvertFile,
} = convertList;

const convertBatch = useBatchProgress();
const convertRunning = convertBatch.running;
const convertDone = convertBatch.done;
const convertTotal = convertBatch.total;
const convertProgress = convertBatch.percent;

const convertOptions = reactive({
    toDocx: true,
    toPdf: true,
    outputMode: "sameDir" as "sameDir" | "custom",
    overwrite: false,
    pdfBookmarks: true,
});

const { outputDir, pickOutputDir } = useOutputDir({
    title: "选择输出目录",
    storageKey: "zdoc.batchOutputDir",
});

const { pickFiles: openFilePicker } = useBatchFilePicker({
    title: "选择要批量转换的文档",
    storageKey: "zdoc.batchFileDir",
});

const fileActions = useFileActions();
const revealInFolder = fileActions.revealInFolder;

// ==================== 计算属性 ====================
const targetSummary = computed(() => {
    const targets: string[] = [];
    if (convertOptions.toDocx) targets.push("DOCX");
    if (convertOptions.toPdf) targets.push("PDF");
    return targets.join(" + ") || "未选择";
});

const canConvert = computed(
    () =>
        !convertRunning.value &&
        convertFiles.value.length > 0 &&
        (convertOptions.toDocx || convertOptions.toPdf),
);

// ==================== 文件选择 ====================
function pickFiles(): void {
    if (convertRunning.value) return;

    const paths = openFilePicker();
    if (paths.length > 0) addFiles(paths);
}

function addFiles(paths: string[]): void {
    const result = convertList.addPaths(paths);

    if (result.unsupported.length > 0) {
        ElMessage.warning(
            `已忽略 ${result.unsupported.length} 个不支持的文件（仅支持 .doc / .docx / .wps）`,
        );
    }
    if (result.added > 0) {
        ElMessage.success(`已添加 ${result.added} 个文档`);
    } else if (result.unsupported.length === 0) {
        ElMessage.info("没有新增文档（可能已在列表中）");
    }
}

function addActiveDoc(): void {
    if (convertRunning.value) return;

    let fullName = "";
    try {
        const doc = ActiveDocument;
        if (!doc) {
            ElMessage.warning("没有打开的文档，请先在 WPS 中打开一个文档");
            return;
        }
        fullName = String(doc.FullName ?? "").trim();
    } catch (error) {
        ElMessage.warning(`获取当前文档失败：${errorText(error)}`);
        return;
    }

    const ext = extOf(fullName).toLowerCase();
    if (!fullName || !ext) {
        ElMessage.warning("当前文档尚未保存到磁盘，请先保存后再添加");
        return;
    }
    if (!SUPPORTED_EXTS.includes(ext)) {
        ElMessage.warning(`当前文档格式（${ext}）不受支持，仅支持 .doc / .docx / .wps`);
        return;
    }
    if (hasConvertFile(fullName)) {
        ElMessage.info("当前文档已在列表中");
        return;
    }

    addFiles([fullName]);
}

function openPath(path: string): void {
    fileActions.openInWps(path, { requireExists: true, errorLabel: "打开文件失败" });
}

// ==================== 转换 ====================
async function startConvert(): Promise<void> {
    if (!canConvert.value) return;

    if (convertOptions.outputMode === "custom" && !outputDir.value) {
        ElMessage.warning("请先选择输出目录");
        return;
    }

    const list = [...convertFiles.value];
    const options: BatchConvertOptions = {
        toDocx: convertOptions.toDocx,
        toPdf: convertOptions.toPdf,
        outputMode: convertOptions.outputMode,
        outputDir: outputDir.value,
        overwrite: convertOptions.overwrite,
        pdfBookmarks: convertOptions.pdfBookmarks,
    };

    convertBatch.start(list.length);

    try {
        const summary = await batchConvertDocs(
            list.map((file) => file.path),
            options,
            {
                onItemStart: (index, total) => {
                    convertBatch.update(index - 1, total);
                    const file = list[index - 1];
                    if (!file) return;
                    file.status = "processing";
                    file.message = "正在转换…";
                    file.outputs = [];
                },
                onProgress: (index, total, result) => {
                    convertBatch.update(index, total);
                    const file = list[index - 1];
                    if (!file) return;

                    if (result.success) {
                        file.outputs = result.outputs;
                        file.status = result.skipped ? "warning" : "success";
                        file.message = result.message;
                    } else {
                        file.status = "error";
                        file.message = result.error ?? "未知错误";
                    }
                },
            },
        );

        if (summary.failCount > 0) {
            ElMessage.warning(
                `转换完成：成功 ${summary.successCount} 个，跳过 ${summary.skippedCount} 个，失败 ${summary.failCount} 个`,
            );
        } else if (summary.skippedCount > 0) {
            ElMessage.info(
                `转换完成：成功 ${summary.successCount} 个，跳过 ${summary.skippedCount} 个（无需转换）`,
            );
        } else {
            ElMessage.success(`转换完成：成功 ${summary.successCount} 个文档`);
        }
    } catch (error) {
        ElMessage.error(`转换过程出错：${errorText(error)}`);
    } finally {
        convertBatch.stop();
    }
}
</script>

<style scoped></style>
