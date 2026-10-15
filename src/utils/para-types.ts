/**
 * @file 公文排版中间层类型定义
 *
 * 所有类型集中于此，便于跨模块引用；本文件不含任何运行时代码。
 */

// ==================== 段落基础信息 ====================

/**
 * 段落基础信息（纯文本分析可产出）。
 *
 * 这里的字段都是"COM 读取 / 纯文本解析"能直接得到的**客观事实**，
 * 不包含任何业务策略（如"跳过"由 `isSkipped` 单独承载）。
 */
export interface BaseParaInfo {
    /** 段落文本（含尾部的 `\r`，与 WPS `Range.Text` 一致） */
    text: string;
    /** 是否为空段落 */
    isEmpty: boolean;
    /** 段落开头为"附件X" */
    isAttachment: boolean;
    /** 包含换页符 `\f` */
    hasFormFeed: boolean;
    /** 包含禁止符号（见 FORBIDDEN_SYMBOLS_REGEX） */
    hasForbidden: boolean;
    /** 已被识别为层级标题（h1/h2/h3）；由分析阶段计算 */
    isHeading: boolean;
    /** 是否在排版范围内 */
    isInRange: boolean;
    /** 段落含 `\x07`（Word 表格单元格标记） */
    isTable: boolean;

    /**
     * 整段跳过排版。
     *
     * 触发条件（任一，由 COM 读取层决定）：
     * - 表格段落
     * - 被 `zdoc_*` 书签覆盖（见 `collectSkipRanges`）
     * - 段落样式为"不排版"（用户手动标记）
     *
     * 该字段是**最高优先级**：任何"期望排版"都不会覆盖它。
     */
    isSkipped: boolean;
}

/**
 * COM 读取到的段落信息（含 1-based 索引与样式名）。
 */
export interface ParaInfo extends BaseParaInfo {
    /** 1-based（WPS `Paragraphs.Item` 序号从 1 开始） */
    index: number;
    /** 当前段落样式名（COM: `Range.Style.NameLocal`） */
    currentStyleName: string;
}

// ==================== 段落语义分类 ====================

/**
 * 段落语义类别。
 *
 * 一段可能同时命中多个类别，例如三级标题中又包含 topic 小标题。
 * 这里只描述"段落是什么"，不描述"排版时怎么处理"（后者由 isSkipped 承载）。
 */
export type ParagraphSemanticKind =
    /** 空行 */
    | "empty"
    /** 主标题（公文标题样式） */
    | "mainTitle"
    /** 副标题（主标题下的楷体行：稿、——、文号等） */
    | "subtitle"
    /** 抬头 / 主送机关 */
    | "salutation"
    /** 一级标题：一、二、…… */
    | "h1"
    /** 二级标题：（一）（二）…… */
    | "h2"
    /** 三级标题：1. 2. …… */
    | "h3"
    /** 段内小标题：一是…… / 二要…… */
    | "topic"
    /** 附件标题行 */
    | "attachment"
    /** 落款：发文机关 */
    | "signatureUnit"
    /** 落款：成文日期 */
    | "signatureDate"
    /** 普通正文 */
    | "body"
    /** 表格 */
    | "table";

// ==================== 段内子范围 ====================

/**
 * 段内子范围修改。
 *
 * 用于只修改段内部分文字，例如仅加粗 topic 前缀。
 */
export interface SubRangeMod {
    /** 段内偏移（0-based，相对段首） */
    start: number;
    /** 字符长度 */
    length: number;
    /** 是否加粗；`undefined` 表示不修改 */
    bold?: boolean;
    /** 字体名称；`undefined` 表示不修改 */
    fontName?: string;
    /** 字号；`undefined` 表示不修改 */
    fontSize?: number;
}

// ==================== 结构分析结果 ====================

/**
 * 结构化段落信息（分析阶段产出）。
 */
