/**
 * @file 文档格式检查（COM 编排层）
 *
 * 只读：读取段落文本 + 当前生效格式 → 复用 `core/analysis` 做语义分析 →
 * 输出给「格式检查」面板。**不写入文档，也不创建撤销记录。**
 *
 * 与排版流水线的区别：
 * - 不要求文档已存在「公文正文 / 公文标题」样式；
 * - 不做 `computeModifications` 的样式差异，因此任意普通文档也能检查。
 */
import type { TypographyConfig } from "@/config/types";
import type { ParagraphSemanticKind, StructuredParaInfo, SubRangeMod } from "@/core/types";
import type {
    CheckElement,
    CurrentFormat,
    FormatIssue,
    InspectionResult,
} from "@/features/format-check/core/inspect";

import {
    analyzeDocumentStructure,
    computeTitleSubRanges,
    computeTopicBoldRanges,
} from "@/core/analysis";
import { H1_REGEX, H2_REGEX, H3_REGEX } from "@/core/patterns";
import { readParaInfos } from "@/core/pipeline";
import { checkFormat, formatBold, getExpectedFormat } from "@/features/format-check/core/inspect";

/** WPS 的 `wdUndefined`（混合格式）通常为 9999999；大于该阈值都视为读不到 */
const UNDEFINED_NUMBER = 9999998;

/** 空格式快照：用于空行 / 表格 / 读取失败，保证面板仍按段落顺序展示 */
function createBlankFormat(styleName = ""): CurrentFormat {
    return {
        styleName,
        fontName: "",
        asciiFontName: "",
        fontSize: null,
        bold: null,
        alignment: null,
        firstLineIndent: null,
        lineSpacing: null,
        lineSpacingRule: null,
    };
}

/** 安全读数字：读不到 / 混合态 → `null` */
function readNumber(read: () => unknown): number | null {
    try {
        const value = read();
        if (typeof value !== "number" || !Number.isFinite(value)) return null;
        if (value >= UNDEFINED_NUMBER) return null;
        return value;
    } catch {
        return null;
    }
}

/** 安全读字符串 */
function readString(read: () => unknown): string {
    try {
        const value = read();
        return typeof value === "string" ? value.trim() : "";
    } catch {
        return "";
    }
}

/** 安全读加粗（msoTrue = -1 / msoFalse = 0 / wdUndefined → null） */
function readBold(read: () => unknown): boolean | null {
    try {
        const value = read();
        if (value === true) return true;
        if (value === false) return false;
        if (typeof value !== "number" || !Number.isFinite(value)) return null;
        if (value >= UNDEFINED_NUMBER) return null;
        return value !== 0;
    } catch {
        return null;
    }
}

/**
 * 读取段落当前生效格式。
 *
 * @param doc 文档
 * @param para 已分析段落
 * @param config 排版配置（用于计算层级标题的段内范围）
 * @param styleName 从 `readParaInfos` 已知的样式名，避免重复读 COM
 */
function readCurrentFormat(
    doc: Wps.Document,
    para: StructuredParaInfo,
    config: TypographyConfig,
    styleName: string,
): CurrentFormat {
    const rng = doc.Paragraphs.Item(para.index).Range;
    const font = rng.Font;
    const pf = rng.ParagraphFormat;

    const nameFarEast = readString(() => font.NameFarEast);
    // NameFarEast 通常已能代表中文字体；为空时才退回 Name
    const name = nameFarEast ? "" : readString(() => font.Name);
    const nameAscii = readString(() => font.NameAscii);
    const fontSize = readNumber(() => font.Size);

    let fontName = nameFarEast || name;
    let bold = readBold(() => font.Bold);

    // 层级标题可能只有标题部分是黑体/楷体，后半段是正文；读标题子范围更准确
    const subRange = getHeadingSubRange(para, config);
    if (subRange) {
        const start = readNumber(() => rng.Start);
        if (start !== null) {
            try {
                const subRng = doc.Range(
                    start + subRange.start,
                    start + subRange.start + subRange.length,
                );
                fontName =
                    readString(() => subRng.Font.NameFarEast) ||
                    readString(() => subRng.Font.Name) ||
                    fontName;
                bold = readBold(() => subRng.Font.Bold) ?? bold;
            } catch {
                // 子范围读取失败时保留整段读取结果
            }
        }
    }

    const charIndent = readNumber(() => pf.CharacterUnitFirstLineIndent);
    let ptIndent: number | null = null;
    // 字符单位缩进为 0 时，才需要读磅值判断是否用磅设置的缩进
    if (charIndent === null || charIndent === 0) {
        ptIndent = readNumber(() => pf.FirstLineIndent);
    }

    let firstLineIndent: number | null = null;
    if (charIndent !== null && charIndent > 0) {
        firstLineIndent = charIndent;
    } else if (ptIndent !== null && ptIndent > 0) {
        // 文档用磅设置缩进时，按字号折算成字符数
        firstLineIndent = ptIndent / (fontSize && fontSize > 0 ? fontSize : 16);
    } else if (charIndent !== null) {
        firstLineIndent = charIndent;
    }

    return {
        styleName,
        fontName,
        asciiFontName: nameAscii,
        fontSize,
        bold,
        alignment: readNumber(() => pf.Alignment),
        firstLineIndent,
        lineSpacing: readNumber(() => pf.LineSpacing),
        lineSpacingRule: readNumber(() => pf.LineSpacingRule),
    };
}

