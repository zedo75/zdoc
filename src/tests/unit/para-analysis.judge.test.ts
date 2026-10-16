import {
    computeTopicBoldRanges,
    looksLikeSalutation,
    looksLikeSignatureDate,
} from "@/utils/para-analysis";

// ==================== 抬头判定 ====================

describe("looksLikeSalutation 抬头判定", () => {
    test.each([
        ["各省、自治区、直辖市人民政府：\r", true, "典型政府机关抬头"],
        ["各单位、各部门：\r", true, "「各X单位」形式"],
        ["尊敬的各位领导：\r", true, "敬语开头"],
        ["党委书记、各位主任：\r", true, "职务名称开头"],
    ])("%j → %s（%s）", (text, expected) => {
        expect(looksLikeSalutation(text), `「${text.trim()}」`).toBe(expected);
    });

    test.each([
        ["关于做好XX工作的通知：\r", "命中排除词「关于」"],
        ["根据XXX规定。：\r", "命中排除词「根据」"],
        ["大家好：\r", "无白名单关键词"],
    ])("%j → false（%s）", (text) => {
        expect(looksLikeSalutation(text), `「${text.trim()}」不应识别为抬头`).toBe(false);
    });
});

// ==================== 落款日期判定 ====================

describe("looksLikeSignatureDate 落款日期判定", () => {
    test.each([
        ["2025年8月24日\r", "标准日期"],
        ["2025年8月 5日\r", "日期内 1 个空格"],
        ["2025年 8月5日\r", "月份前 1 个空格"],
        ["XXXX年XX月XX日\r", "占位日期"],
    ])("%j → true（%s）", (text, _desc) => {
        expect(looksLikeSignatureDate(text), `「${text.trim()}」`).toBe(true);
    });

    test("带前缀时不应识别为落款日期", () => {
        const text = "成文日期：2025年8月24日\r";
        expect(looksLikeSignatureDate(text), `「${text.trim()}」不应识别`).toBe(false);
    });
});

// ==================== topic 加粗范围 ====================

describe("computeTopicBoldRanges topic 加粗范围", () => {
    test("auto 模式：短句（无逗号）整句加粗", () => {
        const text = "一是加强领导。";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "auto");
        expect(r, `「${text}」应整句加粗`).toEqual([{ start: 0, length: text.length, bold: true }]);
    });

    test("auto 模式：恰好 26 字走整句加粗；27 字仅前缀", () => {
        const s26 = "一是" + "甲".repeat(23) + "。";
        expect(s26.length, "构造 26 字").toBe(26);
        const r26 = computeTopicBoldRanges({ text: s26, start: 0, length: s26.length }, "auto");
        expect(r26, "26 字 → 整句加粗").toEqual([{ start: 0, length: s26.length, bold: true }]);

        const s27 = "一是" + "甲".repeat(24) + "。";
        expect(s27.length, "构造 27 字").toBe(27);
        const r27 = computeTopicBoldRanges({ text: s27, start: 0, length: s27.length }, "auto");
        expect(r27, "27 字 → 仅前缀").toEqual([{ start: 0, length: 2, bold: true }]);
    });

    test("auto 模式：句内 2 个逗号仅前缀加粗", () => {
        const text = "一是要深刻认识，全面把握，扎实推进各项工作。";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "auto");
        expect(r, `「${text}」应仅加粗前缀`).toEqual([{ start: 0, length: 2, bold: true }]);
    });

    test("prefix 模式：无论长短只加粗前缀", () => {
        const text = "一是加强领导。";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "prefix");
        expect(r, "prefix 模式").toEqual([{ start: 0, length: 2, bold: true }]);
    });

    test("none 模式返回空数组", () => {
        const text = "一是加强领导。";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "none");
        expect(r, "none 模式").toEqual([]);
    });

    test("无法匹配前缀时返回空数组", () => {
        const text = "首先是加强领导。";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "auto");
        expect(r, "「首先是」不是有效 topic 前缀").toEqual([]);
    });
});
