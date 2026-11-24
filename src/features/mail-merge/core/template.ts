import type { FormatterLookup } from "./formatters";
import type {
    MergeIssue,
    PipeStep,
    TemplateEachNode,
    TemplateNode,
    TemplateParseResult,
    TemplateRenderResult,
    TemplateVariableNode,
} from "./types";

import { applyPipes, isValidVariableKey, parsePlaceholderContent, toRenderedOps } from "./pipeline";

const TOKEN_RE = /\{\{([\s\S]*?)\}\}/g;
const MAX_LOOP_DEPTH = 20;

interface EachFrame {
    node: TemplateEachNode;
    body: TemplateNode[];
    rawStart: string;
}

/**
 * 解析模板文本为语法树。
 *
 * 支持 `{{变量}}`、`{{#each 列表}}...{{/each}}`（可任意嵌套，实际建议不超过两层）。
 * 未闭合 / 多余的循环标记记为 error，而不是静默吞掉。
 */
export function parseTemplate(input: string): TemplateParseResult {
    const issues: MergeIssue[] = [];
    const root: TemplateNode[] = [];
    const stack: EachFrame[] = [];

    const append = (node: TemplateNode) => {
        if (stack.length > 0) stack[stack.length - 1].body.push(node);
        else root.push(node);
    };

    let lastIndex = 0;
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_RE.exec(input)) !== null) {
        if (match.index > lastIndex) {
            append({ type: "text", text: input.slice(lastIndex, match.index) });
        }

        const raw = match[0];
        const content = match[1].trim();
        lastIndex = TOKEN_RE.lastIndex;

        if (content.startsWith("#")) {
            const each = /^#each\b\s*([\s\S]*)$/.exec(content);
            if (!each) {
                issues.push({
                    level: "error",
                    code: "UNKNOWN_TEMPLATE_MARKER",
                    message: `未知模板标记「${raw}」`,
                });
                append({ type: "text", text: raw });
                continue;
            }

            const key = each[1].trim();
            if (!key || !isValidVariableKey(key)) {
                issues.push({
                    level: "error",
                    code: "INVALID_EACH_KEY",
                    message: `循环标记「${raw}」缺少合法的数据键`,
                    key,
                });
                append({ type: "text", text: raw });
                continue;
            }

            stack.push({
                node: { type: "each", key, body: [], rawStart: raw, rawEnd: "" },
                body: [],
                rawStart: raw,
            });
            continue;
        }

        if (content.startsWith("/")) {
            if (!/^\/each\b/.test(content)) {
                issues.push({
                    level: "error",
                    code: "UNKNOWN_TEMPLATE_MARKER",
                    message: `未知模板标记「${raw}」`,
                });
                append({ type: "text", text: raw });
                continue;
            }

            const frame = stack.pop();
            if (!frame) {
                issues.push({
                    level: "error",
                    code: "UNEXPECTED_EACH_END",
                    message: `循环结束标记「${raw}」没有对应的开始标记`,
                });
                append({ type: "text", text: raw });
                continue;
            }

            frame.node.body = frame.body;
            frame.node.rawEnd = raw;
            append(frame.node);
            continue;
        }

        if (content === "") {
            issues.push({
                level: "warn",
                code: "INVALID_PLACEHOLDER",
                message: "发现空的占位符 {{}}，已忽略",
            });
            continue;
        }

        const parsed = parsePlaceholderContent(content, raw);
        issues.push(...parsed.issues);
        if (parsed.placeholder) {
            const node: TemplateVariableNode = {
                type: "variable",
                placeholder: parsed.placeholder,
            };
            append(node);
        }
    }

    if (lastIndex < input.length) {
        append({ type: "text", text: input.slice(lastIndex) });
    }

    if (stack.length > 0) {
        for (const frame of stack) {
            issues.push({
                level: "error",
                code: "UNCLOSED_EACH",
                message: `循环「${frame.node.key}」未闭合（缺少 {{/each}}）`,
                key: frame.node.key,
            });
        }
    }

    return { nodes: root, issues };
}

export interface RenderTemplateOptions {
    registry?: FormatterLookup | Readonly<Record<string, import("./types").Formatter>>;
    /** 由上层传入的行号 / 位置，用于 issue 定位 */
    templateRow?: number;
    maxDepth?: number;
}

