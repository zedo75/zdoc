import {
    computeTopicBoldRanges,
    isLikelyByline,
    isLikelyDocTitle,
    isLikelyH1,
    isLikelyH2,
    isLikelyH3,
    isLikelyLetterhead,
    isLikelySalutation,
    isLikelySignatureDate,
    isLikelySubtitle,
} from "@/core/analysis";

// ==================== 层级标题简洁性 ====================

describe("isLikelyH1 / H2 / H3 首句号前分隔符判定", () => {
    test.each([
        ["一、总体要求\r", true, "无分隔符"],
        ["一、加强领导，明确责任\r", true, "1 个逗号，仍算简洁"],
        ["一、加强领导，明确责任、压实任务\r", false, "2 个分隔符，视为并列描述"],
    ])("%j → %s（%s）", (text, expected) => {
        expect(isLikelyH1(text), `「${text.trim()}」`).toBe(expected);
    });

    test("真实长段落：一、二、开头的整段正文不再算一级标题", () => {
        const p1 =
            "一、统筹甲、乙、丙等各方力量，某个时间节点前组织开展一次专项排查、专项梳理，兜底排查发现各类问题，建立工作清单，推动应录尽录，深化动态管理，做好问题解决。";
        expect(isLikelyH1(p1), "首句号前 3 个分隔符").toBe(false);

        const p2 =
            "二、甲部门、乙部门负责人按照附件2分组安排，于某个时间节点前至少参加1次所负责区域的会议，开展现场指导（每组参加的具体区域由各组联络员与区域对接确定）。";
        expect(isLikelyH1(p2), "首句号前 3 个分隔符").toBe(false);
    });

    test("h2 / h3 与 h1 采用同一阈值", () => {
        expect(isLikelyH2("（一）会议组织，包括甲。"), "h2 1 个").toBe(true);
        expect(isLikelyH2("（一）会议组织，包括甲、乙。"), "h2 2 个").toBe(false);
        expect(isLikelyH3("1.步骤，含甲。"), "h3 1 个").toBe(true);
        expect(isLikelyH3("1.步骤，含甲、乙。"), "h3 2 个").toBe(false);
    });

    test("h2 含冒号 / @ → 不是标题（正文格式）", () => {
        expect(isLikelyH2("（一）请将回执报送邮箱：a@b.com。"), "冒号 + @").toBe(false);
        expect(isLikelyH2("（二）会议时间：10月30日。"), "冒号").toBe(false);
    });

    test("h2 含书名号 /（送审稿）→ 不是标题（多为审议某文件的条目）", () => {
        expect(isLikelyH2("（二）审议《XX工作规则》《XX建议名单》。"), "书名号").toBe(false);
        expect(isLikelyH2("（二）审议XX工作规则（送审稿）。"), "（送审稿）").toBe(false);
        expect(isLikelyH2("（一）研究XX方案（草案）。"), "（草案）").toBe(false);
    });

    test("h2 只判首句号之前：正文合段里的书名号 / 冒号不影响", () => {
        expect(
            isLikelyH2("（五）议程。一是审议《XX（送审稿）》；二是领导讲话。"),
            "书名号在句号之后",
        ).toBe(true);
        expect(isLikelyH2("（一）分组安排。发送至邮箱：a@b.com。"), "冒号在句号之后").toBe(true);
    });

    test("h2 标题与正文合段：正文部分不参与简洁性判定", () => {
        expect(
            isLikelyH2("（四）分组安排。鼓励各单位、社会组织、高校学生等积极参与。"),
            "首句号前无分隔符 → 仍为 h2",
        ).toBe(true);
    });
});

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
        expect(isLikelySubtitle(text), `「${text}」`).toBe(true);
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
        expect(isLikelySubtitle(text), `「${text}」不应识别为副标题`).toBe(false);
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

// ==================== 版头 / 标题判定 ====================

describe("isLikelyLetterhead 版头判定", () => {
    test.each([
        ["XX省XX市XX区人民政府XX工作领导小组办公室", "小红头：机关名称折两行后合并"],
        ["XX县人民政府文件", "大红头：以「文件」收尾"],
        ["中共XX县委员会组织部\r中共XX县委员会宣传部", "联合发文：多行合并"],
        ["XX省人民政府办公厅", "以「办公厅」收尾"],
    ])("%j → true（%s）", (text, _desc) => {
        expect(isLikelyLetterhead(text), `「${text}」`).toBe(true);
    });

    test.each([
        ["关于XX部门、XX部门负责人列席XX级XX联席会议的通知", "标题：含事由词与顿号"],
        ["XX省人民政府办公厅关于印发《XX省2025年政务公开工作要点》的通知", "标题：含印发与书名号"],
        ["为做好XX工作，现将有关事项通知如下", "正文：含逗号"],
        ["XX工作简报", "简报报头：以「报」收尾，不是机关名称"],
        ["XX局", "过短，不够机关名称特征"],
    ])("%j → false（%s）", (text, _desc) => {
        expect(isLikelyLetterhead(text), `「${text}」不应识别为版头`).toBe(false);
    });
});

describe("isLikelyDocTitle 标题判定（版头兜底用）", () => {
    test.each([
        ["关于XX工作的通知", "含「关于」"],
        ["XX县2026年XX工作要点", "以文种「要点」收尾"],
        ["XX县XX工作要点（送审稿）", "文种后带括号说明"],
        ["在XX会议上的讲话", "讲话稿标题"],
    ])("%j → true（%s）", (text, _desc) => {
        expect(isLikelyDocTitle(text), `「${text}」`).toBe(true);
    });

    test.each([
        ["各单位：", "抬头"],
        ["为做好XX工作，现将有关事项通知如下", "正文导语"],
        ["关于XX工作，现将有关事项通知如下", "正文：虽含「关于」，但带逗号"],
        ["中共XX县委办公室", "机关名称"],
    ])("%j → false（%s）", (text, _desc) => {
        expect(isLikelyDocTitle(text), `「${text}」不应识别为标题`).toBe(false);
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

    test("none 模式返回 undefined", () => {
        const text = "一是加强领导。";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "none");
        expect(r, "none 模式").toBeUndefined();
    });

    test("无法匹配前缀时返回 undefined", () => {
        const text = "首先是加强领导。";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "auto");
        expect(r, "「首先是」不是有效 topic 前缀").toBeUndefined();
    });

    test("非 topic 文本返回 undefined", () => {
        // ← 改名 + 明确意图
        // "首先是..." 首字"首"不在 [一...十]，被前置检查拦截
        const text = "首先是加强领导。";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "auto");
        expect(r).toBeUndefined();
    });

    test("分号结尾的 topic 也能匹配（TOPIC_REGEX 的 ；终止符）", () => {
        // "一是加强领导；" 以分号结尾，TOPIC_REGEX 允许
        const text = "一是加强领导；";
        const r = computeTopicBoldRanges({ text, start: 0, length: text.length }, "prefix");
        expect(r).toEqual([{ start: 0, length: 2, bold: true }]);
    });

    test("start 非 0 时子范围基准为 match.start", () => {
        // 覆盖 match.start ≠ 0 的偏移
        const text = "一是加强领导。";
        const r = computeTopicBoldRanges({ text, start: 10, length: text.length }, "auto");
        expect(r).toEqual([{ start: 10, length: text.length, bold: true }]);
    });
});
