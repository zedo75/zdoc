/**
 * @file 公文排版中间层模型（纯逻辑层）
 *
 * 设计目标：
 * 1. 纯文本预分析：不依赖 WPS COM，支持 vitest 单测（输入纯字符串）。
 * 2. 结构分析输出语义标签：mainTitle / subtitle / salutation / h1 / h2 / h3 等。
 * 3. 不做 COM 操作，不做差异对比，不做属性写入——那些属于上层模块。
 */
import type { SimpleFontConfig, TopicBoldMode } from "@/jsa/types";
import type {
    DocumentStructure,
    ListKind,
    ParagraphSemanticKind,
    ParaGroup,
    PlainParaInfo,
    StructuredParaInfo,
    SubRangeMod,
} from "@/utils/para-types";

import { name as SURNAME_ARR } from "@wyxin/baijiaxing";

import {
    ATTACHMENT_LINE_PREFIX_REGEX,
    DOC_TITLE_KIND_REGEX,
    ETHNIC_NAME_REGEX,
    H1_REGEX,
    H2_REGEX,
    H3_REGEX,
    INLINE_DRAFT_PAREN_REGEX,
    LETTERHEAD_FORBIDDEN_REGEX,
    LETTERHEAD_ORG_TAIL_REGEX,
    LIST_ITEM_NUMERIC_REGEX,
    LIST_ITEM_PAREN_HAN_REGEX,
    LIST_ITEM_PAREN_NUM_REGEX,
    MAIN_TITLE_FORBIDDEN_SYMBOLS_REGEX,
    PLAIN_NAME_REGEX,
    SALUTATION_EACH_UNIT_REGEX,
    SALUTATION_EXCLUDE_REGEX,
    SALUTATION_GREETING_REGEX,
    SALUTATION_JOB_TITLE_REGEX,
    SALUTATION_ORG_DEPT_REGEX,
    SALUTATION_REGEX,
    SIGNATURE_DATE_REGEX,
    SUBTITLE_PAREN_ORDINAL_REGEX,
    SUBTITLE_PAREN_REGEX,
    TOPIC_REGEX,
} from "@/utils/para-patterns";

// ==================== 抬头判定辅助 ====================

/**
 * 判断文本是否符合抬头/主送机关特征。
 *
 * 先排除黑名单，再按顿号拆成词组、逐词匹配白名单——
 * 因此 "各省、自治区、直辖市人民政府：" 这类多主体抬头能通过。
 *
 * @param text 待判断文本
 * @returns 是否符合抬头特征
 */
