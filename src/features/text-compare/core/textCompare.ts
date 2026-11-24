/**
 * 文本对比核心：把两段文本转换为「差异块 + 双侧渲染片段 + 统计信息」。
 *
 * - 差异算法：diff-match-patch（字符级），可选语义优化 / 效率优化 / 原始输出
 * - 输出面向 UI：左右两侧各自带 `data-diff-id` 的片段，便于联动定位
 * - 纯函数、无 DOM 依赖，方便单元测试
 */
import type { Diff } from "diff-match-patch-es";

import {
    diff,
    diffCleanupEfficiency,
    diffCleanupSemantic,
    diffPrettyHtml,
} from "diff-match-patch-es";

/** 差异清理模式，与旧版界面“对比模式”一一对应 */
export type CleanupMode = "semantic" | "efficiency" | "none";

/** 一个差异块的类型 */
export type ChangeType = "insert" | "delete" | "replace";

/** 左右两侧的渲染片段 */
export type RenderSegment =
    | { type: "equal"; text: string }
    | { type: "delete"; text: string; groupId: number }
    | { type: "insert"; text: string; groupId: number }
    | { type: "anchor"; text: ""; groupId: number };

/** 差异块：对应结果面板里的一条记录 */
export interface DiffGroup {
    id: number;
    type: ChangeType;
    /** 旧文本中的字符区间 [oldStart, oldEnd) */
    oldStart: number;
    oldEnd: number;
    /** 新文本中的字符区间 [newStart, newEnd) */
    newStart: number;
    newEnd: number;
    oldText: string;
    newText: string;
    /** 起始位置所在行号（1-based），便于结果面板展示 */
    oldLine: number;
    newLine: number;
}

export interface CompareStats {
    /** 新增字符数（不计空白字符） */
    insertedChars: number;
    /** 删除字符数（不计空白字符） */
    deletedChars: number;
    /** 修改处数（既有删除又有新增的差异块） */
    replaceCount: number;
    insertCount: number;
    deleteCount: number;
    /** 差异块总数 */
    groupCount: number;
    /** 相似度百分比 0–100，保留两位小数 */
    similarity: number;
    /** 相似度评价文案 */
    rating: string;
    oldLength: number;
    newLength: number;
    /** 对比耗时（ms） */
    duration: number;
    identical: boolean;
}

export interface CompareResult {
    groups: DiffGroup[];
    oldSegments: RenderSegment[];
    newSegments: RenderSegment[];
    /** 旧版合并视图：整段文本里同时标注删除与新增，供「对比结果」面板默认展示 */
    mergedHtml: string;
    stats: CompareStats;
}

export interface TextCompareOptions {
    cleanupMode?: CleanupMode;
    editCost?: number;
}

export interface ClauseRow {
    id: number;
    type: "equal" | "replace" | "insert" | "delete";
    oldText: string;
    newText: string;
    /** 旧文本中的段落序号（1-based，跳过空行） */
    oldNo: number | null;
    newNo: number | null;
}

/* -------------------------------------------------------------------------- */
/*                                  文本处理                                   */
/* -------------------------------------------------------------------------- */

/** 把 WPS 的段落标记 / Windows 换行统一成 \n，便于展示与定位 */
export function normalizeDocumentText(text: string): string {
    return text.replace(/\r\n?/g, "\n").replace(/[\u0000\u0007]/g, "");
}

/** 仅统计可见字符（去掉空格、换行等），用于“新增/删除字符”统计 */
function visibleLength(text: string): number {
    let count = 0;
    for (const char of text) {
        if (!/\s/u.test(char)) count++;
    }
    return count;
}

function buildLineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) starts.push(i + 1);
    }
    return starts;
}

/** offset 所在行号（1-based） */
function lineAt(starts: number[], offset: number): number {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (starts[mid] <= offset) low = mid;
        else high = mid - 1;
    }
    return low + 1;
}

/** 计算相似度并给出评价 */
export function similarityRating(similarity: number, hasText: boolean, identical: boolean): string {
    if (!hasText) return "暂无文本";
    if (identical) return "完全一致";
    if (similarity >= 90) return "高度相似";
    if (similarity >= 70) return "较为相似";
    if (similarity >= 50) return "存在差异";
    if (similarity >= 20) return "差异较大";
    return "差异很大";
}

/* -------------------------------------------------------------------------- */
/*                                  差异计算                                   */
/* -------------------------------------------------------------------------- */

function buildDiffs(
    oldText: string,
    newText: string,
    options: Required<TextCompareOptions>,
): Diff[] {
    const diffs = diff(oldText, newText);
    if (diffs.length > 1) {
        if (options.cleanupMode === "semantic") {
            diffCleanupSemantic(diffs);
        } else if (options.cleanupMode === "efficiency") {
            diffCleanupEfficiency(diffs, { diffEditCost: options.editCost });
        }
    }
    // 清理后理论上不会出现空片段；兜底过滤，避免生成空差异块
    return diffs.filter(([, text]) => text.length > 0);
}

