import type { ExpressionScope } from "./expression";
import type { FormatterRegistry } from "./formatters";
import type { MergeRecord } from "./spreadsheet";
import type { MergeIssue } from "./types";

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";

import { evaluateExpression } from "./expression";
import { createRegistry, toText } from "./formatters";
import { applyPipes, parsePlaceholderContent } from "./pipeline";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

type XmlNode = any;
type XmlElement = any;
type XmlDocument = any;

// ==================== 对外类型 ====================

export type DocxLoopMode = "row" | "group" | "none";

export interface DocxRenderOptions {
    /** 自定义格式化器 */
    customFunctions?: ReadonlyArray<{ name: string; body: string }>;
    /** 用于变量替换的根作用域；默认取 records[0] */
    rootRecord?: MergeRecord;
    /** group 模式：只渲染第 N 组（0 基），用于“一组一个文件” */
    groupIndex?: number;
}

export interface DocxRenderResult {
    bytes: Uint8Array;
    issues: MergeIssue[];
    mode: DocxLoopMode;
}

export interface DocxTemplateInfo {
    mode: DocxLoopMode;
    issues: MergeIssue[];
    /** group 模式的分组列 */
    groupBy?: string;
    /** group 模式 keep:true */
    groupKeep?: boolean;
}

interface RenderState {
    issues: MergeIssue[];
    registry: FormatterRegistry;
    widthWarned: boolean;
    /** group 模式只渲染指定组（0 基） */
    groupIndex?: number;
}

interface ParagraphText {
    text: string;
    refs: TextRef[];
}

interface TextRef {
    node: XmlElement;
    start: number;
    end: number;
    text: string;
}

interface Iteration {
    scope: ExpressionScope;
}

interface RowLoopSpec {
    mode: "row";
    startCol: number;
    endCol: number;
    cols: number;
    aliases: string[];
}

interface GroupLoopSpec {
    mode: "group";
    by: string;
    keep: boolean;
}

type EachSpec = RowLoopSpec | GroupLoopSpec;

export interface MergeGroup {
    key: string;
    rows: MergeRecord[];
    /** 组首行在传入 records 中的下标（0 基） */
    startIndex: number;
}

/**
 * 纯分组函数：供批量流程与 UI 预估文件数使用。
 * 与 docx 渲染使用同一套 keep 语义，避免“预览是一个文件、合并是另一个文件”。
 */
export function groupMergeRecords(
    records: readonly MergeRecord[],
    by: string,
    keep: boolean,
): MergeGroup[] {
    const groups: MergeGroup[] = [];
    let current: MergeGroup | null = null;

    records.forEach((record, index) => {
        const key = toText(record[by]).trim();
        if (key === "" && keep && current) {
            current.rows.push(record);
            return;
        }
        if (!current || current.key !== key) {
            current = { key, rows: [], startIndex: index };
            groups.push(current);
        }
        current.rows.push(record);
    });

    return groups;
}

interface EachMarker {
    node: XmlElement;
    raw: string;
    spec: EachSpec;
}

interface EachBlock {
    start: EachMarker;
    end: EachMarker;
    body: XmlNode[];
}

// ==================== 入口 ====================

/**
 * 把模板 DOCX 与数据记录合并，返回新的 DOCX 二进制。
 *
 * 模板必须先是 .docx；.doc / .wps 由 WPS 先另存为 DOCX。
 */
