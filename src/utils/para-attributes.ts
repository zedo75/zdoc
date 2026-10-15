/**
 * @file 段落属性注册表 & 差异计算 & 应用
 *
 * 设计目标：
 * 1. 把每个排版属性（style / fontName / fontSize / bold / alignment / firstLineIndent / subRanges）
 *    抽象成一个描述符 `AttrSpec`，内聚它的 4 件事：
 *      - desired: 从语义 + 配置推导期望值
 *      - readCom: 从 COM Range 读当前值
 *      - isEqual: 判定期望值与当前值是否一致
 *      - apply:   写回 COM Range
 * 2. 新增一个属性时，只需在 `ATTRS` 数组加一项，无需修改其他任何函数。
 * 3. 本模块不依赖 WPS COM 的具体类型，靠 `SnapshotReader` 接口解耦，便于 vitest 单测。
 */
import type { TypographyConfig } from "@/jsa/types";
import type {
    DesiredCtx,
    ParaAttrValues,
    ParaModification,
    StructuredParaInfo,
    SubRangeMod,
} from "@/utils/para-types";

import { computeTopicBoldRanges, makeTitleSubRange } from "@/utils/para-analysis";
import { H1_REGEX, H2_REGEX, H3_REGEX } from "@/utils/para-patterns";

// ==================== 属性描述符 ====================

/**
 * 单个排版属性的描述符。
 *
 * 每个属性独立实现自己的 4 个方法；`computeModifications` 与 `applyModifications`
 * 只负责遍历，不关心任何属性细节。
 */
export interface AttrSpec {
    /** 属性键（必须与 `ParaAttrValues` 的字段名一致） */
    readonly key: keyof ParaAttrValues;
    /**
     * 期望值推导。
     *
     * @returns `undefined` 表示本段落不需要设这个属性（沿用样式默认）
     */
    desired(p: StructuredParaInfo, config: TypographyConfig, ctx: DesiredCtx): unknown;
    /**
     * 读取 COM 当前值。
     *
     * @returns `undefined` 表示"读不到"或"混合态" → 视为需要修改
     *          不实现该方法 = 无法读取快照，每次有期望都会重新应用
     */
    readCom?(rng: Wps.Range): unknown;
    /** 判定"期望值 == 当前值"（领域规则，不一定是 `===`） */
    isEqual(expected: unknown, current: unknown): boolean;
    /** 写回 COM */
    apply(rng: Wps.Range, value: unknown, doc: Wps.Document): void;
}

// ==================== 快照读取接口 ====================

/**
 * 快照读取接口（由 COM 层实现，纯逻辑层不依赖）。
 */
export interface SnapshotReader {
    /**
     * 读取指定段落的指定属性当前值。
     *
     * @param idx1 1-based 段落索引
     * @param key 属性键
     * @returns 当前值；`undefined` 表示"读不到"或"混合态" → 触发应用
     */
    read(idx1: number, key: keyof ParaAttrValues): unknown;
}

// ==================== 属性定义 ====================

