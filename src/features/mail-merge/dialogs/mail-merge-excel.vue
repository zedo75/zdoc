<template>
    <div class="w-screen h-screen flex flex-col overflow-hidden bg-slate-100 text-slate-700">
        <!-- 顶部 -->
        <header
            class="shrink-0 flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200"
        >
            <div
                class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center font-bold text-lg shadow-sm"
            >
                邮
            </div>
            <div class="min-w-0">
                <h1 class="text-base font-semibold leading-tight text-slate-800">邮件合并</h1>
                <p class="text-[11px] text-slate-400">
                    当前文档为模板 · Excel 扁平数据 · 按 row / group 模板批量生成 .docx
                </p>
            </div>
            <div class="ml-auto flex items-center gap-2">
                <el-tag v-if="template.saved" size="small" type="success" effect="plain">
                    模板已保存
                </el-tag>
                <el-tag v-else size="small" type="danger" effect="plain">模板未保存</el-tag>
                <el-button size="small" round @click="close">关闭</el-button>
            </div>
        </header>

        <el-tabs v-model="activeTab" class="flex-1 min-h-0 px-4 merge-tabs">
            <!-- ==================== 数据源 ==================== -->
            <el-tab-pane label="① 数据源" name="data">
                <div class="h-full overflow-auto pt-1 space-y-3">
                    <section class="rounded-xl border border-slate-200 bg-white">
                        <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                            <span class="w-1 h-4 rounded-full bg-blue-500"></span>
                            <span class="text-sm font-semibold">模板</span>
                            <span class="text-[11px] text-slate-400">
                                直接编辑当前 WPS 文档，普通字段写在正文 / 表格 / 页眉页脚都可以
                            </span>
                            <el-button size="small" class="ml-auto" @click="refreshTemplate">
                                刷新
                            </el-button>
                        </div>
                        <div class="px-4 py-3 space-y-2">
                            <div class="flex items-center gap-2 min-w-0 text-xs">
                                <span class="shrink-0 text-slate-400">文件</span>
                                <span
                                    class="truncate font-medium text-slate-700"
                                    :title="template.path"
                                >
                                    {{ template.path || "尚未保存" }}
                                </span>
                            </div>
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-[10px] text-slate-400">字段</span>
                                <el-tag
                                    v-for="key in template.placeholders"
                                    :key="`p-${key}`"
                                    size="small"
                                    effect="plain"
                                    type="info"
                                >
                                    {{ key }}
                                </el-tag>
                                <el-tag
                                    v-for="key in template.loops"
                                    :key="`l-${key}`"
                                    size="small"
                                    effect="plain"
                                    type="warning"
                                >
                                    #each {{ key }}
                                </el-tag>
                                <span
                                    v-if="!template.placeholders.length && !template.loops.length"
                                    class="text-[10px] text-slate-400"
                                >
                                    未扫描到占位符
                                </span>
                            </div>
                            <p v-if="!template.saved" class="text-[11px] text-red-500">
                                模板有未保存修改。请先在 WPS 中保存，批量合并会从磁盘读取模板。
                            </p>
                        </div>
                    </section>

                    <section class="rounded-xl border border-slate-200 bg-white">
                        <div
                            class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100"
                        >
                            <span class="w-1 h-4 rounded-full bg-emerald-500"></span>
                            <span class="text-sm font-semibold">Excel 数据</span>
                            <span class="text-[11px] text-slate-400">
                                支持 .xlsx / .xls / .et（.et 能否读取取决于其内部格式）
                            </span>
                            <el-button
                                size="small"
                                type="primary"
                                class="ml-auto"
                                :disabled="isBusy"
                                @click="selectSpreadsheet"
                            >
                                选择表格
                            </el-button>
                        </div>

                        <div
                            v-if="!spreadsheetPath"
                            class="px-4 py-10 text-center text-xs text-slate-400"
                        >
                            <div class="mb-1 text-2xl">📄</div>
                            选择 Excel 后，将按模板中的 row / group 模式批量生成 Word 文档
                        </div>

                        <div v-else class="p-4 space-y-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <span
                                    class="max-w-[420px] truncate text-xs text-slate-600"
                                    :title="spreadsheetPath"
                                >
                                    {{ spreadsheetPath }}
                                </span>
                                <el-tag size="small" effect="plain"
                                    >{{ records?.records.length ?? 0 }} 条记录</el-tag
                                >
                            </div>

                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-xs text-slate-500">工作表</span>
                                <el-select
                                    v-model="sheetName"
                                    size="small"
                                    class="w-44"
                                    :disabled="isBusy"
                                    @change="loadSheet"
                                >
                                    <el-option
                                        v-for="name in sheetNames"
                                        :key="name"
                                        :label="name"
                                        :value="name"
                                    />
                                </el-select>

                                <span class="ml-2 text-xs text-slate-500">表头行</span>
                                <el-input-number
                                    v-model="headerRow"
                                    size="small"
                                    :min="1"
                                    :max="9999"
                                    controls-position="right"
                                    class="w-24"
                                    :disabled="isBusy"
                                    @change="loadSheet"
                                />
                                <span class="text-[10px] text-slate-400">
                                    表头决定 {{ fieldExample }} 的字段
                                </span>
                            </div>

                            <el-table
                                v-if="records && records.headers.length"
                                :data="previewRows"
                                size="small"
                                border
                                max-height="260"
                                class="excel-preview"
                            >
                                <el-table-column label="行" width="58" align="center">
                                    <template #default="{ $index }">
                                        {{ records.rowNumbers[(page - 1) * pageSize + $index] }}
                                    </template>
                                </el-table-column>
                                <el-table-column
                                    v-for="header in records.headers"
                                    :key="header"
                                    :label="header"
                                    min-width="110"
                                    show-overflow-tooltip
                                >
                                    <template #default="{ row }">
                                        {{ formatCell(row[header]) }}
                                    </template>
                                </el-table-column>
                            </el-table>
                            <div
                                v-else-if="records && records.issues.length"
                                class="text-xs text-red-500"
                            >
                                {{ records.issues[0].message }}
                            </div>
                            <p v-else-if="records" class="text-xs text-slate-400">没有数据行</p>

                            <div
                                v-if="records && records.records.length"
                                class="flex items-center justify-between gap-2"
                            >
                                <el-pagination
                                    v-model:current-page="page"
                                    v-model:page-size="pageSize"
                                    :page-sizes="[20, 50, 100, 200]"
                                    :total="records.records.length"
                                    layout="total, sizes, prev, pager, next"
                                    small
                                    background
                                    @size-change="page = 1"
                                />
                                <el-button size="small" text @click="refreshTemplate">
                                    刷新模板
                                </el-button>
                            </div>

                            <div
                                v-if="records && records.headers.length"
                                class="rounded-lg border border-slate-200 p-2.5"
                            >
                                <div class="flex items-center gap-2 mb-1.5">
                                    <span class="text-[11px] font-medium text-slate-600">
                                        快速插入占位符
                                    </span>
                                    <span class="text-[10px] text-slate-400">
                                        在模板光标处插入 {{ columnExample }}，与“插入合并域”体验一致
                                    </span>
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    <el-tag
                                        v-for="header in records.headers"
                                        :key="`insert-${header}`"
                                        size="small"
                                        effect="plain"
                                        class="cursor-pointer hover:border-blue-400"
                                        :title="`插入 {{${header}}}`"
                                        @click="pickHeader(header)"
                                    >
                                        {{ placeholderTag(header) }}
                                    </el-tag>
                                </div>
                            </div>

                            <p class="text-[11px] leading-5 text-slate-400">
                                数据源按扁平二维表处理：一行一条记录、一列一个字段；空值按空字符串渲染。
                                合并单元格按左上角单元格取值并告警。
                            </p>
                        </div>
                    </section>
                </div>
            </el-tab-pane>

            <!-- ==================== 输出与合并 ==================== -->
            <el-tab-pane label="② 输出与合并" name="output">
                <div class="h-full overflow-auto pt-1 space-y-3">
                    <section class="rounded-xl border border-slate-200 bg-white">
                        <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                            <span class="w-1 h-4 rounded-full bg-violet-500"></span>
                            <span class="text-sm font-semibold">输出设置</span>
                        </div>
                        <div class="p-4 space-y-3">
                            <div class="flex items-center gap-2">
                                <span class="w-16 shrink-0 text-xs text-slate-500">输出目录</span>
                                <el-input v-model="outputDir" size="small" readonly />
                                <el-button size="small" :disabled="isBusy" @click="pickOutputDir">
                                    选择
                                </el-button>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="w-16 shrink-0 text-xs text-slate-500">文件名</span>
                                <el-input
                                    v-model="namePattern"
                                    size="small"
                                    placeholder="例如 姓名_{index}"
                                    :disabled="isBusy"
                                    @input="namePatternTouched = true"
                                />
                                <el-checkbox v-model="overwrite" :disabled="isBusy"
                                    >覆盖同名</el-checkbox
                                >
                            </div>
                            <p class="pl-[72px] text-[11px] leading-5 text-slate-400">
                                支持 <code>{{ columnExample }}</code
                                >、<code>{{ columnFormatExample }}</code
                                >、 <code>{index}</code>（序号）、<code>{row}</code>（Excel 行号）。
                                扩展名统一为 .docx；重名会自动加 _2。
                            </p>
                            <div class="flex items-center gap-2 pl-[72px]">
                                <el-tag size="small" type="info" effect="plain">
                                    {{ selectedRecords.length }} 条记录 ·
                                    {{ outputFileCount }} 个文件
                                </el-tag>
                                <span
                                    v-if="selectedRecords.length"
                                    class="text-[11px] text-slate-400"
                                >
                                    第 1 条：{{ firstSelectedLabel }}
                                </span>
                            </div>
                            <p class="pl-[72px] text-[11px] leading-5 text-amber-600">
                                <template v-if="templateMode === 'group'">
                                    group 模式：每个分组输出一个文件（当前
                                    {{ selectedGroups.length }} 组）；
                                    请选择完整分组，避免把同一家庭拆开。
                                </template>
                                <template v-else-if="templateMode === 'row'">
                                    row 模式：每行输出一个文件，循环列在模板的
                                    <code>row in:E..T cols:N</code> 中定义。
                                </template>
                                <template v-else> 普通模式：所选每条记录输出一个文件。 </template>
                            </p>
                        </div>
                    </section>

                    <section class="rounded-xl border border-slate-200 bg-white">
                        <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                            <span class="w-1 h-4 rounded-full bg-amber-500"></span>
                            <span class="text-sm font-semibold">记录范围</span>
                            <span class="text-[11px] text-slate-400"
                                >对应原生邮件合并的 From / To</span
                            >
                        </div>
                        <div class="p-4 space-y-3">
                            <el-radio-group v-model="selectionMode" :disabled="isBusy">
                                <el-radio value="all">全部</el-radio>
                                <el-radio value="range">从 A 到 B</el-radio>
                                <el-radio value="single">指定单条</el-radio>
                            </el-radio-group>

                            <div
                                v-if="selectionMode === 'range'"
                                class="flex items-center gap-2 text-xs"
                            >
                                <span class="text-slate-500">从第</span>
                                <el-input-number
                                    v-model="rangeStart"
                                    size="small"
                                    :min="1"
                                    :max="records?.records.length ?? 1"
                                    controls-position="right"
                                    class="w-24"
                                    :disabled="isBusy"
                                />
                                <span class="text-slate-500">条到第</span>
                                <el-input-number
                                    v-model="rangeEnd"
                                    size="small"
                                    :min="1"
                                    :max="records?.records.length ?? 1"
                                    controls-position="right"
                                    class="w-24"
                                    :disabled="isBusy"
                                />
                                <span class="text-slate-500">条</span>
                            </div>

                            <div
                                v-else-if="selectionMode === 'single'"
                                class="flex items-center gap-2 text-xs"
                            >
                                <span class="text-slate-500">第</span>
                                <el-input-number
                                    v-model="singleIndex"
                                    size="small"
                                    :min="1"
                                    :max="records?.records.length ?? 1"
                                    controls-position="right"
                                    class="w-24"
                                    :disabled="isBusy"
                                />
                                <span class="text-slate-500">条</span>
                            </div>

                            <p class="text-[11px] text-slate-400">
                                当前选中 {{ selectedRecords.length }} 条
                                <span v-if="selectedRowNumbers.length">
                                    （Excel 行 {{ selectedRowNumbers[0] }}
                                    <template v-if="selectedRowNumbers.length > 1">
                                        – {{ selectedRowNumbers[selectedRowNumbers.length - 1] }}
                                    </template>
                                    ）
                                </span>
                                ；group 模式建议按完整分组选择行。
                            </p>
                        </div>
                    </section>

                    <section class="rounded-xl border border-slate-200 bg-white">
                        <div
                            class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100"
                        >
                            <span class="w-1 h-4 rounded-full bg-blue-500"></span>
                            <span class="text-sm font-semibold">执行</span>
                            <span class="text-[11px] text-slate-400">
                                预览会打开一个“已合并但未保存”的新文档
                            </span>
                            <div class="ml-auto flex items-center gap-2">
                                <el-button
                                    size="small"
                                    :loading="previewing"
                                    :disabled="!canPreview"
                                    @click="runPreview"
                                >
                                    {{ templateMode === "group" ? "预览第一组" : "预览所选" }}
                                </el-button>
                                <el-button
                                    size="small"
                                    type="primary"
                                    :loading="merging"
                                    :disabled="!canMerge"
                                    @click="runMerge"
                                >
                                    开始合并
                                </el-button>
                            </div>
                        </div>

                        <div class="p-4 space-y-3">
                            <div v-if="progress.total > 0" class="space-y-1">
                                <el-progress
                                    :percentage="progressPercentage"
                                    :status="
                                        progress.failed
                                            ? 'exception'
                                            : progress.current === progress.total
                                              ? 'success'
                                              : ''
                                    "
                                />
                                <p class="text-[11px] text-slate-500">
                                    {{
                                        progress.text ||
                                        `正在处理 ${progress.current} / ${progress.total}`
                                    }}
                                </p>
                            </div>

                            <div class="flex flex-wrap gap-1.5" v-if="issues.length">
                                <el-tag
                                    v-for="(issue, index) in issues.slice(0, 12)"
                                    :key="`${issue.code}-${index}`"
                                    size="small"
                                    :type="issue.level === 'error' ? 'danger' : 'warning'"
                                    effect="plain"
                                >
                                    {{ issue.message }}
                                </el-tag>
                                <span v-if="issues.length > 12" class="text-[10px] text-slate-400">
                                    还有 {{ issues.length - 12 }} 条…
                                </span>
                            </div>

                            <div
                                v-if="logs.length"
                                class="max-h-52 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-5 text-slate-300"
                            >
                                <div
                                    v-for="(log, index) in logs"
                                    :key="index"
                                    :class="{
                                        'text-red-300': log.level === 'error',
                                        'text-amber-300': log.level === 'warning',
                                        'text-emerald-300': log.level === 'success',
                                    }"
                                >
                                    <span class="text-slate-500">{{ log.time }}</span>
                                    {{ log.text }}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </el-tab-pane>

            <!-- ==================== 自定义函数 ==================== -->
            <el-tab-pane label="自定义函数" name="functions">
                <div class="h-full grid grid-cols-[190px_minmax(0,1fr)] gap-3 pt-1">
                    <section
                        class="min-h-0 flex flex-col rounded-xl border border-slate-200 bg-white"
                    >
                        <div class="px-3 py-2 border-b border-slate-100 flex items-center">
                            <span class="text-[11px] font-medium text-slate-500">我的函数</span>
                            <el-button
                                size="small"
                                text
                                class="ml-auto !px-1"
                                @click="startNewFunction"
                            >
                                + 新增
                            </el-button>
                        </div>
                        <el-scrollbar class="flex-1 min-h-0">
                            <div class="p-2 space-y-1">
                                <button
                                    v-for="def in customFunctions"
                                    :key="def.name"
                                    class="w-full text-left px-2.5 py-2 rounded-lg text-[11px] transition-colors"
                                    :class="
                                        editingName === def.name
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'hover:bg-slate-50 text-slate-600'
                                    "
                                    @click="editFunction(def)"
                                >
                                    <span class="font-mono">{{ def.name }}</span>
                                </button>
                                <p
                                    v-if="customFunctions.length === 0"
                                    class="px-2 py-6 text-center text-[11px] text-slate-400"
                                >
                                    还没有自定义函数
                                </p>
                            </div>
                        </el-scrollbar>
                    </section>

                    <section
                        class="min-h-0 flex flex-col rounded-xl border border-slate-200 bg-white"
                    >
                        <div class="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                            <span class="text-[11px] font-medium text-slate-500">
                                {{ isNewFunction ? "新增函数" : "编辑函数" }}
                            </span>
                            <span class="text-[10px] text-slate-400"
                                >本地离线执行，用户对代码负责</span
                            >
                        </div>
                        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-3">
                            <div class="grid grid-cols-[150px_minmax(0,1fr)] gap-2 items-center">
                                <span class="text-[11px] text-slate-500">函数名</span>
                                <el-input
                                    v-model="functionForm.name"
                                    size="small"
                                    placeholder="half"
                                    :disabled="!isNewFunction"
                                />
                            </div>
                            <div>
                                <div class="flex items-center mb-1">
                                    <span class="text-[11px] text-slate-500">函数体</span>
                                    <span class="ml-auto text-[10px] text-slate-400"
                                        >可用 value / args / ctx，必须 return</span
                                    >
                                </div>
                                <el-input
                                    v-model="functionForm.body"
                                    type="textarea"
                                    :rows="7"
                                    resize="none"
                                    class="function-body"
                                    spellcheck="false"
                                />
                            </div>
                            <el-alert type="info" :closable="false" show-icon>
                                <template #title>
                                    <span class="text-[11px]">
                                        ctx 只暴露 key / warn / helpers，不包含任何 WPS 对象；超过
                                        50ms 会记录性能告警。
                                    </span>
                                </template>
                            </el-alert>
                            <div class="flex items-center gap-2">
                                <el-button size="small" type="primary" @click="saveFunction"
                                    >保存</el-button
                                >
                                <el-button
                                    size="small"
                                    type="danger"
                                    plain
                                    :disabled="isNewFunction"
                                    @click="removeFunction"
                                >
                                    删除
                                </el-button>
                                <span
                                    v-if="functionStatus"
                                    class="text-[10px]"
                                    :class="functionStatusOk ? 'text-emerald-600' : 'text-red-500'"
                                >
                                    {{ functionStatus }}
                                </span>
                            </div>

                            <div class="rounded-lg border border-slate-200 p-2.5">
                                <div class="flex items-center mb-2">
                                    <span class="text-[11px] font-medium text-slate-600"
                                        >试运行</span
                                    >
                                    <el-button
                                        size="small"
                                        class="ml-auto"
                                        :loading="testing"
                                        @click="runFunctionTest"
                                    >
                                        运行
                                    </el-button>
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <el-input
                                        v-model="testForm.value"
                                        size="small"
                                        placeholder='样例值，如 1234 或 "abc"'
                                    />
                                    <el-input
                                        v-model="testForm.args"
                                        size="small"
                                        placeholder='参数 JSON 数组，如 [3,"0"]'
                                    />
                                </div>
                                <pre
                                    v-if="testResult"
                                    class="mt-2 max-h-24 overflow-auto rounded bg-slate-50 p-2 text-[10px] leading-4 font-mono text-slate-600 whitespace-pre-wrap"
                                    >{{ testResult }}</pre>
                            </div>
                        </div>
                    </section>
                </div>
            </el-tab-pane>

            <!-- ==================== 语法 ==================== -->
            <el-tab-pane label="语法说明" name="syntax">
                <div class="h-full overflow-auto pt-1">
                    <div class="grid grid-cols-2 gap-3">
                        <section class="rounded-xl border border-slate-200 bg-white p-3">
                            <h2 class="text-xs font-semibold text-slate-700">变量</h2>
                            <pre class="code-block">{{ variableExample }}</pre>
                            <p class="mt-2 text-[11px] leading-5 text-slate-500">
                                支持中文、字母、数字、下划线、点路径和 <code>{{ thisExample }}</code
                                >。 字段缺失渲染为空并告警，不中断。
                            </p>
                        </section>
                        <section class="rounded-xl border border-slate-200 bg-white p-3">
                            <h2 class="text-xs font-semibold text-slate-700">格式化管道</h2>
                            <pre class="code-block">{{ pipelineExample }}</pre>
                            <p class="mt-2 text-[11px] leading-5 text-slate-500">
                                管道按引号感知切分；支持 format / padl / padr / upper / lower / trim
                                / width / rmbUpper。
                            </p>
                        </section>
                        <section class="rounded-xl border border-slate-200 bg-white p-3">
                            <h2 class="text-xs font-semibold text-slate-700">row：横向切分</h2>
                            <pre class="code-block">{{ rowLoopExample }}</pre>
                            <p class="mt-2 text-[11px] leading-5 text-slate-500">
                                取当前 Excel 行的 E..T 列，每 4
                                列一组。表格里含占位符的行每次迭代复制，
                                不含占位符的表头只输出一次。
                            </p>
                        </section>
                        <section class="rounded-xl border border-slate-200 bg-white p-3">
                            <h2 class="text-xs font-semibold text-slate-700">group：纵向分组</h2>
                            <pre class="code-block">{{ groupLoopExample }}</pre>
                            <p class="mt-2 text-[11px] leading-5 text-slate-500">
                                按 <code>by:</code> 列扫描全部数据行；<code>keep:true</code>
                                表示判组列为空时 延续上一组。循环体段落每行输出一次。<br />
                                <span class="text-amber-600">
                                    by: 是分组键，不是组标题字段；按家庭分组请写 by:姓名，不要写
                                    by:家人姓名。
                                </span>
                            </p>
                        </section>
                        <section class="rounded-xl border border-slate-200 bg-white p-3">
                            <h2 class="text-xs font-semibold text-slate-700">#if 与元信息</h2>
                            <pre class="code-block">{{ ifExample }}</pre>
                            <p class="mt-2 text-[11px] leading-5 text-slate-500">
                                <code>@index</code> / <code>@count</code> /
                                <code>@groupIndex</code> / <code>@group.列名</code> 均从 1 开始。
                                <code>#if</code> 为 false 时不留下空段落。
                            </p>
                        </section>
                        <section class="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                            <h2 class="text-xs font-semibold text-amber-800">
                                "000" vs padl(3,"0")
                            </h2>
                            <p class="mt-2 text-[11px] leading-5 text-amber-900">
                                <code>"000"</code> 是 Excel 数字格式，适用于数值；
                                <code>padl(3,"0")</code> 是纯字符串补齐，"ab" 会变成 "0ab"。
                            </p>
                        </section>
                        <section class="rounded-xl border border-slate-200 bg-white p-3 col-span-2">
                            <h2 class="text-xs font-semibold text-slate-700">模板结构约束</h2>
                            <p class="mt-2 text-[11px] leading-5 text-slate-500">
                                循环标记必须各自独占表格外的段落；循环体可以混合普通段落和一个表格；
                                表格模板行必须连续；一个循环体内最多一个表格。违反约束会在合并前报错。
                            </p>
                        </section>
                    </div>
                </div>
            </el-tab-pane>
        </el-tabs>
    </div>
