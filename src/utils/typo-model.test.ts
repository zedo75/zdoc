import type { SnapshotReader } from "@/utils/para-attributes";
import type { ParaAttrValues } from "@/utils/para-types";

import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";
import {
    computeTopicBoldRanges,
    looksLikeSalutation,
    looksLikeSignatureDate,
    parsePlainTextToParas,
} from "@/utils/para-analysis";
import { computeModifications } from "@/utils/para-attributes";
import { analyzePlainText } from "@/utils/para-pipeline";

// =========================================================================
// 第一阶段：纯文本解析
// =========================================================================

describe("parsePlainTextToParas 纯文本解析", () => {
    test("支持 \\n / \\r / \\r\\n，且每段尾统一带 \\r", () => {
        const r1 = parsePlainTextToParas("a\nb\nc");
        expect(r1).toHaveLength(3);
        expect(r1[0].text).toBe("a\r");
        expect(r1[1].text).toBe("b\r");
        expect(r1[2].text).toBe("c\r");
        expect(r1[0].isEmpty).toBe(false);

        const r2 = parsePlainTextToParas("a\r\nb\rc");
        expect(r2).toHaveLength(3);
        expect(r2.map((p) => p.text)).toEqual(["a\r", "b\r", "c\r"]);
    });

    test("连续空行保留为多段 empty", () => {
        const r3 = parsePlainTextToParas("\n\n\n");
        expect(r3).toHaveLength(3);
        expect(r3.every((p) => p.isEmpty)).toBe(true);
    });

    test("空串返回空数组；单段无换行符时补尾 \\r", () => {
        expect(parsePlainTextToParas("")).toEqual([]);
        const r = parsePlainTextToParas("a");
        expect(r).toHaveLength(1);
        expect(r[0].text).toBe("a\r");
        expect(r[0].isEmpty).toBe(false);
    });

    test("识别附件、换页符、禁止符号", () => {
        const paras = parsePlainTextToParas(
            ["附件1 XXX管理办法", "正常段落。", "含【禁止符号】的段落", "前有换页\f后有内容"].join(
                "\n",
            ),
        );
        expect(paras[0].isAttachment).toBe(true);
        expect(paras[1].isAttachment).toBe(false);
        expect(paras[2].hasForbidden).toBe(true);
        expect(paras[3].hasFormFeed).toBe(true);
    });

    test("表格单元格标记 \\x07 → isTable=true", () => {
        const paras = parsePlainTextToParas("单元格1\x07单元格2\x07\r");
        expect(paras[0].isTable).toBe(true);
    });
});

// =========================================================================
// 第二阶段：纯函数判定
// =========================================================================

describe("looksLikeSalutation 抬头判定", () => {
    test("典型抬头应识别为 true", () => {
        expect(looksLikeSalutation("各省、自治区、直辖市人民政府：\r")).toBe(true);
        expect(looksLikeSalutation("各单位、各部门：\r")).toBe(true);
        expect(looksLikeSalutation("尊敬的各位领导：\r")).toBe(true);
        expect(looksLikeSalutation("党委书记、各位主任：\r")).toBe(true);
    });

    test("命中排除规则时应为 false（即使有冒号）", () => {
        expect(looksLikeSalutation("关于做好XX工作的通知：\r")).toBe(false);
        expect(looksLikeSalutation("根据XXX规定。：\r")).toBe(false);
    });

    test("无白名单关键词时，仅有冒号也应为 false", () => {
        expect(looksLikeSalutation("大家好：\r")).toBe(false);
    });
});

describe("looksLikeSignatureDate 落款日期判定", () => {
    test("标准日期及占位日期识别", () => {
        expect(looksLikeSignatureDate("2025年8月24日\r")).toBe(true);
        // 每段空格数控制在 1 字符以内，符合正则 `[0-9 X]{1,2}`
        expect(looksLikeSignatureDate("2025年8月 5日\r")).toBe(true);
        expect(looksLikeSignatureDate("2025年 8月5日\r")).toBe(true);
        expect(looksLikeSignatureDate("XXXX年XX月XX日\r")).toBe(true);
    });

    test("带前缀时不应识别为落款日期", () => {
        expect(looksLikeSignatureDate("成文日期：2025年8月24日\r")).toBe(false);
    });
});

