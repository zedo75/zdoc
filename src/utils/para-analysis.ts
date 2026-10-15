/**
 * @file 公文排版中间层模型（纯逻辑层）
 *
 * 设计目标：
 * 1. 纯文本预分析：不依赖 WPS COM，支持 vitest 单测（输入纯字符串）。
 * 2. 结构分析输出语义标签：mainTitle / subtitle / salutation / h1 / h2 / h3 / topic / attachment / signature 等。
 * 3. 不做 COM 操作，不做差异对比，不做属性写入——那些属于上层模块。
 */
import type { SimpleFontConfig, TopicBoldMode } from "@/jsa/types";
import type {
    BaseParaInfo,
    DocumentStructure,
    ParagraphSemanticKind,
    StructuredParaInfo,
    SubRangeMod,
} from "@/utils/para-types";

import {
    FORBIDDEN_SYMBOLS_REGEX,
    H1_REGEX,
    H2_REGEX,
    H3_REGEX,
    SALUTATION_EACH_UNIT_REGEX,
    SALUTATION_EXCLUDE_REGEX,
    SALUTATION_GREETING_REGEX,
    SALUTATION_JOB_TITLE_REGEX,
    SALUTATION_ORG_DEPT_REGEX,
    SALUTATION_REGEX,
    SIGNATURE_DATE_REGEX,
    TOPIC_PREFIX_REGEX,
    TOPIC_REGEX,
} from "@/utils/para-patterns";

// ==================== 抬头判定辅助 ====================

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

/**
 * 判断文本是否像落款成文日期。
 *
 * @param text 待判断文本
 * @returns 是否符合成文日期正则
 */
export function looksLikeSignatureDate(text: string): boolean {
    return SIGNATURE_DATE_REGEX.test(text);
}

// ==================== 副标题判定 ====================

/**
 * 判断文本是否为副标题特征行（单行判断，主标题块内部再提升为 subtitle）。
 *
 * @param text 段落文本
 */