</template>

<script setup lang="ts">
import type {
    CustomFormatterDefinition,
    DocxLoopMode,
    MergeIssue,
    MergeRecord,
    SheetRecords,
} from "@/features/mail-merge/core";

import { ElMessage } from "element-plus";

import {
    detectMailMergeMode,
    insertMailMergePlaceholder,
    mergeExcelRecords,
    previewMailMergeRecord,
} from "@/features/mail-merge/commands/mailMergeBatch";
import { scanMailMergeTemplate } from "@/features/mail-merge/commands/mergeTemplate";
import {
    compileCustomFormatter,
    createRegistry,
    defaultNamePattern,
    FORMATTER_HELPERS,
    groupMergeRecords,
    listSheetNames,
    parseSpreadsheet,
    readSheetRecords,
    validateFormatterName,
} from "@/features/mail-merge/core";
import { errorText } from "@/utils/error";
import { dirOf } from "@/utils/filePath";
import { findOpenDocument } from "@/wps/document";
import { pickDirectory, pickDocuments } from "@/wps/fileDialog";
import { pathExists } from "@/wps/fileSystem";

const STORAGE_KEY = "zdoc:mailMerge:customFunctions:v1";

interface CustomFunctionForm {
    name: string;
    body: string;
}

interface LogItem {
    time: string;
    level: "info" | "success" | "warning" | "error";
    text: string;
}

