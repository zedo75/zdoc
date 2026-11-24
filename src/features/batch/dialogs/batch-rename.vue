<template>
    <div class="w-screen h-screen flex flex-col overflow-hidden bg-slate-100 text-slate-700">
        <!-- ========== 顶部 ========== -->
        <header
            class="shrink-0 flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200"
        >
            <div
                class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center font-bold text-lg shadow-sm"
            >
                名
            </div>
            <div class="min-w-0">
                <h1 class="text-base font-semibold leading-tight text-slate-800">批量重命名</h1>
                <p class="text-[11px] text-slate-400">
                    按文档主标题批量重命名 · 保留原件 / 替换原件可切换
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
                        <span class="w-1 h-4 rounded-full bg-violet-500"></span>
                        <span class="text-sm font-semibold">① 选择文档</span>
                        <span class="text-xs text-slate-400">支持 .doc / .docx / .wps</span>
                        <div class="ml-auto flex items-center gap-2">
                            <el-button
                                size="small"
                                type="primary"
                                :disabled="detecting || renameRunning"
                                @click="pickFiles"
                            >
                                选择文档
                            </el-button>
                            <el-button
                                size="small"
                                :disabled="detecting || renameRunning"
                                @click="addActiveDoc"
                            >
                                添加当前文档
                            </el-button>
                            <el-button
                                size="small"
                                :disabled="detecting || renameRunning || renameFiles.length === 0"
                                @click="clearRenameFiles"
                            >
                                清空
                            </el-button>
                        </div>
                    </div>

                    <div class="p-4">
                        <div
                            v-if="renameFiles.length === 0"
                            class="py-10 text-center text-xs text-slate-400"
                        >
                            <div class="mb-1 text-2xl">🏷️</div>
                            尚未添加文档，添加后点击「分析主标题」预览新文件名
                        </div>

                        <template v-else>
                            <div class="mb-3 flex flex-wrap items-center gap-2">
                                <el-button
                                    size="small"
                                    type="primary"
                                    :loading="detecting"
                                    :disabled="renameRunning"
                                    @click="startDetect"
                                >
                                    分析主标题
                                </el-button>
                                <el-button
                                    size="small"
                                    :disabled="detecting || renameRunning || !hasDetectedTitle"
                                    @click="resetNamesToTitles"
                                >
                                    全部恢复为主标题
                                </el-button>
                                <span class="text-[11px] text-slate-400">
                                    仅读取文档结构，不会修改文件
                                </span>
                            </div>

                            <el-table
                                :data="renameFiles"
                                border
                                size="small"
                                row-key="id"
                                max-height="300"
                            >
                                <el-table-column type="index" label="#" width="42" align="center" />
                                <el-table-column label="原文件" min-width="150">
                                    <template #default="{ row }">
                                        <div class="truncate" :title="row.path">
                                            {{ row.name }}
                                        </div>
                                        <div
                                            v-if="row.oldPath"
                                            class="truncate text-[10px] text-emerald-600"
                                            :title="row.oldPath"
                                        >
                                            原：{{ fileNameOf(row.oldPath) }}
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="识别到的主标题" min-width="180">
                                    <template #default="{ row }">
                                        <span
                                            v-if="row.title"
                                            class="text-xs break-all text-slate-700"
                                        >
                                            {{ row.title }}
                                        </span>
                                        <span v-else class="text-xs text-slate-300">未识别</span>
                                    </template>
                                </el-table-column>
                                <el-table-column label="新文件名（不含扩展名）" min-width="240">
                                    <template #default="{ row }">
                                        <el-input
                                            v-model="row.newBase"
                                            size="small"
                                            :disabled="
                                                detecting ||
                                                renameRunning ||
                                                row.status === 'processing'
                                            "
                                            placeholder="填写新文件名"
                                            @input="onNameEdited(row)"
                                        >
                                            <template #append>{{ row.ext }}</template>
                                        </el-input>
                                        <div
                                            v-if="row.status === 'error' && row.message"
                                            class="mt-1 text-[11px] break-all text-red-500"
                                        >
                                            {{ row.message }}
                                        </div>
                                        <div
                                            v-else-if="
                                                effectiveName(row) &&
                                                effectiveName(row) !== row.newBase.trim() + row.ext
                                            "
                                            class="mt-1 text-[11px] break-all text-slate-400"
                                        >
                                            实际保存：{{ effectiveName(row) }}
                                        </div>
                                    </template>
                                </el-table-column>
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
                                <el-table-column label="操作" width="100" align="center">
                                    <template #default="{ row, $index }">
                                        <el-button
                                            link
                                            size="small"
                                            :disabled="
                                                detecting ||
                                                renameRunning ||
                                                row.status === 'processing'
                                            "
                                            @click="detectSingle(row)"
                                        >
                                            分析
                                        </el-button>
                                        <el-button
                                            link
                                            size="small"
                                            type="danger"
                                            :disabled="
                                                detecting ||
                                                renameRunning ||
                                                row.status === 'processing'
                                            "
                                            @click="removeRenameFile($index)"
                                        >
                                            移除
                                        </el-button>
                                    </template>
                                </el-table-column>
                            </el-table>

                            <div v-if="detecting" class="mt-3 flex items-center gap-3">
                                <el-progress
                                    class="flex-1"
                                    :percentage="detectProgress"
                                    :stroke-width="6"
                                    :show-text="false"
                                />
                                <span class="text-xs tabular-nums text-slate-500">
                                    {{ detectDone }} / {{ detectTotal }}
                                </span>
                            </div>
                        </template>
                    </div>
                </section>

                <!-- 命名设置 -->
                <section class="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                        <span class="w-1 h-4 rounded-full bg-violet-500"></span>
                        <span class="text-sm font-semibold">② 命名设置</span>
                    </div>

                    <div class="p-4 space-y-3">
                        <el-radio-group
                            v-model="renameMode"
                            :disabled="detecting || renameRunning"
                            @change="confirmDelete = false"
                        >
                            <el-radio value="copy">另存为新文件（保留原件）</el-radio>
                            <el-radio value="move">重命名原文件（删除原件）</el-radio>
                        </el-radio-group>

                        <p class="text-[11px] leading-relaxed text-slate-400">
                            文件名取自主标题，扩展名保持不变；同名文件自动追加
                            _2、_3，不会覆盖已有文件。
                        </p>

                        <template v-if="renameMode === 'move'">
                            <el-alert type="warning" :closable="false" show-icon>
                                <template #title>此操作会删除原文件，且无法撤销</template>
                                <span class="text-xs">
                                    建议先备份。程序会在确认新文件已成功生成后才删除原件。
                                </span>
                            </el-alert>
                            <el-checkbox v-model="confirmDelete" :disabled="renameRunning">
                                我已知晓风险，确认删除原文件
                            </el-checkbox>
                        </template>
                    </div>
                </section>
            </div>

            <!-- 底部操作栏 -->
            <footer
                class="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-t border-slate-200"
            >
                <div class="flex-1 min-w-0 text-xs text-slate-400">
                    待处理
                    <span class="font-medium text-slate-600">{{ renamePendingCount }}</span>
                    个
                    <span v-if="renameMode === 'move'" class="ml-1 text-amber-600">
                        · 将删除原文件
                    </span>
                    <span v-else class="ml-1">· 保留原件</span>
                </div>
                <el-button
                    type="primary"
                    :loading="renameRunning"
                    :disabled="!canRename"
                    @click="startRename"
                >
                    {{ renameRunning ? "处理中…" : renameButtonText }}
                </el-button>
            </footer>
        </main>
    </div>