export const ATTRS: AttrSpec[] = [
    {
        key: "style",
        desired(p, _config, ctx) {
            if (p.semanticKinds.has("mainTitle") || p.semanticKinds.has("subtitle")) {
                return ctx.titleStyleName;
            }
            return ctx.mainStyleName;
        },
        readCom(rng) {
            return (rng.Style as Wps.Style | null)?.NameLocal;
        },
        isEqual: (a, b) => a === b,
        apply(rng, value, doc) {
            const s = doc.Styles.Item(value as string);
            if (s) rng.Style = s;
        },
    },
    // ---------------- fontName（同时作用于 FarEast 与 Ascii） ----------------
    {
        key: "fontName",
        desired(p, config) {
            if (p.semanticKinds.has("subtitle")) return "楷体_GB2312";
            if (p.semanticKinds.has("attachment")) return "黑体";
            if (p.semanticKinds.has("salutation")) {
                return config.salutation.font || config.main.zh;
            }
            return undefined;
        },
        readCom(rng) {
            const f = rng.Font;
            const fe = f.NameFarEast;
            const ascii = f.NameAscii;
            // 两个字段一致才算"干净"，否则视为需要重设（避免半改状态）
            return fe === ascii ? fe : undefined;
        },
        isEqual: (a, b) => a === b,
        apply(rng, value) {
            rng.Font.NameFarEast = value as string;
            rng.Font.NameAscii = value as string;
        },
    },
    {
        key: "fontSize",
        desired(p) {
            if (p.semanticKinds.has("subtitle")) return 16;
            return undefined;
        },
        readCom(rng) {
            const v = rng.Font.Size;
            return typeof v === "number" ? v : undefined;
        },
        isEqual: (a, b) => a === b,
        apply(rng, value) {
            rng.Font.Size = value as number;
        },
    },
    {
        key: "bold",
        desired(p, config) {
            if (p.semanticKinds.has("subtitle")) return false;
            if (p.semanticKinds.has("salutation")) return !!config.salutation.bold;
            return undefined;
        },
        readCom(rng) {
            const raw = rng.Font.Bold;
            if (raw === msoTrue) return true;
            if (raw === msoFalse) return false;
            // 混合态（wdUndefined）→ undefined → 视为需要修改
            return undefined;
        },
        isEqual: (a, b) => a === b,
        apply(rng, value) {
            rng.Font.Bold = (value as boolean) ? msoTrue : msoFalse;
        },
    },
    // ---------------- alignment（当前期望里没用到，保留槽位） ----------------
    {
        key: "alignment",
        desired() {
            return undefined;
        },
        readCom(rng) {
            return rng.ParagraphFormat.Alignment;
        },
        isEqual: (a, b) => a === b,
        apply(rng, value) {
            rng.ParagraphFormat.Alignment = value as number;
        },
    },
    {
        key: "firstLineIndent",
        desired(p) {
            if (p.semanticKinds.has("attachment") || p.semanticKinds.has("salutation")) {
                return 0;
            }
            return undefined;
        },
        readCom(rng) {
            return rng.ParagraphFormat.CharacterUnitFirstLineIndent;
        },
        isEqual: (a, b) => a === b,
        apply(rng, value) {
            rng.ParagraphFormat.CharacterUnitFirstLineIndent = value as number;
            rng.ParagraphFormat.FirstLineIndent = 0;
        },
    },
    // ---------------- subRanges（标题前缀 / topic 加粗） ----------------
    {
        key: "subRanges",
        desired(p, config) {
            const subs: SubRangeMod[] = [];

            // 一 / 二 / 三级标题前缀
            if (p.semanticKinds.has("h1")) {
                const r = makeTitleSubRange(p.text, H1_REGEX, config.h1);
                if (r) subs.push(...r);
            }
            if (p.semanticKinds.has("h2")) {
                const r = makeTitleSubRange(p.text, H2_REGEX, config.h2);
                if (r) subs.push(...r);
            }
            if (p.semanticKinds.has("h3")) {
                const r = makeTitleSubRange(p.text, H3_REGEX, config.h3);
                if (r) subs.push(...r);
            }

            // topic 小标题加粗
            if (p.semanticKinds.has("topic") && p.subMatches.length) {
                for (const sm of p.subMatches) {
                    subs.push(...computeTopicBoldRanges(sm, config.topicBoldMode));
                }
            }

            return subs.length ? subs : undefined;
        },
        // 子范围不读快照 → 每次有期望就应用（粒度太细，读取成本高）
        isEqual: () => false,
        apply(rng, value, doc) {
            const baseStart = rng.Start;
            for (const sub of value as SubRangeMod[]) {
                const subRng = doc.Range(baseStart + sub.start, baseStart + sub.start + sub.length);
                if (sub.bold !== undefined) {
                    subRng.Font.Bold = sub.bold ? msoTrue : msoFalse;
                }
                if (sub.fontName) subRng.Font.NameFarEast = sub.fontName;
                if (sub.fontSize) subRng.Font.Size = sub.fontSize;
            }
        },
    },
];

/** 属性键 → 描述符，便于按 key 查询 */
export const ATTR_BY_KEY = new Map(ATTRS.map((a) => [a.key, a]));

// ==================== 跳过策略 ====================

/**
 * 判定段落是否整段跳过排版。
 *
 * 跳过条件全部由 COM 读取层写入 `isSkipped`，这里只做单一判定：
 * - 表格段落
 * - 被 `zdoc_*` 书签覆盖
 * - 用户手动标记为"不排版"样式
 *
 * 未来要新增跳过规则（如跳过脚注），只需修改 COM 读取层计算 `isSkipped` 的逻辑。
 */