const activeTab = ref("data");
const template = ref({
    path: "",
    name: "",
    saved: false,
    placeholders: [] as string[],
    loops: [] as string[],
    hasTables: false,
});
const templateMode = ref<DocxLoopMode>("none");
const templateGroupBy = ref("");
const templateGroupKeep = ref(false);

const spreadsheetPath = ref("");
const workbook = shallowRef<ReturnType<typeof parseSpreadsheet> | null>(null);
const sheetNames = ref<string[]>([]);
const sheetName = ref("");
const headerRow = ref(1);
const records = ref<SheetRecords | null>(null);
const page = ref(1);
const pageSize = ref(20);

const outputDir = ref("");
const namePattern = ref("合并结果_{index}");
const namePatternTouched = ref(false);
const lastDefaultPattern = ref("");
const overwrite = ref(false);
const selectionMode = ref<"all" | "range" | "single">("all");
const rangeStart = ref(1);
const rangeEnd = ref(1);
const singleIndex = ref(1);

const previewing = ref(false);
const merging = ref(false);
const progress = reactive({ current: 0, total: 0, failed: false, text: "" });
const issues = ref<MergeIssue[]>([]);
const logs = ref<LogItem[]>([]);

const isBusy = computed(() => previewing.value || merging.value);
const selectedIndexes = computed(() => {
    const total = records.value?.records.length ?? 0;
    if (total === 0) return [] as number[];
    if (selectionMode.value === "all") return Array.from({ length: total }, (_, i) => i);
    if (selectionMode.value === "single") {
        return [Math.max(0, Math.min(total - 1, singleIndex.value - 1))];
    }
    const start = Math.max(1, Math.min(total, rangeStart.value));
    const end = Math.max(1, Math.min(total, rangeEnd.value));
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    return Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
});
const selectedRecords = computed(
    () =>
        selectedIndexes.value
            .map((index) => records.value?.records[index])
            .filter(Boolean) as MergeRecord[],
);
const selectedRowNumbers = computed(() =>
    selectedIndexes.value.map((index) => records.value?.rowNumbers[index] ?? index + 2),
);
const selectedGroups = computed(() => {
    if (templateMode.value !== "group" || !templateGroupBy.value) return [];
    return groupMergeRecords(selectedRecords.value, templateGroupBy.value, templateGroupKeep.value);
});
const outputFileCount = computed(() =>
    templateMode.value === "group" ? selectedGroups.value.length : selectedRecords.value.length,
);
const previewRows = computed(() => {
    const list = records.value?.records ?? [];
    const start = (page.value - 1) * pageSize.value;
    return list.slice(start, start + pageSize.value);
});
const progressPercentage = computed(() =>
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0,
);
const firstSelectedLabel = computed(() => {
    const record = selectedRecords.value[0];
    const header = records.value?.headers[0];
    return record && header ? formatCell(record[header]) : "";
});
const canPreview = computed(() => selectedRecords.value.length > 0 && !isBusy.value);
const canMerge = computed(() => canPreview.value);

