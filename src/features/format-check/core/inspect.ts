/**
 * @file 文档格式检查（纯逻辑层）
 *
 * 设计目标：
 * 1. 只看「段落语义 + 当前生效格式 + 排版配置」，不依赖 WPS COM，可单测。
 * 2. **不假设文档已经排过版**：不要求存在「公文正文 / 公文标题」样式，
 *    也不比较样式名，只比较字体、字号、加粗、对齐、首行缩进、行距等生效属性。
 * 3. **严格按「排版设置」比对**：字体名不做别名归一化，
 *    例如设置为「仿宋_GB2312」而文档使用「仿宋」时判为异常。
 * 4. 只产出问题列表，不修改文档（应用逻辑不在此模块）。
 */
import type { TypographyConfig } from "@/config/types";
import type { ParagraphSemanticKind } from "@/core/types";

// ==================== WPS 常量 ====================

/** WPS `WdParagraphAlignment` 中本模块会用到的取值 */
export const WD_ALIGN = {
    left: 0,
    center: 1,
    right: 2,
    justify: 3,
} as const;

/** WPS `WdLineSpacing`：固定值（排版设置中的行距即该模式） */
export const WD_LINE_SPACE_EXACTLY = 4;

// ==================== 当前格式快照 ====================

/**
 * 段落当前生效格式。
 *
 * 这些值来自 COM 的 `Range.Font` / `Range.ParagraphFormat`，
 * 反映的是「最终生效值」（可能继承自样式），而不是直接格式。
 * `null` 表示读不到或段内混合；字体名不做别名匹配，缺失/混合按异常处理，
 * 其余数值项为 `null` 时跳过判定，避免误报。
 */
export interface CurrentFormat {
    /** 当前段落样式名（只展示，不参与判定） */
    styleName: string;
    /** 中文字体名（严格比对） */
    fontName: string;
    /** 西文字体名（严格比对） */
    asciiFontName: string;
    /** 字号（pt） */
    fontSize: number | null;
    /** 是否加粗 */
    bold: boolean | null;
    /** 对齐方式（`WD_ALIGN`） */
    alignment: number | null;
    /** 首行缩进（字符） */
    firstLineIndent: number | null;
    /** 行距（pt） */
    lineSpacing: number | null;
    /** 行距规则（`WD_LINE_SPACE_EXACTLY` 等） */
    lineSpacingRule: number | null;
}

/** 期望格式；未列出的字段表示「不做判定」 */
export interface ExpectedFormat {
    font?: string;
    asciiFont?: string;
    fontSize?: number;
    bold?: boolean;
    alignment?: number;
    firstLineIndent?: number;
    lineSpacing?: number;
    lineSpacingRule?: number;
}

/** 单个格式问题的字段类型 */
export type FormatIssueField =
    "font" | "fontAscii" | "size" | "bold" | "alignment" | "indent" | "spacing";

/** 单个格式问题 */
export interface FormatIssue {
    field: FormatIssueField;
    /** 中文标签，如「字体」「字号」 */
    label: string;
    /** 期望值（已格式化） */
    expected: string;
    /** 当前值（已格式化） */
    actual: string;
}

// ==================== 检查结果 ====================

/** 面板中的一行段落（含正文、空行、表格） */
export interface CheckElement {
    /** 1-based 段落索引，用于定位 */
    paraIndex: number;
    /** 段落主语义 */
    kind: ParagraphSemanticKind;
    /** 段落命中的全部语义（用于展示） */
    kinds: ParagraphSemanticKind[];
    /** 去掉段落标记后的纯文本 */
    text: string;
    /** 当前格式 */
    format: CurrentFormat;
    /** 期望格式；`null` 表示不检查（如版头 / 空行 / 表格） */
    expected: ExpectedFormat | null;
    /** 是否被用户标记为「不排版」/ 跳过 */
    skipped: boolean;
    /** 当前格式是否读取失败 */
    readFailed: boolean;
    /** 是否属于附件说明块（块内悬挂缩进不按正文首行缩进判定） */
    inAttachmentBlock: boolean;
    /** 格式不符项 */
    issues: FormatIssue[];
}

/** 一次完整的格式检查结果 */
export interface InspectionResult {
    /** 文档名 */
    docName: string;
    /** 检查时间戳（毫秒） */
    checkedAt: number;
    /** 文档段落总数 */
    paragraphCount: number;
    /** 全部段落（按文档自然顺序，含正文 / 空行 / 表格） */
    elements: CheckElement[];
    /** 格式不符项总数 */
    issueCount: number;
    /** 被跳过的段落数量 */
    skippedCount: number;
    /** 各语义类型的数量 */
    counts: Partial<Record<ParagraphSemanticKind, number>>;
    /** 结构提示（不是错误，只是提醒） */
    notes: string[];
}

// ==================== 期望格式 ====================