export function isLikelySalutation(text: string): boolean {
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

/**
 * 段落的「标题部分」：第一个句号之前的内容；没有句号则取整段（去掉段尾 `\r`）。
 *
 * 句号之后属于「正文合段」的说明部分，不参与标题判定。
 */
function getHeadingPart(text: string): string {
    const firstPeriod = text.indexOf("。");
    return firstPeriod >= 0 ? text.slice(0, firstPeriod) : text.replace(/\r$/, "");
}

/**
 * 首句号前（无句号则取段尾，去掉 `\r`）的 `，` / `、` 分隔符数量。
 *
 * 分隔符过多说明是"并列描述"而不是标题，用于 h1 / h2 / h3 的简洁性判定。
 *
 * `firstPeriod >= 0`：段首就是句号时 `before` 为空串（第一个句号前没有内容），
 * 不能退化为统计整段。
 */
function countSeparatorsBeforePeriod(text: string): number {
    return (getHeadingPart(text).match(/[，、]/g) || []).length;
}

/** 一级标题编号前缀（`一、`…`十九、`）；`、` 是编号分隔符，不计入分隔符统计 */
const H1_PREFIX_REGEX = /^[一二三四五六七八九十]+、/;

/**
 * 段落是 h1 候选（满足 H1_REGEX 且第一个句号前 `，`/`、` 少于 2 个）。
 *
 * 与 {@link isLikelyH2} / {@link isLikelyH3} 同理：首句号前分隔符过多说明是并列描述而不是标题，
 * 例如「一、并列描述一，描述二、描述三，描述四。」
 * 这类整段正文不能被套上黑体一级标题格式。
 */
export function isLikelyH1(text: string): boolean {
    // 编号自身的 `、` 不算分隔符，先剥掉「一、」再统计
    return (
        H1_REGEX.test(text) && countSeparatorsBeforePeriod(text.replace(H1_PREFIX_REGEX, "")) < 2
    );
}

/**
 * 段落是 h2 候选。
 *
 * 满足 H2_REGEX，并且**标题部分**（首句号之前）：
 * - 不含 `：` / `:` / `@`——标题不会出现「报送邮箱：a@b.com」这类正文格式；
 * - 不含书名号 `《》` 与「（送审稿）/（草案）」式括号——这类多是
 *   “审议某文件”的列表项，不是小节标题。
 *
 * 只判首句号前的内容：`（一）小节标题。小节正文……` 是「标题 + 正文合段」，正文里的冒号 / 书名号不影响 h2。
 * 同理 `（五）议程。一是审议《XX（送审稿）》；……` 的标题部分只有「（五）议程」，
 * 仍是 h2，书名号出现在句号之后的部分。
 *
 * 多句**不单独触发降格**：只有同组出现真正的 listItem 时才整组降格
 * 见 {@link normalizeNumberedGroups}。
 */
export function isLikelyH2(text: string): boolean {
    if (!H2_REGEX.test(text)) return false;
    const heading = getHeadingPart(text);
    if (/[：:@]/.test(heading)) return false;
    if (/[《》]/.test(heading) || INLINE_DRAFT_PAREN_REGEX.test(heading)) return false;
    return countSeparatorsBeforePeriod(text) < 2;
}

/**
 * 段落是 h3 候选（满足 H3_REGEX 且第一个句号前 ，/、 少于 2 个）。
 *
 * 第一个句号前分隔符过多说明这是"并列描述"而不是标题，
 * 例如"接到任务后，由甲或乙确定时间、地点、人数需求。"——
 * 第一个句号前已包含多个顿号，不符合标题的简洁特征。
 */
export function isLikelyH3(text: string): boolean {
    return H3_REGEX.test(text) && countSeparatorsBeforePeriod(text) < 2;
}

/**
 * 从段落前缀判断列表项类型。
 *
 * @param text 段落文本
 * @returns 列表项前缀类型；非列表项返回 "none"
 */
function getPrefixKind(text: string): ListKind {
    if (LIST_ITEM_NUMERIC_REGEX.test(text)) return "numeric";
    if (LIST_ITEM_PAREN_HAN_REGEX.test(text)) return "parenHan";
    if (LIST_ITEM_PAREN_NUM_REGEX.test(text)) return "parenNum";
    return "none";
}

/**
 * 判断文本是否像落款成文日期。
 *
 * @param text 待判断文本
 * @returns 是否符合成文日期正则
 */
export function isLikelySignatureDate(text: string): boolean {
    return SIGNATURE_DATE_REGEX.test(text);
}

/**
 * 只有日期、没有单位行时，判断该日期是否处于“文末落款”位置。
 *
 * 其后跳过空行与换页符段，只允许文档结束、附件页或附件页的标题块；
 * 若又遇到正文段落，说明这是正文中的日期，而不是落款。
 *
 * @param paraInfos 已分好类的段落列表
 * @param dateIndex 日期段落下标（0-based）
 */
function isSignatureDateOnlyAtEnd(paraInfos: StructuredParaInfo[], dateIndex: number): boolean {
    for (let i = dateIndex + 1; i < paraInfos.length; i++) {
        const p = paraInfos[i];
        if (p.isEmpty || p.hasFormFeed) continue;
        return p.isAttachment || p.semanticKinds.has("mainTitle");
    }
    return true;
}

// ==================== 副标题判定 ====================

/**
 * 判断文本是否为副标题特征行（单行判断，主标题块内部再提升为 subtitle）。
 *
 * 命中以下任一即视为副标题行：
 * - 整行被一对全角圆括号包裹，如 "（送审稿）"、"（某委〔2026〕1号）"、
 *   "（2024年X月X日）"、"（仅供参考）"；
 * - 以破折号 "——" 开头（引题/副题）。
 *
 * @param text 段落文本
 */
export function isLikelySubtitle(text: string): boolean {
    const t = text.trim();
    return (
        (SUBTITLE_PAREN_REGEX.test(t) && !SUBTITLE_PAREN_ORDINAL_REGEX.test(t)) ||
        t.startsWith("——")
    );
}

const SURNAME_SET = new Set(SURNAME_ARR as unknown as string[]);

/**
 * 判断文本是否为"署名"（职务 + 姓名）。
 *
 * 规则：
 * - 以 。；！？ 结尾 → 直接排除（避免正文句子误命中）；
 * - 普通姓名：末尾 2+ 空格（半角/全角）后跟 2-4 汉字，首字过百家姓；
 * - 少数民族姓名：包含 "·"，不限 4 字。
 */
export function isLikelyByline(text: string): boolean {
    const t = text.trim();
    // 排除空串和以句号 / 分号 / 感叹 / 问号结尾的正文句子
    if (!t || /[。；！？]$/.test(t)) return false;

    // 普通姓名（2–4 字），走姓氏字典
    const plainMatch = t.match(PLAIN_NAME_REGEX);
    if (plainMatch) {
        const namePart = plainMatch[2].replace(/[\s\u3000]/g, "");
        if (SURNAME_SET.has(namePart[0])) return true;
    }

    // 含「·」的少数民族姓名，强特征直接通过
    if (ETHNIC_NAME_REGEX.test(t)) return true;

    return false;
}

// ==================== 版头（红头）判定 ====================

/** 版头合并文本的长度上限：超过说明更像标题 / 正文，而不是发文机关名称 */
const LETTERHEAD_MAX_CHARS = 60;

/**
 * 判断一段**合并后**的文本是否像版头（红头 / 发文机关标志）。
 *
 * 版头的形态是「发文机关名称」：以机关名称收尾、不含事由词与句读。
 * 例：
 * - 「XX县人民政府文件」
 * - 「XX省XX市XX区人民政府XX工作领导小组办公室」
 *
 * 标题（「关于……的通知」）会因为含「关于」或以文种收尾而被排除；
 * 正文段落则会命中句读标点。
 *
 * @param text 由多个段落拼接、已去掉换行与空白的文本
 */
export function isLikelyLetterhead(text: string): boolean {
    const t = text.replace(/[\s\u3000]/g, "");
    if (t.length < 4 || t.length > LETTERHEAD_MAX_CHARS) return false;
    if (LETTERHEAD_FORBIDDEN_REGEX.test(t)) return false;
    return LETTERHEAD_ORG_TAIL_REGEX.test(t);
}

/**
 * 判断一段**合并后**的文本是否像公文标题。
 *
 * 只用于「版头后面必须跟标题」这条兜底规则，因此判据放宽：
 * 含「关于」，或以文种（通知 / 意见 / 要点 / 讲话……）收尾即可。
 *
 * 含句读（`。；！？，：`）的一律排除：正文里的「关于……」很常见，
 * 但标题不会带句读，否则「版头 + 正文」的文档会把正文误当标题。
 *
 * @param text 由多个段落拼接、已去掉换行与空白的文本
 */
export function isLikelyDocTitle(text: string): boolean {
    const t = text.replace(/[\s\u3000]/g, "");
    if (/[。；！？，：]/.test(t)) return false;
    return t.includes("关于") || DOC_TITLE_KIND_REGEX.test(t);
}

// =========================================================================
// 第一阶段：解析（纯文本 → PlainParaInfo[]）
// =========================================================================

/**
 * 将纯文本按段落切分，并转换为 {@link PlainParaInfo}[]。
 *
 * @param raw 原始纯文本，支持 `\n`、`\r\n`、`\r` 换行
 * @returns 段落信息数组；每段 `text` 末尾都会补 `\r`，与 WPS `Range.Text` 保持一致
 *
 * - 输入会先统一换行为 `\r`；
 * - 以 `\r` 拆分后，最后一段空段会被过滤（输入只有 `\r` 的边界情况除外）。
 */
export function parsePlainTextToParas(raw: string): PlainParaInfo[] {
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
        const info = computePlainParaInfo(text);
        return {
            ...info,
            isSkipped: info.isTable, // 纯文本层没有书签/样式信息，只有表格能触发跳过
        };
    });
}

