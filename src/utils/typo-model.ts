/**
 * @file 公文排版中间层模型
 *
 * 设计目标：
 * 1. 纯文本预分析：不依赖 WPS COM，支持 vitest 单测（输入纯字符串）。
 * 2. 结构分析输出语义标签：mainTitle / subtitle / salutation / h1 / h2 / h3 / topic / attachment / signature 等。
 * 3. 差异检测：传入“当前已排版状态”，仅输出真正需要执行的修改指令，减少 COM 操作。
 * 4. 与 typo-engine.ts 兼容：ParaModification 结构保持一致，方便复用 applyModifications。
 */
import type { SimpleFontConfig, TopicBoldMode, TypographyConfig } from "@/jsa/types";
import type { BaseParaInfo } from "@/utils/typo";

import {
    findMainTitleBlocks,
    FORBIDDEN_SYMBOLS_REGEX,
    H1_REGEX,
    H2_REGEX,
    H3_REGEX,
    isSubtitleLine,
    SALUTATION_EACH_UNIT_REGEX,
    SALUTATION_EXCLUDE_REGEX,
    SALUTATION_GREETING_REGEX,
    SALUTATION_JOB_TITLE_REGEX,
    SALUTATION_ORG_DEPT_REGEX,
    SALUTATION_REGEX,
    SIGNATURE_DATE_REGEX,
    TOPIC_PREFIX_REGEX,
    TOPIC_REGEX,
} from "@/utils/typo";

// ==================== 1. 段落语义类别 ====================

/**
 * 段落语义类别。
 *
 * @remarks
 * 一段可能同时命中多个类别，例如三级标题中又包含 topic 小标题。
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

// ==================== 2. 子范围修改（段内部分文字，如仅加粗"一是"） ====================

/**
 * 段内子范围修改。
 *
 * @remarks
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

// ==================== 3. 段落级修改指令 ====================
//
// 约定：所有字段为 undefined 代表"不需修改"；显式赋值代表"要改成这个值"。
// 这样可以很方便地做差异对比（期望 - 当前 = 需要执行的指令）。

/**
 * 段落级修改指令。
 *
 * @remarks
 * 约定：所有字段为 `undefined` 表示“不修改”；显式赋值表示“要改成该值”。
 * 这样可以方便地做差异对比：期望状态 - 当前状态 = 需要执行的指令。
 */
export interface ParaModification {
    /** 1-based 段落序号（与 WPS `Paragraphs.Item` 对齐） */
    index: number;
    /** 段落样式名称，如 `公文正文` / `公文标题` */
    style?: string;
    /** 整段字体名称，同时作用于 `NameFarEast` 和 `NameAscii` */
    fontName?: string;
    /** 整段字号 */
    fontSize?: number;
    /** 整段是否加粗 */
    bold?: boolean;
    /** 段落对齐方式（`Word.WdParagraphAlignment`，如 `wdAlignParagraphCenter`） */
    alignment?: number;
    /** 首行缩进字符数，`0` 表示顶格 */
    firstLineIndent?: number;
    /** 段内子范围修改，优先级最高，会覆盖整段设置 */
    subRanges?: SubRangeMod[];
    /** 调试用：段落语义类别，不参与执行 */
    _kind?: ParagraphSemanticKind;
    /** 调试用：修改原因，不参与执行 */
    _reason?: string;
}

// ==================== 4. 结构分析结果 ====================

/**
 * 结构化段落信息。
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
    /** 落款位置（0-based 段落索引） */
    signature: {
        /** 发文机关段落索引 */
        unitIndex: number | null;
        /** 成文日期段落索引 */
        dateIndex: number | null;
    };
}

// ==================== 5. 抬头判定辅助 ====================

/**
 * 判断文本是否符合抬头/主送机关特征。
 *
 * @param text 待判断文本
 * @returns 是否符合抬头特征
 */