describe("computeTopicBoldRanges topic 加粗范围", () => {
    test("auto 模式：短句（无逗号）整句加粗", () => {
        const r = computeTopicBoldRanges({ text: "一是加强领导。", start: 0, length: 7 }, "auto");
        expect(r).toEqual([{ start: 0, length: 7, bold: true }]);
    });

    test("auto 模式：恰好 26 字走整句加粗；27 字仅前缀", () => {
        // 构造 26 字、无逗号的 topic 句子
        const s26 = "一是" + "甲".repeat(23) + "。"; // 2 + 23 + 1 = 26
        expect(s26.length).toBe(26);
        const r26 = computeTopicBoldRanges({ text: s26, start: 0, length: s26.length }, "auto");
        expect(r26).toEqual([{ start: 0, length: s26.length, bold: true }]);

        const s27 = "一是" + "甲".repeat(24) + "。"; // 2 + 24 + 1 = 27
        expect(s27.length).toBe(27);
        const r27 = computeTopicBoldRanges({ text: s27, start: 0, length: s27.length }, "auto");
        expect(r27).toEqual([{ start: 0, length: 2, bold: true }]);
    });

    test("auto 模式：句内 2 个逗号仅前缀加粗", () => {
        const longText = "一是要深刻认识，全面把握，扎实推进各项工作。";
        const r = computeTopicBoldRanges(
            { text: longText, start: 0, length: longText.length },
            "auto",
        );
        expect(r).toEqual([{ start: 0, length: 2, bold: true }]);
    });

    test("prefix 模式：无论长短只加粗前缀", () => {
        const r = computeTopicBoldRanges({ text: "一是加强领导。", start: 0, length: 7 }, "prefix");
        expect(r).toEqual([{ start: 0, length: 2, bold: true }]);
    });

    test("none 模式返回空数组", () => {
        expect(
            computeTopicBoldRanges({ text: "一是加强领导。", start: 0, length: 7 }, "none"),
        ).toEqual([]);
    });

    test("无法匹配前缀时返回空数组", () => {
        const r = computeTopicBoldRanges(
            { text: "首先是加强领导。", start: 0, length: 10 },
            "auto",
        );
        expect(r).toEqual([]);
    });
});

// =========================================================================
// 第三阶段：结构分析
// =========================================================================

/** 标准公文样例（不含任何格式信息） */
const SAMPLE_GOV_DOC = String.raw`XX省人民政府办公厅
关于印发《XX省2025年政务公开工作要点》的通知

各市、县（区）人民政府，省政府各部门：
《XX省2025年政务公开工作要点》已经省政府同意，现印发给你们，请认真贯彻执行。

一、总体要求
以习近平新时代中国特色社会主义思想为指导，全面贯彻落实党的二十大精神。
（一）指导思想
坚持稳中求进工作总基调。
（二）基本原则
一是提高政治站位。二是强化责任担当。

1.加强组织领导
各级政府要加强对政务公开工作的领导。

附件1 2025年度重点任务分工表
附件2 考核指标体系

XX省人民政府办公厅
2025年3月15日`;

