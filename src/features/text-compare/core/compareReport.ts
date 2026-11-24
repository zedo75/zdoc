import type { CompareResult, RenderSegment } from "@/features/text-compare/core/textCompare";

const CHANGE_TYPE_LABELS = {
    replace: "修改",
    insert: "新增",
    delete: "删除",
} as const;

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** 差异清单里只展示摘要，完整内容在左右两栏 */
function summarize(value: string, maxLength = 220): string {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
}

function renderSegments(segments: RenderSegment[], side: "old" | "new"): string {
    return segments
        .map((segment) => {
            if (segment.type === "equal") return escapeHtml(segment.text);
            if (segment.type === "anchor") return "";
            const tag = side === "old" ? "del" : "ins";
            return `<${tag}>${escapeHtml(segment.text)}</${tag}>`;
        })
        .join("");
}

function formatDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
        date.getHours(),
    )}:${pad(date.getMinutes())}`;
}

export interface CompareReportOptions {
    oldText: string;
    newText: string;
    result: CompareResult;
    cleanupLabel: string;
    generatedAt?: Date;
}

/** 生成一份可离线打开 / 打印的 HTML 对比报告 */
export function buildCompareReportHtml(options: CompareReportOptions): string {
    const { result } = options;
    const { stats } = result;
    const generatedAt = options.generatedAt ?? new Date();

    const groupsHtml = result.groups
        .map((group) => {
            const label = CHANGE_TYPE_LABELS[group.type];
            const body =
                group.type === "replace"
                    ? `<del>${escapeHtml(summarize(group.oldText))}</del><span class="arrow">→</span><ins>${escapeHtml(summarize(group.newText))}</ins>`
                    : group.type === "delete"
                      ? `<del>${escapeHtml(summarize(group.oldText))}</del>`
                      : `<ins>${escapeHtml(summarize(group.newText))}</ins>`;
            return `<li class="type-${group.type}"><span class="tag">${label}</span><span class="text">${body}</span><span class="line">原 ${group.oldLine} 行 / 新 ${group.newLine} 行</span></li>`;
        })
        .join("");

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>文本对比报告</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #f4f6fb; color: #1f2937; font: 14px/1.7 "Microsoft YaHei", "PingFang SC", sans-serif; }
  .page { max-width: 1180px; margin: 0 auto; }
  header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
  h1 { margin: 0; font-size: 22px; }
  .meta { color: #94a3b8; font-size: 12px; text-align: right; }
  .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
  .stat { background: #fff; border: 1px solid #e8ecf4; border-radius: 10px; padding: 12px; text-align: center; }
  .stat b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }
  .stat span { color: #64748b; font-size: 12px; }
  .green { color: #16a34a; } .red { color: #dc2626; } .amber { color: #d97706; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .column { background: #fff; border: 1px solid #e8ecf4; border-radius: 10px; overflow: hidden; }
  .column h2 { margin: 0; padding: 10px 14px; font-size: 13px; background: #fbfcfe; border-bottom: 1px solid #eef1f7; }
  .content { padding: 14px 16px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13.5px; line-height: 1.9; }
  del { color: #b91c1c; background: #fef2f2; text-decoration: line-through; }
  ins { color: #15803d; background: #ecfdf3; text-decoration: none; }
  .result { background: #fff; border: 1px solid #e8ecf4; border-radius: 10px; overflow: hidden; }
  .result h2 { margin: 0; padding: 10px 14px; font-size: 13px; background: #fbfcfe; border-bottom: 1px solid #eef1f7; }
  .result ul { list-style: none; margin: 0; padding: 6px; }
  .result li { display: flex; gap: 8px; align-items: flex-start; padding: 7px 8px; border-radius: 7px; }
  .result li:nth-child(even) { background: #fafbfe; }
  .tag { flex: 0 0 auto; font-size: 10px; line-height: 1; padding: 4px 5px; border-radius: 4px; }
  .type-delete .tag { color: #b91c1c; background: #fee2e2; }
  .type-insert .tag { color: #15803d; background: #dcfce7; }
  .type-replace .tag { color: #b45309; background: #fef3c7; }
  .text { flex: 1; min-width: 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
  .arrow { color: #94a3b8; padding: 0 3px; }
  .line { flex: 0 0 auto; color: #a8b3c4; font-size: 10px; }
  footer { margin-top: 14px; color: #a8b3c4; font-size: 11px; text-align: center; }
  @media print {
    body { background: #fff; padding: 12mm; }
    .stat, .column, .result { break-inside: avoid; }
    .result li { break-inside: avoid; }
  }
  @media (max-width: 760px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .columns { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <div>
      <h1>文本对比报告</h1>
      <div class="meta">${escapeHtml(options.cleanupLabel)} · 生成于 ${escapeHtml(formatDate(generatedAt))}</div>
    </div>
    <div class="meta">${escapeHtml(stats.rating)} · 相似度 ${stats.similarity.toFixed(2)}%</div>
  </header>

  <section class="stats">
    <div class="stat"><b class="green">${stats.insertedChars}</b><span>新增字符</span></div>
    <div class="stat"><b class="red">${stats.deletedChars}</b><span>删除字符</span></div>
    <div class="stat"><b class="amber">${stats.replaceCount}</b><span>修改处数</span></div>
    <div class="stat"><b>${stats.similarity.toFixed(2)}%</b><span>文档相似度</span></div>
    <div class="stat"><b>${escapeHtml(stats.rating)}</b><span>相似度评价</span></div>
  </section>

  <section class="columns">
    <div class="column">
      <h2>原始版本</h2>
      <div class="content">${renderSegments(result.oldSegments, "old")}</div>
    </div>
    <div class="column">
      <h2>修改版本</h2>
      <div class="content">${renderSegments(result.newSegments, "new")}</div>
    </div>
  </section>

  <section class="result">
    <h2>对比结果（共 ${stats.groupCount} 处）</h2>
    <ul>${groupsHtml || '<li><span class="text">两段文本完全一致，没有差异。</span></li>'}</ul>
  </section>

  <footer>由 zdoc 文本对比生成 · 报告内容仅保存在本机</footer>
</div>
</body>
</html>`;
}

/** 报告文件名：文本对比报告-20261119-0150.html */
export function buildCompareReportFileName(date: Date = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `文本对比报告-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
        date.getDate(),
    )}-${pad(date.getHours())}${pad(date.getMinutes())}.html`;
}