/**
 * 从段落文本计算基础事实字段。
 *
 * 返回 {@link PlainParaInfo} 中除 `isSkipped` 外的所有字段：
 * - 从 `text` 派生的 5 个 flag；
 * - `text` 本身；
 * - 占位默认值 `isHeading: false`、`isInRange: true`（由后续分析阶段改写）。
 *
 * `isSkipped` 由调用方决定：纯文本层 = `isTable`，COM 层还需叠加样式与书签。
 */
export function computePlainParaInfo(text: string): Omit<PlainParaInfo, "isSkipped"> {
    const trimmed = text.trim();
    return {
        text,
        // isEmpty：真空行，不含换页符
        isEmpty: trimmed === "" && !text.includes("\f"),
        isAttachment: ATTACHMENT_LINE_PREFIX_REGEX.test(trimmed),
        // 只有 \f 后紧跟 \r 才算分页符；A\fB 忽略
        hasFormFeed: /\f\r/.test(text),
        hasForbidden: MAIN_TITLE_FORBIDDEN_SYMBOLS_REGEX.test(trimmed),
        isTable: text.includes("\x07"),
        isHeading: false, // 由 analyze 阶段填
        isInRange: true,
    };
}

// =========================================================================
// 第二阶段：结构分析（PlainParaInfo[] → DocumentStructure）
// =========================================================================