// ==================== 模板 ====================

function refreshTemplate() {
    try {
        const active = ActiveDocument;
        // 预览会在新窗口打开临时文档，不能让它覆盖“模板”身份
        const doc =
            (template.value.path ? findOpenDocument(template.value.path) : null) ??
            (active?.FullName && (!template.value.path || active.FullName === template.value.path)
                ? active
                : null);

        if (!doc) {
            if (template.value.path) {
                template.value.saved = pathExists(template.value.path);
                return;
            }
            ElMessage.warning("没有可用的模板文档");
            return;
        }

        const info = scanMailMergeTemplate(doc);
        template.value = {
            path: template.value.path || doc.FullName || "",
            name: doc.Name || "当前文档",
            saved: Boolean(doc.Saved),
            placeholders: info.placeholders,
            loops: info.loops,
            hasTables: info.hasTables,
        };
        issues.value = info.issues;
        if (!outputDir.value && template.value.path) outputDir.value = dirOf(template.value.path);
        void refreshTemplateMode();
    } catch (error) {
        ElMessage.error(`读取当前文档失败：${errorText(error)}`);
    }
}

async function refreshTemplateMode(): Promise<void> {
    if (!template.value.path) {
        templateMode.value = "none";
        templateGroupBy.value = "";
        templateGroupKeep.value = false;
        return;
    }

    try {
        const info = await detectMailMergeMode(template.value.path);
        templateMode.value = info.mode;
        templateGroupBy.value = info.groupBy ?? "";
        templateGroupKeep.value = info.groupKeep ?? false;
    } catch {
        // 模板未保存 / 无法转换时保持当前模式，不打断操作
    }
}