export function isSubtitleLine(text: string): boolean {
    const t = text.trim();
    // 匹配中文括号内容，且包含"稿"或"案"，或者破折号开头
    return (
        /^（[^）]*[稿案][^）]*）$/.test(t) ||
        /^[^\s]{2,5}\u3014\d{4}\u3015\d+号$/.test(t) ||
        t.startsWith("——")
    );
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
        const isTable = text.includes("\x07");
        return {
            text,
            isEmpty: trimmed === "",
            isAttachment: /^附件\s*[0-9]+/.test(trimmed),
            hasFormFeed: text.includes("\f"),
            hasForbidden: FORBIDDEN_SYMBOLS_REGEX.test(trimmed),
            isHeading: false, // 后续 analyze 阶段填
            isInRange: true,
            isTable,
            // 纯文本层没有书签/样式信息，只有表格能触发跳过
            isSkipped: isTable,
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
 * 对单段文本做初步语义识别。
 *
 * @param info 段落基础信息
 * @returns 语义类别集合、主分类，以及是否为副标题行
 *
 * 不处理主标题块、落款等需要全局上下文的判断。
 */
function classifyPara(info: BaseParaInfo): {
    kinds: Set<ParagraphSemanticKind>;
    primary: ParagraphSemanticKind;
    isSubtitleLine?: boolean;
} {
    const kinds = new Set<ParagraphSemanticKind>();
    const text = info.text;

    // 表格段落：最高优先级，直接短路
    if (info.isTable) {
        kinds.add("table");
        return { kinds, primary: "table" };
    }

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
    TOPIC_REGEX.lastIndex = 0;
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
 * 根据段落信息数组找出所有应升级为主标题的连续段落块。
 *
 * - 候选起点：文档首非空、附件后、换页符后（可扩展抬头上方）
 * - 向后扩展直到遇空行、层级标题、禁止符号、附件或范围外
 * - 块后必须跟空行（或文档末尾，此处强制必须）
 * - 附件段落自身不会被选为候选，也不会被包含在块内
 */
export function findMainTitleBlocks(paraInfos: BaseParaInfo[]): [number, number][] {
    const n = paraInfos.length;
    const blocks: [number, number][] = [];
    const candidates = new Set<number>();

    // 文档第一个非空段落（排除附件、换页符、禁止符）
    const firstNonEmpty = paraInfos.findIndex((p) => !p.isEmpty);
    if (
        firstNonEmpty !== -1 &&
        !paraInfos[firstNonEmpty].isTable &&
        !paraInfos[firstNonEmpty].isAttachment &&
        !paraInfos[firstNonEmpty].hasFormFeed &&
        !paraInfos[firstNonEmpty].hasForbidden &&
        paraInfos[firstNonEmpty].isInRange
    ) {
        candidates.add(firstNonEmpty);
    }

    // 判断该索引位置的段落能否作为主标题块的候选起点
    const isEligibleBlockStart = (idx: number) =>
        idx < n &&
        !paraInfos[idx].isTable &&
        !paraInfos[idx].isAttachment &&
        !paraInfos[idx].hasForbidden &&
        paraInfos[idx].isInRange;

    // 附件后第一个非空段落（跳过中间空行）
    paraInfos.forEach((p, idx) => {
        if (p.isAttachment) {
            let next = idx + 1;
            while (next < n && paraInfos[next].isEmpty) next++;
            if (isEligibleBlockStart(next)) {
                candidates.add(next);
            }
        }
    });

    // 换页符后第一个非空段落（跳过中间空行，排除附件自身）
    paraInfos.forEach((p, idx) => {
        if (p.hasFormFeed) {
            let next = idx + 1;
            while (next < n && paraInfos[next].isEmpty) next++;
            if (isEligibleBlockStart(next)) {
                candidates.add(next);
            }
        }
    });

    // 抬头上方可扩展（暂略）-----

    // 从候选生成块
    const sorted = Array.from(candidates).sort((a, b) => a - b);
    for (const start of sorted) {
        if (blocks.some(([s, e]) => start >= s && start <= e)) continue;

        const info = paraInfos[start];
        if (info.isTable) continue;
        if (info.isEmpty || info.hasForbidden || info.isHeading) continue;

        // 若前一个非空段落是层级标题，则相邻时不作为标题
        let prev = start - 1;
        while (prev >= 0 && paraInfos[prev].isEmpty) prev--;
        if (prev >= 0 && paraInfos[prev].isHeading) continue;

        // 向后扩展：收集连续的非空、非层级、非禁止、非附件、在范围内的段落
        let end = start;
        while (end < n) {
            const cur = paraInfos[end];
            if (cur.isEmpty) break;
            if (cur.isHeading) break;
            if (cur.hasForbidden) {
                end = -1;
                break;
            }
            if (cur.isAttachment) break; // 附件本身不应包含在标题块内
            if (cur.isTable) break; // 表格切断主标题块
            if (!cur.isInRange) break;
            end++;
        }
        if (end === -1 || end <= start) continue;

        // 块后必须有空行（文档末尾也可接受，但此处强制要求空行）
        if (end < n && paraInfos[end].isEmpty) {
            blocks.push([start, end - 1]);
        }
    }

    // 合并相邻或重叠的块
    if (blocks.length > 1) {
        const merged: typeof blocks = [];
        let [curS, curE] = blocks[0];
        for (let i = 1; i < blocks.length; i++) {
            const [s, e] = blocks[i];
            if (s <= curE + 1) {
                curE = Math.max(curE, e);
            } else {
                merged.push([curS, curE]);
                [curS, curE] = [s, e];
            }
        }
        merged.push([curS, curE]);
        return merged;
    }
    return blocks;
}

/**
 * 核心分析函数：输入段落信息，输出文档结构分析结果。
 *
 * @param baseInfos 段落信息；`index` 应为 0-based 数组下标，`isHeading` 会被覆盖重算
 * @param isFullDoc 是否为全文排版；`false` 时跳过主标题、落款等需要全局上下文的判断
 * @returns 文档结构分析结果
 *
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

    // 4. 全文模式下：落款识别（收集所有"日期 + 单位"对）
    const signatures: DocumentStructure["signatures"] = [];

    if (isFullDoc) {
        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            if (!looksLikeSignatureDate(p.text)) continue;

            const MAX_UNIT_LINES = 5; // 联合发文一般最多 3-4 家
            // 从日期往前扫描，收集所有非空段落作为单位行，
            // 直到遇到空行（或到文档开头）为止。
            // 用 unshift 保持"从上到下"的文档顺序。
            const unitIndices: number[] = [];
            let prev = i - 1;
            while (prev >= 0 && !paragraphs[prev].isEmpty && unitIndices.length < MAX_UNIT_LINES) {
                unitIndices.unshift(prev);
                prev--;
            }

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

    return { paragraphs, mainTitleBlocks, signatures };
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
export function makeTitleSubRange(
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
