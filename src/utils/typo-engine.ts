import type { TypographyConfig } from "@/jsa/types";
import type { BaseParaInfo } from "@/utils/typo";
import type { CurrentParaSnapshot, DesiredParaState, ParaModification } from "@/utils/typo-model";

import { FORBIDDEN_SYMBOLS_REGEX } from "@/utils/typo";
import {
    analyzeDocumentStructure,
    buildDesiredStates,
    computeModifications,
} from "@/utils/typo-model";

/**
 * 修改指令类型（复用 typo-model，保持同名导出）
 */
export type { SubRangeMod, ParaModification } from "@/utils/typo-model";

/**
 * 段落信息（含当前样式名称）
 */
export interface ParaInfo extends BaseParaInfo {
    /**
     * 1-based （WPS Paragraphs.Item 序号从 1 开始）
     */
    index: number;
    isTable: boolean;
    currentStyleName: string;
}

/**
 * 读取器（只读 Text 和 Style.NameLocal，每段 2 次 COM 调用）
 */
export function parseParagraphs(doc: Wps.Document): ParaInfo[] {
    const paras = doc.Paragraphs;
    const count = paras.Count;
    const result: ParaInfo[] = [];
    let textTotal = 0;
    let styleTotal = 0;

    for (let i = 1; i <= count; i++) {
        const p = paras.Item(i);
        const rng = p.Range;

        const t1 = performance.now();
        const text = rng.Text;
        textTotal += performance.now() - t1;

        const t2 = performance.now();
        const style = rng.Style as Wps.Style | null; // 行结束标记段落 "\r\x07" 的 Style 为 null
        styleTotal += performance.now() - t2;

        const trimmed = text.trim();
        const isEmpty = trimmed === "";
        const isAttachment = /^附件\s*[0-9]+/.test(trimmed);
        const hasFormFeed = text.includes("\f");
        const hasForbidden = FORBIDDEN_SYMBOLS_REGEX.test(trimmed);
        const isTable = text.includes("\x07");

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
            currentStyleName: style?.NameLocal ?? "",
        });
    }

    console.log(`  ├─ 其中读取 Text: ${textTotal.toFixed(2)}ms`);
    console.log(`  ├─ 其中读取 Style: ${styleTotal.toFixed(2)}ms`);
    console.log(`  └─ parseParagraphs (${count}段)`);

    console.table(result);
    return result;
}

/**
 * COM 快照读取（按需读取，不扫全量；只对显式有期望覆盖的段落做深层读）
 *
 * 对指定的 1-based 段落索引，读取"当前样式快照"用于差异检测。
 * 每个索引会增加若干 COM 读取（字体、加粗、对齐、首行缩进），
 * 所以只对 desiredStates 里显式声明的段落调用即可。
 */
export function readCurrentSnapshots(
    doc: Wps.Document,
    indices: Set<number>,
    styleNameOverrides: Map<number, Pick<CurrentParaSnapshot, "styleName">> | null = null,
): Map<number, CurrentParaSnapshot> {
    const result = new Map<number, CurrentParaSnapshot>();
    const paras = doc.Paragraphs;

    for (const idx1 of indices) {
        const p = paras.Item(idx1);
        const rng = p.Range;
        const font = rng.Font;
        const pf = rng.ParagraphFormat;

        // Bold 三态：true/false/混合型（混合型返回 wdUndefined = 9999999，用 undefined 表示跳过）
        let bold: boolean | undefined;
        const rawBold = font.Bold as number;
        if (rawBold === (msoTrue as number)) bold = true;
        else if (rawBold === (msoFalse as number)) bold = false;
        // else：混合型 → undefined，不做对比

        result.set(idx1, {
            index: idx1,
            styleName:
                styleNameOverrides?.get(idx1)?.styleName ?? (rng.Style as Wps.Style).NameLocal,
            fontNameFarEast: font.NameFarEast,
            fontNameAscii: font.NameAscii,
            fontSize: font.Size,
            bold,
            alignment: pf.Alignment,
            firstLineIndentChars: pf.CharacterUnitFirstLineIndent,
        });
    }
    return result;
}

// ========== 分析器（委托给 typo-model 纯逻辑，可选差异检测） ==========

/**
 * 分析文档结构并返回修改指令。
 *
 * 与旧版的主要区别：
 *   - 结构分析（主标题/副标题/层级标题/抬头/落款/附件）统一走 typo-model 的 analyzeDocumentStructure
 *   - 期望状态用 buildDesiredStates 集中声明
 *   - 若传入 doc，则按需读取快照，通过 computeModifications 产生"差异指令"（只改需要改的，减少 COM 写）
 *   - 若不传 doc，仍然会利用 parseParagraphs 已读取到的 currentStyleName 做 style 级别的去重
 */