export function looksLikeSalutation(text: string): boolean {
    if (SALUTATION_EXCLUDE_REGEX.test(text)) return false;
    const words = text.replace(/\r$/, "").split("、");
    const patterns = [
        SALUTATION_ORG_DEPT_REGEX,
        SALUTATION_EACH_UNIT_REGEX,
        SALUTATION_GREETING_REGEX,
        SALUTATION_JOB_TITLE_REGEX,
    ];
    return words.some((w) => patterns.some((p) => p.test(w)));
}

// ==================== 6. 落款日期判定 ====================

/**
 * 判断文本是否像落款成文日期。
 *
 * @param text 待判断文本
 * @returns 是否符合成文日期正则
 */
export function looksLikeSignatureDate(text: string): boolean {
    return SIGNATURE_DATE_REGEX.test(text);
}

// =========================================================================
// 第一阶段：解析（纯文本 → BaseParaInfo[]）
// =========================================================================

/**
 * 将纯文本按段落切分，并转换为 `BaseParaInfo[]`。
 *
 * @param raw 原始纯文本，支持 `\n`、`\r\n`、`\r` 换行
 * @returns 段落信息数组；每段 `text` 末尾都会补 `\r`，与 WPS `Range.Text` 保持一致
 *
 * @remarks
 * - 输入会先统一换行为 `\r`；
 * - 以 `\r` 拆分后，最后一段空段会被过滤（输入只有 `\r` 的边界情况除外）。
 */
export function parsePlainTextToParas(raw: string): BaseParaInfo[] {
    // 统一换行：Word 内部用 \r，输入的 \n 也要转为 \r 行为一致
    const normalized = raw.replace(/\r\n|\r|\n/g, "\r");
    // 以 \r 拆分，但保留每个段尾的 \r（最后一段如果没有 \r 也要补上，便于后续正则一致）
    const parts = normalized.split("\r");
    // "a\rb\r".split("\r") → ["a", "b", ""]；要过滤最后一个空段（除非输入只有 "\r"）
    const paras: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        if (i === parts.length - 1 && parts[i] === "") continue;
        paras.push(parts[i] + "\r");
    }

    return paras.map((text) => {
        const trimmed = text.trim();
        return {
            text,
            isEmpty: trimmed === "",
            isAttachment: /^附件\s*[0-9]+/.test(trimmed),
            hasFormFeed: text.includes("\f"),
            hasForbidden: FORBIDDEN_SYMBOLS_REGEX.test(trimmed),
            isHeading: false, // 后续 analyze 阶段填
            isInRange: true,
            isTable: text.includes("\x07"),
        };
    });
}

// =========================================================================
// 第二阶段：结构分析（BaseParaInfo[] → DocumentStructure）
// =========================================================================

/**
 * 提取段内 topic 小标题的匹配范围。
 *
 * @param text 段落文本
 * @returns 段内子范围匹配列表
 */
function matchSubMatches(text: string): StructuredParaInfo["subMatches"] {
    const result: StructuredParaInfo["subMatches"] = [];

    // topic 小标题（整段内可有多个）
    const topicIter = text.matchAll(TOPIC_REGEX);
    for (const m of topicIter) {
        result.push({
            kind: "topic",
            start: m.index!,
            length: m[0].length,
            text: m[0],
        });
    }
    return result;
}

/**
 * 对单段文本做初步语义识别。
 *
 * @param info 段落基础信息
 * @returns 语义类别集合、主分类，以及是否为副标题行
 *
 * @remarks
 * 不处理主标题块、落款等需要全局上下文的判断。
 */
