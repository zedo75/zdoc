/**
 * @file 邮件合并模板引擎的公共类型
 *
 * 本目录只包含纯逻辑：不引用 ActiveDocument / Range / Application 等 WPS 全局对象，
 * 所有模块都可以直接在 Node + Vitest 下运行。
 */

// ==================== 问题与报告 ====================

export type MergeIssueLevel = "error" | "warn";

/**
 * 合并过程中的一条问题。
 *
 * 约定：
 * - `warn` 不中断当前单元格 / 行 / 文档；
 * - `error` 表示模板结构非法，调用方应停止对该文档的写入。
 */
export interface MergeIssue {
    level: MergeIssueLevel;
    /** 稳定的机器可读错误码，便于 UI 聚合与测试断言 */
    code: string;
    message: string;
    /** 模板中的行号（表格行从 1 开始；纯文本模板可省略） */
    templateRow?: number;
    /** 出问题的占位符 / 循环键 */
    key?: string;
}

// ==================== 侧信道格式 ====================

export type FormatOp =
    { type: "fitWidth"; chars: number } | { type: "fontSpacing"; points: number };

export interface FormatterResultObject {
    text: string;
    ops?: FormatOp[];
}

/**
 * 格式化器返回值。
 *
 * 返回字符串时只改变文本；返回对象时可以携带格式指令，
 * 由文档层施加到该占位符最终渲染出的最小 Range 上。
 */
export type FormatterResult = string | FormatterResultObject;

export type FormatterArg = string | number | boolean | null;

export interface FormatterHelpers {
    /** 显示宽度接口。当前按码点计数，不做全角 / 半角折算。 */
    displayWidth: (text: string) => number;
    [name: string]: (...args: never[]) => unknown;
}

export interface FormatterContext {
    key: string;
    warn: (msg: string) => void;
    /** 只读副本；绝不包含任何 WPS 对象 */
    helpers: Readonly<FormatterHelpers>;
}

export type Formatter = (
    value: unknown,
    args: FormatterArg[],
    ctx: FormatterContext,
) => FormatterResult;

// ==================== 管道 ====================

export type PipeStep =
    | {
          kind: "format";
          /** 引号内的字符串字面量（等价于 format(<pattern>)） */
          pattern: string;
          source: string;
      }
    | {
          kind: "call";
          name: string;
          args: FormatterArg[];
          source: string;
      }
    | {
          kind: "invalid";
          source: string;
          reason: string;
      };

export interface Placeholder {
    /** 原始 `{{...}}` 文本 */
    raw: string;
    /** 去掉首尾空白后的变量路径，如 `部门.名称`、`this` */
    key: string;
    steps: PipeStep[];
}

// ==================== 模板语法树 ====================

export interface TemplateTextNode {
    type: "text";
    text: string;
}

export interface TemplateVariableNode {
    type: "variable";
    placeholder: Placeholder;
}

export interface TemplateEachNode {
    type: "each";
    key: string;
    body: TemplateNode[];
    rawStart: string;
    rawEnd: string;
}

export type TemplateNode = TemplateTextNode | TemplateVariableNode | TemplateEachNode;

export interface TemplateParseResult {
    nodes: TemplateNode[];
    issues: MergeIssue[];
}

// ==================== 渲染结果 ====================

/** 一条相对渲染文本的位置信息 */
export interface RenderedFormatOp {
    /** 相对整个渲染结果的起始偏移（UTF-16 code unit） */
    start: number;
    end: number;
    op: FormatOp;
    key: string;
}

export interface TemplateRenderResult {
    text: string;
    ops: RenderedFormatOp[];
    issues: MergeIssue[];
}

// ==================== 表格行循环 ====================

export interface RowMarkerToken {
    kind: "start" | "end";
    key: string;
    rowIndex: number;
    cellIndex: number;
    offset: number;
    length: number;
    raw: string;
}

export interface RowLoop {
    key: string;
    start: RowMarkerToken;
    end: RowMarkerToken;
    /** 起止标记位于同一个单元格：交给单元格内联解析器处理，不复制行 */
    inline: boolean;
    /** 非内联循环的嵌套层级，0 为最外层 */
    depth: number;
}

export interface RowLoopScanResult {
    loops: RowLoop[];
    issues: MergeIssue[];
}

export interface TableRowRenderResult {
    /** 展开后的纯文本行；单元格之间用 `\t` 保留列边界 */
    rows: string[][];
    issues: MergeIssue[];
}