function pushEqual(segments: RenderSegment[], text: string): void {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.type === "equal") {
        last.text += text;
        return;
    }
    segments.push({ type: "equal", text });
}

/**
 * 计算完整对比结果。
 *
 * 同一个差异块在左右两侧都会有一个带相同 groupId 的定位元素：
 * - 有内容的一侧是 delete / insert 片段
 * - 没有内容的一侧是零宽的 anchor（保证“新增”也能在原文侧定位）
 */
export function computeTextCompare(
    oldText: string,
    newText: string,
    options: TextCompareOptions = {},
): CompareResult {
    const startedAt = performance.now();
    const resolved: Required<TextCompareOptions> = {
        cleanupMode: options.cleanupMode ?? "semantic",
        editCost: options.editCost ?? 4,
    };

    const diffs = buildDiffs(oldText, newText, resolved);
    // 复用旧版 diffPrettyHtml 的渲染结果，保证「对比结果」里的增删同屏视图和之前一致
    const mergedHtml = diffPrettyHtml(diffs);
    const oldLineStarts = buildLineStarts(oldText);
    const newLineStarts = buildLineStarts(newText);

    const groups: DiffGroup[] = [];
    const oldSegments: RenderSegment[] = [];
    const newSegments: RenderSegment[] = [];

    let oldPos = 0;
    let newPos = 0;
    let blockOldStart = 0;
    let blockNewStart = 0;
    let blockOld = "";
    let blockNew = "";
    let inBlock = false;

    const flush = () => {
        if (!inBlock) return;
        inBlock = false;

        const id = groups.length;
        const oldTextPart = blockOld;
        const newTextPart = blockNew;
        const type: ChangeType =
            oldTextPart && newTextPart ? "replace" : oldTextPart ? "delete" : "insert";

        groups.push({
            id,
            type,
            oldStart: blockOldStart,
            oldEnd: blockOldStart + oldTextPart.length,
            newStart: blockNewStart,
            newEnd: blockNewStart + newTextPart.length,
            oldText: oldTextPart,
            newText: newTextPart,
            oldLine: lineAt(oldLineStarts, blockOldStart),
            newLine: lineAt(newLineStarts, blockNewStart),
        });

        if (oldTextPart) {
            oldSegments.push({ type: "delete", text: oldTextPart, groupId: id });
        } else {
            oldSegments.push({ type: "anchor", text: "", groupId: id });
        }

        if (newTextPart) {
            newSegments.push({ type: "insert", text: newTextPart, groupId: id });
        } else {
            newSegments.push({ type: "anchor", text: "", groupId: id });
        }

        blockOld = "";
        blockNew = "";
    };

    for (const [operation, text] of diffs) {
        if (operation === 0) {
            flush();
            pushEqual(oldSegments, text);
            pushEqual(newSegments, text);
            oldPos += text.length;
            newPos += text.length;
            continue;
        }

        if (!inBlock) {
            inBlock = true;
            blockOldStart = oldPos;
            blockNewStart = newPos;
        }

        if (operation === -1) {
            blockOld += text;
            oldPos += text.length;
        } else {
            blockNew += text;
            newPos += text.length;
        }
    }
    flush();

    // 兜底：极端情况下（diff 返回空数组）仍保证文本能完整展示
    if (!diffs.length) {
        pushEqual(oldSegments, oldText);
        pushEqual(newSegments, newText);
    }

    let insertedChars = 0;
    let deletedChars = 0;
    let replaceCount = 0;
    let insertCount = 0;
    let deleteCount = 0;
    /** 类似 Levenshtein 的编辑代价：替换按较长一侧计一次 */
    let editCost = 0;

    for (const group of groups) {
        deletedChars += visibleLength(group.oldText);
        insertedChars += visibleLength(group.newText);
        if (group.type === "replace") {
            replaceCount++;
            editCost += Math.max(group.oldText.length, group.newText.length);
        } else if (group.type === "insert") {
            insertCount++;
            editCost += group.newText.length;
        } else {
            deleteCount++;
            editCost += group.oldText.length;
        }
    }

    const hasText = oldText.length > 0 || newText.length > 0;
    const identical = hasText && oldText === newText;
    const maxLength = Math.max(oldText.length, newText.length);
    const rawSimilarity = !hasText ? 100 : maxLength === 0 ? 100 : (1 - editCost / maxLength) * 100;
    const similarity = Math.round(Math.max(0, Math.min(100, rawSimilarity)) * 100) / 100;

    const stats: CompareStats = {
        insertedChars,
        deletedChars,
        replaceCount,
        insertCount,
        deleteCount,
        groupCount: groups.length,
        similarity,
        rating: similarityRating(similarity, hasText, identical),
        oldLength: oldText.length,
        newLength: newText.length,
        duration: performance.now() - startedAt,
        identical,
    };

    return { groups, oldSegments, newSegments, mergedHtml, stats };
}

