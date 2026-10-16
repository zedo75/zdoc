import type { TypographyConfig } from "@/jsa/types";
import type {
    DocumentStructure,
    ParagraphSemanticKind,
    ParaModification,
    StructuredParaInfo,
    SubRangeMod,
} from "@/utils/para-types";

import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";
import { analyzePlainText } from "@/utils/para-pipeline";

/**
 * 测试文档包装器：把 `analyzePlainText` 的返回值翻译成排版语义。
 *
 * @remarks
 * 相比裸 `structure.paragraphs[0].primaryKind`，本类提供：
 * - `find("文本前缀")` 按内容定位段落（找不到会抛错并打印预览）
 * - `kind` / `style` / `fontName` / `indent` 等 getter 取代深层字段路径
 * - `boldPrefix()` 取代 `subRanges[0]` + slice 的手工计算
 *
 * @example
 * const doc = new TestDoc([
 *     "各市人民政府：",
 *     "正文内容。",
 * ]);
 * const p = doc.find("各市人民政府");
 * expect(p.kind, `段落「${p.text}」应识别为抬头`).toBe("salutation");
 * expect(p.indent, `段落「${p.text}」应顶格`).toBe(0);
 */
export class TestDoc {
    readonly structure: DocumentStructure;
    readonly modifications: ParaModification[];

    constructor(
        input: string | string[],
        config: TypographyConfig = DEFAULT_TYPO_CONFIG,
        options?: { isFullDoc?: boolean },
    ) {
        const text = Array.isArray(input)
            ? input.map((l) => l.replace(/\r$/, "")).join("\r") + "\r"
            : input;
        const result = analyzePlainText(text, config, options);
        this.structure = result.structure;
        this.modifications = result.modifications;
    }

    get length(): number {
        return this.structure.paragraphs.length;
    }

    /** 按 1-based 索引取段落 */
    at(index1: number): ParaView {
        const info = this.structure.paragraphs[index1 - 1];
        if (!info) throw new Error(`段落索引越界: ${index1}（共 ${this.length} 段）`);
        return new ParaView(info, this.modifications);
    }

    /**
     * 按文本前缀定位段落。
     *
     * @throws 找不到时抛出，附带前 5 段预览，便于排查
     */
    find(textPrefix: string): ParaView {
        const info = this.structure.paragraphs.find((p) => p.text.startsWith(textPrefix));
        if (!info) {
            const preview = this.structure.paragraphs
                .slice(0, 5)
                .map((p, i) => `  [${i + 1}] ${JSON.stringify(p.text.slice(0, 30))}`)
                .join("\n");
            throw new Error(
                `未找到以 ${JSON.stringify(textPrefix)} 开头的段落。\n段落预览：\n${preview}`,
            );
        }
        return new ParaView(info, this.modifications);
    }

    /** 所有段落 */
    all(): ParaView[] {
        return this.structure.paragraphs.map((info) => new ParaView(info, this.modifications));
    }

    /** 按 primaryKind 过滤 */
    kinds(kind: ParagraphSemanticKind): ParaView[] {
        return this.all().filter((p) => p.kind === kind);
    }

    /** 所有落款（单位行组 + 日期） */
    signatures(): SignatureView[] {
        return this.structure.signatures.map(
            (sig) =>
                new SignatureView(
                    sig.unitIndices.map((i) => this.at(i + 1)),
                    this.at(sig.dateIndex + 1),
                ),
        );
    }
}

/** 段落视图：排版语义 getter 集合 */
export class ParaView {
    constructor(
        readonly info: StructuredParaInfo,
        private readonly mods: ParaModification[],
    ) {}

    // ── 结构信息 ──
    get index(): number {
        return this.info.index;
    }
    get text(): string {
        return this.info.text.replace(/\r$/, "");
    }
    get kind(): ParagraphSemanticKind {
        return this.info.primaryKind;
    }
    get kinds(): Set<ParagraphSemanticKind> {
        return this.info.semanticKinds;
    }
    get isEmpty(): boolean {
        return this.info.isEmpty;
    }
    get isSkipped(): boolean {
        return this.info.isSkipped;
    }
    get isTable(): boolean {
        return this.info.isTable;
    }
    get subMatches(): StructuredParaInfo["subMatches"] {
        return this.info.subMatches;
    }

    // ── 修改指令的便捷字段 ──
    get mod(): ParaModification | undefined {
        return this.mods.find((m) => m.index === this.info.index);
    }
    get style(): string | undefined {
        return this.mod?.style;
    }
    get fontName(): string | undefined {
        return this.mod?.fontName;
    }
    get fontSize(): number | undefined {
        return this.mod?.fontSize;
    }
    get bold(): boolean | undefined {
        return this.mod?.bold;
    }
    get indent(): number | undefined {
        return this.mod?.firstLineIndent;
    }
    get alignment(): number | undefined {
        return this.mod?.alignment;
    }
    get subRanges(): SubRangeMod[] | undefined {
        return this.mod?.subRanges;
    }

    /**
     * 第一个加粗子范围覆盖的原文——用于断言"加粗前缀"。
     *
     * @returns 无加粗子范围时返回 `null`
     */
    boldPrefix(): string | null {
        const subs = this.subRanges;
        if (!subs?.length) return null;
        const first = subs.find((s) => s.bold === true);
        if (!first) return null;
        return this.info.text.slice(first.start, first.start + first.length);
    }

    /** 第一个子范围覆盖的原文（无论是否 bold） */
    firstSubText(): string | null {
        const subs = this.subRanges;
        if (!subs?.length) return null;
        const first = subs[0];
        return this.info.text.slice(first.start, first.start + first.length);
    }
}

/** 落款视图 */
export class SignatureView {
    constructor(
        readonly units: ParaView[],
        readonly date: ParaView,
    ) {}

    get unitTexts(): string[] {
        return this.units.map((u) => u.text);
    }
}