function ensureTemplateOpen(): Wps.Document | null {
    if (!template.value.path) refreshTemplate();
    if (!template.value.path) {
        ElMessage.warning("模板尚未保存，请先保存当前文档");
        return null;
    }
    const doc = findOpenDocument(template.value.path);
    if (!doc) {
        ElMessage.warning("模板文档未打开，无法写入");
        return null;
    }
    return doc;
}

function ensureTemplate(): boolean {
    if (!template.value.path) refreshTemplate();
    if (!template.value.path) {
        ElMessage.warning("模板尚未保存，请先保存当前文档");
        return false;
    }
    if (!pathExists(template.value.path)) {
        ElMessage.warning("模板文件不存在，请重新保存后再试");
        return false;
    }

    const doc = findOpenDocument(template.value.path);
    if (doc && !doc.Saved) {
        ElMessage.warning("模板有未保存修改，请先在 WPS 中保存");
        return false;
    }

    // 文档未打开时以磁盘文件为准
    if (!doc) template.value.saved = true;
    return true;
}

// ==================== Excel ====================

function selectSpreadsheet() {
    try {
        const paths = pickDocuments({
            title: "选择 Excel 数据源",
            storageKey: "zdoc.mailMergeSpreadsheetDir",
            filters: [
                { description: "Excel / WPS 表格", extensions: "*.xlsx;*.xls;*.et" },
                { description: "Excel 工作簿", extensions: "*.xlsx;*.xls" },
                { description: "WPS 表格", extensions: "*.et" },
                { description: "全部文件", extensions: "*.*" },
            ],
            multi: false,
        });
        if (paths.length === 0) return;

        const buffer = Application.FileSystem.ReadFileAsArrayBuffer(paths[0]);
        if (!buffer) throw new Error("读取文件失败");

        const parsed = parseSpreadsheet(buffer);
        const names = listSheetNames(parsed);
        if (names.length === 0) throw new Error("工作簿中没有工作表");

        spreadsheetPath.value = paths[0];
        workbook.value = parsed;
        sheetNames.value = names;
        sheetName.value = names[0];
        headerRow.value = 1;
        namePatternTouched.value = false;
        progress.current = 0;
        progress.total = 0;
        progress.failed = false;
        progress.text = "";
        logs.value = [];
        loadSheet();
    } catch (error) {
        ElMessage.error(`读取 Excel 失败：${errorText(error)}`);
    }
}

