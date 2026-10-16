import { TestDoc } from "../helpers/doc-test";

describe("listItem 识别：规则 2（首句号前分隔符 ≥ 2）", () => {
    test.each([
        ["1.接到任务后，由甲或乙确定时间、地点、人数需求。", "listItem", "逗号+顿号混用"],
        ["1.登录系统，填写信息，提交申请。", "listItem", "两个逗号"],
        ["1.城乡环境卫生整治。县城公共区域、背街小巷清理。", "h3", "首句号前无分隔符"],
        ["1.宣传引导、政策解读。", "h3", "仅 1 个顿号"],
    ])("%j → %s（%s）", (text, expected) => {
        const p = new TestDoc([text]).at(1);
        expect(p.kind, `「${p.text}」`).toBe(expected);
    });
});

describe("listItem 识别：规则 3（前段状态传递）", () => {
    test("前段是 listItem → 本段短句也不判 h3", () => {
        const doc = new TestDoc([
            "1.长文本列表项，包含逗、顿号、多个分隔符。",
            "2.短句本应判 h3。",
        ]);
        expect(doc.at(1).kind, `「${doc.at(1).text}」`).toBe("listItem");
        expect(doc.at(2).kind, `「${doc.at(2).text}」`).toBe("listItem");
    });

    test("列表延续多段", () => {
        const doc = new TestDoc([
            "1.列表项一，含逗号、顿号。",
            "2.列表项二。",
            "3.列表项三。",
            "4.列表项四。",
        ]);
        for (let i = 1; i <= 4; i++) {
            expect(doc.at(i).kind, `第 ${i} 段「${doc.at(i).text}」`).toBe("listItem");
        }
    });

    test("非列表项段落打断状态", () => {
        const doc = new TestDoc([
            "1.列表项一，含逗号，顿号。",
            "2.列表项二。",
            "这是一段普通正文。",
            "3.短句本应判 h3。",
        ]);
        expect(doc.at(1).kind, "段 1").toBe("listItem");
        expect(doc.at(2).kind, "段 2").toBe("listItem");
        expect(doc.at(3).kind, `「${doc.at(3).text}」`).toBe("body");
        expect(doc.at(4).kind, `「${doc.at(4).text}」`).toBe("h3");
    });

    test("空行重置列表状态", () => {
        const doc = new TestDoc(["1.列表项一，含逗号，顿号。", "", "2.短句本应判 h3。"]);
        expect(doc.at(1).kind, "段 1").toBe("listItem");
        expect(doc.at(2).kind, "空行").toBe("empty");
        expect(doc.at(3).kind, `「${doc.at(3).text}」`).toBe("h3");
    });

    test("h2 标题重置列表状态", () => {
        const doc = new TestDoc([
            "1.列表项一，含逗号，顿号。",
            "（一）新的小节",
            "2.短句本应判 h3。",
        ]);
        expect(doc.at(1).kind, "段 1").toBe("listItem");
        expect(doc.at(2).kind, `「${doc.at(2).text}」`).toBe("h2");
        expect(doc.at(3).kind, `「${doc.at(3).text}」`).toBe("h3");
    });
});

describe("listItem 识别：规则 1（分号结尾）", () => {
    test("以分号结尾 + 数字前缀 → listItem", () => {
        const p = new TestDoc(["1.城乡环境卫生整治；"]).at(1);
        expect(p.kind, `「${p.text}」`).toBe("listItem");
    });

    test("无编号、以分号结尾 → body", () => {
        const p = new TestDoc(["城乡环境卫生整治；"]).at(1);
        expect(p.kind, `「${p.text}」`).toBe("body");
    });
});

describe("listItem 识别：片段混排", () => {
    test("（二）会议组织流程下所有条目都是 listItem", () => {
        const doc = new TestDoc([
            "（二）会议组织流程",
            "1.确定会议计划后，由会务组或牵头单位确定会议时间、地点、人数需求。",
            "2.通过会议系统发布会议信息，填写会议名称、参会对象、会议类别。",
            "3.通过微信群发布会议通知，同时电话通知各组联络人或小组长。",
            "4.参会人员自愿报名，可在会议系统中报名或扫描二维码报名。",
            "5.会务联系人登录会议系统，在报名列表中对参会人员进行审核。",
            "6.会议当天，现场签到、分发材料、简短流程说明。",
            "7.会议结束后，会务联系人登录会议系统，查看签到明细。",
        ]);
        expect(doc.at(1).kind, "首段 h2").toBe("h2");
        for (let i = 2; i <= 8; i++) {
            expect(doc.at(i).kind, `第 ${i} 段「${doc.at(i).text.slice(0, 15)}...」`).toBe(
                "listItem",
            );
        }
    });

    test("（一）常规议程下的短条目是 h3", () => {
        const doc = new TestDoc([
            "（一）常规议程",
            "1.开幕式。主会场布置、签到台引导、嘉宾接待。",
            "2.主题报告。主讲人发言、PPT展示、现场提问。",
            "3.分组研讨。按主题分组讨论、记录员汇总要点。",
        ]);
        expect(doc.at(1).kind, "首段 h2").toBe("h2");
        for (let i = 2; i <= 4; i++) {
            expect(doc.at(i).kind, `第 ${i} 段「${doc.at(i).text.slice(0, 15)}...」`).toBe("h3");
        }
    });
});