function classifyPara(info: BaseParaInfo): {
    kinds: Set<ParagraphSemanticKind>;
    primary: ParagraphSemanticKind;
    isSubtitleLine?: boolean;
} {
    const kinds = new Set<ParagraphSemanticKind>();
    const text = info.text;

    if (info.isEmpty) {
        kinds.add("empty");
        return { kinds, primary: "empty" };
    }

    if (info.isAttachment) {
        kinds.add("attachment");
    }

    // 抬头
    if (SALUTATION_REGEX.test(text) && looksLikeSalutation(text)) {
        kinds.add("salutation");
    }

    // 层级标题（每段最多匹配一个）
    if (H1_REGEX.test(text)) kinds.add("h1");
    else if (H2_REGEX.test(text)) kinds.add("h2");
    else if (H3_REGEX.test(text)) kinds.add("h3");

    // 副标题（单行判断，主标题块内部再提升为 subtitle）
    const isSubtitle = isSubtitleLine(text);

    // 段内 topic
    if (TOPIC_REGEX.test(text)) {
        kinds.add("topic");
        TOPIC_REGEX.lastIndex = 0; // 重置 g 标志
    }

    // 如果一个都没匹配到，视为 body
    if (kinds.size === 0 && !isSubtitle) {
        kinds.add("body");
    }

    // 主分类优先级：h1/h2/h3 > salutation > attachment > topic > body
    const priority: ParagraphSemanticKind[] = [
        "h1",
        "h2",
        "h3",
        "salutation",
        "attachment",
        "topic",
        "body",
    ];
    let primary: ParagraphSemanticKind = "body";
    for (const k of priority) {
        if (kinds.has(k)) {
            primary = k;
            break;
        }
    }
    return { kinds, primary, isSubtitleLine: isSubtitle };
}

/**
 * 核心分析函数：输入段落信息，输出文档结构分析结果。
 *
 * @param baseInfos 段落信息；`index` 应为 0-based 数组下标，`isHeading` 会被覆盖重算
 * @param isFullDoc 是否为全文排版；`false` 时跳过主标题、落款等需要全局上下文的判断
 * @returns 文档结构分析结果
 *
 * @remarks
 * 不做任何 COM 操作，纯 JS，可测试。输入可来自纯文本或 WPS COM 读取。
 */
export function analyzeDocumentStructure(
    baseInfos: BaseParaInfo[],
    isFullDoc: boolean = true,
): DocumentStructure {
    // 1. 初步逐段分类
    const paragraphs: StructuredParaInfo[] = baseInfos.map((info, idx) => {
        const { kinds, primary, isSubtitleLine } = classifyPara(info);
        // 标记是否 heading（h1/h2/h3）
        const isHeading = kinds.has("h1") || kinds.has("h2") || kinds.has("h3");
        return {
            ...info,
            index: idx + 1, // 1-based
            semanticKinds: kinds,
            primaryKind: primary,
            subMatches: kinds.has("topic") ? matchSubMatches(info.text) : [],
            isHeading,
            isSubtitleLine,
        };
    });

    // 2. 全文模式下：主标题块识别（复用现有函数）
    let mainTitleBlocks: Array<[number, number]> = [];
    if (isFullDoc) {
        // findMainTitleBlocks 依赖 paraInfos 的 isHeading，所以传已处理的数组
        mainTitleBlocks = findMainTitleBlocks(paragraphs);
    }

    // 3. 把主标题块内的段落升级为 mainTitle / subtitle
    for (const [startIdx, endIdx] of mainTitleBlocks) {
        for (let i = startIdx; i <= endIdx; i++) {
            const p = paragraphs[i];
            if (!p) continue;
            // 已经是层级标题的不抢（避免"一、XXX"这种被误当主标题时被降级覆盖）
            if (
                p.semanticKinds.has("h1") ||
                p.semanticKinds.has("h2") ||
                p.semanticKinds.has("h3")
            ) {
                continue;
            }
            p.semanticKinds.delete("body");
            if (p.isSubtitleLine) {
                p.semanticKinds.add("subtitle");
                p.primaryKind = "subtitle";
            } else {
                p.semanticKinds.add("mainTitle");
                p.primaryKind = "mainTitle";
            }
        }
    }

    // 4. 全文模式下：落款识别（从后往前找日期 + 上一段是单位）
    const signature: DocumentStructure["signature"] = { unitIndex: null, dateIndex: null };
    if (isFullDoc) {
        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const p = paragraphs[i];
            if (looksLikeSignatureDate(p.text)) {
                signature.dateIndex = i;
                // 上一段（跳过空行）作为单位
                let prev = i - 1;
                while (prev >= 0 && paragraphs[prev].isEmpty) prev--;
                if (prev >= 0 && !paragraphs[prev].isEmpty) {
                    signature.unitIndex = prev;
                }
                break;
            }
        }
        if (signature.unitIndex !== null) {
            paragraphs[signature.unitIndex].semanticKinds.add("signatureUnit");
            paragraphs[signature.unitIndex].primaryKind = "signatureUnit";
        }
        if (signature.dateIndex !== null) {
            paragraphs[signature.dateIndex].semanticKinds.add("signatureDate");
            paragraphs[signature.dateIndex].primaryKind = "signatureDate";
        }
    }

    return { paragraphs, mainTitleBlocks, signature };
}