/**
 * 提取段内 topic 小标题的匹配范围。
 *
 * @param text 段落文本
 * @returns 段内子范围匹配列表
 */
function findTopicMatches(text: string): StructuredParaInfo["subMatches"] {
    const result: StructuredParaInfo["subMatches"] = [];

    // topic 小标题（整段内可有多个）
    TOPIC_REGEX.lastIndex = 0; // 保险起见，先重置
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
 * 创建带状态的段落分类器。
 *
 * 分类器内部维护「上一段是什么类型的列表项」这一个状态（`lastListKind`），用于：
 * - **同组延续**：`（一）` 后接 `（二）` 时抑制 h2；
 * - **跨组放行**：`1.` 后接 `（一）` 属跨组，若本段简洁仍可判 h2；
 * - **h3 抑制**：前段是任意列表项时，本段 `1.` 不再升格为 h3。
 *
 * 状态在下列情况下重置为 `"none"`：
 * - 表格 / 空行段落（短路返回）；
 * - 非 listItem 段落（只有 `kinds.has("listItem")` 才延续前缀类型）。
 *
 * @returns `classifyPara(info)`：对单段文本做初步语义识别，
 *   不处理主标题块、落款等需要全局上下文的判断。
 */
export function createParaClassifier() {
    let lastListKind: ListKind = "none";

    return function classifyPara(info: PlainParaInfo): {
        kinds: Set<ParagraphSemanticKind>;
        primary: ParagraphSemanticKind;
        isSubtitle?: boolean;
    } {
        const kinds = new Set<ParagraphSemanticKind>();
        const text = info.text;

        // 表格段落：最高优先级，直接短路
        if (info.isTable) {
            kinds.add("table");
            lastListKind = "none"; // 表格 / 空行：短路，同时重置状态
            return { kinds, primary: "table" };
        }

        if (info.isEmpty) {
            kinds.add("empty");
            lastListKind = "none";
            return { kinds, primary: "empty" };
        }

        if (info.isAttachment) {
            kinds.add("attachment");
        }

        // 抬头
        if (SALUTATION_REGEX.test(text) && isLikelySalutation(text)) {
            kinds.add("salutation");
        }

        // 层级标题：同组延续 → 抑制 h2；前段为任意列表项 → 抑制 h3
        const currentListKind = getPrefixKind(text);
        const continuesSameGroup = lastListKind !== "none" && currentListKind === lastListKind;

        // h2：只抑制 "同组延续" 和 "带分隔符（长描述）" 两种，留下一个放行通道；
        // h3：前段任意 listItem 一律抑制，不留通道，不限同组。"1." 永远视为列表延续。
        const hasSeparator = countSeparatorsBeforePeriod(text) > 0;
        const suppressH2 = lastListKind !== "none" && (continuesSameGroup || hasSeparator);
        const suppressH3 = lastListKind !== "none";

        if (isLikelyH1(text)) {
            kinds.add("h1");
        } else if (isLikelyH2(text) && !suppressH2) {
            kinds.add("h2");
        } else if (isLikelyH3(text) && !suppressH3) {
            kinds.add("h3");
        } else if (currentListKind !== "none") {
            kinds.add("listItem");
        }

        // 副标题（单行判断，主标题块内部再提升为 subtitle）
        const isSubtitle = isLikelySubtitle(text);

        // 段内 topic
        TOPIC_REGEX.lastIndex = 0;
        if (TOPIC_REGEX.test(text)) {
            kinds.add("topic");
            TOPIC_REGEX.lastIndex = 0; // 重置全局正则的匹配位置
        }

        // 如果一个都没匹配到，视为 body
        if (kinds.size === 0 && !isSubtitle) {
            kinds.add("body");
        }

        // 更新状态：只有本段是 listItem 时才记住前缀类型
        lastListKind = kinds.has("listItem") ? currentListKind : "none";

        // 主分类优先级
        const priority: ParagraphSemanticKind[] = [
            "h1",
            "h2",
            "h3",
            "listItem", // 和 h3 互斥，和 salutation/attachment 也几乎不会同时命中（判定前缀不同）
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
        return { kinds, primary, isSubtitle };
    };
}

/**
 * 同组编号一致性：h2 不能与同组 listItem 混排。
 *
 * 同一编号序列（连续、前缀类型相同，如「（一）（二）（三）」）里，
 * 只要有一条被判为 listItem（首句号前多个逗号顿号 / 分号结尾 /
 * 含冒号、`@` 等正文格式），整组 h2 就降为 listItem。
 *
 * 例 1：整组都是「标题。说明」——不降格，仍是 h2：
 *
 *     （一）小节标题一。说明一……。
 *     （二）小节标题二。说明二……。
 *
 * 例 2：组内混进一条真正的列表项——整组降格：
 *
 *     （一）小节标题一。说明一……。
 *     （二）小节标题二。说明二……。
 *     （三）并列描述一，并列描述二，……。说明三……。
 *                                 ↑ 首句号前 2 个逗号 → listItem
 *
 * 同组编号不可能一个是二级标题、一个是列表项，所以整组跟随那条 listItem。
 * 判据只认「段落本身已判为 listItem」，**不把多句当作降格理由**：
 * 「标题。说明，说明」是合法的 h2 + 正文合段（子范围只覆盖标题部分）。
 *
 * 单条编号（组内只有一段）不处理。
 */
function normalizeNumberedGroups(paragraphs: StructuredParaInfo[]): void {
    /** 是否为「（一）」这类括号汉字编号组中的 h2 / listItem */
    const isGroupMember = (p: StructuredParaInfo): boolean =>
        getPrefixKind(p.text) === "parenHan" &&
        (p.semanticKinds.has("h2") || p.semanticKinds.has("listItem"));

    let i = 0;
    while (i < paragraphs.length) {
        if (!isGroupMember(paragraphs[i])) {
            i++;
            continue;
        }

        // 连续同组段落区间 [i, j]
        let j = i;
        while (j + 1 < paragraphs.length && isGroupMember(paragraphs[j + 1])) j++;
        const group = paragraphs.slice(i, j + 1);

        // 单条编号没有"组"上下文，保持原判（h2 + 正文合段）；
        // 组内只要有一条 listItem，同组的 h2 一律降格
        if (group.length > 1 && group.some((p) => p.semanticKinds.has("listItem"))) {
            for (const p of group) {
                if (!p.semanticKinds.has("h2")) continue;
                p.semanticKinds.delete("h2");
                p.semanticKinds.add("listItem");
                p.primaryKind = "listItem";
                p.isHeading = false;
            }
        }

        i = j + 1;
    }
}

/**
 * 核心分析函数：输入段落信息，输出文档结构分析结果。
 *
 * @param paraInfos 段落信息；按数组下标（0-based）遍历，输出的 `index` 会置为 1-based
 * @param isFullDoc 是否为全文排版；`false` 时跳过主标题、落款等需要全局上下文的判断
 * @returns 文档结构分析结果
 *
 * 不做任何 COM 操作，纯 JS，可测试。输入可来自纯文本或 WPS COM 读取。
 */
export function analyzeDocumentStructure(
    paraInfos: PlainParaInfo[],
    isFullDoc: boolean = true,
): DocumentStructure {
    // 1. 初步逐段分类
    const paragraphs: StructuredParaInfo[] = [];
    const classify = createParaClassifier();

    for (let idx = 0; idx < paraInfos.length; idx++) {
        const info = paraInfos[idx];
        const { kinds, primary, isSubtitle } = classify(info);
        const isHeading = kinds.has("h1") || kinds.has("h2") || kinds.has("h3");

        paragraphs.push({
            ...info,
            index: idx + 1,
            semanticKinds: kinds,
            primaryKind: primary,
            subMatches: kinds.has("topic") ? findTopicMatches(info.text) : [],
            isHeading,
            isSubtitle,
        });
    }

    // 2. 全文模式下：版头（红头）识别——必须先于主标题块，
    //    否则「发文机关名称」会抢占「关于……的通知」的标题位置。
    if (isFullDoc) {
        const letterhead = findLetterheadBlock(paragraphs);
        if (letterhead) {
            for (let i = letterhead.start; i <= letterhead.end; i++) {
                const p = paragraphs[i];
                p.semanticKinds.delete("body");
                p.semanticKinds.add("letterhead");
                p.primaryKind = "letterhead";
            }
        }
    }

    // 3. 全文模式下：主标题块识别（复用现有函数）
    let mainTitleBlocks: ParaGroup[] = [];
    if (isFullDoc) {
        // findMainTitleBlocks 依赖 paraInfos 的 isHeading，所以传已处理的数组
        mainTitleBlocks = findMainTitleBlocks(paragraphs);
    }

    // 4. 把主标题块内的段落升级为 mainTitle / subtitle
    for (const { start, end } of mainTitleBlocks) {
        for (let i = start; i <= end; i++) {
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
            // 标题块内的裸日期（如讲话稿「标题 + 日期」）按副标题处理，
            // 不能当主标题套 22pt 小标宋。
            if (p.isSubtitle || isLikelyByline(p.text) || isLikelySignatureDate(p.text)) {
                p.semanticKinds.add("subtitle");
                p.primaryKind = "subtitle";
            } else {
                p.semanticKinds.add("mainTitle");
                p.primaryKind = "mainTitle";
            }
        }
    }

    // 5. 全文模式下：落款识别（收集所有"日期 + 单位"对）
    const signatures: DocumentStructure["signatures"] = [];

    if (isFullDoc) {
        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            if (!isLikelySignatureDate(p.text)) continue;

            // 日期段后面必须紧跟空行 / 换页符段 / 文末，否则说明它只是正文中的日期，
            // 例如「一、时间安排」下面单独一行的「2025年3月15日」。
            const next = paragraphs[i + 1];
            if (next && !next.isEmpty && !next.hasFormFeed) continue;

            const MAX_UNIT_LINES = 5; // 联合发文一般最多 3-4 家
            // 从日期往前扫描，收集所有非空段落作为单位行，
            // 直到遇到空行（或到文档开头）为止。
            // 用 unshift 保持"从上到下"的文档顺序。
            const unitIndices: number[] = [];
            let prev = i - 1;
            while (prev >= 0 && unitIndices.length < MAX_UNIT_LINES) {
                const q = paragraphs[prev];
                if (q.isEmpty) break;
                // 防御：换页符段 / 表格 / 附件 / 层级标题 / 主标题、副标题 / 另一个日期
                // 都不是发文机关，停止向上收集
                if (
                    q.hasFormFeed ||
                    q.isTable ||
                    q.isAttachment ||
                    q.isHeading ||
                    q.semanticKinds.has("mainTitle") ||
                    q.semanticKinds.has("subtitle") ||
                    isLikelySignatureDate(q.text)
                ) {
                    break;
                }
                // 防御：若段落以句末标点（含冒号）结尾，则视为正文，不是发文机关
                if (/[。！？；：]$/.test(q.text.trim())) break;
                unitIndices.unshift(prev);
                prev--;
            }

            // 只有日期、没有单位时，还要求它确实处于文末落款位置，
            // 避免把「日期 + 空行 + 后续正文」误判为落款。
            if (unitIndices.length === 0 && !isSignatureDateOnlyAtEnd(paragraphs, i)) continue;

            signatures.push({ unitIndices, dateIndex: i });
        }

        // 标记语义类别
        for (const sig of signatures) {
            for (const u of sig.unitIndices) {
                paragraphs[u].semanticKinds.add("signatureUnit");
                paragraphs[u].primaryKind = "signatureUnit";
            }
            paragraphs[sig.dateIndex].semanticKinds.add("signatureDate");
            paragraphs[sig.dateIndex].primaryKind = "signatureDate";
        }
    }

    // 6. 全文 / 局部模式都做：同组编号里 h2 与 listItem 保持一致
    //    放在主标题 / 落款之后，避免影响依赖 isHeading 的结构判断。
    normalizeNumberedGroups(paragraphs);

    return { paragraphs, mainTitleBlocks, signatures };
}

// ==================== 版头（红头）识别 ====================

/** 版头最多包含的段落数：机关名称折行或联合发文时会有多行 */
const LETTERHEAD_MAX_LINES = 4;

/**
 * 把 `[start, end]` 的连续段落合并成一行文本。
 *
 * 去掉段尾 `\r` 与所有空白（含全角空格），因为版头折行处并没有空格：
 * 「XX省XX市XX区人民政府」+「XX工作领导小组办公室」
 * 合并后才是一个完整的发文机关名称。
 */
function joinBlockText(paraInfos: StructuredParaInfo[], start: number, end: number): string {
    let text = "";
    for (let i = start; i <= end; i++) {
        text += paraInfos[i].text.replace(/\r$/, "");
    }
    return text.replace(/[\s\u3000]/g, "");
}

/**
 * 从 `from` 起跳过空行，返回下一个连续干净段落块；找不到返回 null。
 *
 * 只用于“版头后面必须跟标题”的前瞻，不参与主标题块本身的切分。
 */
function findNextCleanBlock(paraInfos: StructuredParaInfo[], from: number): ParaGroup | null {
    let i = from;
    while (i < paraInfos.length && paraInfos[i].isEmpty) i++;
    if (i >= paraInfos.length || !isCleanPara(paraInfos[i])) return null;
    let j = i;
    while (j < paraInfos.length && isCleanPara(paraInfos[j])) j++;
    return { start: i, end: j - 1 };
}

/**
 * 识别文档开头的版头（红头 / 发文机关标志）块。
 *
 * 版头位于标题上方，形态是「发文机关名称」：
 * - 位置：文档最前（前面只允许空行）；
 * - 行数：1–4 个连续干净段落（机关名称过长会折行，联合发文会多行）；
 * - 内容：合并后以机关名称结尾、不含事由词与句读（见 {@link isLikelyLetterhead}）；
 * - 兜底：其后（隔空行）必须紧跟一个以文种收尾的标题块——
 *   否则开头孤立的单位名（如简报报头）不应被当作版头。
 *
 * 已知限制：版头与发文字号连成一块（中间无空行）时，合并文本以「号」收尾，
 * 不会命中版头，此时退回旧行为（整块按标题处理）。
 *
 * @returns 版头块（0-based 闭区间）；不像版头时返回 null
 */
function findLetterheadBlock(paraInfos: StructuredParaInfo[]): ParaGroup | null {
    // 跳过文档开头的空行
    let start = 0;
    while (start < paraInfos.length && paraInfos[start].isEmpty) start++;
    if (start >= paraInfos.length) return null;

    // 收集开头连续的非空、干净段落（遇空行 / 表格 / 附件 / 换页符 / 层级标题即止）
    let end = start;
    while (end < paraInfos.length && isCleanPara(paraInfos[end])) end++;
    if (end === start || end - start > LETTERHEAD_MAX_LINES) return null;

    if (!isLikelyLetterhead(joinBlockText(paraInfos, start, end - 1))) return null;

    // 兜底：版头下方必须是标题（而不是正文 / 落款）
    const title = findNextCleanBlock(paraInfos, end);
    if (!title) return null;
    if (!isLikelyDocTitle(joinBlockText(paraInfos, title.start, title.end))) return null;

    return { start, end: end - 1 };
}

// ==================== 主标题块识别 ====================

/**
 * 段落自身是否“干净”：
 *
 * 非空、非表格/附件/禁止符/层级标题/范围外、不含换页符
 */
function isCleanPara(p: StructuredParaInfo): boolean {
    return (
        !p.isEmpty &&
        !p.isTable &&
        !p.isAttachment &&
        !p.hasForbidden &&
        !p.hasFormFeed &&
        !p.isHeading &&
        p.isInRange
    );
}

/** 前方最近的有效段落类型：文档首 / 分隔（版头、附件或换页符段）/ 普通段落 */
type PrevSignal = "docStart" | "divider" | "other";

/**
 * 主标题块的“语义终止段”：命中时标题块在它之前结束，且允许块后不接空行。
 *
 * - 抬头（主送机关），如「各单位：」；
 * - 以冒号结尾的导语，如「现将有关事项通知如下：」。
 *
 * 真实公文里标题与抬头/导语之间经常没有空行；这类段落本身不可能是标题，
 * 不能再并入主标题块（否则抬头会被套上居中的「公文标题」样式）。
 *
 * 注意：裸日期（如 `2025年3月15日`）不能作为终止段——它与“落款单位 + 日期”
 * 的形态完全相同，若当作终止段会把落款单位误升为主标题。
 */
function isMainTitleBlockTerminator(p: StructuredParaInfo): boolean {
    return p.semanticKinds.has("salutation") || /[：:]\r?$/.test(p.text);
}

/**
 * 向前找最近的有效段落，归类为分隔信号。
 *
 * 必须先判 `isAttachment` / `hasFormFeed`，再判 `isEmpty`：
 * 真实 COM 文本 `\r\f\r` 解析出的 `"\f\r"` 段是 `isEmpty=false`、
 * `hasFormFeed=true`，若当空行跳过会越过它，导致换页符后的标题漏识别。
 *
 * 版头（红头）也归入 `divider`：它是标题上方的分隔，其后第一个干净段落
 * 才是标题；否则版头会一直占着「文档首」的位置，把真正的标题挤成正文。
 *
 * 层级标题归入 `other`：标题后的段落不应再升级为主标题。
 */
function getPrevSignal(paraInfos: StructuredParaInfo[], idx: number): PrevSignal {
    for (let i = idx - 1; i >= 0; i--) {
        const p = paraInfos[i];
        if (p.semanticKinds.has("letterhead")) return "divider";
        if (p.isAttachment || p.hasFormFeed) return "divider";
        if (!p.isEmpty) return "other";
    }
    return "docStart";
}

/**
 * 从 start 向后扩展主标题块，返回 `[start, end]`；块不成立返回 null。
 *
 * 右边界：
 * - 空行（`isEmpty`）：正常情况，块后有空行；
 * - 语义终止段（见 {@link isMainTitleBlockTerminator}）：块在它之前结束，允许块后不接空行。
 *
 * 遇到其它“非干净段落”（表格 / 附件 / 换页符段 / 层级标题）时整块作废；
 * 文档末尾既无空行也无终止段时丢弃。
 */
function tryExtendTitleBlock(paraInfos: StructuredParaInfo[], start: number): ParaGroup | null {
    let end = start;
    while (end < paraInfos.length) {
        const p = paraInfos[end];
        if (p.isEmpty) break;
        if (isMainTitleBlockTerminator(p)) {
            // 起点本身是终止段（如文档以「各单位：」开头）→ 块不成立；
            // 否则标题块到终止段之前结束。
            return end > start ? { start, end: end - 1 } : null;
        }
        if (!isCleanPara(p)) return null;
        end++;
    }
    if (end >= paraInfos.length) return null;
    return { start, end: end - 1 };
}

/**
 * 找出所有应升级为主标题的连续段落块。
 *
 * 起点：干净段落，且前方信号为 `docStart` / `divider`（不是 `other`）。
 * 终点：向后扩展至空行或语义终止段（抬头 / 导语），块内每段都必须干净。
 * 版头（红头）段落既不是标题、也不能成为起点。
 *
 * 不切组、不合并：候选之间必然被空行或换页符段隔开，不会产生重叠；
 * 同一分隔信号后只有紧邻它的第一个干净段落能成为起点。
 */
export function findMainTitleBlocks(paraInfos: StructuredParaInfo[]): ParaGroup[] {
    const blocks: ParaGroup[] = [];
    for (let i = 0; i < paraInfos.length; i++) {
        if (!isCleanPara(paraInfos[i]) || isMainTitleBlockTerminator(paraInfos[i])) continue;
        if (paraInfos[i].semanticKinds.has("letterhead")) continue;
        if (getPrevSignal(paraInfos, i) === "other") continue;
        const block = tryExtendTitleBlock(paraInfos, i);
        if (block) blocks.push(block);
    }
    return blocks;
}

// =========================================================================
// 第三阶段：段内子范围辅助（供属性注册表复用）
// =========================================================================

/**
 * 根据标题前缀正则生成段内子范围修改。
 *
 * @param text 段落文本
 * @param regex 标题前缀正则
 * @param cfg 对应标题层级的字体配置
 * @returns 子范围修改数组；无匹配时返回 `undefined`
 */
export function computeTitleSubRanges(
    text: string,
    regex: RegExp,
    cfg: SimpleFontConfig,
): SubRangeMod[] | undefined {
    const match = regex.exec(text);
    if (!match) return undefined;

    // 若匹配包含段尾 \r，从子范围中排除（避免覆盖段落标记）
    const matched = match[0];
    const length = matched.endsWith("\r") ? matched.length - 1 : matched.length;
    if (length <= 0) return undefined;

    const sub: SubRangeMod = { start: match.index, length };
    if (cfg.font) sub.fontName = cfg.font;
    if (cfg.bold !== undefined) sub.bold = !!cfg.bold;
    return [sub];
}

/**
 * 计算单条 topic 小标题的加粗范围。
 *
 * 入参 `match.text` 预期是 {@link findTopicMatches} 的匹配结果：
 * 以 `[一...十][是要]` 开头，故前缀长度恒为 2，无需再匹配。
 *
 * @param match topic 匹配信息；`text` 为整句文本，`start` / `length` 为段内位置
 * @param mode 加粗模式
 * @returns 需要加粗的段内子范围；`mode` 为 `"none"` 或文本不是 topic 时返回 `undefined`
 *
 * `auto` 模式下，句内最多 1 个逗号且长度不超过一行时整句加粗；
 * 否则仅加粗前 2 字（`X是` / `X要`）。
 */
export function computeTopicBoldRanges(
    match: { text: string; start: number; length: number },
    mode: TopicBoldMode,
): SubRangeMod[] | undefined {
    // match.text 匹配的是整句文本
    if (mode === "none") return undefined;

    // 不处理非 topic 文本，避免调用方误传
    TOPIC_REGEX.lastIndex = 0;
    if (!TOPIC_REGEX.test(match.text)) return undefined; // 不是 topic → 整段不处理

    const commaCount = (match.text.match(/，/g) || []).length;

    /** 整句加粗的长度上限：一行 28 字 - 2 字缩进 */
    const TOPIC_FULL_BOLD_MAX_CHARS = 26;

    // 整句加粗：auto 模式下，句内最多 1 个逗号，且小于一行
    const shouldFullBold =
        mode === "auto" && commaCount < 2 && match.text.length <= TOPIC_FULL_BOLD_MAX_CHARS;
    if (shouldFullBold) {
        return [{ start: match.start, length: match.length, bold: true }];
    }

    // 能走到这里 match.text 必然以 [一...十][是要] 开头，前缀长度固定 2
    return [{ start: match.start, length: 2, bold: true }];
}