export function shouldSkipPara(p: StructuredParaInfo): boolean {
    return p.isSkipped;
}

// ==================== 差异计算 ====================

/**
 * 对比期望状态与当前快照，仅输出真正需要修改的指令。
 *
 * @param paras 结构化段落列表
 * @param config 排版配置
 * @param ctx 运行时上下文（实际样式名）
 * @param reader 快照读取器；不传 = 输出完整指令（纯文本测试用）
 * @returns 需要执行的修改指令，按段落索引倒序排列
 *
 * - 每个属性独立判定"期望值 vs 当前值"；
 * - `desired === undefined` → 本段落不需要设该属性；
 * - `readCom` 返回 `undefined` → 视为需要修改（无法确认一致）；
 * - 无任何字段需要修改的段落会被跳过；
 * - 被 `shouldSkipPara` 标记的段落整段跳过。
 *
 * 样式切换会重置它定义的属性（如 "公文正文" 自带 2 字符首行缩进）。
 * 若 style 将变而其他属性仍按差异检测，会出现：
 *
 *     [首行缩进] 当前 0，期望 0 → 判定不需改
 *     → 样式切到"公文正文" → 继承 2 字符缩进 → 实际结果错了
 *
 * 因此当 style 判定为"需改"时，其他属性**跳过差异检测，直接下发**
 */
export function computeModifications(
    paras: StructuredParaInfo[],
    config: TypographyConfig,
    ctx: DesiredCtx,
    reader?: SnapshotReader,
): ParaModification[] {
    const result: ParaModification[] = [];

    for (const p of paras) {
        if (shouldSkipPara(p)) continue;

        const mod: ParaModification = { index: p.index, _kind: p.primaryKind };
        let changed = false;

        // ── 第一步：判定 style 是否会变 ──
        // 样式是其他属性的基线，切换样式会重置它定义的属性（如首行缩进），
        // 所以要先知道 style 会不会变，才能决定其他属性的差异检测是否可信。
        const styleSpec = ATTR_BY_KEY.get("style")!;
        const desiredStyle = styleSpec.desired(p, config, ctx) as string | undefined;
        let styleWillChange = false;

        if (desiredStyle !== undefined) {
            if (reader) {
                const curStyle = reader.read(p.index, "style");
                styleWillChange =
                    curStyle === undefined || !styleSpec.isEqual(desiredStyle, curStyle);
            } else {
                styleWillChange = true; // 无 reader → 视为会变（保守）
            }
        }

        // ── 第二步：逐属性收集修改指令 ──
        for (const attr of ATTRS) {
            const desired = attr.desired(p, config, ctx);
            if (desired === undefined) continue;

            // 差异检测：仅在 "样式不变" 时可信（针对首行缩进）
            if (reader && !styleWillChange) {
                const current = reader.read(p.index, attr.key);
                if (current !== undefined && attr.isEqual(desired, current)) continue;
            }

            // 样式会变，直接下发期望
            (mod as unknown as Record<string, unknown>)[attr.key] = desired;
            changed = true;
        }

        if (changed) result.push(mod);
    }

    // 按索引倒序返回（apply 时一般从尾到头，避免修改前面段落导致后面 index 偏移）
    result.sort((a, b) => b.index - a.index);
    return result;
}

// ==================== 应用修改 ====================

/**
 * 将修改指令写回文档。
 *
 * @param doc WPS 文档对象
 * @param modifications 修改指令（顺序无关，内部会重新按索引倒序处理）
 *
 * 遍历所有属性描述符，凡 `mod` 中显式赋值的字段都会调用对应的 `attr.apply`。
 */
export function applyModifications(doc: Wps.Document, modifications: ParaModification[]): void {
    // 内部再排一次序，防止调用方传入无序数组
    const sorted = [...modifications].sort((a, b) => b.index - a.index);

    for (const mod of sorted) {
        const rng = doc.Paragraphs.Item(mod.index).Range;
        for (const attr of ATTRS) {
            const value = (mod as unknown as Record<string, unknown>)[attr.key];
            if (value !== undefined) {
                attr.apply(rng, value as never, doc);
            }
        }
    }
}