// =========================================================================
// 第三阶段：期望样式生成（结构 → 每段的期望状态）
// =========================================================================

/**
 * 每段期望的目标状态。
 *
 * @remarks
 * 保存完整状态，便于与当前快照做 diff；未列出的字段表示沿用样式默认值。
 */
export interface DesiredParaState {
    /** 目标段落样式 */
    style: "公文正文" | "公文标题";
    /** 目标字体；不填表示沿用样式默认字体 */
    fontName?: string;
    /** 目标字号 */
    fontSize?: number;
    /** 目标加粗状态 */
    bold?: boolean;
    /** 目标对齐方式 */
    alignment?: number;
    /** 目标首行缩进字符数，`0` 表示顶格 */
    firstLineIndent?: number;
    /** 目标段内子范围修改 */
    subRanges?: SubRangeMod[];
}

/**
 * 根据标题前缀正则生成段内子范围修改。
 *
 * @param text 段落文本
 * @param regex 标题前缀正则
 * @param cfg 对应标题层级的字体配置
 * @returns 子范围修改数组；无匹配时返回 `undefined`
 */
function makeTitleSubRange(
    text: string,
    regex: RegExp,
    cfg: SimpleFontConfig,
): SubRangeMod[] | undefined {
    const match = regex.exec(text);
    if (!match) return undefined;
    const sub: SubRangeMod = { start: match.index, length: match[0].length };
    if (cfg.font) sub.fontName = cfg.font;
    if (cfg.bold !== undefined) sub.bold = !!cfg.bold;
    return [sub];
}

/**
 * 计算单条 topic 小标题的加粗范围。
 *
 * @param match topic 匹配信息；`text` 为整句文本，`start` / `length` 为段内位置
 * @param mode 加粗模式
 * @returns 需要加粗的段内子范围；`none` 或无法匹配前缀时返回空数组
 *
 * @remarks
 * `auto` 模式下，句内最多 1 个逗号且长度不超过一行（28 字 - 2 缩进 = 26 字）时整句加粗；
 * 否则仅加粗 `X是` / `X要` 前缀。
 *
 * @see TOPIC_PREFIX_REGEX
 */
export function computeTopicBoldRanges(
    match: { text: string; start: number; length: number },
    mode: TopicBoldMode,
): SubRangeMod[] {
    // match.text 匹配的是整句文本
    if (mode === "none") return [];

    // 不处理非 topic 文本，避免调用方误传
    TOPIC_REGEX.lastIndex = 0;
    if (!TOPIC_REGEX.test(match.text)) return [];

    const commaCount = (match.text.match(/，/g) || []).length;
    // 整句加粗：auto 模式下，句内最多 1 个逗号，且小于一行（28 字 - 2 缩进 = 26 字）
    const shouldFullBold = mode === "auto" && commaCount < 2 && match.text.length <= 26;
    if (shouldFullBold) {
        return [{ start: match.start, length: match.length, bold: true }];
    }

    // 仅前缀加粗（"X是" 或 "X要"）
    const prefix = match.text.match(TOPIC_PREFIX_REGEX)?.[0];
    if (!prefix) return [];
    return [{ start: match.start, length: prefix.length, bold: true }];
}