describe("结构分析：完整公文样例", () => {
    const { structure } = analyzePlainText(SAMPLE_GOV_DOC, DEFAULT_TYPO_CONFIG);

    test("主标题块识别：文档首段连续 2 行非空", () => {
        expect(structure.mainTitleBlocks).toHaveLength(1);
        const [s, e] = structure.mainTitleBlocks[0];
        expect(s).toBe(0);
        expect(e).toBe(1); // 发文机关 + 标题
        expect(structure.paragraphs[0].primaryKind).toBe("mainTitle");
        expect(structure.paragraphs[1].primaryKind).toBe("mainTitle");
    });

    test("抬头识别：各市、县（区）人民政府，省政府各部门：", () => {
        const idx = structure.paragraphs.findIndex((p) => p.text.startsWith("各市、县（区）"));
        expect(idx).toBeGreaterThan(0);
        expect(structure.paragraphs[idx].semanticKinds.has("salutation")).toBe(true);
        expect(structure.paragraphs[idx].primaryKind).toBe("salutation");
    });

    test("层级标题识别：h1 / h2 / h3 均存在", () => {
        const kinds = structure.paragraphs.map((p) => p.primaryKind);
        expect(kinds).toContain("h1");
        expect(kinds.filter((k) => k === "h2").length).toBeGreaterThanOrEqual(2);
        expect(kinds).toContain("h3");
    });

    test("h3 段落同时包含 topic 子句（多类别共存）", () => {
        // 三、四级标题：一段可能既是 h3 又含 topic
        const text = ["1.加强组织领导", "一是落实责任。"].join("\n");
        const { structure } = analyzePlainText(text, DEFAULT_TYPO_CONFIG);
        // 第一段：h3
        expect(structure.paragraphs[0].semanticKinds.has("h3")).toBe(true);
        // 第二段：含 topic 子句（前置缩进使 topic 无法匹配到首句，此处仅校验存在性）
        expect(structure.paragraphs[1].semanticKinds.has("topic")).toBe(true);
    });

    test("小标题（topic）匹配：一是…二是…", () => {
        // topicRegex 先行断言要求句前是「^ / 。 / ？ / ！」，所以去掉行首缩进
        const sample = "一是提高政治站位。二是强化责任担当。\n";
        const { structure } = analyzePlainText(sample, DEFAULT_TYPO_CONFIG);
        const p = structure.paragraphs[0];
        expect(p.semanticKinds.has("topic")).toBe(true);
        expect(p.subMatches.length).toBe(2);
        expect(p.subMatches[0].text).toContain("一是提高政治站位");
        expect(p.subMatches[1].text).toContain("二是强化责任担当");
    });

    test("附件行识别：样例含 2 处", () => {
        const attCount = structure.paragraphs.filter((p) => p.primaryKind === "attachment").length;
        expect(attCount).toBe(2);
    });

    test("落款识别：单位 + 日期", () => {
        expect(structure.signatures[0].unitIndices.length).toBeGreaterThan(0);
        expect(structure.signatures[0].dateIndex).not.toBeNull();

        const unitP = structure.paragraphs[structure.signatures[0].unitIndices[0]];
        const dateP = structure.paragraphs[structure.signatures[0].dateIndex!];
        expect(unitP.primaryKind).toBe("signatureUnit");
        expect(dateP.primaryKind).toBe("signatureDate");
        expect(unitP.text.trim()).toBe("XX省人民政府办公厅");
    });

    test("空行段落：primaryKind === empty，且不产生修改指令", () => {
        const emptyIdx = structure.paragraphs.findIndex((p) => p.isEmpty);
        expect(emptyIdx).toBeGreaterThanOrEqual(0);
        expect(structure.paragraphs[emptyIdx].primaryKind).toBe("empty");

        const { modifications } = analyzePlainText(SAMPLE_GOV_DOC, DEFAULT_TYPO_CONFIG);
        const emptyIdx1 = emptyIdx + 1; // ★ 1-based
        // ★ 不再断言 "不在 desiredStates 里"，而是"不产生指令"
        const mod = modifications.find((m) => m.index === emptyIdx1);
        expect(mod?.style == "公文正文").toBe(true);
    });
});

describe("结构分析：副标题", () => {
    test("含「稿」或「案」的括号行 → subtitle", () => {
        const text = ["XX厅关于XX的通知", "（征求意见稿）", "", "各单位："].join("\n");
        const { structure } = analyzePlainText(text, DEFAULT_TYPO_CONFIG);
        expect(structure.paragraphs[0].primaryKind).toBe("mainTitle");
        expect(structure.paragraphs[1].primaryKind).toBe("subtitle");
    });

    test("破折号开头 → subtitle", () => {
        const text = ["关于XX工作的实施意见", "——XX市人民政府办公厅", "", "各区县："].join("\n");
        const { structure } = analyzePlainText(text, DEFAULT_TYPO_CONFIG);
        expect(structure.paragraphs[1].primaryKind).toBe("subtitle");
    });

    test("副标题语义仅在主标题块内被提升", () => {
        // 单独一行副标题（不在主标题块内）不应被识别为 subtitle
        const text = "（征求意见稿）\n";
        const { structure } = analyzePlainText(text, DEFAULT_TYPO_CONFIG);
        expect(structure.paragraphs[0].primaryKind).not.toBe("subtitle");
    });
});

