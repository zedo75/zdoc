<!-- src/dialogs/MdTableDialog.vue -->
<template>
    <div class="md-table-dialog">
        <div class="toolbar">
            <span class="hint">在左侧输入 Markdown 表格，右侧实时预览</span>
            <button class="btn-ghost" @click="clearInput">清空</button>
            <button class="btn-primary" :disabled="!tableData || inserting" @click="insertTable">
                {{ inserting ? "插入中…" : "插入到光标位置" }}
            </button>
        </div>

        <div class="panes">
            <div class="pane">
                <div class="pane-header">Markdown 输入</div>
                <textarea
                    v-model="markdown"
                    placeholder="| 姓名 | 备注 |
|------|------|
| 张三 | 第一行<br>第二行 |
| 李四 | 正常 |"
                    spellcheck="false"
                ></textarea>
            </div>

            <div class="pane">
                <div class="pane-header">预览</div>
                <div class="preview" v-html="previewHtml"></div>
            </div>
        </div>

        <div class="status" :class="statusClass">{{ statusMsg }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

// ==================== 纯逻辑：Markdown 表格解析 ====================

interface TableData {
    header: string[];
    rows: string[][];
}

/** 匹配单元格内换行标记：<br>、<br/>、<br />（大小写不敏感） */
const BR_RE = /<br\s*\/?>/gi;

/**
 * Word 表格单元格内的换行符。
 * - '\v'（Chr(11)）＝ 手动换行（软回车，Shift+Enter），同一段落内换行
 * - '\r'（Chr(13)）＝ 段落标记，单元格内新起段落
 * 默认用 \v，如需新段落可改为 '\r'。
 */
const WORD_CELL_BREAK = "\v";

/** 从 Markdown 文本中提取第一个 GFM 管道表格 */
function parseMarkdownTable(src: string): TableData | null {
    const lines = src
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    let separatorIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^\|?[\s:]*[-–—]{2,}[\s:]*(\|[\s:]*[-–—]{2,}[\s:]*)*\|?$/.test(lines[i])) {
            separatorIndex = i;
            break;
        }
    }
    if (separatorIndex < 1) return null;

    const header = splitPipeRow(lines[separatorIndex - 1]);
    if (header.length === 0) return null;

    const rows: string[][] = [];
    for (let i = separatorIndex + 1; i < lines.length; i++) {
        const cells = splitPipeRow(lines[i]);
        if (cells.length === 0) continue;
        while (cells.length < header.length) cells.push("");
        rows.push(cells.slice(0, header.length));
    }

    return { header, rows };
}

function splitPipeRow(line: string): string[] {
    const trimmed = line.replace(/^\||\|$/g, "");
    return trimmed.split("|").map((c) => c.trim());
}

// ==================== 单元格内容转换 ====================

/**
 * 预览用：单元格文本 → HTML。
 * 先把 <br> 拆开，对其他片段做转义，再用真正的 <br> 连接，
 * 避免 <br> 被 escapeHtml 转成字面文本。
 */
function cellToHtml(text: string): string {
    return text.split(BR_RE).map(escapeHtml).join("<br>");
}

/**
 * Word 用：单元格文本 → 带换行符的纯文本。
 * 把 <br> 替换为 Word 可识别的 \v（或 \r），而不是字面写入 "<br>"。
 */
function cellToWordText(text: string): string {
    return text.replace(BR_RE, WORD_CELL_BREAK);
}

function escapeHtml(s: string): string {
    return s.replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c]!,
    );
}

// ==================== 组件状态 ====================
const markdown = ref(
    "| 姓名 | 年龄 | 城市 |\n|------|------|------|\n| 张三 | 28 | 北京 |\n| 李四 | 32 | 上海 |",
);
const statusMsg = ref("");
const statusClass = ref("");
const inserting = ref(false);

const tableData = computed(() => parseMarkdownTable(markdown.value));

const previewHtml = computed(() => {
    const data = tableData.value;
    if (!data) {
        return '<p class="empty-tip">暂未检测到有效的 Markdown 表格</p>';
    }

    let html = "<table><thead><tr>";
    for (const h of data.header) {
        html += `<th>${cellToHtml(h)}</th>`;
    }
    html += "</tr></thead><tbody>";
    for (const row of data.rows) {
        html += "<tr>";
        for (const cell of row) {
            html += `<td>${cellToHtml(cell)}</td>`;
        }
        html += "</tr>";
    }
    html += "</tbody></table>";
    return html;
});