</template>

<script setup lang="ts">
import type { BatchFileStatus } from "@/features/batch/utils/fileStatus";

import { ElMessage } from "element-plus";
import { computed, ref } from "vue";

import { batchRenameFiles, detectMainTitles } from "@/features/batch/commands/batchRename";
import { readMainTitleFromFile } from "@/features/batch/commands/mainTitle";
import { useBatchFileList } from "@/features/batch/composables/useBatchFileList";
import { useBatchFilePicker } from "@/features/batch/composables/useBatchFilePicker";
import { useBatchProgress } from "@/features/batch/composables/useBatchProgress";
import { statusLabel, statusType } from "@/features/batch/utils/fileStatus";
import { delay } from "@/utils/async";
import { errorText } from "@/utils/error";
import { sanitizeBaseName } from "@/utils/fileName";
import { baseNameOf, dirOf, extOf, fileNameOf } from "@/utils/filePath";

// ==================== 类型 ====================
type RenameMode = "copy" | "move";

interface RenameFile {
    id: number;
    path: string;
    name: string;
    baseName: string;
    dir: string;
    ext: string;
    status: BatchFileStatus;
    message: string;
    title: string;
    newBase: string;
    /** 用户是否手动改过新文件名（重新分析时不覆盖） */
    dirty: boolean;
    /** 成功重命名后的旧路径，仅用于界面展示 */
    oldPath?: string;
}