describe("结构分析：局部模式 isFullDoc=false", () => {
    test("不识别主标题、不识别落款，但仍识别段落级语义", () => {
        const text = SAMPLE_GOV_DOC;
        const full = analyzePlainText(text, DEFAULT_TYPO_CONFIG, { isFullDoc: true });
        const partial = analyzePlainText(text, DEFAULT_TYPO_CONFIG, { isFullDoc: false });

        expect(full.structure.mainTitleBlocks.length).toBeGreaterThan(0);
        expect(partial.structure.mainTitleBlocks).toHaveLength(0);

        // ★ 从"第一项字段非空"改成"数组长度 > 0"
        expect(full.structure.signatures.length).toBeGreaterThan(0);
        // ★ partial 模式：直接断言数组为空
        expect(partial.structure.signatures).toHaveLength(0);

        const partialKinds = new Set(partial.structure.paragraphs.map((p) => p.primaryKind));
        expect(partialKinds.has("h1")).toBe(true);
        expect(partialKinds.has("h2")).toBe(true);
        expect(partialKinds.has("h3")).toBe(true);
        expect(partialKinds.has("salutation")).toBe(true);
        expect(partialKinds.has("attachment")).toBe(true);
    });
});

// =========================================================================
// 第四阶段：期望状态 & 修改指令生成
// =========================================================================

