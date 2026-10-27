import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";
import { computeModifications } from "@/core/attributes";

import { TestDoc } from "../helpers/doc-test";
import { SMALL_NOTICE_LINES } from "../helpers/fixtures";
import { makeReader } from "../helpers/readers";

const ctx = { mainStyleName: "公文正文", titleStyleName: "公文标题" };

describe("computeModifications 差异检测", () => {
    const doc = new TestDoc(SMALL_NOTICE_LINES);

    test("无 reader → 输出完整指令", () => {
        const mods = computeModifications(doc.structure.paragraphs, DEFAULT_TYPO_CONFIG, ctx);
        expect(mods.length, "至少 3 段产生指令").toBeGreaterThanOrEqual(3);
    });

    test("返回结果按段落索引倒序（apply 从尾到头更安全）", () => {
        const mods = computeModifications(doc.structure.paragraphs, DEFAULT_TYPO_CONFIG, ctx);
        const indices = mods.map((m) => m.index);
        expect(indices, "索引倒序").toEqual([...indices].sort((a, b) => b - a));
    });

    test("快照与期望完全一致 → 该段落不产生指令", () => {
        const reader = makeReader([
            { index: 1, attrs: { style: "公文标题" } },
            {
                index: 3,
                attrs: {
                    style: "公文正文",
                    fontName: DEFAULT_TYPO_CONFIG.salutation.font || DEFAULT_TYPO_CONFIG.main.zh,
                    bold: !!DEFAULT_TYPO_CONFIG.salutation.bold,
                    firstLineIndent: 0,
                },
            },
        ]);
        const mods = computeModifications(
            doc.structure.paragraphs,
            DEFAULT_TYPO_CONFIG,
            ctx,
            reader,
        );
        const indices = mods.map((m) => m.index);
        expect(indices, "段 1 完全匹配 → 不应出现").not.toContain(1);
        expect(indices, "段 3 完全匹配 → 不应出现").not.toContain(3);
    });

    test("仅缩进差异 → 只下发缩进", () => {
        const reader = makeReader([
            {
                index: 3,
                attrs: {
                    style: "公文正文",
                    fontName: DEFAULT_TYPO_CONFIG.salutation.font || DEFAULT_TYPO_CONFIG.main.zh,
                    bold: !!DEFAULT_TYPO_CONFIG.salutation.bold,
                    firstLineIndent: 2, // ← 与期望 0 不一致
                },
            },
        ]);
        const mods = computeModifications(
            doc.structure.paragraphs,
            DEFAULT_TYPO_CONFIG,
            ctx,
            reader,
        );
        const p = mods.find((m) => m.index === 3);
        expect(p, "段 3 应产生指令").toBeDefined();
        expect(p!.style, "style 一致 → 不下发").toBeUndefined();
        expect(p!.fontName, "fontName 一致 → 不下发").toBeUndefined();
        expect(p!.firstLineIndent, "缩进差异 → 下发 0").toBe(0);
    });

    test("显式 bold:false 差异应被下发（不能漏）", () => {
        const reader = makeReader([
            {
                index: 3,
                attrs: {
                    style: "公文正文",
                    fontName: DEFAULT_TYPO_CONFIG.salutation.font || DEFAULT_TYPO_CONFIG.main.zh,
                    bold: true, // ← 与期望 false 不一致
                    firstLineIndent: 0,
                },
            },
        ]);
        const mods = computeModifications(
            doc.structure.paragraphs,
            DEFAULT_TYPO_CONFIG,
            ctx,
            reader,
        );
        const p = mods.find((m) => m.index === 3);
        expect(p, "段 3 应产生指令").toBeDefined();
        expect(p!.bold, "bold 差异 → 下发 false").toBe(false);
    });

    test("全部一致 → 返回空数组", () => {
        const d = new TestDoc(["这是一段正文。"]);
        const reader = makeReader([{ index: 1, attrs: { style: "公文正文" } }]);
        const mods = computeModifications(d.structure.paragraphs, DEFAULT_TYPO_CONFIG, ctx, reader);
        expect(mods, "无差异 → 无指令").toEqual([]);
    });

    // ⚠️ 对齐方式测试：当前 ATTRS.alignment.desired 恒为 undefined，
    //    无法通过语义触发。等未来加入 alignment 策略后再补。
});