const SUPPORTED_EXTS = [".doc", ".docx", ".wps"];

let nextId = 1;

function createRenameFile(path: string): RenameFile {
    return {
        id: nextId++,
        path,
        name: fileNameOf(path),
        baseName: baseNameOf(path),
        dir: dirOf(path),
        ext: extOf(path),
        status: "pending",
        message: "",
        title: "",
        newBase: "",
        dirty: false,
    };
}

// ==================== 状态 ====================
const renameList = useBatchFileList<RenameFile>({
    supportedExts: SUPPORTED_EXTS,
    createItem: createRenameFile,
});
const {
    files: renameFiles,
    removeAt: removeRenameFile,
    clear: clearRenameFiles,
    has: hasRenameFile,
} = renameList;

/** el-table 的 row 运行时就是 RenameFile，只是 Element Plus 类型没带上 */
function asRenameFile(row: unknown): RenameFile {
    return row as RenameFile;
}

const detectBatch = useBatchProgress();
const detecting = detectBatch.running;
const detectDone = detectBatch.done;
const detectTotal = detectBatch.total;
const detectProgress = detectBatch.percent;

const renameBatch = useBatchProgress();
const renameRunning = renameBatch.running;

const renameMode = ref<RenameMode>("copy");
const confirmDelete = ref(false);

const { pickFiles: openFilePicker } = useBatchFilePicker({
    title: "选择要重命名的文档",
    storageKey: "zdoc.batchFileDir",
});

/** 待处理行：已成功的行不再参与下一轮，避免重复改名 */
const renamePending = computed(() => renameFiles.value.filter((f) => f.status !== "success"));
const renamePendingCount = computed(() => renamePending.value.length);
const hasDetectedTitle = computed(() => renameFiles.value.some((f) => !!f.title));

/** 移动模式必须显式确认删除，且所有待处理行都要有合法的新文件名 */
const canRename = computed(() => {
    if (renameRunning.value || detecting.value) return false;
    if (renamePending.value.length === 0) return false;
    if (renameMode.value === "move" && !confirmDelete.value) return false;
    return renamePending.value.every((f) => !!sanitizeBaseName(f.newBase));
});

const renameButtonText = computed(() => (renameMode.value === "move" ? "开始重命名" : "开始另存"));

// ==================== 文件选择 ====================
function pickFiles(): void {
    if (detecting.value || renameRunning.value) return;

    const paths = openFilePicker();
    if (paths.length > 0) addFiles(paths);
}

function addFiles(paths: string[]): void {
    const result = renameList.addPaths(paths);

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
    if (detecting.value || renameRunning.value) return;

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
    if (hasRenameFile(fullName)) {
        ElMessage.info("当前文档已在列表中");
        return;
    }

    addFiles([fullName]);
}

// ==================== 主标题分析 ====================
/** 写入识别结果；用户手动改过的名称（dirty）不被覆盖 */
function applyDetectedTitle(file: RenameFile, title: string): void {
    file.title = title;

    if (!file.dirty) file.newBase = title;

    if (title) {
        file.status = "pending";
        file.message = file.dirty ? "已识别主标题（保留手动修改的名称）" : "已识别主标题";
    } else {
        file.status = "warning";
        file.message = "未识别到主标题，请手动填写新文件名";
    }
}