export async function renderDocx(
    template: ArrayBuffer | Uint8Array,
    records: readonly MergeRecord[],
    options: DocxRenderOptions = {},
): Promise<DocxRenderResult> {
    const zip = await JSZip.loadAsync(template);
    const docFile = zip.file("word/document.xml");
    if (!docFile) throw new Error("不是有效的 DOCX：缺少 word/document.xml");

    const created = createRegistry(options.customFunctions ?? []);
    const state: RenderState = {
        issues: [],
        registry: created.registry,
        widthWarned: false,
        groupIndex: options.groupIndex,
    };
    for (const error of created.errors) {
        state.issues.push({
            level: "warn",
            code: "CUSTOM_FORMATTER_ERROR",
            message: `自定义函数「${error.name}」注册失败：${error.message}`,
            key: error.name,
        });
    }
    const rootRecord = options.rootRecord ?? records[0] ?? (Object.create(null) as MergeRecord);
    const rootScope = makeRootScope(rootRecord);
    const documentXml = await docFile.async("string");
    const rendered = renderDocumentXml(documentXml, records, {
        state,
        rootScope,
    });
    zip.file("word/document.xml", rendered.xml);

    // 页眉 / 页脚 / 脚注 / 尾注：只替换普通变量与 #if，不展开 each
    for (const fileName of Object.keys(zip.files)) {
        if (
            !/^word\/(header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(fileName) ||
            fileName === "word/document.xml"
        ) {
            continue;
        }
        const file = zip.file(fileName);
        if (!file) continue;
        try {
            const xml = await file.async("string");
            const part = renderDocumentXml(xml, records, {
                state,
                rootScope,
                allowLoops: false,
            });
            zip.file(fileName, part.xml);
        } catch (error) {
            state.issues.push({
                level: "warn",
                code: "PART_RENDER_FAILED",
                message: `处理 ${fileName} 失败：${errorText(error)}`,
            });
        }
    }

    const bytes = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
    });

    return {
        bytes,
        issues: state.issues,
        mode: analyzeDocumentXml(documentXml).mode,
    };
}

/** 分析模板循环模式，供批量流程决定“每行一个文件”还是“一次合并” */
export async function analyzeDocxTemplate(
    template: ArrayBuffer | Uint8Array,
): Promise<DocxTemplateInfo> {
    const zip = await JSZip.loadAsync(template);
    const file = zip.file("word/document.xml");
    if (!file) throw new Error("不是有效的 DOCX：缺少 word/document.xml");
    return analyzeDocumentXml(await file.async("string"));
}

/**
 * 纯 XML 渲染入口（测试 / 调试用）。
 */
export function renderDocumentXml(
    xml: string,
    records: readonly MergeRecord[],
    options: {
        state?: RenderState;
        rootScope?: ExpressionScope;
        allowLoops?: boolean;
        groupIndex?: number;
    } = {},
): { xml: string; issues: MergeIssue[]; mode: DocxLoopMode } {
    const doc = parseXml(xml);
    const body = findBody(doc);
    if (!body) throw new Error("DOCX XML 缺少 w:body");

    const state =
        options.state ??
        ({
            issues: [],
            registry: createRegistry().registry,
            widthWarned: false,
            groupIndex: options.groupIndex,
        } satisfies RenderState);
    const rootRecord = records[0] ?? (Object.create(null) as MergeRecord);
    const rootScope = options.rootScope ?? makeRootScope(rootRecord);
    const info = analyzeDocumentXml(xml);
    state.issues.push(...info.issues);

    if (options.allowLoops !== false && info.issues.every((issue) => issue.level !== "error")) {
        processLoops(body, records, state);
    }

    renderAllParagraphs(body, rootScope, state);
    const serialized = new XMLSerializer().serializeToString(doc);
    return { xml: serialized, issues: state.issues, mode: info.mode };
}