/**
 * 根据配置生成每段期望的样式状态。
 *
 * @param structure 文档结构分析结果
 * @param config 排版配置
 * @returns Map，key 为 1-based 段落序号；仅包含需要与默认正文不同的段落
 *
 * @remarks
 * 未出现在 Map 中的段落，其期望状态就是“公文正文样式，无额外覆盖”。
 */
export function buildDesiredStates(
    structure: DocumentStructure,
    config: TypographyConfig,
): Map<number, DesiredParaState> {
    const result = new Map<number, DesiredParaState>();
    const { paragraphs } = structure;

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        if (p.isEmpty) continue;

        const idx1 = p.index; // 1-based
        const s: DesiredParaState = {
            style: "公文正文",
        };

        // === 主标题 / 副标题 ===
        if (p.semanticKinds.has("mainTitle")) {
            s.style = "公文标题";
        } else if (p.semanticKinds.has("subtitle")) {
            s.style = "公文标题";
            s.fontName = "楷体_GB2312";
            s.fontSize = 16;
            s.bold = false;
        }

        // === 附件标题行：黑体、顶格 ===
        else if (p.semanticKinds.has("attachment")) {
            s.fontName = "黑体";
            s.firstLineIndent = 0;
        }

        // === 抬头：楷体（或配置）、顶格 ===
        else if (p.semanticKinds.has("salutation")) {
            s.fontName = config.salutation.font || config.main.zh;
            s.bold = !!config.salutation.bold;
            s.firstLineIndent = 0;
        }

        // === 一 / 二 / 三级标题 ===
        else if (p.semanticKinds.has("h1")) {
            const subs = makeTitleSubRange(p.text, H1_REGEX, config.h1);
            if (subs) s.subRanges = [...(s.subRanges ?? []), ...subs];
        } else if (p.semanticKinds.has("h2")) {
            const subs = makeTitleSubRange(p.text, H2_REGEX, config.h2);
            if (subs) s.subRanges = [...(s.subRanges ?? []), ...subs];
        } else if (p.semanticKinds.has("h3")) {
            const subs = makeTitleSubRange(p.text, H3_REGEX, config.h3);
            if (subs) s.subRanges = [...(s.subRanges ?? []), ...subs];
        }

        // === topic 小标题加粗（段内子范围） ===
        if (p.semanticKinds.has("topic") && p.subMatches.length) {
            for (const sm of p.subMatches) {
                const ranges = computeTopicBoldRanges(sm, config.topicBoldMode);
                if (ranges.length) {
                    s.subRanges = [...(s.subRanges ?? []), ...ranges];
                }
            }
        }

        result.set(idx1, s);
    }

    return result;
}

// =========================================================================
// 第四阶段：差异计算（期望状态 - 当前状态 = 修改指令）
// =========================================================================

/**
 * 当前段落的实际样式快照，用于差异对比。
 *
 * @remarks
 * 通常来自 WPS COM 读取。
 */
export interface CurrentParaSnapshot {
    /** 1-based 段落序号 */
    index: number;
    /** 当前段落样式名 */
    styleName: string;
    /** 当前中文字体名 */
    fontNameFarEast?: string;
    /** 当前西文字体名 */
    fontNameAscii?: string;
    /** 当前字号 */
    fontSize?: number;
    /** 当前加粗状态；`undefined` 表示混合，避免来回切换 */
    bold?: boolean;
    /** 当前对齐方式 */
    alignment?: number;
    /** 当前首行缩进字符数 */
    firstLineIndentChars?: number;
}

/**
 * 对比期望状态与当前快照，仅输出真正需要修改的指令。
 *
 * @param desired 期望状态，key 为 1-based 段落序号
 * @param currentSnapshots 当前段落样式快照；传 `null` 时输出完整指令
 * @param totalCount 段落总数
 * @returns 需要执行的修改指令，按段落索引倒序排列
 *
 * @remarks
 * - 仅输出与当前快照不同的字段；
 * - 无任何字段需要修改的段落会被跳过；
 * - 子范围当前不逐项比对是否已加粗，存在期望子范围时会直接下发。
 */