/** 批量分析主标题：先复制列表快照，回调中按索引回写对应行 */
async function startDetect(): Promise<void> {
    if (detecting.value || renameRunning.value || renameFiles.value.length === 0) return;

    const list = [...renameFiles.value];
    detectBatch.start(list.length);

    try {
        const summary = await detectMainTitles(
            list.map((file) => file.path),
            {
                onItemStart: (index, total) => {
                    detectBatch.update(index - 1, total);
                    const file = list[index - 1];
                    if (!file) return;
                    file.status = "processing";
                    file.message = "正在分析主标题…";
                },
                onProgress: (index, total, result) => {
                    detectBatch.update(index, total);
                    const file = list[index - 1];
                    if (!file) return;

                    if (result.error) {
                        file.status = "error";
                        file.message = result.error;
                    } else {
                        applyDetectedTitle(file, result.title);
                    }
                },
            },
        );

        if (summary.failCount > 0) {
            ElMessage.warning(
                `分析完成：${summary.foundCount} 个识别成功，${summary.failCount} 个失败`,
            );
        } else {
            ElMessage.success(
                `分析完成：${summary.foundCount} / ${list.length} 个文档识别到主标题`,
            );
        }
    } catch (error) {
        ElMessage.error(`分析过程出错：${errorText(error)}`);
    } finally {
        detectBatch.stop();
    }
}

/** 单行分析：不占用批量进度条，只更新该行状态 */
async function detectSingle(row: unknown): Promise<void> {
    const file = asRenameFile(row);
    if (detecting.value || renameRunning.value || file.status === "processing") return;

    file.status = "processing";
    file.message = "正在分析主标题…";
    await delay(20);

    try {
        applyDetectedTitle(file, readMainTitleFromFile(file.path));
    } catch (error) {
        file.status = "error";
        file.message = errorText(error);
    }
}

/** 手动编辑后标记 dirty，后续重新分析时不再覆盖用户输入 */
function onNameEdited(row: unknown): void {
    const file = asRenameFile(row);
    file.dirty = true;
    if (file.status !== "processing") {
        file.status = "pending";
        file.message = "";
    }
}

function resetNamesToTitles(): void {
    let count = 0;
    for (const file of renameFiles.value) {
        if (!file.title) continue;
        file.newBase = file.title;
        file.dirty = false;
        file.status = "pending";
        file.message = "已恢复为主标题";
        count++;
    }

    if (count > 0) ElMessage.success(`已恢复 ${count} 个文件名`);
}

function effectiveName(row: unknown): string {
    const file = asRenameFile(row);
    const base = sanitizeBaseName(file.newBase);
    return base ? `${base}${file.ext}` : "";
}

// ==================== 重命名 ====================
/**
 * 开始重命名/另存。
 *
 * 只处理未成功的行；`reservedPaths` 传入当前列表的全部路径，
 * 防止本批次生成的新文件名覆盖仍在列表中的其他文档。
 */
async function startRename(): Promise<void> {
    if (!canRename.value) return;

    const list = [...renamePending.value];
    renameBatch.start(list.length);

    try {
        const summary = await batchRenameFiles(
            list.map((file) => ({ path: file.path, newBase: file.newBase })),
            renameMode.value,
            {
                onItemStart: (index) => {
                    const file = list[index - 1];
                    if (!file) return;
                    file.status = "processing";
                    file.message = "正在处理…";
                },
                onProgress: (index, _total, result) => {
                    const file = list[index - 1];
                    if (!file) return;

                    if (!result.success) {
                        file.status = "error";
                        file.message = result.error ?? "未知错误";
                    } else if (result.unchanged) {
                        file.status = "warning";
                        file.message = result.message;
                    } else {
                        file.oldPath = result.sourcePath;
                        file.path = result.targetPath;
                        file.name = result.fileName;
                        file.baseName = result.baseName;
                        file.dir = result.dir;
                        file.status = "success";
                        file.message = result.message;
                    }
                },
            },
            renameFiles.value.map((file) => file.path),
        );

        if (summary.failCount > 0) {
            ElMessage.warning(
                `处理完成：成功 ${summary.successCount} 个，失败 ${summary.failCount} 个，未变化 ${summary.unchangedCount} 个`,
            );
        } else if (summary.unchangedCount > 0) {
            ElMessage.info(
                `处理完成：成功 ${summary.successCount} 个，文件名未变化 ${summary.unchangedCount} 个`,
            );
        } else {
            ElMessage.success(`处理完成：成功 ${summary.successCount} 个文档`);
        }
    } catch (error) {
        ElMessage.error(`重命名过程出错：${errorText(error)}`);
    } finally {
        renameBatch.stop();
    }
}
</script>

<style scoped></style>