export interface StructuredParaInfo extends BaseParaInfo {
    /** 1-based 段落序号 */
    index: number;
    /** 段落命中的语义类别集合；可能多种，如一段既是 h3 又含 topic 子句 */
    semanticKinds: Set<ParagraphSemanticKind>;
    /** 主分类，用于显示和判断 */
    primaryKind: ParagraphSemanticKind;
    /** 段内匹配的子范围，如 topic 前缀加粗、topic 整句 */
    subMatches: Array<{
        /** 子范围类型，目前主要是 `topic` */
        kind: ParagraphSemanticKind;
        /** 段内偏移（0-based） */
        start: number;
        /** 字符长度 */
        length: number;
        /** 匹配到的文本 */
        text: string;
    }>;
    /** 是否为副标题特征行 */
    isSubtitleLine?: boolean;
}

/**
 * 文档结构分析结果。
 */
export interface DocumentStructure {
    /** 结构化段落列表 */
    paragraphs: StructuredParaInfo[];
    /** 主标题块列表；`[startIdx, endIdx]` 为 0-based 段落索引闭区间 */
    mainTitleBlocks: Array<[number, number]>;
    /**
     * 所有落款位置（从前往后），可能多个：正文 + 各附件。
     */
    signatures: Array<{
        /**
         * 所有单位行（从上到下，0-based 段落索引）。
         *
         * - 支持联合发文的多行单位落款（不盖章）或单位名称较长分为 2 行的落款。
         * - 从日期往前扫，直到遇到空行为止，中间所有非空段落都视为单位行。
         * - 空数组表示"只有日期，无单位"。
         */
        unitIndices: number[];
        /** 日期段落 0-based 索引 */
        dateIndex: number;
    }>;
}

// ==================== 属性值表 ====================

/**
 * 段落属性值表。
 *
 * 新增一个排版属性时，只需：
 *   1. 在此接口添加字段；
 *   2. 在 `para-attributes.ts` 的 `ATTRS` 数组中添加对应描述符。
 * 无需修改 `computeModifications` / `applyModifications` 或其他任何函数。
 */
export interface ParaAttrValues {
    /** 段落样式名（如 `公文正文` / `公文标题`） */
    style: string;
    /** 整段字体名称（同时作用于 `NameFarEast` 与 `NameAscii`） */
    fontName: string;
    /** 整段字号 */
    fontSize: number;
    /** 整段是否加粗 */
    bold: boolean;
    /** 段落对齐方式（`Word.WdParagraphAlignment`） */
    alignment: number;
    /** 首行缩进字符数，`0` 表示顶格 */
    firstLineIndent: number;
    /** 段内子范围修改，优先级最高，会覆盖整段设置 */
    subRanges: SubRangeMod[];
}

/**
 * 段落级修改指令。
 *
 * 约定：所有字段为 `undefined` 表示"不修改"；显式赋值表示"要改成该值"。
 * 这样可以方便地做差异对比：期望状态 - 当前状态 = 需要执行的指令。
 */
export interface ParaModification extends Partial<ParaAttrValues> {
    /** 1-based 段落序号（与 WPS `Paragraphs.Item` 对齐） */
    index: number;
    /** 调试用：段落语义类别，不参与执行 */
    _kind?: ParagraphSemanticKind;
    /** 调试用：修改原因，不参与执行 */
    _reason?: string;
}

// ==================== 期望上下文 ====================

/**
 * 期望值推导的运行时上下文。
 *
 * 只包含"运行时才能确定"的信息（如 COM 里实际的样式名）；
 * 其他配置（字体、字号等）通过 `TypographyConfig` 传入。
 */
export interface DesiredCtx {
    /** 实际运行时"公文正文"对应的样式名 */
    mainStyleName: string;
    /** 实际运行时"公文标题"对应的样式名 */
    titleStyleName: string;
}

// ==================== 书签跳过区间 ====================

/**
 * 字符区间（用于书签覆盖判定）。
 *
 * 用字符区间而非段落索引，是为了：
 * - 支持书签只覆盖某段的一部分
 * - 支持书签跨越多个段落
 * - 与 `Paragraphs.Item` 索引机制解耦
 */
export interface SkipRange {
    start: number;
    end: number;
}