/** 只分析循环模式与结构错误，不做渲染 */
export function analyzeDocumentXml(xml: string): DocxTemplateInfo {
    const issues: MergeIssue[] = [];
    let doc: XmlDocument;
    try {
        doc = parseXml(xml);
    } catch (error) {
        return {
            mode: "none",
            issues: [
                {
                    level: "error",
                    code: "INVALID_DOCX_XML",
                    message: `无法解析 DOCX XML：${errorText(error)}`,
                },
            ],
        };
    }

    const body = findBody(doc);
    if (!body) {
        return {
            mode: "none",
            issues: [
                {
                    level: "error",
                    code: "INVALID_DOCX_XML",
                    message: "DOCX XML 缺少 w:body",
                },
            ],
        };
    }

    // 循环标记不允许出现在任何表格单元格里
    for (const cell of allW(body, "tc")) {
        const text = textOf(cell);
        if (/\{\{\s*[#/]\s*each\b/.test(text)) {
            issues.push({
                level: "error",
                code: "each-crosses-table",
                message: "{{#each}} / {{/each}} 不能位于表格单元格内，必须放在表格外的独立段落中",
            });
        }
    }

    const scanState: RenderState = {
        issues: [],
        registry: createRegistry().registry,
        widthWarned: false,
    };
    const loops = collectLoops(body, scanState);
    issues.push(...scanState.issues);
    const specs = loops.map((loop) => loop.start.spec);

    for (const loop of loops) {
        validateEachSpec(loop.start.spec, issues);
        const table = loop.body.find((node) => isW(node, "tbl"));
        if (table) validateTemplateRows(table, issues);
    }

    const modes = new Set(specs.map((spec) => spec.mode));
    if (modes.size > 1) {
        issues.push({
            level: "error",
            code: "mixed-each-modes",
            message: "同一文档暂不支持混用 row 与 group 两种循环模式",
        });
    }
    const groupSpec = specs.find((spec): spec is GroupLoopSpec => spec.mode === "group");

    return {
        mode: modes.has("row") ? "row" : modes.has("group") ? "group" : "none",
        issues,
        groupBy: groupSpec?.by,
        groupKeep: groupSpec?.keep,
    };
}

function validateEachSpec(spec: EachSpec, issues: MergeIssue[]): void {
    if (spec.mode !== "row") return;
    const width = spec.endCol - spec.startCol + 1;
    if (width <= 0 || spec.cols <= 0 || width % spec.cols !== 0) {
        issues.push({
            level: "error",
            code: "row-column-range-error",
            message: `列区间 ${columnName(spec.startCol)}..${columnName(spec.endCol)} 的宽度 ${width} 不能被 cols:${spec.cols} 整除`,
        });
    }
    if (spec.aliases.length > 0 && spec.aliases.length !== spec.cols) {
        issues.push({
            level: "error",
            code: "row-column-range-error",
            message: `as: 提供了 ${spec.aliases.length} 个别名，但 cols:${spec.cols} 需要 ${spec.cols} 个`,
        });
    }
}

function validateTemplateRows(table: XmlElement, issues: MergeIssue[]): void {
    const rows = elementChildren(table).filter((node: XmlNode) => isW(node, "tr"));
    const flags = rows.map((row: XmlNode) => textOf(row).includes("{{"));
    const first = flags.indexOf(true);
    const last = flags.lastIndexOf(true);
    if (first < 0) return;
    for (let i = first; i <= last; i++) {
        if (!flags[i]) {
            issues.push({
                level: "error",
                code: "template-rows-not-contiguous",
                message: "表格中的模板行必须连续：静态行不能夹在模板行之间",
            });
            return;
        }
    }
}

// ==================== 循环执行 ====================

function processLoops(body: XmlElement, records: readonly MergeRecord[], state: RenderState): void {
    // 先收集，后从后往前替换，避免节点引用被前面的插入打乱
    const loops = collectLoops(body, state);
    if (state.issues.some((issue) => issue.level === "error")) return;

    for (const loop of [...loops].reverse()) {
        const contexts = buildIterations(loop.start.spec, records, state);
        if (state.issues.some((issue) => issue.level === "error")) return;
        renderLoop(loop, contexts, records, state);
    }
}

function collectLoops(body: XmlElement, state: RenderState): EachBlock[] {
    const loops: EachBlock[] = [];
    const stack: EachMarker[] = [];
    const children = elementChildren(body);

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!isW(child, "p")) continue;
        const text = paragraphText(child).trim();
        if (!/^\{\{\s*[#/]\s*each\b/.test(text)) continue;

        if (text.startsWith("{{/each")) {
            if (!/^\{\{\s*\/each\s*\}\}$/.test(text)) {
                state.issues.push({
                    level: "error",
                    code: "invalid-each-syntax",
                    message: `循环结束标记必须独占段落：${text}`,
                });
                continue;
            }
            const start = stack.pop();
            if (!start) {
                state.issues.push({
                    level: "error",
                    code: "unexpected-each-end",
                    message: "发现多余的 {{/each}}",
                });
                continue;
            }
            loops.push({
                start,
                end: { node: child, raw: text, spec: start.spec },
                body: children.slice(children.indexOf(start.node) + 1, i),
            });
            continue;
        }

        const parsed = parseEachStart(text);
        if (!parsed.spec) {
            state.issues.push({
                level: "error",
                code: "invalid-each-syntax",
                message: parsed.error ?? `无法解析循环标记：${text}`,
            });
            continue;
        }
        if (stack.length > 0) {
            state.issues.push({
                level: "error",
                code: "nested-each-not-supported",
                message: "不支持嵌套 {{#each}}",
            });
        }
        stack.push({ node: child, raw: text, spec: parsed.spec });
    }

    if (stack.length > 0) {
        state.issues.push({
            level: "error",
            code: "unclosed-each",
            message: "存在未闭合的 {{#each}}",
        });
    }

    // 每个循环体最多一个表格
    for (const loop of loops) {
        const tables = loop.body.filter((node) => isW(node, "tbl"));
        if (tables.length > 1) {
            state.issues.push({
                level: "error",
                code: "each-multiple-tables",
                message: "一个 {{#each}} 循环体内最多只能有一个表格",
            });
        }
        for (const node of loop.body) {
            if (isW(node, "p") && /\{\{\s*[#/]\s*each\b/.test(paragraphText(node))) {
                state.issues.push({
                    level: "error",
                    code: "nested-each-not-supported",
                    message: "循环体内不支持嵌套 {{#each}}",
                });
            }
        }
    }

    return loops.filter((loop) => loop.body.length > 0 || loop.start.node !== loop.end.node);
}

function renderLoop(
    loop: EachBlock,
    contexts: readonly Iteration[],
    records: readonly MergeRecord[],
    state: RenderState,
): void {
    const table = loop.body.find((node) => isW(node, "tbl"));
    const rootScope = makeRootScope(records[0] ?? (Object.create(null) as MergeRecord));
    const output: XmlNode[] = [];

    if (!table) {
        for (const context of contexts) {
            for (const node of loop.body) {
                output.push(...renderDetached(node, context.scope, state));
            }
        }
    } else {
        const tableIndex = loop.body.indexOf(table);
        const before = loop.body.slice(0, tableIndex);
        const after = loop.body.slice(tableIndex + 1);

        for (const context of contexts) {
            for (const node of before) {
                output.push(...renderDetached(node, context.scope, state));
            }
        }

        output.push(renderLoopTable(table, contexts, rootScope, state));

        for (const context of contexts) {
            for (const node of after) {
                output.push(...renderDetached(node, context.scope, state));
            }
        }
    }

    const parent = loop.start.node.parentNode;
    if (!parent) return;
    const anchor = loop.end.node.nextSibling;
    for (const node of output) parent.insertBefore(node, anchor);

    let current = loop.start.node;
    while (current) {
        const next = current.nextSibling;
        parent.removeChild(current);
        if (current === loop.end.node) break;
        current = next;
    }
}

function renderLoopTable(
    table: XmlElement,
    contexts: readonly Iteration[],
    rootScope: ExpressionScope,
    state: RenderState,
): XmlElement {
    const rows = elementChildren(table).filter((node: XmlNode) => isW(node, "tr"));
    const templateFlags = rows.map((row: XmlNode) => textOf(row).includes("{{"));
    const firstTemplate = templateFlags.indexOf(true);
    const lastTemplate = templateFlags.lastIndexOf(true);

    if (firstTemplate >= 0) {
        for (let i = firstTemplate; i <= lastTemplate; i++) {
            if (!templateFlags[i]) {
                state.issues.push({
                    level: "error",
                    code: "template-rows-not-contiguous",
                    message: "表格中的模板行必须连续：静态行不能夹在模板行之间",
                });
                break;
            }
        }
    }

    const out = table.cloneNode(false) as XmlElement;
    let emittedTemplate = false;

    for (const child of elementChildren(table)) {
        if (!isW(child, "tr")) {
            out.appendChild(child.cloneNode(true));
            continue;
        }

        const index = rows.indexOf(child);
        const isTemplate = templateFlags[index] ?? false;

        if (!isTemplate) {
            const clone = child.cloneNode(true);
            renderTree(clone, contexts[0]?.scope ?? rootScope, state);
            out.appendChild(clone);
            continue;
        }

        if (!emittedTemplate) {
            emittedTemplate = true;
            for (const context of contexts) {
                for (const templateRow of rows.slice(firstTemplate, lastTemplate + 1)) {
                    const clone = templateRow.cloneNode(true);
                    renderTree(clone, context.scope, state);
                    out.appendChild(clone);
                }
            }
        }
    }

    return out;
}

// ==================== 迭代上下文 ====================

function buildIterations(
    spec: EachSpec,
    records: readonly MergeRecord[],
    state: RenderState,
): Iteration[] {
    if (spec.mode === "row") return buildRowIterations(spec, records, state);
    return buildGroupIterations(spec, records, state);
}

function buildRowIterations(
    spec: RowLoopSpec,
    records: readonly MergeRecord[],
    state: RenderState,
): Iteration[] {
    const record = records[0];
    if (!record) return [];

    const width = spec.endCol - spec.startCol + 1;
    if (width <= 0 || spec.cols <= 0 || width % spec.cols !== 0) {
        state.issues.push({
            level: "error",
            code: "row-column-range-error",
            message: `列区间 ${columnName(spec.startCol)}..${columnName(spec.endCol)} 的宽度 ${width} 不能被 cols:${spec.cols} 整除`,
        });
        return [];
    }
    if (spec.aliases.length > 0 && spec.aliases.length !== spec.cols) {
        state.issues.push({
            level: "error",
            code: "row-column-range-error",
            message: `as: 提供了 ${spec.aliases.length} 个别名，但 cols:${spec.cols} 需要 ${spec.cols} 个`,
        });
        return [];
    }

    const cells = recordCells(record);
    const count = width / spec.cols;
    const contexts: Iteration[] = [];

    for (let group = 0; group < count; group++) {
        const fields: Record<string, unknown> = { ...record };
        for (let c = 0; c < spec.cols; c++) {
            const alias = spec.aliases[c] || `c${c + 1}`;
            fields[alias] = cells[spec.startCol - 1 + group * spec.cols + c] ?? "";
        }
        contexts.push({
            scope: {
                fields,
                index: group,
                count,
            },
        });
    }

    return contexts;
}

function buildGroupIterations(
    spec: GroupLoopSpec,
    records: readonly MergeRecord[],
    state: RenderState,
): Iteration[] {
    const groups = groupMergeRecords(records, spec.by, spec.keep);
    const contexts: Iteration[] = [];

    if (state.groupIndex != null && state.groupIndex >= groups.length) {
        state.issues.push({
            level: "error",
            code: "group-index-out-of-range",
            message: `分组序号 ${state.groupIndex + 1} 超出范围（共 ${groups.length} 组）`,
        });
        return [];
    }

    const selected =
        state.groupIndex == null
            ? groups.map((group, index) => ({ group, index }))
            : [{ group: groups[state.groupIndex], index: state.groupIndex }];

    for (const { group, index: groupIndex } of selected) {
        if (group.rows.length === 0) continue;
        const first = group.rows[0];
        group.rows.forEach((row, rowIndex) => {
            contexts.push({
                scope: {
                    fields: row,
                    index: rowIndex,
                    count: group.rows.length,
                    groupIndex,
                    group: first,
                },
            });
        });
    }

    if (groups.length === 0 && records.length > 0) {
        state.issues.push({
            level: "warn",
            code: "group-empty",
            message: `按「${spec.by}」分组后没有可输出的行`,
        });
    }

    // 常见误用：by 选了每条记录都唯一的列（如“家人姓名”而不是“姓名”），
    // 结果每组只有 1 行，@index 永远为 1、@count 永远为 1。
    if (records.length > 1 && groups.length === records.length) {
        state.issues.push({
            level: "warn",
            code: "group-all-singletons",
            message:
                `按「${spec.by}」分组后每组都只有 1 行（@index 恒为 1、@count 恒为 1）。` +
                "如果应按家庭/主记录分组，请把 by: 改成主记录列（例如「姓名」），" +
                "并确保续行的该列为空或相同值。",
            key: spec.by,
        });
    }

    return contexts;
}
// ==================== 段落渲染 ====================

function renderAllParagraphs(root: XmlElement, scope: ExpressionScope, state: RenderState): void {
    const paragraphs = allW(root, "p");
    for (const paragraph of paragraphs) {
        renderParagraph(paragraph, scope, state);
    }
}

function renderTree(node: XmlNode, scope: ExpressionScope, state: RenderState): void {
    if (isW(node, "p")) {
        renderParagraph(node, scope, state);
        return;
    }
    for (const paragraph of allW(node, "p")) {
        renderParagraph(paragraph, scope, state);
    }
}

/**
 * 渲染一个尚未挂到文档上的克隆节点。
 *
 * 段落的 #if 为 false 时需要能从父节点删除整段，所以先挂到临时 holder；
 * 渲染后把 holder 中存活的节点返回给调用方。
 */
function renderDetached(source: XmlNode, scope: ExpressionScope, state: RenderState): XmlNode[] {
    const clone = source.cloneNode(true) as XmlNode;
    const holder = source.ownerDocument.createElementNS(W_NS, "w:zdocTmp");
    holder.appendChild(clone);
    renderTree(holder, scope, state);
    const result: XmlNode[] = [];
    for (let child = holder.firstChild; child; child = child.nextSibling) {
        result.push(child);
    }
    return result;
}

function renderParagraph(paragraph: XmlElement, scope: ExpressionScope, state: RenderState): void {
    if (!paragraph.parentNode) return;
    const removed = processIfs(paragraph, scope, state);
    if (removed) return;
    replaceVariables(paragraph, scope, state);
}

function processIfs(paragraph: XmlElement, scope: ExpressionScope, state: RenderState): boolean {
    let map = collectParagraphText(paragraph);
    if (!map.text.includes("{{#if")) return false;

    const regex = /\{\{#if\s+([^{}]+?)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    const matches: Array<{ start: number; end: number; expression: string; content: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(map.text)) !== null) {
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            expression: match[1],
            content: match[2],
        });
    }

    const starts = (map.text.match(/\{\{#if\b/g) ?? []).length;
    const ends = (map.text.match(/\{\{\/if\}\}/g) ?? []).length;
    if (starts !== matches.length || ends !== matches.length) {
        state.issues.push({
            level: "error",
            code: "unclosed-if",
            message: "段落中的 {{#if}} / {{/if}} 没有成对闭合",
        });
        return false;
    }

    for (let i = matches.length - 1; i >= 0; i--) {
        const item = matches[i];
        const evaluated = evaluateExpression(item.expression, scope);
        if (!evaluated.ok) {
            state.issues.push({
                level: "error",
                code: "invalid-if-expression",
                message: `#if 条件「${item.expression}」无法解析：${evaluated.error ?? "未知错误"}`,
            });
            continue;
        }
        replaceRange(map.refs, item.start, item.end, evaluated.value ? item.content : "");
    }

    map = collectParagraphText(paragraph);
    if (map.text.trim() === "" && paragraph.parentNode) {
        const inCell = hasAncestor(paragraph, "tc");
        if (!inCell) {
            paragraph.parentNode.removeChild(paragraph);
            return true;
        }
    }
    return false;
}

function replaceVariables(paragraph: XmlElement, scope: ExpressionScope, state: RenderState): void {
    const map = collectParagraphText(paragraph);
    if (!map.text.includes("{{")) return;

    const regex = /\{\{([^{}]+)\}\}/g;
    const matches: Array<{ start: number; end: number; raw: string; content: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(map.text)) !== null) {
        if (/^\s*[#/]/.test(match[1])) continue;
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0],
            content: match[1],
        });
    }

    for (let i = matches.length - 1; i >= 0; i--) {
        const item = matches[i];
        const parsed = parsePlaceholderContent(item.content, item.raw);
        state.issues.push(...parsed.issues);
        if (!parsed.placeholder) continue;

        const value = resolveScopeKey(scope, parsed.placeholder.key, state);
        const rendered = applyPipes(value, parsed.placeholder.steps, {
            registry: state.registry,
            key: parsed.placeholder.key,
            issues: state.issues,
        });

        const run = runBefore(map.refs, item.start);
        replaceRange(map.refs, item.start, item.end, rendered.text);
        if (run && rendered.ops.length > 0) {
            applyRunOps(run, rendered.ops, rendered.text, state);
        }
    }
}

function resolveScopeKey(scope: ExpressionScope, key: string, state: RenderState): unknown {
    if (key === "@index") return scope.index + 1;
    if (key === "@count") return scope.count;
    if (key === "@groupIndex") {
        return scope.groupIndex == null ? undefined : scope.groupIndex + 1;
    }
    if (key === "@group") return scope.group;
    if (key.startsWith("@group.")) {
        return resolveField(scope.group, key.slice("@group.".length));
    }

    const value = resolveField(scope.fields, key);
    if (value === undefined) {
        state.issues.push({
            level: "warn",
            code: "UNDEFINED_PATH",
            message: `字段「${key}」不存在，已渲染为空字符串`,
            key,
        });
    }
    return value;
}

function resolveField(source: unknown, key: string): unknown {
    let current: unknown = source;
    for (const segment of key.split(".")) {
        if (current == null || (typeof current !== "object" && typeof current !== "function")) {
            return undefined;
        }
        if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

// ==================== 文本节点映射 / 替换 ====================

function collectParagraphText(paragraph: XmlElement): ParagraphText {
    const refs: TextRef[] = [];
    let text = "";

    const visit = (node: XmlNode) => {
        if (node.nodeType === 1) {
            if (isW(node, "p") && node !== paragraph) return;
            if (isW(node, "t")) {
                const value = node.textContent ?? "";
                refs.push({
                    node,
                    start: text.length,
                    end: text.length + value.length,
                    text: value,
                });
                text += value;
                return;
            }
            if (isW(node, "tab")) {
                text += "\t";
                return;
            }
            if (isW(node, "br") || isW(node, "cr")) {
                text += "\n";
                return;
            }
        }
        for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
    };

    visit(paragraph);
    return { text, refs };
}

function replaceRange(refs: TextRef[], start: number, end: number, replacement: string): void {
    if (start === end) {
        insertAt(refs, start, replacement);
        return;
    }

    const first = findRef(refs, start);
    const last = findRef(refs, Math.max(start, end - 1));
    if (!first || !last) return;

    const firstOffset = start - first.start;
    const lastOffset = end - last.start;
    const firstText = first.text;
    const lastText = last.text;
    const prefix = firstText.slice(0, firstOffset);
    const suffix = lastText.slice(Math.max(0, lastOffset));

    if (first === last) {
        writeRef(first, prefix + replacement + suffix);
        return;
    }

    writeRef(first, prefix + replacement);
    for (const ref of refs) {
        if (ref.start > first.start && ref.end < last.end) writeRef(ref, "");
    }
    writeRef(last, suffix);
}

function insertAt(refs: TextRef[], position: number, text: string): void {
    if (!text) return;
    const ref = findRef(refs, position);
    if (!ref) return;
    const offset = Math.max(0, position - ref.start);
    writeRef(ref, ref.text.slice(0, offset) + text + ref.text.slice(offset));
}

function writeRef(ref: TextRef, text: string): void {
    ref.text = text;
    ref.end = ref.start + text.length;
    setText(ref.node, text);
}

function findRef(refs: TextRef[], position: number): TextRef | null {
    for (const ref of refs) {
        if (position >= ref.start && position < ref.end) return ref;
    }
    for (let i = refs.length - 1; i >= 0; i--) {
        if (refs[i].start <= position) return refs[i];
    }
    return refs[0] ?? null;
}

function runBefore(refs: TextRef[], start: number): XmlElement | null {
    const ref = findRef(refs, start);
    if (!ref) return null;
    let node: XmlNode = ref.node;
    while (node && !isW(node, "r")) node = node.parentNode;
    return node ?? null;
}

function setText(node: XmlElement, text: string): void {
    node.textContent = text;
    if (/^\s|\s$/.test(text)) node.setAttributeNS(XML_NS, "xml:space", "preserve");
}

function applyRunOps(
    run: XmlElement,
    ops: ReadonlyArray<{ type: string; chars?: number; points?: number }>,
    text: string,
    state: RenderState,
): void {
    let spacing = 0;
    for (const op of ops) {
        if (op.type === "fontSpacing") {
            spacing += (op.points ?? 0) * 20;
        } else if (op.type === "fitWidth") {
            spacing += (Math.max(0, op.chars ?? 0) - [...text].length) * 20;
            if (!state.widthWarned) {
                state.widthWarned = true;
                state.issues.push({
                    level: "warn",
                    code: "WIDTH_APPROX",
                    message:
                        "DOCX 引擎用字距近似 width(n)（Word 的 FitTextWidth 无直接 OOXML 等价属性）",
                });
            }
        }
    }
    if (spacing === 0) return;

    const doc = run.ownerDocument;
    let rPr = elementChildren(run).find((child: XmlNode) => isW(child, "rPr"));
    if (!rPr) {
        rPr = doc.createElementNS(W_NS, "w:rPr");
        run.insertBefore(rPr, run.firstChild);
    }
    let spacingEl = elementChildren(rPr).find((child: XmlNode) => isW(child, "spacing"));
    if (!spacingEl) {
        spacingEl = doc.createElementNS(W_NS, "w:spacing");
        rPr.appendChild(spacingEl);
    }
    spacingEl.setAttributeNS(W_NS, "w:val", String(Math.round(spacing)));
}

// ==================== 解析辅助 ====================

function parseXml(xml: string): XmlDocument {
    const errors: string[] = [];
    const parser = new DOMParser({
        errorHandler: (level: string, message: string) => {
            if (level === "error") errors.push(message);
        },
    });
    const doc = parser.parseFromString(xml, "text/xml") as XmlDocument;
    if (errors.length > 0) throw new Error(errors[0]);
    return doc;
}

function findBody(doc: XmlDocument): XmlElement | null {
    const bodies = doc.getElementsByTagNameNS(W_NS, "body");
    if (bodies.length > 0) return bodies[0];
    const hdr = doc.getElementsByTagNameNS(W_NS, "hdr");
    if (hdr.length > 0) return hdr[0];
    const ftr = doc.getElementsByTagNameNS(W_NS, "ftr");
    if (ftr.length > 0) return ftr[0];
    return doc.documentElement;
}

function elementChildren(node: XmlNode): XmlElement[] {
    const result: XmlElement[] = [];
    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) result.push(child);
    }
    return result;
}

function allW(root: XmlNode, localName: string): XmlElement[] {
    const result: XmlElement[] = [];
    const list = root.getElementsByTagNameNS?.(W_NS, localName) ?? [];
    for (let i = 0; i < list.length; i++) result.push(list[i]);
    return result;
}

function isW(node: XmlNode, localName: string): boolean {
    return node?.nodeType === 1 && node.localName === localName;
}

function hasAncestor(node: XmlNode, localName: string): boolean {
    let current = node.parentNode;
    while (current) {
        if (isW(current, localName)) return true;
        current = current.parentNode;
    }
    return false;
}

function paragraphText(paragraph: XmlElement): string {
    return collectParagraphText(paragraph).text;
}

function textOf(root: XmlNode): string {
    let text = "";
    const visit = (node: XmlNode) => {
        if (node.nodeType === 1 && isW(node, "t")) {
            text += node.textContent ?? "";
            return;
        }
        for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
    };
    visit(root);
    return text;
}

function parseEachStart(raw: string): { spec?: EachSpec; error?: string } {
    const text = raw.trim();

    const row =
        /^\{\{\s*#each\s+row\s+in:([A-Za-z]+)\.\.([A-Za-z]+)\s+cols:(\d+)(?:\s+as:([^}]*?))?\s*\}\}$/.exec(
            text,
        );
    if (row) {
        const startCol = columnIndex(row[1]);
        const endCol = columnIndex(row[2]);
        const cols = Number(row[3]);
        const aliases = (row[4] ?? "")
            .split(",")
            .map((alias) => alias.trim())
            .filter(Boolean);

        if (startCol == null || endCol == null) {
            return { error: "列范围必须使用 Excel 列字母，如 E..T" };
        }
        if (endCol < startCol) return { error: "列范围结束列不能小于开始列" };
        if (!Number.isInteger(cols) || cols <= 0) return { error: "cols 必须是正整数" };
        return { spec: { mode: "row", startCol, endCol, cols, aliases } };
    }

    const group = /^\{\{\s*#each\s+group\s+by:([^\s}]+)(?:\s+keep:(true|false))?\s*\}\}$/i.exec(
        text,
    );
    if (group) {
        return {
            spec: {
                mode: "group",
                by: group[1],
                keep: (group[2] ?? "false").toLowerCase() === "true",
            },
        };
    }

    return {
        error: "循环标记必须写成 {{#each row in:E..T cols:4 as:...}} 或 {{#each group by:列名 keep:true}}",
    };
}

function columnIndex(name: string): number | null {
    const upper = name.toUpperCase();
    if (!/^[A-Z]+$/.test(upper)) return null;
    let value = 0;
    for (const char of upper) value = value * 26 + (char.charCodeAt(0) - 64);
    return value;
}

function columnName(index: number): string {
    let value = index;
    let name = "";
    while (value > 0) {
        const remainder = (value - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        value = Math.floor((value - 1) / 26);
    }
    return name || "A";
}

function recordCells(record: MergeRecord): unknown[] {
    const cells = (record as Record<string, unknown>).__zdocCells;
    if (Array.isArray(cells)) return cells;
    return Object.keys(record).map((key) => record[key]);
}

function makeRootScope(record: MergeRecord): ExpressionScope {
    return { fields: record, index: 0, count: 1 };
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
