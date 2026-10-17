import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";

import { TestDoc } from "../helpers/doc-test";
import { SAMPLE_GOV_DOC_LINES, SUBTITLE_DOC_LINES } from "../helpers/fixtures";

// ==================== 完整公文样例 ====================

describe("结构分析：完整公文样例", () => {
    const doc = new TestDoc(SAMPLE_GOV_DOC_LINES);

    test("主标题块：文档首连续 2 行非空", () => {
        expect(doc.structure.mainTitleBlocks.length, "块数").toBe(1);
        const [s, e] = doc.structure.mainTitleBlocks[0];
        expect(s, "块起点").toBe(0);
        expect(e, "块终点").toBe(1);

        const p0 = doc.at(1);
        const p1 = doc.at(2);
        expect(p0.kind, `「${p0.text}」`).toBe("mainTitle");
        expect(p1.kind, `「${p1.text}」`).toBe("mainTitle");
    });

    test("抬头识别", () => {
        const p = doc.find("各市、县（区）");
        expect(p.kind, `「${p.text}」`).toBe("salutation");
        expect(p.kinds.has("salutation"), `「${p.text}」semanticKinds 应含 salutation`).toBe(true);
    });

    test("层级标题 h1 / h2 / h3 均存在", () => {
        expect(doc.kinds("h1").length, "h1 数量").toBeGreaterThanOrEqual(1);
        expect(doc.kinds("h2").length, "h2 数量").toBeGreaterThanOrEqual(2);
        expect(doc.kinds("h3").length, "h3 数量").toBeGreaterThanOrEqual(1);
    });

    test("h3 段落同时包含 topic 子句（多类别共存）", () => {
        const text = ["1.加强组织领导", "一是落实责任。"].join("\n");
        const d = new TestDoc(text);
        expect(d.at(1).kind, "第 1 段").toBe("h3");
        expect(d.at(2).kinds.has("topic"), `「${d.at(2).text}」semanticKinds 应含 topic`).toBe(
            true,
        );
    });

    test("topic 匹配：一是…二是…（同段内两个子句）", () => {
        const d = new TestDoc(["一是提高政治站位。二是强化责任担当。"]);
        const p = d.at(1);
        expect(p.kinds.has("topic"), `「${p.text}」应含 topic`).toBe(true);
        expect(p.subMatches.length, "应匹配到 2 个子句").toBe(2);
        expect(p.subMatches[0].text, "第一个子句").toContain("一是提高政治站位");
        expect(p.subMatches[1].text, "第二个子句").toContain("二是强化责任担当");
    });

    test("附件行识别：样例含 2 处", () => {
        const attArr = doc.kinds("attachment");
        expect(attArr.length, "附件段落数").toBe(2);
    });

    test("落款识别：单位 + 日期", () => {
        const sigs = doc.signatures();
        expect(sigs.length, "落款组数").toBeGreaterThan(0);

        const sig = sigs[0];
        expect(sig.units.length, "单位行数").toBeGreaterThan(0);
        expect(sig.date.kind, `日期段「${sig.date.text}」`).toBe("signatureDate");
        expect(sig.date.text, "日期文本").toBe("2025年3月15日");

        const unit = sig.units[0];
        expect(unit.kind, `单位段「${unit.text}」`).toBe("signatureUnit");
        expect(unit.text, "单位文本").toBe("XX省人民政府办公厅");
    });

    test("空行段落：primaryKind === empty", () => {
        const emptyP = doc.all().find((p) => p.isEmpty);
        expect(emptyP, "至少有一处空行").toBeDefined();
        expect(emptyP!.kind, `空段「${emptyP!.text}」`).toBe("empty");
    });
});

// ==================== 多行主标题块（标题 + 署名 + 日期 + 文种） ====================

