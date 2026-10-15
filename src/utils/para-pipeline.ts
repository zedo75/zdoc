/**
 * @file 公文排版流水线（COM 编排层）
 *
 * 职责：
 * - 遍历 `doc.Paragraphs`，读取段落事实信息
 * - 一次性扫描 `doc.Bookmarks` 建立跳过区间表（性能关键：避免逐段读 COM）
 * - 缓存 `Range` 实例，减少 COM 调用
 * - 把纯逻辑层（analysis + attributes）串成完整流程：
 *     读取 → 分析 → 差异 → 应用
 *
 * 本文件是唯一直接面对 `Wps.Document` 的模块。
 */
import type { TypographyConfig } from "@/jsa/types";
import type { SnapshotReader } from "@/utils/para-attributes";
import type {
    DesiredCtx,
    DocumentStructure,
    ParaAttrValues,
    ParaInfo,
    ParaModification,
    SkipRange,
} from "@/utils/para-types";

import { analyzeDocumentStructure, parsePlainTextToParas } from "@/utils/para-analysis";
import { ATTR_BY_KEY, computeModifications } from "@/utils/para-attributes";
import { FORBIDDEN_SYMBOLS_REGEX } from "@/utils/para-patterns";

// ==================== 书签跳过区间 ====================

/** 触发"整段跳过"的书签前缀 */
const SKIP_BOOKMARK_PREFIX = "zdoc_";

/** 触发"整段跳过"的样式名（用户手动标记） */
const SKIP_STYLE_NAME = "不排版";

/**
 * 一次性收集所有"跳过书签"覆盖的字符区间。
 *
 * @param doc WPS 文档
 * @returns 字符区间列表
 *
 * 相比逐段读 `rng.Bookmarks.Count`（每段 1 次 COM 调用），
 * 本函数只枚举一次 `doc.Bookmarks`，然后每段做纯 JS 区间比对，
 * 大幅降低 COM 调用次数。
 */
export function collectSkipRanges(doc: Wps.Document): SkipRange[] {
    const ranges: SkipRange[] = [];
    const bms = doc.Bookmarks;
    const n = bms.Count as number;
    for (let i = 1; i <= n; i++) {
        const bm = bms.Item(i) as Wps.Bookmark;
        const name = bm.Name as string;
        if (name.startsWith(SKIP_BOOKMARK_PREFIX)) {
            const r = bm.Range;
            ranges.push({ start: r.Start as number, end: r.End as number });
        }
    }
    return ranges;
}

/**
 * 段落字符区间是否与任一跳过区间重叠。
 *
 * @param start 段落起始字符位置
 * @param end 段落结束字符位置
 * @param ranges 跳过区间列表
 */
export function isCovered(start: number, end: number, ranges: SkipRange[]): boolean {
    for (const s of ranges) {
        if (start < s.end && end > s.start) return true;
    }
    return false;
}

// ==================== 读取器 ====================

/**
 * 读取器（只读 Text 和 Style.NameLocal，每段 2 次 COM 调用；另加 0~2 次书签/形状检测）。
 */
export function parseParagraphs(doc: Wps.Document): ParaInfo[] {
    const paras = doc.Paragraphs;
    const count = paras.Count;
    const result: ParaInfo[] = [];

    // 一次性扫描书签，建立跳过区间表（纯 JS，无 COM 调用）
    const skipRanges = collectSkipRanges(doc);

    for (let i = 1; i <= count; i++) {
        const p = paras.Item(i);
        const rng = p.Range;

        const text = rng.Text;
        const style = rng.Style as Wps.Style | null; // 行结束标记段落 "\r\x07" 的 Style 为 null

        const trimmed = text.trim();
        const isEmpty = trimmed === "";
        const isAttachment = /^附件\s*[0-9]+/.test(trimmed);
        const hasFormFeed = text.includes("\f");
        const hasForbidden = FORBIDDEN_SYMBOLS_REGEX.test(trimmed);
        const isTable = text.includes("\x07");

        const currentStyleName = style?.NameLocal ?? "";

        // 跳过策略：表格 / 用户手动标记样式 / zdoc_* 书签覆盖
        // 只在确实存在跳过书签时，才需要段落起止位置
        let isSkipped = isTable || currentStyleName === SKIP_STYLE_NAME;
        if (!isSkipped && skipRanges.length > 0) {
            const start = rng.Start as number;
            const end = rng.End as number;
            isSkipped = isCovered(start, end, skipRanges);
        }

        result.push({
            index: i,
            text,
            isEmpty,
            isAttachment,
            hasFormFeed,
            hasForbidden,
            isHeading: false, // 稍后在 analyzeDocumentStructure 中重新计算
            isInRange: true,
            isTable,
            isSkipped,
            currentStyleName,
        });
    }

    console.table(result);
    return result;
}