export function computeModifications(
    desired: Map<number, DesiredParaState>,
    currentSnapshots: Map<number, CurrentParaSnapshot> | null,
    totalCount: number,
): ParaModification[] {
    const result: ParaModification[] = [];

    // 默认期望（不在 desired Map 里的段落也需要应用正文样式，如果当前不是的话）
    const DEFAULT_DESIRED: DesiredParaState = { style: "公文正文" };

    for (let idx1 = 1; idx1 <= totalCount; idx1++) {
        const d = desired.get(idx1) || DEFAULT_DESIRED;
        const cur = currentSnapshots?.get(idx1);

        const mod: ParaModification = { index: idx1 };

        // 样式
        if (!cur || cur.styleName !== d.style) {
            mod.style = d.style;
        }

        // 字体（不填 = 沿用 style 默认 → 所以 undefined 代表"不要覆盖"）
        if (d.fontName !== undefined) {
            if (!cur || cur.fontNameFarEast !== d.fontName || cur.fontNameAscii !== d.fontName) {
                mod.fontName = d.fontName;
            }
        }
        if (d.fontSize !== undefined) {
            if (!cur || cur.fontSize !== d.fontSize) {
                mod.fontSize = d.fontSize;
            }
        }
        if (d.bold !== undefined) {
            if (!cur || cur.bold !== d.bold) {
                mod.bold = d.bold;
            }
        }

        // 段落格式
        if (d.alignment !== undefined) {
            if (!cur || cur.alignment !== d.alignment) {
                mod.alignment = d.alignment;
            }
        }
        if (d.firstLineIndent !== undefined) {
            if (!cur || cur.firstLineIndentChars !== d.firstLineIndent) {
                mod.firstLineIndent = d.firstLineIndent;
            }
        }

        // 子范围（当前版本暂不对比子范围是否已加粗——粒度太细，且读取成本高；
        //         但如果上一轮指令完全一样且当前 style/font/para 都匹配，可整段跳过）
        if (d.subRanges && d.subRanges.length) {
            mod.subRanges = d.subRanges;
        }

        // 空指令：没任何字段需要改 → 跳过
        const hasAny =
            mod.style !== undefined ||
            mod.fontName !== undefined ||
            mod.fontSize !== undefined ||
            mod.bold !== undefined ||
            mod.alignment !== undefined ||
            mod.firstLineIndent !== undefined ||
            (mod.subRanges && mod.subRanges.length > 0);
        if (hasAny) {
            result.push(mod);
        }
    }

    // 按索引倒序返回（apply 时一般从尾到头，避免修改前面段落导致后面 index 偏移）
    result.sort((a, b) => b.index - a.index);
    return result;
}

// =========================================================================
// 便捷组合：全流程（纯文本输入，输出修改指令——方便单测）
// =========================================================================

/**
 * 纯文本便捷入口：输入纯文本和配置，输出结构分析、期望状态与修改指令。
 *
 * @param text 原始纯文本
 * @param config 排版配置
 * @param options 可选参数
 * @param options.isFullDoc 是否为全文排版；默认 `true`
 * @returns 结构分析、期望状态和修改指令
 *
 * @remarks
 * 此函数无法获取当前快照（因为无 COM 环境），所以返回的 `modifications` 是完整指令而非差异指令；
 * 这正是单测需要的——可直接断言哪些段落需要被改为什么样式。
 */
export function analyzePlainText(
    text: string,
    config: TypographyConfig,
    options: { isFullDoc?: boolean } = {},
): {
    structure: DocumentStructure;
    desiredStates: Map<number, DesiredParaState>;
    modifications: ParaModification[];
} {
    const baseInfos = parsePlainTextToParas(text);
    const structure = analyzeDocumentStructure(baseInfos, options.isFullDoc ?? true);
    const desiredStates = buildDesiredStates(structure, config);
    const modifications = computeModifications(desiredStates, null, baseInfos.length);
    // modifications 前面被倒序了，测试时不方便按顺序看，这里再排回正序
    modifications.sort((a, b) => a.index - b.index);
    return { structure, desiredStates, modifications };
}