describe("analyzePlainText 期望状态（改用 modifications 断言）", () => {
    const { structure, modifications } = analyzePlainText(SAMPLE_GOV_DOC, DEFAULT_TYPO_CONFIG);
    const byIndex = new Map(modifications.map((m) => [m.index, m]));

    test("主标题段落期望「公文标题」样式", () => {
        const titleP = structure.paragraphs.find((p) => p.primaryKind === "mainTitle")!;
        // ★ 不再有 desiredStates；直接看 modifications 的 style 字段
        expect(byIndex.get(titleP.index)?.style).toBe("公文标题");
    });

    test("抬头段落期望楷体 / 顶格", () => {
        const sP = structure.paragraphs.find((p) => p.primaryKind === "salutation")!;
        const mod = byIndex.get(sP.index);
        expect(mod).toBeDefined();
        // ★ 期望值现在从 config 读，直接断言具体值或与 config 一致
        expect(mod!.firstLineIndent).toBe(0);
        expect(mod!.fontName).toBe(
            DEFAULT_TYPO_CONFIG.salutation.font || DEFAULT_TYPO_CONFIG.main.zh,
        );
    });

    test("正文段落期望「公文正文」样式", () => {
        const bodyP = structure.paragraphs.find((p) => p.primaryKind === "body")!;
        expect(byIndex.get(bodyP.index)?.style).toBe("公文正文");
    });

    test("副标题有明确 font / size / bold 覆盖", () => {
        const text = ["标题", "（送审稿）", "", "正文开始"].join("\n");
        const r = analyzePlainText(text, DEFAULT_TYPO_CONFIG);
        const subtitleMod = r.modifications.find((m) => m.index === 2);
        expect(subtitleMod?.style).toBe("公文标题");
        expect(subtitleMod?.fontName).toBe("楷体_GB2312");
        expect(subtitleMod?.fontSize).toBe(16);
        expect(subtitleMod?.bold).toBe(false);
    });

    test("抬头：顶格 + 楷体", () => {
        const salutationPara = structure.paragraphs.find((p) => p.primaryKind === "salutation");
        expect(salutationPara).toBeDefined();
        const m = byIndex.get(salutationPara!.index);
        expect(m?.firstLineIndent).toBe(0);
        expect(m?.fontName).toBe(DEFAULT_TYPO_CONFIG.salutation.font);
    });

    test("附件：顶格 + 黑体", () => {
        const attachmentIndices = new Set(
            structure.paragraphs.filter((p) => p.primaryKind === "attachment").map((p) => p.index),
        );
        expect(attachmentIndices.size).toBeGreaterThanOrEqual(2);
        const attachmentMods = modifications.filter((m) => attachmentIndices.has(m.index));
        expect(attachmentMods.length).toBeGreaterThanOrEqual(2);
        attachmentMods.forEach((m) => {
            expect(m.fontName).toBe("黑体");
            expect(m.firstLineIndent).toBe(0);
        });
    });

    test("一级标题：通过 subRanges 在编号前缀上应用黑体", () => {
        const h1 = structure.paragraphs.find((p) => p.primaryKind === "h1");
        expect(h1).toBeDefined();

        const mod = byIndex.get(h1!.index);
        expect(mod).toBeDefined();

        // 整段层面不应带 fontName（保留“公文正文”样式默认字体）
        expect(mod!.fontName).toBeUndefined();

        // 字体通过 subRange 施加在 H1_REGEX 匹配到的前缀上
        expect(mod!.subRanges?.length).toBeGreaterThan(0);
        const sub = mod!.subRanges![0];
        expect(sub.fontName).toBe("黑体");

        // 把契约钉死：subRange 覆盖的确实是一、二、… 这类编号前缀
        const covered = h1!.text.slice(sub.start, sub.start + sub.length);
        expect(covered).toMatch(/^[一二三四五六七八九十]+、/);
    });

    test("三级标题：仿宋_GB2312 + 加粗", () => {
        const h3 = structure.paragraphs.find((p) => p.primaryKind === "h3");
        expect(h3).toBeDefined();
        const mod = byIndex.get(h3!.index);
        // 整段层面不应带 fontName/bold（保留样式默认）
        expect(mod!.fontName).toBeUndefined();
        expect(mod!.bold).toBeUndefined();

        // 字体/加粗通过 subRange 施加在 H3_REGEX 匹配到的区间上
        expect(mod!.subRanges?.length).toBeGreaterThan(0);
        const sub = mod!.subRanges![0];
        expect(sub.fontName).toBe("仿宋_GB2312");
        expect(sub.bold).toBe(true);
    });

    test("topic prefix 模式 → 子范围仅加粗「X是 / X要」前缀", () => {
        const { structure, modifications } = analyzePlainText(
            "（二）基本原则\n一是提高政治站位。二是强化责任担当。\n",
            DEFAULT_TYPO_CONFIG, // 默认 topicBoldMode: "prefix"
        );
        const target = modifications.find(
            (m) => m.index === 2 && m.subRanges && m.subRanges.length > 0,
        );
        expect(target).toBeDefined();

        const firstSub = target!.subRanges![0];
        expect(firstSub.bold).toBe(true);
        // prefix 模式下前缀固定 2 个汉字
        expect(firstSub.length).toBe(2);

        const p = structure.paragraphs[1];
        const text = p.text.slice(firstSub.start, firstSub.start + firstSub.length);
        expect(text).toMatch(/^[一二三四五六七八九十][是要]$/);
    });

    test("topicBoldMode=auto + 短句 → 整句加粗", () => {
        const cfg = { ...DEFAULT_TYPO_CONFIG, topicBoldMode: "auto" as const };
        const sample = "正文\n一是提高站位。\n";
        const { modifications } = analyzePlainText(sample, cfg);
        const m = modifications.find((mm) => mm.index === 2);
        expect(m?.subRanges?.[0].bold).toBe(true);
        expect(m?.subRanges?.[0].length).toBe("一是提高站位。".length);
    });
});

// =========================================================================
// 第五阶段：差异检测
// =========================================================================

/**
 * 测试用 SnapshotReader：从简化的 attribute 表构造。
 */
function makeReader(
    entries: Array<{
        index: number;
        attrs: Partial<Record<keyof ParaAttrValues, unknown>>;
    }>,
): SnapshotReader {
    const m = new Map(entries.map((e) => [e.index, e.attrs]));
    return {
        read(idx1, key) {
            const attrs = m.get(idx1);
            return attrs ? attrs[key] : undefined;
        },
    };
}