/**
 * 检查 topic 小标题的加粗是否符合 `topicBoldMode`。
 *
 * - `none`：topic 文本不应加粗；
 * - `auto` / `prefix`：`computeTopicBoldRanges` 给出的范围应加粗。
 *
 * 只在 topic 段落上额外读子范围，避免给全文增加 COM 调用。
 */
function checkTopicBold(
    doc: Wps.Document,
    para: StructuredParaInfo,
    config: TypographyConfig,
): FormatIssue[] {
    if (!para.semanticKinds.has("topic") || para.subMatches.length === 0) return [];

    const rng = doc.Paragraphs.Item(para.index).Range;
    const start = readNumber(() => rng.Start);
    if (start === null) return [];

    const issues: FormatIssue[] = [];

    if (config.topicBoldMode === "none") {
        for (const match of para.subMatches) {
            const sub = doc.Range(start + match.start, start + match.start + match.length);
            const bold = readBold(() => sub.Font.Bold);
            if (bold === true) {
                issues.push({
                    field: "bold",
                    label: "小标题加粗",
                    expected: "不加粗",
                    actual: "加粗",
                });
                break;
            }
        }
        return issues;
    }

    for (const match of para.subMatches) {
        const ranges = computeTopicBoldRanges(match, config.topicBoldMode) ?? [];
        for (const range of ranges) {
            const sub = doc.Range(start + range.start, start + range.start + range.length);
            const bold = readBold(() => sub.Font.Bold);
            if (bold !== true) {
                issues.push({
                    field: "bold",
                    label: "小标题加粗",
                    expected: "加粗",
                    actual: formatBold(bold),
                });
                break;
            }
        }
        if (issues.length) break;
    }

    return issues;
}

/**
 * 计算层级标题在段落内的子范围。
 *
 * 只对 h1 / h2 / h3 生效；利用 `computeTitleSubRanges` 与排版属性使用同一套
 * 正则 / 段尾处理，避免检查结果与实际排版不一致。
 */
function getHeadingSubRange(
    para: StructuredParaInfo,
    config: TypographyConfig,
): SubRangeMod | null {
    let regex: RegExp;
    let font: { font: string; bold: boolean };

    switch (para.primaryKind) {
        case "h1":
            regex = H1_REGEX;
            font = config.h1;
            break;
        case "h2":
            regex = H2_REGEX;
            font = config.h2;
            break;
        case "h3":
            regex = H3_REGEX;
            font = config.h3;
            break;
        default:
            return null;
    }

    return computeTitleSubRanges(para.text, regex, font)?.[0] ?? null;
}

