import type { RenderTemplateOptions } from "./template";
import type {
    MergeIssue,
    RowLoop,
    RowLoopScanResult,
    RowMarkerToken,
    TableRowRenderResult,
    TemplateRenderResult,
} from "./types";

import { parseTemplate, renderTemplateNodes, resolvePath } from "./template";

const ROW_MARKER_RE = /\{\{\s*([#/]each)\b\s*([^}]*?)\s*\}\}/g;

/**
 * 扫描表格行里的 `{{#each}}` / `{{/each}}` 标记。
 *
 * 起止标记在同一单元格内时标记为 inline，交由单元格内联模板渲染器处理，
 * 这样一行里可以安全地写多个行内循环，不会触发整行复制。
 */
export function findRowLoops(rows: readonly string[][]): RowLoopScanResult {
    const issues: MergeIssue[] = [];
    const tokens: RowMarkerToken[] = [];

    rows.forEach((cells, rowIndex) => {
        cells.forEach((cell, cellIndex) => {
            ROW_MARKER_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = ROW_MARKER_RE.exec(cell)) !== null) {
                const raw = match[0];
                const isStart = match[1] === "#each";
                tokens.push({
                    kind: isStart ? "start" : "end",
                    key: isStart ? match[2].trim() : "",
                    rowIndex,
                    cellIndex,
                    offset: match.index,
                    length: raw.length,
                    raw,
                });
            }
        });
    });

    interface Frame {
        token: RowMarkerToken;
        depth: number;
    }

    const stack: Frame[] = [];
    const loops: RowLoop[] = [];

    for (const token of tokens) {
        if (token.kind === "start") {
            if (!token.key) {
                issues.push({
                    level: "error",
                    code: "INVALID_EACH_KEY",
                    message: `循环标记「${token.raw}」缺少数据键`,
                    templateRow: token.rowIndex + 1,
                });
            }
            stack.push({ token, depth: stack.length });
            continue;
        }

        const frame = stack.pop();
        if (!frame) {
            issues.push({
                level: "error",
                code: "UNEXPECTED_EACH_END",
                message: `循环结束标记「${token.raw}」没有对应的开始标记`,
                templateRow: token.rowIndex + 1,
            });
            continue;
        }

        if (frame.token.key !== "" && token.key !== "" && frame.token.key !== token.key) {
            issues.push({
                level: "error",
                code: "EACH_KEY_MISMATCH",
                message: `循环开始「${frame.token.key}」与结束标记不匹配`,
                key: frame.token.key,
                templateRow: token.rowIndex + 1,
            });
        }

        const inline =
            frame.token.rowIndex === token.rowIndex && frame.token.cellIndex === token.cellIndex;

        if (!inline) {
            loops.push({
                key: frame.token.key || token.key,
                start: frame.token,
                end: token,
                inline: false,
                depth: frame.depth,
            });
        }
    }

    for (const frame of stack) {
        issues.push({
            level: "error",
            code: "UNCLOSED_EACH",
            message: `循环「${frame.token.key}」未闭合（缺少 {{/each}}）`,
            key: frame.token.key,
            templateRow: frame.token.rowIndex + 1,
        });
    }

    return { loops, issues };
}

/** 只取最外层、需要复制表格行的循环 */
export function findTopLevelRowLoops(rows: readonly string[][]): RowLoop[] {
    return findRowLoops(rows).loops.filter((loop) => loop.depth === 0);
}

/**
 * 去掉指定循环的起止标记，返回新的行副本。
 *
 * 同一单元格可能同时含开始与结束标记，按偏移从大到小删除，避免位置漂移。
 */
export function stripRowLoopMarkers(
    rows: readonly string[][],
    loop: RowLoop,
    rowOffset = 0,
): string[][] {
    const copy = rows.map((cells) => [...cells]);
    const removals = [loop.start, loop.end]
        .map((token) => ({ ...token, rowIndex: token.rowIndex - rowOffset }))
        .sort((a, b) => {
            if (a.rowIndex !== b.rowIndex) return b.rowIndex - a.rowIndex;
            if (a.cellIndex !== b.cellIndex) return b.cellIndex - a.cellIndex;
            return b.offset - a.offset;
        });

    for (const token of removals) {
        const cell = copy[token.rowIndex]?.[token.cellIndex];
        if (cell == null) continue;
        copy[token.rowIndex][token.cellIndex] =
            cell.slice(0, token.offset) + cell.slice(token.offset + token.length);
    }

    // 仅由标记构成的“标记行”删除；标记行里还有别的内容时保留。
    const markerRows = new Set([loop.start.rowIndex - rowOffset, loop.end.rowIndex - rowOffset]);
    return copy.filter(
        (cells, index) => !markerRows.has(index) || cells.some((cell) => cell.trim() !== ""),
    );
}

export interface ExpandTableRowsOptions extends RenderTemplateOptions {
    /** 最多展开多少行，防御异常数据导致文档爆炸 */
    maxRows?: number;
}

/**
 * 纯逻辑的表格模板展开，用于预览与单测。
 *
 * 文档层使用同样的行循环扫描规则，但把“插入行 / 复制 FormattedText”换成真实 COM 操作。
 */
export function expandTableRows(
    templateRows: readonly string[][],
    data: unknown,
    options: ExpandTableRowsOptions = {},
): TableRowRenderResult {
    const issues: MergeIssue[] = [];
    const maxRows = options.maxRows ?? 10000;

    const expandRows = (rows: string[][], context: unknown): string[][] => {
        const scan = findRowLoops(rows);
        issues.push(...scan.issues);
        if (scan.issues.some((issue) => issue.level === "error")) return rows;

        const topLevel = scan.loops.filter((loop) => loop.depth === 0);
        if (topLevel.length === 0) {
            return rows.map((cells, index) =>
                renderRowCells(cells, context, options, issues, index),
            );
        }

        const covered = new Set<number>();
        for (const loop of topLevel) {
            for (let i = loop.start.rowIndex; i <= loop.end.rowIndex; i++) covered.add(i);
        }

        let result = rows.map((cells, index) => {
            if (covered.has(index)) return [...cells];
            return renderRowCells(cells, context, options, issues, index);
        });

        for (const loop of [...topLevel].sort((a, b) => b.start.rowIndex - a.start.rowIndex)) {
            const start = loop.start.rowIndex;
            const end = loop.end.rowIndex;
            const body = stripRowLoopMarkers(result.slice(start, end + 1), loop, start);
            const value = resolvePath(context, loop.key, [], start + 1, false);

            if (!Array.isArray(value) || value.length === 0) {
                if (!Array.isArray(value)) {
                    issues.push({
                        level: "warn",
                        code: "EACH_NOT_ARRAY",
                        message: `循环「${loop.key}」不是数组，按空数组处理`,
                        key: loop.key,
                        templateRow: start + 1,
                    });
                }
                result.splice(start, end - start + 1);
                continue;
            }

            const cloned: string[][] = [];
            for (const item of value) {
                // 只传当前项，内层不会回退到外层同名键
                const next = expandRows(
                    body.map((cells) => [...cells]),
                    item,
                );
                cloned.push(...next);
                if (cloned.length > maxRows) {
                    issues.push({
                        level: "error",
                        code: "TOO_MANY_ROWS",
                        message: `合并结果超过 ${maxRows} 行，已停止展开`,
                    });
                    return rows;
                }
            }
            result.splice(start, end - start + 1, ...cloned);
        }

        return result;
    };

    const rows = expandRows(
        templateRows.map((cells) => [...cells]),
        data,
    );

    return { rows, issues };
}

/** 渲染一行的所有单元格（支持单元格内联 each） */
export function renderRowCells(
    cells: readonly string[],
    context: unknown,
    options: RenderTemplateOptions,
    issues: MergeIssue[],
    templateRow: number,
): string[] {
    return cells.map((cell) => {
        const result = renderCellTemplate(cell, context, options, templateRow);
        issues.push(...result.issues);
        return result.text;
    });
}

/** 单元格级模板渲染；只产生文本，格式指令由文档层另行处理 */
export function renderCellTemplate(
    cell: string,
    context: unknown,
    options: RenderTemplateOptions = {},
    templateRow?: number,
): TemplateRenderResult {
    const parsed = parseTemplate(cell);
    const rendered = renderTemplateNodes(parsed.nodes, context, {
        ...options,
        templateRow,
    });
    return {
        text: rendered.text,
        ops: rendered.ops,
        issues: [...parsed.issues, ...rendered.issues],
    };
}

/** 生成适合 UI 文本预览的表格文本 */
export function formatRowsAsText(rows: readonly string[][]): string {
    return rows.map((cells) => cells.join("\t")).join("\n");
}