function loadSheet() {
    if (!workbook.value || !sheetName.value) return;

    const result = readSheetRecords(workbook.value, sheetName.value, headerRow.value);
    records.value = result;
    issues.value = result.issues;
    page.value = 1;
    selectionMode.value = "all";
    rangeStart.value = 1;
    rangeEnd.value = Math.max(1, result.records.length);
    singleIndex.value = 1;

    if (result.headers.length > 0) {
        const suggested = defaultNamePattern(result.headers);
        const previousDefault = lastDefaultPattern.value;
        if (!namePatternTouched.value || namePattern.value === previousDefault) {
            namePattern.value = suggested;
        }
        lastDefaultPattern.value = suggested;
    }

    if (result.issues.some((issue) => issue.level === "error")) {
        ElMessage.error(
            result.issues.find((issue) => issue.level === "error")?.message ?? "读取表格失败",
        );
    } else if (result.records.length === 0) {
        ElMessage.warning("该工作表没有数据行");
    }
}

function formatCell(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return "";
        }
    }
    return String(value);
}

// ==================== 输出 ====================

function pickOutputDir() {
    try {
        const dir = pickDirectory({
            title: "选择 DOCX 输出目录",
            storageKey: "zdoc.mailMergeOutputDir",
            initialPath: outputDir.value || (template.value.path ? dirOf(template.value.path) : ""),
        });
        if (dir) outputDir.value = dir;
    } catch (error) {
        ElMessage.error(`选择目录失败：${errorText(error)}`);
    }
}