/** 渲染一段已解析的模板 */
export function renderTemplateNodes(
    nodes: readonly TemplateNode[],
    data: unknown,
    options: RenderTemplateOptions = {},
): TemplateRenderResult {
    const issues: MergeIssue[] = [];
    let text = "";
    const ops: TemplateRenderResult["ops"] = [];

    const renderNodes = (list: readonly TemplateNode[], context: unknown, depth: number) => {
        if (depth > (options.maxDepth ?? MAX_LOOP_DEPTH)) {
            issues.push({
                level: "error",
                code: "EACH_DEPTH_EXCEEDED",
                message: "循环嵌套层级过深，已停止展开",
            });
            return;
        }

        for (const node of list) {
            if (node.type === "text") {
                text += node.text;
                continue;
            }

            if (node.type === "variable") {
                const start = text.length;
                const value = resolvePath(
                    context,
                    node.placeholder.key,
                    issues,
                    options.templateRow,
                );
                const rendered = applyPipes(value, node.placeholder.steps, {
                    registry: options.registry,
                    key: node.placeholder.key,
                    issues,
                });
                text += rendered.text;
                ops.push(
                    ...toRenderedOps(start, rendered.text, rendered.ops, node.placeholder.key),
                );
                continue;
            }

            const value = resolvePath(context, node.key, issues, options.templateRow, false);
            if (value == null) {
                issues.push({
                    level: "warn",
                    code: "EACH_NOT_ARRAY",
                    message: `循环「${node.key}」的值为空，按空数组处理`,
                    key: node.key,
                    templateRow: options.templateRow,
                });
                continue;
            }
            if (!Array.isArray(value)) {
                issues.push({
                    level: "warn",
                    code: "EACH_NOT_ARRAY",
                    message: `循环「${node.key}」不是数组，按空数组处理`,
                    key: node.key,
                    templateRow: options.templateRow,
                });
                continue;
            }

            for (const item of value) {
                // 故意只传当前项：循环体内不回退到外层同名键
                renderNodes(node.body, item, depth + 1);
            }
        }
    };

    renderNodes(nodes, data, 0);
    return { text, ops, issues };
}

/** 解析 + 渲染的便捷入口 */
export function renderTemplate(
    template: string,
    data: unknown,
    options: RenderTemplateOptions = {},
): TemplateRenderResult {
    const parsed = parseTemplate(template);
    const rendered = renderTemplateNodes(parsed.nodes, data, options);
    return {
        text: rendered.text,
        ops: rendered.ops,
        issues: [...parsed.issues, ...rendered.issues],
    };
}

/**
 * 点路径逐级取值。
 *
 * 只认自有属性，避免把 `toString` / 原型链上的东西渲染出来；
 * 循环内没有“外层作用域回退”。
 */
export function resolvePath(
    context: unknown,
    key: string,
    issues: MergeIssue[] = [],
    templateRow?: number,
    warnUndefined = true,
): unknown {
    if (key === "this") return context;

    const segments = key.split(".");
    let cursor: unknown = context;

    for (const segment of segments) {
        if (cursor == null || (typeof cursor !== "object" && typeof cursor !== "function")) {
            cursor = undefined;
            break;
        }
        if (!Object.prototype.hasOwnProperty.call(cursor, segment)) {
            cursor = undefined;
            break;
        }
        cursor = (cursor as Record<string, unknown>)[segment];
    }

    if (cursor === undefined && warnUndefined) {
        issues.push({
            level: "warn",
            code: "UNDEFINED_PATH",
            message: `字段「${key}」不存在，已渲染为空字符串`,
            key,
            templateRow,
        });
    }

    return cursor;
}

/** 语法树中所有变量占位符的键（供 UI 扫描模板） */
export function collectPlaceholderKeys(nodes: readonly TemplateNode[]): string[] {
    const keys: string[] = [];
    const visit = (list: readonly TemplateNode[]) => {
        for (const node of list) {
            if (node.type === "variable") keys.push(node.placeholder.key);
            if (node.type === "each") {
                keys.push(node.key);
                visit(node.body);
            }
        }
    };
    visit(nodes);
    return keys;
}

/** 语法树中所有循环键 */
export function collectLoopKeys(nodes: readonly TemplateNode[]): string[] {
    const keys: string[] = [];
    const visit = (list: readonly TemplateNode[]) => {
        for (const node of list) {
            if (node.type === "each") {
                keys.push(node.key);
                visit(node.body);
            }
        }
    };
    visit(nodes);
    return keys;
}

/** 判断模板中是否存在结构级 error */
export function hasTemplateError(issues: readonly MergeIssue[]): boolean {
    return issues.some((issue) => issue.level === "error");
}

/** 把一段管道表达式解析出来（供 UI / 调试） */
export function parsePipelineExpression(expression: string): {
    key: string;
    steps: PipeStep[];
    issues: MergeIssue[];
} {
    const parsed = parsePlaceholderContent(expression, `{{${expression}}}`);
    return {
        key: parsed.placeholder?.key ?? "",
        steps: parsed.placeholder?.steps ?? [],
        issues: parsed.issues,
    };
}
