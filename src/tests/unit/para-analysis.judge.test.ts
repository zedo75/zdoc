import {
    computeTopicBoldRanges,
    isLikelyByline,
    isLikelySalutation,
    isLikelySignatureDate,
    isLikelySubtitleLine,
} from "@/utils/para-analysis";

// ==================== 抬头判定 ====================

describe("isLikelySubtitleLine 抬头判定", () => {
    test.each([
        ["各省、自治区、直辖市人民政府：\r", true, "典型政府机关抬头"],
        ["各单位、各部门：\r", true, "「各X单位」形式"],
        ["尊敬的各位领导：\r", true, "敬语开头"],
        ["党委书记、各位主任：\r", true, "职务名称开头"],
    ])("%j → %s（%s）", (text, expected) => {
        expect(isLikelySalutation(text), `「${text.trim()}」`).toBe(expected);
    });

    test.each([
        ["关于做好XX工作的通知：\r", "命中排除词「关于」"],
        ["根据XXX规定。：\r", "命中排除词「根据」"],
        ["大家好：\r", "无白名单关键词"],
    ])("%j → false（%s）", (text) => {
        expect(isLikelySalutation(text), `「${text.trim()}」不应识别为抬头`).toBe(false);
    });
});

describe("isLikelySubtitleLine 副标题行判定", () => {
    test.each([
        ["（送审稿）", "括号短语，含「稿」"],
        ["（征求意见稿，未定稿前请勿传播）", "括号短语，含「稿」，多字"],
        ["（修正案）", "括号短语，含「案」"],
        ["（某委〔2026〕1号）", "括号短语，文号形态"],
        ["（2024年X月X日）", "括号短语，日期形态，X 占位"],
        ["（2024年 月 日）", "括号短语，日期形态，空格占位"],
        ["（仅供参考）", "括号短语，普通措辞"],
        ["（2024年度总结）", "括号短语，非稿/案/文号/日期也命中"],
        ["—— 关于XX的若干意见", "破折号开头"],
    ])("%j → true（%s）", (text, _desc) => {
        expect(isLikelySubtitleLine(text), `「${text}」`).toBe(true);
    });

    test.each([
        ["某委〔2026〕1号", "裸文号（无括号）"],
        ["关于某委〔2026〕1号的通知", "正文中出现的文号"],
        ["2024年X月X日", "无括号的日期"],
        ["（一）", "纯汉字序号括号"],
        ["（十二）", "纯汉字序号括号，多字"],
        ["（1）", "纯阿拉伯数字序号括号"],
        ["（2024）", "纯数字括号，视同序号"],
        ["（一）xxx", "括号序号后带内容，非整行括号"],
        ["（（一））", "嵌套括号"],
        ["（）", "空括号"],
    ])("%j → false（%s）", (text, _desc) => {
        expect(isLikelySubtitleLine(text), `「${text}」不应识别为副标题`).toBe(false);
    });
});

describe("isLikelyByline 署名行判定", () => {
    test.each([
        ["某局局长  张三", true, "职务 + 双空格 + 常见姓氏"],
        ["县委常委、组织部部长  王五", true, "多段职务 + 常见姓氏"],
        ["某部门负责人  李  四", true, "两字名中间加空格"],
        ["某公司经理　　刘六", true, "全角空格分隔"],
        ["某组长  阿不都热依木·买买提", true, "少数民族姓名（含 ·）"],
        ["某长  赵  七", true, "姓氏 + 名字间空格 + 单字"],
    ])("%j → %s（%s）", (text, expected, _desc) => {
        expect(isLikelyByline(text), `「${text.trim()}」`).toBe(expected);
    });

    test.each([
        ["", "空串"],
        ["局长张三", "无分隔空格"],
        ["局长 张三", "仅 1 个空格（<2）"],
        ["局长  张三。", "末尾句号"],
        ["局长  张三；", "末尾分号"],
        ["局长  张三！", "末尾感叹号"],
        ["局长  张三？", "末尾问号"],
        ["通知内容  详见附件", "格式命中但「详」非姓氏"],
        ["局长  张三和李四", "姓名超长（5 字 > 4 字上限）"],
    ])("%j → false（%s）", (text, _desc) => {
        expect(isLikelyByline(text), `「${text.trim()}」不应识别为署名行`).toBe(false);
    });

    test("姓名上限边界：4 字命中，5 字不命中", () => {
        const ok = "某长  " + "赵".repeat(4);
        const bad = "某长  " + "赵".repeat(5);
        expect(isLikelyByline(ok), "4 字姓名").toBe(true);
        expect(isLikelyByline(bad), "5 字姓名").toBe(false);
    });

    test("首字非姓氏 + 含 · → 仍判为署名（少数民族姓名分支）", () => {
        // 「买」是否在 chinese-surnames 里不保证，但含 · 应走第三层兜底
        const text = "某长  买买提·吐尔逊";
        expect(isLikelyByline(text), `「${text}」`).toBe(true);
    });

    test("首字非姓氏 + 不含 · → 不判为署名", () => {
        const text = "通知内容  详附件";
        expect(isLikelyByline(text), `「${text}」`).toBe(false);
    });
});

// ==================== 落款日期判定 ====================

describe("isLikelySignatureDate 落款日期判定", () => {
    test.each([
        ["2025年8月24日\r", "标准日期"],
        ["2025年8月 5日\r", "日期内 1 个空格"],
        ["2025年 8月5日\r", "月份前 1 个空格"],
        ["XXXX年XX月XX日\r", "占位日期"],
    ])("%j → true（%s）", (text, _desc) => {
        expect(isLikelySignatureDate(text), `「${text.trim()}」`).toBe(true);
    });

    test("带前缀时不应识别为落款日期", () => {
        const text = "成文日期：2025年8月24日\r";
        expect(isLikelySignatureDate(text), `「${text.trim()}」不应识别`).toBe(false);
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