function placeholderTag(header: string): string {
    return `{{${header}}}`;
}

function pickHeader(header: string): void {
    try {
        if (!ensureTemplateOpen()) return;
        insertMailMergePlaceholder(placeholderTag(header), template.value.path);
        ElMessage.success(`已插入 {{${header}}}，保存模板后才会参与批量合并`);
        refreshTemplate();
    } catch (error) {
        ElMessage.error(`插入占位符失败：${errorText(error)}`);
    }
}

// ==================== 预览 / 合并 ====================

async function runPreview() {
    if (!ensureTemplate()) return;
    if (selectedRecords.value.length === 0) {
        ElMessage.warning("请先选择数据源和记录范围");
        return;
    }

    previewing.value = true;
    issues.value = [];
    try {
        const result = await previewMailMergeRecord({
            templatePath: template.value.path,
            records: selectedRecords.value,
            customFunctions: customDefinitions(),
        });

        if (result.success) {
            issues.value = [...(records.value?.issues ?? []), ...(result.report?.issues ?? [])];
            const warning = result.report?.issues.some((issue) => issue.level === "warn");
            ElMessage.success(
                warning
                    ? "预览已打开（有告警），文档未保存"
                    : "预览已在新的 WPS 窗口打开，文档未保存",
            );
        } else {
            ElMessage.error(`预览失败：${result.error ?? "未知错误"}`);
        }
    } finally {
        previewing.value = false;
    }
}

async function runMerge() {
    if (!ensureTemplate()) return;
    if (selectedRecords.value.length === 0) {
        ElMessage.warning("数据源没有选中的记录");
        return;
    }

    merging.value = true;
    progress.current = 0;
    progress.total = selectedRecords.value.length;
    progress.failed = false;
    progress.text = "";
    logs.value = [];
    issues.value = [];

    const startTime = Date.now();
    appendLog("info", `开始合并 ${selectedRecords.value.length} 条记录`);

    try {
        const result = await mergeExcelRecords(
            {
                templatePath: template.value.path,
                records: selectedRecords.value,
                rowNumbers: selectedRowNumbers.value,
                outputDir: outputDir.value || dirOf(template.value.path),
                namePattern: namePattern.value,
                overwrite: overwrite.value,
                customFunctions: customDefinitions(),
            },
            {
                onItemStart(index, total, record) {
                    progress.current = index - 1;
                    progress.total = total;
                    progress.text = `正在处理第 ${index} / ${total} 条：${previewValue(record)}`;
                },
                onProgress(index, total, item) {
                    progress.current = index;
                    progress.total = total;
                    if (item.status === "error") {
                        progress.failed = true;
                        appendLog(
                            "error",
                            `第 ${item.rowNumber} 行失败：${item.error ?? "未知错误"}`,
                        );
                    } else if (item.status === "warning") {
                        appendLog(
                            "warning",
                            `第 ${item.rowNumber} 行完成（有告警）：${item.outputPath}`,
                        );
                    } else {
                        appendLog("success", `第 ${item.rowNumber} 行：${item.outputPath}`);
                    }
                },
            },
        );

        issues.value = [
            ...(records.value?.issues ?? []),
            ...result.templateIssues,
            ...result.results.flatMap((item) => item.report?.issues ?? []),
        ];

        for (const issue of result.templateIssues) {
            if (issue.level === "error") appendLog("error", `模板预检：${issue.message}`);
        }

        const modeLabel =
            result.mode === "group"
                ? "group 分组模式"
                : result.mode === "row"
                  ? "row 模式"
                  : "普通模式";
        progress.text = `完成（${modeLabel}）：成功 ${result.successCount}，有告警 ${result.warningCount}，失败 ${result.failCount}（${(
            (Date.now() - startTime) /
            1000
        ).toFixed(1)}s）`;
        progress.failed = result.failCount > 0;

        if (result.status === "success") ElMessage.success("全部记录合并完成");
        else if (result.status === "warning") ElMessage.warning("合并完成，但有告警");
        else ElMessage.error("部分记录合并失败，请查看日志");
    } catch (error) {
        progress.failed = true;
        ElMessage.error(`合并失败：${errorText(error)}`);
        appendLog("error", errorText(error));
    } finally {
        merging.value = false;
    }
}

function previewValue(record: MergeRecord): string {
    for (const [key, value] of Object.entries(record)) {
        if (key.startsWith("__zdoc")) continue;
        const text = formatCell(value);
        if (text) return `${key}=${text}`;
    }
    return "空记录";
}

function appendLog(level: LogItem["level"], text: string) {
    logs.value.push({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level,
        text,
    });
}

// ==================== 自定义函数 ====================

const customFunctions = ref<CustomFunctionForm[]>(loadCustomFunctions());
const editingName = ref("");
const isNewFunction = ref(true);
const functionForm = ref<CustomFunctionForm>({ name: "", body: defaultFunctionBody() });
const functionStatus = ref("");
const functionStatusOk = ref(false);
const testForm = ref({ value: "1234", args: '[3, "0"]' });
const testResult = ref("");
const testing = ref(false);

function loadCustomFunctions(): CustomFunctionForm[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (item): item is CustomFunctionForm =>
                    Boolean(item) &&
                    typeof (item as CustomFunctionForm).name === "string" &&
                    typeof (item as CustomFunctionForm).body === "string",
            )
            .map((item) => ({ name: item.name, body: item.body }));
    } catch {
        return [];
    }
}

function persistCustomFunctions() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customFunctions.value));
    } catch {
        ElMessage.warning("自定义函数保存失败：本地存储不可用");
    }
}

function customDefinitions(): CustomFormatterDefinition[] {
    return customFunctions.value.map((item) => ({ name: item.name, body: item.body }));
}