export function analyzeDocument(
    infos: ParaInfo[],
    config: TypographyConfig,
    isFullDoc: boolean,
    mainStyleName: string,
    titleStyleName: string,
    doc?: Wps.Document,
): ParaModification[] {
    // a) 结构分析（复用 findMainTitleBlocks / isSubtitleLine / 正则判定等已有经验）
    const structure = analyzeDocumentStructure(infos, isFullDoc);

    // b) 期望状态（每段的目标样式描述）
    const desiredStates = buildDesiredStates(structure, config);

    // 修正 style 名称（typo-model 用硬编码 "公文正文" / "公文标题"，替换为实际运行时的 NameLocal）
    // 这样即便用户改了 Style 名，也能对齐。
    const normalizedDesired = new Map<number, DesiredParaState>();
    desiredStates.forEach((s, idx1) => {
        const styleName =
            s.style === "公文正文"
                ? mainStyleName
                : s.style === "公文标题"
                  ? titleStyleName
                  : (s.style as string);
        normalizedDesired.set(idx1, {
            ...s,
            style: styleName as DesiredParaState["style"],
        });
    });

    // c) 当前快照
    let snapshots: Map<number, CurrentParaSnapshot> | null = null;

    // c-1) 即使没有 doc，也用 parseParagraphs 已拿到的 currentStyleName 构造"浅层快照"，
    //      至少可以跳过已经匹配的 style 写入（旧版就有的优化）。
    const shallow = new Map<number, CurrentParaSnapshot>();
    for (const info of infos) {
        shallow.set(info.index, {
            index: info.index,
            styleName: info.currentStyleName,
        });
    }
    snapshots = shallow;

    // c-2) 若有 doc → 针对 desiredStates 中有显式覆盖的段落，追加深层属性（字体/对齐/缩进等）
    if (doc && normalizedDesired.size > 0) {
        // 对"需要深层属性对比"的段落索引读取快照：
        //   - 任何出现在 normalizedDesired 的段落（它们可能设置了 fontName/firstLineIndent/...）
        //   - 以及不在 desiredStates 中但期望 style === mainStyleName 且 currentStyleName != mainStyleName 的段落
        //     （这些只需要 style 对比，已经在 shallow 中覆盖了，不用额外读）
        const deepIndices = new Set<number>();
        normalizedDesired.forEach((_d, idx1) => deepIndices.add(idx1));

        const deepSnaps = readCurrentSnapshots(doc, deepIndices, shallow);
        // deepSnaps 覆盖浅层（继承 styleName 不用再读）
        snapshots = new Map([...shallow, ...deepSnaps]);
    }

    // d) 差异计算 → 修改指令
    // 注意：computeModifications 默认按 index 降序返回（便于某些直接正向遍历的场景）。
    // 本模块 applyModifications 采用反向遍历（从数组末尾倒着读），因此需要这里先恢复为升序，
    // 两者叠加后实际按段落 index 从大到小执行（避免修改前面导致后面索引失效）。
    const mods = computeModifications(normalizedDesired, snapshots, infos.length);
    mods.sort((a, b) => a.index - b.index);

    return mods;
}

/**
 * 写入器（只处理有实际修改的段落）
 */
export function applyModifications(
    doc: Wps.Document,
    modifications: ParaModification[],
    mainStyle: Wps.Style,
    titleStyle: Wps.Style,
) {
    for (let i = modifications.length - 1; i >= 0; i--) {
        const mod = modifications[i];
        const para = doc.Paragraphs.Item(mod.index);
        const rng = para.Range;

        // 样式
        if (mod.style) {
            let style: Wps.Style | null = null;
            if (mod.style === mainStyle.NameLocal) style = mainStyle;
            else if (mod.style === titleStyle.NameLocal) style = titleStyle;
            else style = doc.Styles.Item(mod.style);
            if (style) rng.Style = style;
        }

        // 字体
        const hasFont =
            mod.fontName !== undefined || mod.fontSize !== undefined || mod.bold !== undefined;
        if (hasFont) {
            const font = rng.Font;
            if (mod.fontName) {
                font.NameFarEast = mod.fontName;
                font.NameAscii = mod.fontName;
            }
            if (mod.fontSize) font.Size = mod.fontSize;
            if (mod.bold !== undefined) font.Bold = mod.bold ? msoTrue : msoFalse;
        }

        // 段落格式
        const hasPara = mod.alignment !== undefined || mod.firstLineIndent !== undefined;
        if (hasPara) {
            const pf = rng.ParagraphFormat;
            if (mod.alignment !== undefined) pf.Alignment = mod.alignment;
            if (mod.firstLineIndent !== undefined) {
                pf.CharacterUnitFirstLineIndent = mod.firstLineIndent;
                pf.FirstLineIndent = 0;
            }
        }

        // 子范围
        if (mod.subRanges && mod.subRanges.length) {
            const baseStart = rng.Start;
            for (const sub of mod.subRanges) {
                const subRng = doc.Range(baseStart + sub.start, baseStart + sub.start + sub.length);
                if (sub.bold !== undefined) subRng.Font.Bold = sub.bold ? msoTrue : msoFalse;
                if (sub.fontName) subRng.Font.NameFarEast = sub.fontName;
                if (sub.fontSize) subRng.Font.Size = sub.fontSize;
            }
        }
    }
}