/** 去掉段落标记 / 换页符 / 软换行 / 表格标记，并压缩空白，便于面板展示 */
function cleanText(text: string): string {
    return text
        .replace(/[\r\f\v\x07]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 是否附件块起始段（如「附件1」「附件：」）。
 *
 * 附件块内的折行段会使用 5 字符悬挂缩进（`formatAttachments` 的规则），
 * 不能按正文首行缩进去判定，否则会误报。
 */
function isAttachmentBlockStart(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed.startsWith("附件")) return false;
    return /^附件\s*\d/.test(trimmed) || trimmed.includes("：") || trimmed.includes(":");
}

/**
 * 检查当前活动文档（或指定文档）的排版要素与格式。
 *
 * @param config 排版配置（来自 `useGovDocConfig().typography`）
 * @param doc 目标文档，默认当前活动文档
 */
export function inspectDocument(
    config: TypographyConfig,
    doc: Wps.Document = Application.ActiveDocument,
): InspectionResult {
    const infos = readParaInfos(doc);
    const structure = analyzeDocumentStructure(infos, true);

    // readParaInfos 已经读过每段样式名，这里复用，避免再走一次 COM
    const styleNames = new Map<number, string>();
    for (const info of infos) {
        styleNames.set(info.index, info.currentStyleName);
    }

    const elements: CheckElement[] = [];
    let skippedCount = 0;
    let readFailures = 0;
    // 附件块可能用 5 字符悬挂缩进，块内段落不按正文首行缩进判定
    let inAttachmentBlock = false;

    // 按文档自然顺序输出全部段落（含正文、空行、表格）
    for (const para of structure.paragraphs) {
        const styleName = styleNames.get(para.index) ?? "";
        const text = cleanText(para.text);
        const isNeutral = para.primaryKind === "empty" || para.primaryKind === "table";

        // 附件块在空行 / 换页符 / 新标题处结束；附件起始段开启块（含「附件：」这种无序号形式）
        if (
            para.isEmpty ||
            para.hasFormFeed ||
            para.primaryKind === "mainTitle" ||
            para.primaryKind === "letterhead"
        ) {
            inAttachmentBlock = false;
        } else if (para.isAttachment || isAttachmentBlockStart(text)) {
            inAttachmentBlock = true;
        }

        // 表格的 isSkipped 也算 true，但它不是用户标记的「不排版」，单独按「不检查」展示
        const skipped = para.isSkipped && para.primaryKind !== "table";
        if (skipped) skippedCount++;

        let format: CurrentFormat;
        let readFailed = false;
        if (isNeutral) {
            format = createBlankFormat(styleName);
        } else {
            try {
                format = readCurrentFormat(doc, para, config, styleName);
            } catch {
                format = createBlankFormat(styleName);
                readFailed = true;
                readFailures++;
            }
        }

        const expected = getExpectedFormat(para.primaryKind, config);
        let issues =
            readFailed || skipped || !expected ? [] : checkFormat(para.primaryKind, format, config);

        // topic 小标题的加粗是段内子范围，单独补充检查
        if (!readFailed && !skipped && expected) {
            issues.push(...checkTopicBold(doc, para, config));

            // 附件块的悬挂缩进由 formatAttachments 专门处理，不作为首行缩进异常
            if (inAttachmentBlock) {
                issues = issues.filter((issue) => issue.field !== "indent");
            }
        }

        elements.push({
            paraIndex: para.index,
            kind: para.primaryKind,
            kinds: [...para.semanticKinds],
            text,
            format,
            expected,
            skipped,
            readFailed,
            inAttachmentBlock,
            issues,
        });
    }

    const counts: Partial<Record<ParagraphSemanticKind, number>> = {};
    let issueCount = 0;
    for (const el of elements) {
        counts[el.kind] = (counts[el.kind] ?? 0) + 1;
        issueCount += el.issues.length;
    }

    const notes: string[] = [];
    if (elements.length === 0) {
        notes.push("未读取到段落：当前文档可能为空，或没有正文内容。");
    } else {
        if (!counts.mainTitle) {
            notes.push("未识别到公文标题，可能不是公文，或标题特征不明显。");
        }
        if (structure.mainTitleBlocks.length > 1) {
            notes.push(`识别到 ${structure.mainTitleBlocks.length} 处可能的标题块，请人工确认。`);
        }
        if (!counts.signatureDate) {
            notes.push("未识别到成文日期；普通文档可忽略此项。");
        }
    }
    if (skippedCount > 0) {
        notes.push(`有 ${skippedCount} 段标记为「不排版」，已跳过格式检查。`);
    }
    if (readFailures > 0) {
        notes.push(`有 ${readFailures} 段格式读取失败，已跳过检查。`);
    }

    return {
        docName: readString(() => doc.Name) || "未命名文档",
        checkedAt: Date.now(),
        paragraphCount: infos.length,
        elements,
        issueCount,
        skippedCount,
        counts,
        notes,
    };
}

/**
 * 选中指定段落，让 WPS 自动滚动到该段。
 *
 * 仅改变选区，不修改文档内容。
 *
 * @param index 1-based 段落索引
 * @param doc 目标文档，默认当前活动文档
 */
export function locateParagraph(
    index: number,
    doc: Wps.Document = Application.ActiveDocument,
): void {
    const rng = doc.Paragraphs.Item(index).Range;
    rng.Select();
}