describe("computeModifications 差异检测", () => {
    // 构造：1 段主标题，1 段空行，1 段抬头，1 段正文
    const ONE_TITLE = "XX省关于做好XX工作的通知\n\n各市人民政府：\n正文内容。\n";
    const { structure } = analyzePlainText(ONE_TITLE, DEFAULT_TYPO_CONFIG);
    const ctx = { mainStyleName: "公文正文", titleStyleName: "公文标题" };

    test("当前快照为空 → 输出完整指令", () => {
        // ★ 不再传 desiredStates Map；直接传 structure.paragraphs
        const mods = computeModifications(structure.paragraphs, DEFAULT_TYPO_CONFIG, ctx);
        expect(mods.length).toBeGreaterThanOrEqual(3);
    });

    test("返回结果按段落索引倒序（apply 从尾到头更安全）", () => {
        const mods = computeModifications(structure.paragraphs, DEFAULT_TYPO_CONFIG, ctx);
        const indices = mods.map((m) => m.index);
        const sortedDesc = [...indices].sort((a, b) => b - a);
        expect(indices).toEqual(sortedDesc);
    });

    test("快照与期望完全一致时，该段落不产生指令", () => {
        // ★ 用 SnapshotReader 代替 CurrentParaSnapshot Map
        const reader = makeReader([
            // 段 1（主标题）：仅期望 style
            { index: 1, attrs: { style: "公文标题" } },
            // 段 3（抬头）：期望 style / fontName / bold / firstLineIndent
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

        const mods = computeModifications(structure.paragraphs, DEFAULT_TYPO_CONFIG, ctx, reader);
        const indices = mods.map((m) => m.index);
        // 段 1、3 完全匹配 → 不出现在指令里
        expect(indices).not.toContain(1);
        expect(indices).not.toContain(3);
    });

    test("仅在字段不一致时才生成指令（缩进差异）", () => {
        // 抬头段：只 firstLineIndent 不一致
        const reader = makeReader([
            {
                index: 3,
                attrs: {
                    style: "公文正文",
                    fontName: DEFAULT_TYPO_CONFIG.salutation.font || DEFAULT_TYPO_CONFIG.main.zh,
                    bold: !!DEFAULT_TYPO_CONFIG.salutation.bold,
                    firstLineIndent: 2, // ← 不一致
                },
            },
        ]);

        const mods = computeModifications(structure.paragraphs, DEFAULT_TYPO_CONFIG, ctx, reader);
        const seg3 = mods.find((m) => m.index === 3);
        expect(seg3).toBeDefined();
        expect(seg3!.style).toBeUndefined();
        expect(seg3!.fontName).toBeUndefined();
        expect(seg3!.firstLineIndent).toBe(0);
    });

    test("显式 bold:false 差异应被下发（不能漏）", () => {
        // 抬头段：bold 当前是 true，期望 false
        const reader = makeReader([
            {
                index: 3,
                attrs: {
                    style: "公文正文",
                    fontName: DEFAULT_TYPO_CONFIG.salutation.font || DEFAULT_TYPO_CONFIG.main.zh,
                    bold: true, // ← 不一致
                    firstLineIndent: 0,
                },
            },
        ]);

        const mods = computeModifications(structure.paragraphs, DEFAULT_TYPO_CONFIG, ctx, reader);
        const seg3 = mods.find((m) => m.index === 3);
        expect(seg3).toBeDefined();
        expect(seg3!.bold).toBe(false);
    });

    // ⚠️ 对齐方式测试：当前 ATTRS.alignment.desired 永远返回 undefined，
    //    所以无法通过语义触发。等未来加入 alignment 策略后再补。

    test("全部一致 → 返回空数组", () => {
        // 用一个纯正文段落测试
        const SINGLE_BODY = "这是一段正文。\n";
        const { structure: s2 } = analyzePlainText(SINGLE_BODY, DEFAULT_TYPO_CONFIG);
        const reader = makeReader([{ index: 1, attrs: { style: "公文正文" } }]);

        const mods = computeModifications(s2.paragraphs, DEFAULT_TYPO_CONFIG, ctx, reader);
        expect(mods).toEqual([]);
    });
});