/**
 * COM 层实现 `SnapshotReader`：按段落缓存 `Range`，避免重复 COM 调用。
 *
 * @param doc WPS 文档
 */
export function makeComReader(
    doc: Wps.Document,
    knownStyles?: Map<number, string>,
): SnapshotReader {
    const rangeCache = new Map<number, Wps.Range>();
    return {
        read(idx1: number, key: keyof ParaAttrValues): unknown {
            // 已从 parseParagraphs 拿到的 style 直接复用，不重复 COM 读
            if (key === "style" && knownStyles?.has(idx1)) {
                return knownStyles.get(idx1);
            }

            let rng = rangeCache.get(idx1);
            if (!rng) {
                rng = doc.Paragraphs.Item(idx1).Range;
                rangeCache.set(idx1, rng);
            }
            return ATTR_BY_KEY.get(key)?.readCom?.(rng);
        },
    };
}

// ==================== 分析入口 ====================

/**
 * 分析文档结构并返回修改指令。
 *
 * @param infos 段落信息（来自 `parseParagraphs`）
 * @param config 排版配置
 * @param isFullDoc 是否为全文排版
 * @param mainStyleName 实际运行时的"公文正文"样式名
 * @param titleStyleName 实际运行时的"公文标题"样式名
 * @param doc 可选 WPS 文档；传入则做差异检测，不传则输出完整指令（单测用）
 * @returns
 *   - `modifications`: 修改指令列表（按段落索引倒序）
 *   - `structure`: 结构分析结果（落款位置、主标题块等）
 *
 * 返回 `structure` 是为了让调用方（如 `formatSignature`）复用已识别的位置，避免二次扫描全文。
 */
export function analyzeDocument(
    infos: ParaInfo[],
    config: TypographyConfig,
    isFullDoc: boolean,
    mainStyleName: string,
    titleStyleName: string,
    doc?: Wps.Document,
): { modifications: ParaModification[]; structure: DocumentStructure } {
    // a) 结构分析
    const structure = analyzeDocumentStructure(infos, isFullDoc);

    // b) 运行时上下文
    const ctx: DesiredCtx = { mainStyleName, titleStyleName };

    // c) 差异计算
    //    - 无 doc → 无 reader → 输出完整指令
    //    - 有 doc → 用 COM reader 做差异检测
    let reader: SnapshotReader | undefined;
    if (doc) {
        // 收集 parseParagraphs 已知的 style 名
        const knownStyles = new Map<number, string>();
        for (const info of infos) {
            if (info.currentStyleName) knownStyles.set(info.index, info.currentStyleName);
        }
        reader = makeComReader(doc, knownStyles);
    }
    const modifications = computeModifications(structure.paragraphs, config, ctx, reader);

    return { modifications, structure };
}

// ==================== 便捷导出 ====================

/**
 * 纯文本便捷入口（单测专用）：从纯文本到结构分析 + 修改指令。
 *
 * @param text 原始纯文本
 * @param config 排版配置
 * @param options.isFullDoc 是否全文排版；默认 `true`
 * @param options.ctx 运行时上下文（实际样式名）；不传则用默认值
 *
 * 无 COM 环境，`modifications` 是完整指令而非差异指令。
 */
export function analyzePlainText(
    text: string,
    config: TypographyConfig,
    options: {
        isFullDoc?: boolean;
        ctx?: DesiredCtx;
    } = {},
): {
    structure: DocumentStructure;
    modifications: ParaModification[];
} {
    const ctx = options.ctx ?? {
        mainStyleName: "公文正文",
        titleStyleName: "公文标题",
    };
    const baseInfos = parsePlainTextToParas(text);
    const structure = analyzeDocumentStructure(baseInfos, options.isFullDoc ?? true);
    const modifications = computeModifications(structure.paragraphs, config, ctx);
    modifications.sort((a, b) => a.index - b.index);
    return { structure, modifications };
}

// re-export 应用函数，方便调用方一处 import
export { applyModifications } from "@/utils/para-attributes";