describe("结构分析：多行主标题块", () => {
    const LINES = [
        "在XX县“XX工作法”", // 0
        "培训会上的讲话", // 1
        "某部部长，某委书记（兼）  李某", // 2
        "（2026年X月X日）", // 3
        "（送审稿）", // 4
        "", // 5
        "各有关单位：", // 6
        "",
        "正文……",
    ];

    test("整块识别：连续 5 行合为一个块", () => {
        const doc = new TestDoc(LINES);
        expect(doc.structure.mainTitleBlocks.length, "块数").toBe(1);
        const [s, e] = doc.structure.mainTitleBlocks[0];
        expect(s, "起点").toBe(0);
        expect(e, "终点").toBe(4);
    });

    test("主标题 / 署名 / 日期 / 文种各归其位", () => {
        const doc = new TestDoc(LINES);
        expect(doc.at(1).kind, "标题首行").toBe("mainTitle");
        expect(doc.at(2).kind, "标题次行").toBe("mainTitle");
        expect(doc.at(3).kind, "署名行").toBe("subtitle");
        expect(doc.at(4).kind, "括号日期").toBe("subtitle");
        expect(doc.at(5).kind, "文种").toBe("subtitle");
    });

    test("块后抬头保持 salutation，不被吞", () => {
        const doc = new TestDoc(LINES);
        expect(doc.at(7).kind, "抬头").toBe("salutation");
    });
});

test("署名行仅 1 个空格 → fallback 为 mainTitle", () => {
    const doc = new TestDoc([
        "关于XX工作的通知",
        "某局局长 张某", // 单空格，PLAIN_NAME_REGEX 拒绝
        "",
    ]);
    expect(doc.at(2).kind, "当前行为").toBe("mainTitle");
    // 此处记录现状；若后续放宽空格数要求，此断言需同步改
});

// ==================== 副标题 ====================

describe("结构分析：副标题", () => {
    test("含「稿」或「案」的括号行 → subtitle", () => {
        const doc = new TestDoc(SUBTITLE_DOC_LINES);
        expect(doc.at(1).kind, "第 1 段主标题").toBe("mainTitle");
        expect(doc.at(2).kind, `「${doc.at(2).text}」副标题`).toBe("subtitle");
    });

    test("破折号开头 → subtitle", () => {
        const doc = new TestDoc(["关于XX工作的实施意见", "——XX省人民政府办公厅", "", "各区县："]);
        expect(doc.at(2).kind, `「${doc.at(2).text}」`).toBe("subtitle");
    });

    test("副标题语义仅在主标题块内被提升", () => {
        const doc = new TestDoc(["（征求意见稿）"]);
        expect(doc.at(1).kind, `孤立副标题「${doc.at(1).text}」不应被提升为 subtitle`).not.toBe(
            "subtitle",
        );
    });
});

// ==================== 局部模式 ====================

describe("结构分析：局部模式 isFullDoc=false", () => {
    const full = new TestDoc(SAMPLE_GOV_DOC_LINES, DEFAULT_TYPO_CONFIG, { isFullDoc: true });
    const partial = new TestDoc(SAMPLE_GOV_DOC_LINES, DEFAULT_TYPO_CONFIG, { isFullDoc: false });

    test("主标题块：全文识别、局部跳过", () => {
        expect(full.structure.mainTitleBlocks.length, "全文模式").toBeGreaterThan(0);
        expect(partial.structure.mainTitleBlocks.length, "局部模式").toBe(0);
    });

    test("落款：全文识别、局部跳过", () => {
        expect(full.structure.signatures.length, "全文模式").toBeGreaterThan(0);
        expect(partial.structure.signatures.length, "局部模式").toBe(0);
    });

    test("段落级语义在两种模式下都识别", () => {
        const kinds = new Set(partial.all().map((p) => p.kind));
        expect(kinds.has("h1"), "h1").toBe(true);
        expect(kinds.has("h2"), "h2").toBe(true);
        expect(kinds.has("h3"), "h3").toBe(true);
        expect(kinds.has("salutation"), "salutation").toBe(true);
        expect(kinds.has("attachment"), "attachment").toBe(true);
    });
});
