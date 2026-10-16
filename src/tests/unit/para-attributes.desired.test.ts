import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";

import { TestDoc } from "../helpers/doc-test";
import { SAMPLE_GOV_DOC_LINES } from "../helpers/fixtures";

describe("期望值：完整公文样例", () => {
    const doc = new TestDoc(SAMPLE_GOV_DOC_LINES);

    test("主标题 → 公文标题", () => {
        const p = doc.find("XX省人民政府办公厅");
        expect(p.style, `「${p.text}」`).toBe("公文标题");
    });

    test("抬头 → 楷体 + 顶格", () => {
        const p = doc.find("各市、县（区）");
        expect(p.fontName, `「${p.text}」字体`).toBe(
            DEFAULT_TYPO_CONFIG.salutation.font || DEFAULT_TYPO_CONFIG.main.zh,
        );
        expect(p.indent, `「${p.text}」缩进`).toBe(0);
    });

    test("正文段落 → 公文正文", () => {
        const p = doc.kinds("body")[0];
        expect(p.style, `「${p.text}」`).toBe("公文正文");
    });

    test("附件：顶格 + 黑体", () => {
        const atts = doc.kinds("attachment");
        expect(atts.length, "附件段落数").toBeGreaterThanOrEqual(2);
        for (const p of atts) {
            expect(p.fontName, `「${p.text}」字体`).toBe("黑体");
            expect(p.indent, `「${p.text}」缩进`).toBe(0);
        }
    });

    test("h1 编号前缀加粗为黑体", () => {
        const p = doc.find("一、总体要求");
        expect(p.kind, `「${p.text}」kind`).toBe("h1");
        expect(p.fontName, `「${p.text}」整段不应设 fontName`).toBeUndefined();
        expect(p.firstSubText(), `「${p.text}」子范围应只覆盖前缀`).toBe("一、总体要求");
        expect(p.subRanges![0].fontName, "前缀字体").toBe("黑体");
        expect(p.subRanges![0].bold, "h1 不加粗").toBe(false);
    });

    test("h2 与正文合段：子范围只覆盖标题部分，不含正文", () => {
        const doc = new TestDoc(["（四）分组安排。鼓励各单位、社会组织、高校学生等积极参与。"]);
        const p = doc.at(1);
        expect(p.kind, `「${p.text.slice(0, 10)}...」kind`).toBe("h2");

        // 子范围只覆盖到第一个句号
        expect(p.firstSubText(), "子范围覆盖范围").toBe("（四）分组安排。");
        expect(p.boldPrefix()).toBe(null);

        // 正文部分不应被覆盖
        const sub = p.subRanges![0];
        const coveredText = p.info.text.slice(sub.start, sub.start + sub.length);
        expect(coveredText, "子范围不含正文").not.toContain("鼓励各单位");
    });

    test("h3 编号前缀加粗 + 仿宋_GB2312", () => {
        const p = doc.find("1.加强组织领导");
        expect(p.kind, `「${p.text}」kind`).toBe("h3");
        expect(p.fontName, `「${p.text}」整段不应设 fontName`).toBeUndefined();
        expect(p.bold, `「${p.text}」整段不应设 bold`).toBeUndefined();
        expect(p.boldPrefix(), `「${p.text}」加粗前缀`).toBe("1.加强组织领导");
        expect(p.subRanges![0].fontName, "前缀字体").toBe("仿宋_GB2312");
        expect(p.subRanges![0].bold, "前缀加粗").toBe(true);
    });
});

describe("h3：标题 + 说明合段（含冒号）", () => {
    test.each([
        ["1.会议签到。签到地点：活动中心一楼。"],
        ["2.主题演讲。演讲主题：AI与教育。"],
        ["3.分组讨论。填写《参会回执》（附件1）并发送至会务组邮箱：meeting@example.com。"],
        ["4.加入会议群。建立“XX研讨会”微信群，所有参会人员加入。"],
        ["5.引导注册。引导参会人员在会议系统完成实名注册。"],
        ["6.加入小组。参会人员完成注册后，在会议系统中搜索并申请加入相应讨论小组。"],
    ])("%j → h3", (text) => {
        const p = new TestDoc([text]).at(1);
        expect(p.kind, `「${text.slice(0, 20)}...」`).toBe("h3");
    });

    test("标题部分加粗范围不含后续说明", () => {
        const doc = new TestDoc(["1.会议签到。签到地点：活动中心一楼。"]);
        const p = doc.at(1);
        expect(p.kind, `「${p.text}」kind`).toBe("h3");
        // 加粗范围只覆盖到第一个句号
        expect(p.boldPrefix(), "加粗前缀").toBe("1.会议签到。");
        // 不含后续说明
        expect(p.boldPrefix(), "不含后续说明").not.toContain("地点");
    });

    test("「1.联系人：张三」不是 h3（数字. 后紧跟冒号）", () => {
        const p = new TestDoc(["1.联系人：张三"]).at(1);
        expect(p.kind, `「${p.text}」`).not.toBe("h3");
    });
});

describe("期望值：副标题", () => {
    test("副标题 → 楷体 + 16 号 + 不加粗", () => {
        const doc = new TestDoc(["标题", "（送审稿）", "", "正文开始"]);
        const p = doc.at(2);
        expect(p.style, `「${p.text}」样式`).toBe("公文标题");
        expect(p.fontName, `「${p.text}」字体`).toBe("楷体_GB2312");
        expect(p.fontSize, `「${p.text}」字号`).toBe(16);
        expect(p.bold, `「${p.text}」加粗`).toBe(false);
    });
});

describe("期望值：topic 加粗模式", () => {
    test("prefix 模式 → 子范围仅加粗「X是 / X要」前缀", () => {
        const doc = new TestDoc(["（二）基本原则", "一是提高政治站位。二是强化责任担当。"]);
        const p = doc.at(2);
        expect(p.boldPrefix(), `「${p.text}」加粗前缀`).toMatch(/^[一二三四五六七八九十][是要]$/);
        expect(p.subRanges![0].length, "前缀长度").toBe(2);
    });

    test("auto 模式 + 短句 → 整句加粗", () => {
        const cfg = { ...DEFAULT_TYPO_CONFIG, topicBoldMode: "auto" as const };
        const doc = new TestDoc(["正文", "一是提高站位。"], cfg);
        const p = doc.at(2);
        expect(p.boldPrefix(), `「${p.text}」应整句加粗`).toBe("一是提高站位。");
        expect(p.subRanges![0].length, "整句长度").toBe("一是提高站位。".length);
    });
});