/* -------------------------------------------------------------------------- */
/*                              条款 / 段落视图                                */
/* -------------------------------------------------------------------------- */

type SequenceOp =
    | { type: "equal"; oldIndex: number; newIndex: number }
    | { type: "delete"; oldIndex: number }
    | { type: "insert"; newIndex: number };

/**
 * Myers 数组差异（O((N+M)D)），用于段落级对齐。
 * 段落数量通常远小于字符数，比逐字符对比更适合“条款视图”。
 */
function diffSequences(a: string[], b: string[]): SequenceOp[] {
    const n = a.length;
    const m = b.length;
    if (n === 0) return b.map((_, index) => ({ type: "insert", newIndex: index }));
    if (m === 0) return a.map((_, index) => ({ type: "delete", oldIndex: index }));

    const max = n + m;
    const offset = max;
    const size = 2 * max + 2;
    const v = new Int32Array(size).fill(-1);
    v[offset + 1] = 0;

    const trace: Int32Array[] = [];
    let foundD = -1;

    for (let d = 0; d <= max; d++) {
        trace.push(v.slice());
        for (let k = -d; k <= d; k += 2) {
            const index = offset + k;
            let x: number;
            if (k === -d || (k !== d && v[index - 1] < v[index + 1])) {
                x = v[index + 1];
            } else {
                x = v[index - 1] + 1;
            }
            let y = x - k;
            while (x < n && y < m && a[x] === b[y]) {
                x++;
                y++;
            }
            v[index] = x;
            if (x >= n && y >= m) {
                foundD = d;
                break;
            }
        }
        if (foundD >= 0) break;
    }

    const ops: SequenceOp[] = [];
    let x = n;
    let y = m;

    for (let d = foundD; d > 0; d--) {
        const snapshot = trace[d];
        const k = x - y;
        const index = offset + k;
        const prevK =
            k === -d || (k !== d && snapshot[index - 1] < snapshot[index + 1]) ? k + 1 : k - 1;
        const prevX = snapshot[offset + prevK];
        const prevY = prevX - prevK;

        while (x > prevX && y > prevY) {
            ops.push({ type: "equal", oldIndex: x - 1, newIndex: y - 1 });
            x--;
            y--;
        }

        if (x === prevX) {
            ops.push({ type: "insert", newIndex: y - 1 });
            y--;
        } else {
            ops.push({ type: "delete", oldIndex: x - 1 });
            x--;
        }
    }

    while (x > 0 && y > 0) {
        ops.push({ type: "equal", oldIndex: x - 1, newIndex: y - 1 });
        x--;
        y--;
    }
    while (x > 0) ops.push({ type: "delete", oldIndex: --x });
    while (y > 0) ops.push({ type: "insert", newIndex: --y });

    return ops.reverse();
}

/** 按换行切分条款，忽略空行 */
export function splitClauses(text: string): string[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

/**
 * 生成条款视图的行：相同段落对齐，连续新增/删除块按顺序配对为“修改”。
 */
export function buildClauseRows(oldText: string, newText: string): ClauseRow[] {
    const oldClauses = splitClauses(oldText);
    const newClauses = splitClauses(newText);
    const operations = diffSequences(oldClauses, newClauses);

    const rows: ClauseRow[] = [];
    let index = 0;

    while (index < operations.length) {
        const operation = operations[index];
        if (operation.type === "equal") {
            rows.push({
                id: rows.length,
                type: "equal",
                oldText: oldClauses[operation.oldIndex] ?? "",
                newText: newClauses[operation.newIndex] ?? "",
                oldNo: operation.oldIndex + 1,
                newNo: operation.newIndex + 1,
            });
            index++;
            continue;
        }

        const deleted: number[] = [];
        const inserted: number[] = [];
        while (index < operations.length && operations[index].type !== "equal") {
            const current = operations[index];
            if (current.type === "delete") deleted.push(current.oldIndex);
            else inserted.push(current.newIndex);
            index++;
        }

        const pairCount = Math.max(deleted.length, inserted.length);
        for (let i = 0; i < pairCount; i++) {
            const oldIndex = deleted[i];
            const newIndex = inserted[i];
            const hasOld = oldIndex !== undefined;
            const hasNew = newIndex !== undefined;
            rows.push({
                id: rows.length,
                type: hasOld && hasNew ? "replace" : hasOld ? "delete" : "insert",
                oldText: hasOld ? (oldClauses[oldIndex] ?? "") : "",
                newText: hasNew ? (newClauses[newIndex] ?? "") : "",
                oldNo: hasOld ? oldIndex + 1 : null,
                newNo: hasNew ? newIndex + 1 : null,
            });
        }
    }

    return rows;
}