function defaultFunctionBody(): string {
    return [
        "const n = Number(value);",
        "return isNaN(n) ? String(value) : (n / 100).toFixed(2);",
    ].join("\n");
}

function startNewFunction() {
    editingName.value = "";
    isNewFunction.value = true;
    functionForm.value = { name: "", body: defaultFunctionBody() };
    functionStatus.value = "";
    testResult.value = "";
}

function editFunction(def: CustomFunctionForm) {
    editingName.value = def.name;
    isNewFunction.value = false;
    functionForm.value = { name: def.name, body: def.body };
    functionStatus.value = "";
    testResult.value = "";
}

function saveFunction() {
    const name = functionForm.value.name.trim();
    const body = functionForm.value.body.trim();

    const nameError = validateFormatterName(name);
    if (nameError) return setFunctionStatus(nameError, false);
    if (
        customFunctions.value.some(
            (item) =>
                item.name === name && (isNewFunction.value || item.name !== editingName.value),
        )
    ) {
        return setFunctionStatus("函数名已存在", false);
    }

    const { registry, errors } = createRegistry([{ name, body }]);
    if (errors.length > 0) return setFunctionStatus(errors[0].message, false);
    if (!registry.has(name)) return setFunctionStatus("函数注册失败", false);

    if (isNewFunction.value) {
        customFunctions.value.push({ name, body });
    } else {
        const index = customFunctions.value.findIndex((item) => item.name === name);
        if (index >= 0) customFunctions.value[index] = { name, body };
    }

    persistCustomFunctions();
    editingName.value = name;
    isNewFunction.value = false;
    setFunctionStatus("已保存", true);
    ElMessage.success(`函数 ${name} 已保存`);
}

function removeFunction() {
    const name = editingName.value;
    if (!name) return;
    customFunctions.value = customFunctions.value.filter((item) => item.name !== name);
    persistCustomFunctions();
    startNewFunction();
    setFunctionStatus("已删除", true);
}

function setFunctionStatus(message: string, ok: boolean) {
    functionStatus.value = message;
    functionStatusOk.value = ok;
}

async function runFunctionTest() {
    const compiled = compileCustomFormatter(functionForm.value.body);
    if (!compiled.ok) {
        setFunctionStatus(`语法错误：${compiled.error}`, false);
        testResult.value = "";
        return;
    }

    let value: unknown = testForm.value.value;
    try {
        value = JSON.parse(testForm.value.value);
    } catch {
        // 保留原字符串
    }

    let args: unknown[] = [];
    try {
        const parsed = JSON.parse(testForm.value.args || "[]");
        if (!Array.isArray(parsed)) throw new Error("参数必须是 JSON 数组");
        args = parsed;
    } catch (error) {
        setFunctionStatus(`参数错误：${errorText(error)}`, false);
        return;
    }

    testing.value = true;
    const warnings: string[] = [];
    try {
        const started = performance.now();
        const output = compiled.formatter(value, args as never[], {
            key: "试运行",
            warn: (message) => warnings.push(message),
            helpers: FORMATTER_HELPERS,
        });
        const elapsed = performance.now() - started;
        testResult.value = [
            `返回值：${JSON.stringify(output, null, 2)}`,
            `耗时：${elapsed.toFixed(2)} ms`,
            warnings.length ? `告警：\n${warnings.join("\n")}` : "",
        ]
            .filter(Boolean)
            .join("\n");
        setFunctionStatus("运行成功", true);
    } catch (error) {
        testResult.value = `运行失败：${errorText(error)}`;
        setFunctionStatus("运行失败", false);
    } finally {
        testing.value = false;
    }
}

// ==================== 常量 ====================

const variableExample = `{{姓名}}
{{部门.名称}}
{{this}}`;

const fieldExample = "{{字段名}}";
const columnExample = "{{列名}}";
const columnFormatExample = '{{列名 | "0.00"}}';
const thisExample = "{{this}}";

const pipelineExample = `{{金额 | "0.00"}}
{{序号 | padl(3, "0")}}
{{姓名 | width(3)}}
{{金额 | "0.00" | padr(10, " ")}}`;

const rowLoopExample = `{{#each row in:E..T cols:4 as:姓名,关系,单位,电话}}
{{#if @index == 1}}
| 姓名 | 关系 | 单位 | 电话 |
{{/if}}
| {{姓名}} | {{关系}} | {{单位}} | {{电话}} |
{{/each}}`;

const groupLoopExample = `{{#each group by:姓名 keep:true}}
{{#if @index == 1}}
姓名：{{@group.姓名}}（共 {{@count}} 行）
{{/if}}
{{@index}}. {{家人姓名}} — {{家人关系}} — {{家人工作单位}}
{{/each}}`;

const ifExample = `{{#if @index == 1}}
组标题只输出一次
{{/if}}`;

function close() {
    window.close();
}

onMounted(refreshTemplate);
</script>

<style scoped>
.merge-tabs {
    display: flex;
    flex-direction: column;
}

.merge-tabs :deep(.el-tabs__content) {
    flex: 1;
    min-height: 0;
    padding-top: 10px;
}

.merge-tabs :deep(.el-tab-pane) {
    height: 100%;
}

.excel-preview :deep(.el-table__cell) {
    font-size: 11px;
}

.function-body :deep(.el-textarea__inner) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.65;
}

.code-block {
    margin-top: 8px;
    border-radius: 8px;
    background: rgb(249 250 251);
    border: 1px solid rgb(241 245 249);
    padding: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    line-height: 1.7;
    white-space: pre-wrap;
    color: #374151;
}
</style>