function clearInput() {
    markdown.value = "";
    statusMsg.value = "";
    statusClass.value = "";
}

watch(markdown, () => {
    statusMsg.value = "";
    statusClass.value = "";
});

// ==================== COM 操作：插入表格 ====================

function getApplication(): any {
    if (typeof (window as any).Application !== "undefined") {
        return (window as any).Application;
    }
    if ((window as any).wps?.Application) {
        return (window as any).wps.Application;
    }
    if ((window as any).external?.Application) {
        return (window as any).external.Application;
    }
    return null;
}

async function insertTable() {
    const data = tableData.value;
    if (!data) return;

    inserting.value = true;
    statusMsg.value = "正在插入…";
    statusClass.value = "";

    try {
        const app = getApplication();
        if (!app) {
            throw new Error("无法访问 WPS Application，请确认运行在 zdoc 弹窗环境中");
        }

        const doc = app.ActiveDocument;
        const selection = doc.ActiveWindow.Selection;
        let range = selection.Range;

        if (range.Start !== range.End) {
            range = doc.Range(range.End, range.End);
        }

        const pos = range.Start;
        const docEnd = doc.Content.End;

        let needParagraphBefore = false;
        let needParagraphAfter = false;

        if (pos > 0) {
            const prevText = doc.Range(pos - 1, pos).Text;
            if (prevText && !/[\r\n\v]/.test(prevText)) {
                needParagraphBefore = true;
            }
        }

        if (pos < docEnd - 1) {
            const nextText = doc.Range(pos, pos + 1).Text;
            if (nextText && !/[\r\n\v]/.test(nextText)) {
                needParagraphAfter = true;
            }
        }

        const allRows = [data.header, ...data.rows];
        const rowCount = allRows.length;
        const colCount = data.header.length;

        if (needParagraphBefore) {
            range.InsertParagraphBefore();
        }

        const tableAnchor = doc.Range(range.Start, range.Start);
        const table = doc.Tables.Add(tableAnchor, rowCount, colCount);

        for (let r = 0; r < rowCount; r++) {
            for (let c = 0; c < colCount; c++) {
                const raw = allRows[r][c] ?? "";
                // 关键：<br> → \v（或 \r），不要把字面 "<br>" 写进 Word
                table.Cell(r + 1, c + 1).Range.Text = cellToWordText(raw);
            }
        }

        if (needParagraphAfter) {
            const after = doc.Range(table.Range.End, table.Range.End);
            after.InsertParagraphAfter();
        }

        statusMsg.value = `插入成功（${rowCount} 行 × ${colCount} 列）`;
        statusClass.value = "ok";
    } catch (err: any) {
        console.error("[MdTableDialog] insert failed", err);
        statusMsg.value = "插入失败：" + (err?.message ?? String(err));
        statusClass.value = "error";
    } finally {
        inserting.value = false;
    }
}
</script>

<style scoped>
/* 样式与上一版一致，略 */
.md-table-dialog {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 12px;
    gap: 10px;
    font-family: var(--zdoc-font, "Microsoft YaHei", sans-serif);
    background: var(--zdoc-bg, #f5f5f5);
    box-sizing: border-box;
}
.toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
}
.hint {
    font-size: 12px;
    color: #888;
    margin-right: auto;
}
button {
    padding: 7px 18px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition: opacity 0.15s;
}
button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.btn-ghost {
    background: #e5e7eb;
    color: #333;
}
.btn-primary {
    background: #2563eb;
    color: #fff;
}
.btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
}
.panes {
    flex: 1;
    display: flex;
    gap: 10px;
    min-height: 0;
}
.pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.pane-header {
    padding: 6px 10px;
    font-size: 12px;
    color: #666;
    background: #fafafa;
    border-bottom: 1px solid #eee;
}
textarea {
    flex: 1;
    border: none;
    outline: none;
    padding: 10px;
    font-family: "Consolas", "Courier New", monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: none;
}
.preview {
    flex: 1;
    overflow: auto;
    padding: 10px;
}
.preview :deep(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
}
.preview :deep(th),
.preview :deep(td) {
    border: 1px solid #ddd;
    padding: 6px 10px;
    text-align: left;
}
.preview :deep(th) {
    background: #f0f4ff;
    font-weight: 600;
}
.preview :deep(.empty-tip) {
    color: #aaa;
    font-size: 13px;
}
.status {
    min-height: 18px;
    font-size: 12px;
    color: #888;
}
.status.ok {
    color: #16a34a;
}
.status.error {
    color: #dc2626;
}
</style>