/**
 * 根据段落语义给出期望格式。
 *
 * 注意：
 * - 只返回**与语义强相关**的字段，不复制整套样式；
 * - 字体名严格使用「排版设置」中的原值，不做 `仿宋_GB2312` / `仿宋` 之类的别名归一；
 * - 版头（红头）是版式设计元素，返回 `null`（不检查）；
 * - 正文类的加粗期望为 false，段内局部加粗（混合态）不会误报。
 *
 * @param kind 段落主语义
 * @param config 当前排版配置
 */
export function getExpectedFormat(
    kind: ParagraphSemanticKind,
    config: TypographyConfig,
): ExpectedFormat | null {
    switch (kind) {
        case "mainTitle":
            return {
                font: config.title.zh,
                asciiFont: config.title.en,
                fontSize: config.title.size,
                bold: false,
                alignment: WD_ALIGN.center,
                firstLineIndent: 0,
                lineSpacing: config.title.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "subtitle":
            // 项目内副标题固定使用楷体_GB2312 小四号（16pt），与排版属性注册表保持一致
            return {
                font: "楷体_GB2312",
                asciiFont: "楷体_GB2312",
                fontSize: 16,
                bold: false,
                alignment: WD_ALIGN.center,
                firstLineIndent: 0,
                lineSpacing: config.title.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "salutation":
            return {
                font: config.salutation.font,
                asciiFont: config.salutation.font,
                fontSize: config.main.size,
                bold: config.salutation.bold,
                alignment: WD_ALIGN.justify,
                firstLineIndent: 0,
                lineSpacing: config.main.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "attachment":
            return {
                font: "黑体",
                asciiFont: "黑体",
                fontSize: config.main.size,
                bold: false,
                alignment: WD_ALIGN.justify,
                firstLineIndent: 0,
                lineSpacing: config.main.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "h1":
            return {
                font: config.h1.font,
                asciiFont: config.main.en,
                fontSize: config.main.size,
                bold: config.h1.bold,
                alignment: WD_ALIGN.justify,
                firstLineIndent: config.main.indent,
                lineSpacing: config.main.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "h2":
            return {
                font: config.h2.font,
                asciiFont: config.main.en,
                fontSize: config.main.size,
                bold: config.h2.bold,
                alignment: WD_ALIGN.justify,
                firstLineIndent: config.main.indent,
                lineSpacing: config.main.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "h3":
            return {
                font: config.h3.font,
                asciiFont: config.main.en,
                fontSize: config.main.size,
                bold: config.h3.bold,
                alignment: WD_ALIGN.justify,
                firstLineIndent: config.main.indent,
                lineSpacing: config.main.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "body":
        case "listItem":
            return {
                font: config.main.zh,
                asciiFont: config.main.en,
                fontSize: config.main.size,
                bold: false,
                alignment: WD_ALIGN.justify,
                firstLineIndent: config.main.indent,
                lineSpacing: config.main.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "topic":
            // topic 的加粗是段内子范围，由 checkTopicBold 单独判定，不能按整段 bold 比较
            return {
                font: config.main.zh,
                asciiFont: config.main.en,
                fontSize: config.main.size,
                alignment: WD_ALIGN.justify,
                firstLineIndent: config.main.indent,
                lineSpacing: config.main.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "signatureUnit":
        case "signatureDate":
            return {
                font: config.main.zh,
                asciiFont: config.main.en,
                fontSize: config.main.size,
                bold: false,
                alignment: WD_ALIGN.right,
                lineSpacing: config.main.spacing,
                lineSpacingRule: WD_LINE_SPACE_EXACTLY,
            };

        case "letterhead":
        case "empty":
        case "table":
            return null;
    }
}

// ==================== 值格式化 ====================

/** 去掉浮点误差（如 15.999999 → 16） */
export function trimNumber(value: number, digits = 2): string {
    return String(Number(value.toFixed(digits)));
}

const ALIGN_LABELS: Record<number, string> = {
    [WD_ALIGN.left]: "左对齐",
    [WD_ALIGN.center]: "居中",
    [WD_ALIGN.right]: "右对齐",
    [WD_ALIGN.justify]: "两端对齐",
};

/** 对齐方式 → 中文 */
export function formatAlignment(value: number | null): string {
    if (value === null) return "混合";
    return ALIGN_LABELS[value] ?? `对齐值 ${value}`;
}

/** 字号 → 中文 */
export function formatFontSize(value: number | null): string {
    return value === null ? "混合" : `${trimNumber(value)}pt`;
}

/** 加粗 → 中文 */
export function formatBold(value: boolean | null): string {
    return value === null ? "混合" : value ? "加粗" : "不加粗";
}

/** 首行缩进 → 中文 */
export function formatIndent(value: number | null): string {
    return value === null ? "混合" : `${trimNumber(value)} 字符`;
}

const LINE_SPACE_LABELS: Record<number, string> = {
    0: "单倍行距",
    1: "1.5 倍行距",
    2: "两倍行距",
    3: "最小值",
    4: "固定值",
    5: "多倍行距",
};

/**
 * 行距 → 中文。
 *
 * 排版设置里的行距是「固定值」，因此固定值时显示为 `固定值 28.95pt`；
 * 其它规则直接显示规则名（如「单倍行距」），便于直接看出差异。
 */
export function formatLineSpacing(value: number | null, rule: number | null): string {
    if (rule === null) {
        return value === null ? "未知" : `${trimNumber(value)}pt`;
    }
    if (rule === WD_LINE_SPACE_EXACTLY) {
        return value === null ? "固定值" : `固定值 ${trimNumber(value)}pt`;
    }
    return LINE_SPACE_LABELS[rule] ?? `行距规则 ${rule}`;
}

// ==================== 判定 ====================

/** 字号 / 缩进 / 行距的容差（磅 / 字符） */
const NUMERIC_TOLERANCE = 0.15;

/**
 * 比较当前格式与期望格式，返回所有不符项。
 *
 * 规则：
 * - 期望字段为 `undefined` → 不判定；
 * - 字体名**严格相等**比较，不做别名归一；
 *   中文字体缺失/混合也判为异常，西文字体缺失则跳过（部分 WPS 版本对纯中文段不返回值）；
 * - 字号 / 加粗 / 对齐 / 缩进的当前值为 `null`（读不到或混合）→ 不判定，避免误报；
 * - 行距同时比对「固定值」规则与具体磅值；
 * - 数值有 {@link NUMERIC_TOLERANCE} 的容差，吸收 COM 浮点误差。
 *
 * @param kind 段落主语义
 * @param current 当前格式快照
 * @param config 排版配置
 */
export function checkFormat(
    kind: ParagraphSemanticKind,
    current: CurrentFormat,
    config: TypographyConfig,
): FormatIssue[] {
    const expected = getExpectedFormat(kind, config);
    if (!expected) return [];

    const issues: FormatIssue[] = [];

    // 中文字体：严格按设置中的字体名比较，不做别名匹配
    if (expected.font && current.fontName !== expected.font) {
        issues.push({
            field: "font",
            label: "字体",
            expected: expected.font,
            actual: current.fontName || "混合/未知",
        });
    }

    // 西文字体：只在能读到时严格比较（部分 WPS 版本纯中文段返回空串）
    if (
        expected.asciiFont &&
        current.asciiFontName &&
        current.asciiFontName !== expected.asciiFont
    ) {
        issues.push({
            field: "fontAscii",
            label: "西文字体",
            expected: expected.asciiFont,
            actual: current.asciiFontName,
        });
    }

    if (
        expected.fontSize !== undefined &&
        current.fontSize !== null &&
        Math.abs(expected.fontSize - current.fontSize) > NUMERIC_TOLERANCE
    ) {
        issues.push({
            field: "size",
            label: "字号",
            expected: formatFontSize(expected.fontSize),
            actual: formatFontSize(current.fontSize),
        });
    }

    if (expected.bold !== undefined && current.bold !== null && expected.bold !== current.bold) {
        issues.push({
            field: "bold",
            label: "加粗",
            expected: formatBold(expected.bold),
            actual: formatBold(current.bold),
        });
    }

    if (
        expected.alignment !== undefined &&
        current.alignment !== null &&
        expected.alignment !== current.alignment
    ) {
        issues.push({
            field: "alignment",
            label: "对齐",
            expected: formatAlignment(expected.alignment),
            actual: formatAlignment(current.alignment),
        });
    }

    if (
        expected.firstLineIndent !== undefined &&
        current.firstLineIndent !== null &&
        Math.abs(expected.firstLineIndent - current.firstLineIndent) > NUMERIC_TOLERANCE
    ) {
        issues.push({
            field: "indent",
            label: "首行缩进",
            expected: formatIndent(expected.firstLineIndent),
            actual: formatIndent(current.firstLineIndent),
        });
    }

    // 行距：设置里是固定值，先比规则，再比磅值
    if (current.lineSpacingRule !== null) {
        const ruleMismatch =
            expected.lineSpacingRule !== undefined &&
            current.lineSpacingRule !== expected.lineSpacingRule;
        const valueMismatch =
            expected.lineSpacing !== undefined &&
            current.lineSpacing !== null &&
            Math.abs(expected.lineSpacing - current.lineSpacing) > NUMERIC_TOLERANCE;

        if (ruleMismatch || valueMismatch) {
            issues.push({
                field: "spacing",
                label: "行距",
                expected: formatLineSpacing(
                    expected.lineSpacing ?? null,
                    expected.lineSpacingRule ?? null,
                ),
                actual: formatLineSpacing(current.lineSpacing, current.lineSpacingRule),
            });
        }
    }

    return issues;
}
