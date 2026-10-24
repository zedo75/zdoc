import { TestDoc } from "../helpers/doc-test";

describe("listItem 识别：规则 2（首句号前分隔符 ≥ 2）", () => {
    test.each([
        ["1.接到任务后，由甲或乙确定时间、地点、人数需求。", "listItem", "逗号+顿号混用"],
        ["1.登录系统，填写信息，提交申请。", "listItem", "两个逗号"],
        ["1.事项名称。说明甲、说明乙。", "h3", "首句号前无分隔符"],
        ["1.事项名称、事项说明。", "h3", "仅 1 个顿号"],
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
        const p = new TestDoc(["1.事项名称；"]).at(1);
        expect(p.kind, `「${p.text}」`).toBe("listItem");
    });

    test("无编号、以分号结尾 → body", () => {
        const p = new TestDoc(["事项名称；"]).at(1);
        expect(p.kind, `「${p.text}」`).toBe("body");
    });
});

describe("listItem 识别：片段混排", () => {
    test("（二）会议组织流程下所有条目都是 listItem", () => {
        const doc = new TestDoc([
            "（二）事项流程",
            "1.确定事项计划后，由甲组或牵头单位确定时间、地点、人数需求。",
            "2.通过系统发布事项信息，填写名称、对象、类别。",
            "3.通过群组发布事项通知，同时电话通知各组联络人或小组长。",
            "4.相关人员自愿报名，可在系统中报名或扫描二维码报名。",
            "5.联系人登录系统，在报名列表中对相关人员进行审核。",
            "6.事项当天，现场签到、分发材料、简短流程说明。",
            "7.事项结束后，联系人登录系统，查看签到明细。",
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
            "（一）常规流程",
            "1.环节一。说明甲、说明乙、说明丙。",
            "2.环节二。说明丁、说明戊、说明己。",
            "3.环节三。说明庚、说明辛、说明壬。",
        ]);
        expect(doc.at(1).kind, "首段 h2").toBe("h2");
        for (let i = 2; i <= 4; i++) {
            expect(doc.at(i).kind, `第 ${i} 段「${doc.at(i).text.slice(0, 15)}...」`).toBe("h3");
        }
    });
});

describe("h2 识别：首句号前分隔符 ≥ 2 → listItem", () => {
    test.each([
        ["（一）新的小节", "h2", "简洁标题"],
        ["（十二）常规议程", "h2", "简洁标题，多字序号"],
        ["（一）事项甲，说明一、说明二、说明三。", "listItem", "首句号前 3 个分隔符"],
        ["（二）会议流程，确定时间、地点。", "listItem", "首句号前 2 个分隔符"],
        ["（一）会议组织，包括甲。", "h2", "首句号前仅 1 个分隔符，仍算简洁"],
    ])("%j → %s（%s）", (text, expected) => {
        const p = new TestDoc([text]).at(1);
        expect(p.kind, `「${p.text}」`).toBe(expected);
    });

    test("h2 长描述不污染后续 h3 状态（首段即长描述，无前段 listItem）", () => {
        const doc = new TestDoc(["（一）事项甲，说明一、说明二、说明三。", "1.短句本应判 h3。"]);
        expect(doc.at(1).kind, "首段 h2 长描述 → listItem").toBe("listItem");
        // 前段是 listItem → 后续 1. 被抑制，延续 listItem
        expect(doc.at(2).kind, `「${doc.at(2).text}」`).toBe("listItem");
    });
});

describe("listItem 识别：括号阿拉伯数字前缀（配套 LIST_ITEM_PREFIX 扩展）", () => {
    test.each([
        ["（1）会议组织，包括甲、乙、丙。", "listItem", "括号数字 + 长描述"],
        ["（1）新的小节", "listItem", "括号数字 + 简洁标题；H2 不认数字序号，落 listItem"],
        ["（12）会议流程，确定时间、地点。", "listItem", "两位数字序号"],
    ])("%j → %s（%s）", (text, expected) => {
        const p = new TestDoc([text]).at(1);
        expect(p.kind, `「${p.text}」`).toBe(expected);
    });
});

describe("listItem 识别：prevIsListItem 边界（同组延续 vs 类型切换升格）", () => {
    // =========================================================
    // 1. 同组编号延续：一律 listItem（同组优先于 h2）
    //    核心规则：prevIsListItem 且 前缀类型相同 → 无论有无分隔符都 listItem；
    //             前缀类型变化 → 允许升格（isLikelyH2 通过则 h2）。
    // =========================================================
    describe("列表延续：同组编号一律 listItem", () => {
        test("带 1 个逗号的（一）在列表延续中 → listItem", () => {
            const doc = new TestDoc(["1.列表项，含逗号、顿号。", "（一）条目甲，包含描述乙。"]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
        });

        test("带 2 个分隔符的（一）在列表延续中 → listItem（isLikelyH2 本身 false）", () => {
            const doc = new TestDoc([
                "1.列表项，含逗号、顿号。",
                "（一）会议组织，包括甲、乙、丙。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
        });

        test("同组延续：末条无分隔符的（三）→ listItem（用户诉求核心）", () => {
            // 同组编号（一）/（二）/（三）延续时，末条即使无分隔符、
            // 满足 isLikelyH2，也应视为列表延续，不升格为 h2。
            const doc = new TestDoc([
                "（一）条目甲，包含描述一、描述二；",
                "（二）条目乙，包含描述三、描述四；",
                "（三）条目丙。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
            expect(doc.at(3).kind, "段 3 同组延续 → listItem").toBe("listItem");
        });

        test("同组延续：中间插入带分隔符项也不打断", () => {
            const doc = new TestDoc([
                "（一）条目甲，包含描述一、描述二。",
                "（二）条目乙。",
                "（三）条目丙，包含描述三、描述四。",
                "（四）条目丁。",
            ]);
            for (let i = 1; i <= 4; i++) {
                expect(doc.at(i).kind, `第 ${i} 段`).toBe("listItem");
            }
        });

        test("括号数字组延续：末条无分隔符也 listItem", () => {
            const doc = new TestDoc([
                "（1）条目甲，包含描述一、描述二；",
                "（2）条目乙，包含描述三、描述四；",
                "（3）条目丙。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
            expect(doc.at(3).kind, "段 3 同组延续 → listItem").toBe("listItem");
        });

        test("连续多段 listItem 后，h1 仍能重置状态", () => {
            const doc = new TestDoc([
                "1.列表项一，含逗号、顿号。",
                "2.列表项二，含逗号。",
                "3.列表项三，含逗号。",
                "一、新的章",
                "4.短句本应判 h3。",
            ]);
            for (let i = 1; i <= 3; i++) {
                expect(doc.at(i).kind, `第 ${i} 段`).toBe("listItem");
            }
            expect(doc.at(4).kind, "h1 重置").toBe("h1");
            expect(doc.at(5).kind, "h1 之后 h3 恢复").toBe("h3");
        });
    });

    // =========================================================
    // 2. 前缀类型切换：允许升格为 h2
    //    证明"同组延续"只在同类型前缀时生效，类型变化正常升格。
    // =========================================================
    describe("前缀类型切换：升格为 h2", () => {
        test("数字点 → 括号汉字：升格为 h2", () => {
            const doc = new TestDoc(["1.列表项一，含逗号、顿号。", "（一）新的小节", "2.短句。"]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2 类型变化 → h2").toBe("h2");
            expect(doc.at(3).kind, "h2 后 h3 恢复").toBe("h3");
        });

        test("括号数字 → 括号汉字：升格为 h2", () => {
            const doc = new TestDoc([
                "（1）列表项一，含逗号、顿号。",
                "（一）新的小节",
                "1.短句。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2 类型变化 → h2").toBe("h2");
            expect(doc.at(3).kind, "h2 后 h3 恢复").toBe("h3");
        });

        test("h2 → h3 → 带逗号（二）：前段非 listItem，仍判 h2", () => {
            // h3 不 add listItem → 后续（二）不应被"同组延续"抑制
            const doc = new TestDoc(["（一）小节一", "1.步骤。", "（二）会议组织，包括甲。"]);
            expect(doc.at(1).kind, "段 1").toBe("h2");
            expect(doc.at(2).kind, "段 2").toBe("h3");
            expect(doc.at(3).kind, "前段 h3 非 listItem → 1 分隔符仍判 h2").toBe("h2");
        });
    });

    // =========================================================
    // 3. 非列表状态下：h2 阈值不变
    //    证明"同组延续"只在列表延续中生效，不会反向影响干净场景。
    // =========================================================
    describe("非列表状态下：h2 阈值不变", () => {
        test("首段带 1 个分隔符的（一）→ h2", () => {
            const p = new TestDoc(["（一）会议组织，包括甲。"]).at(1);
            expect(p.kind).toBe("h2");
        });

        test("首段带 2 个分隔符的（一）→ listItem（isLikelyH2 false）", () => {
            const p = new TestDoc(["（一）会议组织，包括甲、乙。"]).at(1);
            expect(p.kind).toBe("listItem");
        });

        test("空行重置后，带 1 个分隔符的（一）→ h2", () => {
            const doc = new TestDoc(["1.列表项一，含逗号、顿号。", "", "（一）会议组织，包括甲。"]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "空行").toBe("empty");
            expect(doc.at(3).kind, "空行重置后判 h2").toBe("h2");
        });

        test("空行重置后，带 2 个分隔符的（一）→ listItem（阈值独立于状态）", () => {
            const doc = new TestDoc([
                "1.列表项一，含逗号、顿号。",
                "",
                "（一）会议组织，包括甲、乙。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "空行").toBe("empty");
            expect(doc.at(3).kind, "段 3").toBe("listItem");
        });

        test("body 打断后，带 1 个分隔符的（一）→ h2", () => {
            const doc = new TestDoc([
                "1.列表项一，含逗号、顿号。",
                "这是一段普通正文。",
                "（一）会议组织，包括甲。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("body");
            expect(doc.at(3).kind, "body 打断后判 h2").toBe("h2");
        });

        test("h1 打断后，带 1 个分隔符的（一）→ h2", () => {
            const doc = new TestDoc([
                "1.列表项一，含逗号、顿号。",
                "一、新的章",
                "（一）会议组织，包括甲。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("h1");
            expect(doc.at(3).kind, "h1 打断后判 h2").toBe("h2");
        });

        test("h1 打断后，无分隔符的 1. → h3（不受前段 listItem 抑制）", () => {
            const doc = new TestDoc(["1.列表项一，含逗号、顿号。", "一、新的章", "1.短句。"]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("h1");
            expect(doc.at(3).kind, "段 3").toBe("h3");
        });
    });

    // =========================================================
    // 4. h3 抑制：与 h2 同组延续"不同"—h3 只看 prevIsListItem
    //    h3 前缀（数字点）与 h2 前缀（括号汉字）本来就不同类，
    //    当前设计：前段是 listItem 时 h3 一律抑制，不区分同组。
    // =========================================================
    describe("h3 抑制（前段 listItem 时一律抑制）", () => {
        test("列表延续 + 无分隔符的 1. → listItem（!prevIsListItem 抑制）", () => {
            const doc = new TestDoc(["1.列表项一，含逗号、顿号。", "2.短句。"]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
        });

        test("列表延续 + 1 逗号的 1. → listItem（isLikelyH3 true，被状态抑制）", () => {
            const doc = new TestDoc(["1.列表项一，含逗号、顿号。", "2.步骤，含甲。"]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
        });

        test("列表延续 + 2 分隔符的 1. → listItem（isLikelyH3 false）", () => {
            const doc = new TestDoc(["1.列表项一，含逗号、顿号。", "2.步骤，含甲、乙。"]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
        });

        test("前段是括号汉字列表，本段 1. → 跨类型也抑制 h3", () => {
            // h3 抑制与前缀类型无关：前段只要是非空 listItem，本段 1. 一律延续
            const doc = new TestDoc(["（一）会议组织，包括甲、乙、丙。", "1.短句。"]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "前段 listItem → h3 抑制").toBe("listItem");
        });

        test("非列表状态：0 / 1 / 2 分隔符三条边界", () => {
            expect(new TestDoc(["1.步骤。"]).at(1).kind, "0 分隔符").toBe("h3");
            expect(new TestDoc(["1.步骤，含甲。"]).at(1).kind, "1 分隔符").toBe("h3");
            expect(new TestDoc(["1.步骤，含甲、乙。"]).at(1).kind, "2 分隔符").toBe("listItem");
        });
    });

    // =========================================================
    // 5. h3 无句号：isLikelyH3 取段尾统计
    // =========================================================
    describe("h3 无句号：isLikelyH3 取段尾统计", () => {
        test.each([
            ["1.步骤", "h3", "无句号、0 分隔符"],
            ["1.步骤，含甲", "h3", "无句号、1 逗号"],
            ["1.步骤，含甲、乙", "listItem", "无句号、2 分隔符"],
            ["1.步骤、甲、乙", "listItem", "无句号、2 顿号"],
        ])("%j → %s（%s）", (text, expected) => {
            const p = new TestDoc([text]).at(1);
            expect(p.kind, `「${p.text}」`).toBe(expected);
        });
    });

    // =========================================================
    // 6. 状态机全链路
    // =========================================================
    describe("状态机回放：listItem ⇄ h2 ⇄ h3 交替", () => {
        test("listItem → listItem → h1 → h3 → listItem", () => {
            const doc = new TestDoc([
                "1.列表项一，含逗号、顿号。",
                "2.列表项二，含逗号。",
                "一、新的章",
                "1.短句。",
                "2.步骤，含甲、乙。",
            ]);
            expect(doc.at(1).kind, "listItem").toBe("listItem");
            expect(doc.at(2).kind, "listItem（状态抑制 h3）").toBe("listItem");
            expect(doc.at(3).kind, "h1（类型变化 → 升格）").toBe("h1");
            expect(doc.at(4).kind, "h3（h1 后状态恢复）").toBe("h3");
            expect(doc.at(5).kind, "listItem（2 分隔符，isLikelyH3 false）").toBe("listItem");
        });

        test("h2 → h3 → 带逗号（二）：先 h2 后 h3 都不影响列表外阈值", () => {
            const doc = new TestDoc(["（一）小节一", "1.步骤。", "（二）小节二"]);
            expect(doc.at(1).kind, "段 1").toBe("h2");
            expect(doc.at(2).kind, "段 2").toBe("h3");
            expect(doc.at(3).kind, "段 3").toBe("h2");
        });

        test("listItem → body → listItem（body 打断后再进 listItem 序列）", () => {
            const doc = new TestDoc([
                "1.列表项一，含逗号、顿号。",
                "正文段落。",
                "2.步骤。",
                "3.步骤二，含甲、乙。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("body");
            expect(doc.at(3).kind, "body 后无分隔符 → h3").toBe("h3");
            expect(doc.at(4).kind, "h3 后 2 分隔符 → listItem（isLikelyH3 false）").toBe(
                "listItem",
            );
        });

        test("同组延续 → 跨类型延续 → 同组延续", () => {
            const doc = new TestDoc([
                "（一）条目甲，包含描述一、描述二；",
                "（二）条目乙，包含描述三；",
                "1.条目丙的短句。",
                "（一）新组条目甲，包含描述四、描述五。",
                "（二）新组条目乙。",
            ]);
            expect(doc.at(1).kind, "旧组段 1").toBe("listItem");
            expect(doc.at(2).kind, "旧组段 2").toBe("listItem");
            expect(doc.at(3).kind, "前段 listItem → h3 抑制").toBe("listItem");
            expect(doc.at(4).kind, "新组段 1（≥2 分隔符）").toBe("listItem");
            expect(doc.at(5).kind, "新组段 2（同组延续，无分隔符）").toBe("listItem");
        });
    });

    describe("h2 识别：无句号时取段尾统计", () => {
        test.each([
            ["（一）新的小节", "h2", "无句号、0 分隔符"],
            ["（一）会议组织，包括甲", "h2", "无句号、1 分隔符"],
            ["（一）会议组织，包括甲、乙", "listItem", "无句号、2 分隔符"],
            ["（一）会议组织，包括甲、乙、丙", "listItem", "无句号、3 分隔符"],
        ])("%j → %s（%s）", (text, expected) => {
            const p = new TestDoc([text]).at(1);
            expect(p.kind).toBe(expected);
        });
    });

    describe("场景回放（抽象化样本）", () => {
        test("场景 A：超长描述（一）→ listItem，无 h2 / mainTitle / subtitle 污染", () => {
            // 抽象样本对应"（一）某某机制，A、B，C，D，E、F；G，H。"
            // 首句号前分隔符：5 个逗号 + 2 个顿号 = 7（≥2）
            const p = new TestDoc([
                "（一）条目甲，包含描述一、描述二，涉及描述三，覆盖描述四，列举描述五、描述六；同时说明描述七，并补充描述八。",
            ]).at(1);
            expect(p.kind).toBe("listItem");
            expect(p.kind == "h2", "不应命中 h2").toBe(false);
            expect(p.kind == "mainTitle", "不应命中 mainTitle").toBe(false);
            expect(p.kind == "subtitle", "不应命中 subtitle").toBe(false);
            expect(p.kind == "h3", "不应命中 h3").toBe(false);
        });

        test("场景 A 完整：连续 3 段超长描述 → 全 listItem", () => {
            const doc = new TestDoc([
                "（一）条目甲，包含描述一、描述二，涉及描述三，覆盖描述四，列举描述五、描述六；同时说明描述七，并补充描述八。按照“要点一”要求，推动要素一、要素二、要素三、要素四、要素五五个方面深度融合，加快相关机构实体化运行。",
                "（二）条目乙，包含描述九、描述十，涉及描述十一，覆盖描述十二；同时说明描述十三，并补充描述十四。形成主体一统筹、主体二牵头协调，主体三、主体四、主体五等各方参与的工作格局。运行中确有困难及时报告，共同研究解决。",
                "（三）条目丙，包含描述十五、描述十六，涉及描述十七，覆盖描述十八；同时说明描述十九，并补充描述二十。按照“要点二”要求，鼓励结合实际开展探索，及时提炼特色做法。",
            ]);
            for (let i = 1; i <= 3; i++) {
                expect(doc.at(i).kind, `第 ${i} 段`).toBe("listItem");
                expect(doc.at(i).kind == "h2", `第 ${i} 段不应含 h2`).toBe(false);
            }
        });

        test("场景 B：整组（一）（二）（三）都 listItem", () => {
            // 前两条：分号结尾 → H2_REGEX 不匹配 → listItem
            // 第 3 条：句号结尾 + 同组延续 → listItem
            const doc = new TestDoc([
                "（一）条目甲，包含描述一、描述二；",
                "（二）条目乙，包含描述三、描述四；",
                "（三）条目丙，包含描述五。",
            ]);
            for (let i = 1; i <= 3; i++) {
                expect(doc.at(i).kind, `第 ${i} 段`).toBe("listItem");
            }
        });

        test("场景 B 变体：末条无分隔符 → 仍为 listItem（同组延续）", () => {
            // 与"边界（明确取舍）"里旧期望不同——同组延续优先
            const doc = new TestDoc([
                "（一）条目甲，包含描述一、描述二；",
                "（二）条目乙，包含描述三、描述四；",
                "（三）条目丙。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
            expect(doc.at(3).kind, "段 3 无分隔符但同组延续 → listItem").toBe("listItem");
        });

        test("场景 B 后的 h1：紧随其后的 h1 仍能重置状态，后接 h3", () => {
            // 侧证"列表状态在 h1 处被重置"，与场景 A/B 不冲突
            const doc = new TestDoc([
                "（一）条目甲，包含描述一、描述二；",
                "（二）条目乙，包含描述三、描述四；",
                "一、新的章",
                "1.短句。",
            ]);
            expect(doc.at(1).kind, "段 1").toBe("listItem");
            expect(doc.at(2).kind, "段 2").toBe("listItem");
            expect(doc.at(3).kind, "h1 重置").toBe("h1");
            expect(doc.at(4).kind, "h1 后 h3 恢复").toBe("h3");
        });
    });
});

describe("编号前缀：小数 / 百分比 / 多级版本号不算编号", () => {
    test.each([
        ["1.5亿元资金已到位。"],
        ["50.5%的企业已完成改造。"],
        ["2.5.1版本说明。"],
        ["10.1亿元投资。"],
    ])("%j → body", (text) => {
        const p = new TestDoc([text]).at(1);
        expect(p.kind, `「${p.text}」`).toBe("body");
        expect(p.subRanges, "不应产生标题前缀子范围").toBeUndefined();
    });

    test("真正的数字编号仍然是三级标题", () => {
        expect(new TestDoc(["1.加强组织领导。"]).at(1).kind, "1.加强组织领导。").toBe("h3");
        expect(new TestDoc(["12.具体步骤"]).at(1).kind, "12.具体步骤").toBe("h3");
    });
});

describe("h1 简洁性：首句号前分隔符 ≥ 2 视为正文", () => {
    const P1 = "一、条目甲、条目乙、条目丙等。";
    const P2 = "二、条目甲、条目乙，XXX。……。";

    test("长段落不再被判为一级标题", () => {
        const doc = new TestDoc([P1, "", P2, "", "正文。"]);
        expect(doc.at(1).kind, "段 1").toBe("body");
        expect(doc.at(3).kind, "段 2").toBe("body");
        expect(doc.at(1).subRanges, "不再产生黑体前缀子范围").toBeUndefined();
        expect(doc.at(3).subRanges, "不再产生黑体前缀子范围").toBeUndefined();
    });

    test("简洁的一级标题仍然识别", () => {
        const doc = new TestDoc(["一、总体要求", "", "正文。"]);
        expect(doc.at(1).kind).toBe("h1");
    });

    test("编号自身的顿号不计入分隔符", () => {
        const doc = new TestDoc(["一、加强领导，明确责任", "", "正文。"]);
        expect(doc.at(1).kind, "1 个逗号，仍算简洁").toBe("h1");
    });

    test("首句号前 2 个分隔符 → 正文", () => {
        const doc = new TestDoc(["一、加强领导，明确责任、压实任务。", "", "正文。"]);
        expect(doc.at(1).kind).toBe("body");
    });
});

describe("分号规则：段内句号不能绕过", () => {
    test.each([
        ["一、甲事项。乙事项；", "body"],
        ["（一）甲事项。乙事项；", "listItem"],
        ["1.甲事项。乙事项；", "listItem"],
    ])("%j → %s", (text, expected) => {
        expect(new TestDoc([text]).at(1).kind).toBe(expected);
    });
});

// ==================== 同组编号一致性 ====================

describe("同组编号一致性：h2 与 listItem 混排时整组降格", () => {
    test("场景一：单句（一）夹在长条目中 → 全组 listItem", () => {
        const doc = new TestDoc([
            "（一）条目甲。",
            "（二）条目乙，包含描述一、描述二。",
            "（三）条目丙，包含描述三、描述四，涉及描述五，覆盖描述六；同时说明描述七，并补充描述八。",
        ]);
        for (let i = 1; i <= 3; i++) {
            expect(doc.at(i).kind, `第 ${i} 段`).toBe("listItem");
        }
    });

    test("场景二：含冒号 / @ 的条目 → 整组 listItem", () => {
        const doc = new TestDoc([
            "（一）请相关方于某时间前将反馈材料（附件）报送邮箱：example@example.com。",
            "（二）相关事项原则上不予变更，确因特殊原因不能按原计划执行的须提前说明，并明确相关人员代为负责。",
        ]);
        for (let i = 1; i <= 2; i++) {
            expect(doc.at(i).kind, `第 ${i} 段`).toBe("listItem");
        }
    });

    test("场景三：含书名号 /（送审稿）的条目 → 整组 listItem", () => {
        const doc = new TestDoc([
            "（一）说明条目甲。由甲某负责。",
            "（二）说明《文件一（送审稿）》。",
            "（三）乙某补充说明。",
        ]);
        // （二）含书名号与（送审稿）→ listItem；同组编号不能混排 → 整组 listItem
        expect(doc.at(2).kind, "（二）含书名号").toBe("listItem");
        for (let i = 1; i <= 3; i++) {
            expect(doc.at(i).kind, `第 ${i} 段`).toBe("listItem");
        }
    });

    test("书名号出现在首句号之后：仍是 h2（只判标题部分）", () => {
        const doc = new TestDoc([
            "（五）条目。一是内容甲；二是内容乙（见《某文件（送审稿）》）；三是内容丙。",
        ]);
        expect(doc.at(1).kind, "标题部分是「（五）条目」").toBe("h2");
        expect(doc.at(1).subMatches.length, "topic 仍按分号拆条").toBe(3);
    });

    test("「标题。说明」整组 → h2，不因多句而降格", () => {
        const doc = new TestDoc([
            "（一）条目甲。包含描述一，明确描述二。",
            "（二）条目乙。包含描述三，明确描述四。",
        ]);
        for (let i = 1; i <= 2; i++) {
            expect(doc.at(i).kind, `第 ${i} 段`).toBe("h2");
        }
    });

    test("「标题。说明」组内混入真正的列表项 → 整组降格", () => {
        const doc = new TestDoc([
            "（一）条目甲。包含描述一，明确描述二。",
            "（二）条目乙。包含描述三，明确描述四。",
            "（三）相关事项原则上不予变更，确因特殊原因不能按原计划执行的须提前说明，并明确相关人员代为负责。",
        ]);
        // （三）首句号前 2 个逗号 → listItem；同组编号不能混排 → 整组 listItem
        expect(doc.at(3).kind, "（三）长描述").toBe("listItem");
        expect(doc.at(1).kind, "（一）随组降格").toBe("listItem");
        expect(doc.at(2).kind, "（二）随组降格").toBe("listItem");
    });

    test("单条「h2 + 正文合段」不降格（无同组上下文）", () => {
        const p = new TestDoc(["（四）事项丁。鼓励各方积极参与。"]).at(1);
        expect(p.kind, `「${p.text}」`).toBe("h2");
    });

    test("正常的多条 h2 组不受影响", () => {
        const doc = new TestDoc(["（一）条目甲", "（二）条目乙", "（三）条目丙"]);
        for (let i = 1; i <= 3; i++) {
            expect(doc.at(i).kind, `第 ${i} 段`).toBe("h2");
        }
    });

    test("不同前缀类型不参与整组降格", () => {
        const doc = new TestDoc(["（一）条目甲", "1.列表项，含逗号、顿号。"]);
        expect(doc.at(1).kind, "（一）仍是 h2").toBe("h2");
        expect(doc.at(2).kind, "1. 是 listItem").toBe("listItem");
    });

    test("空行隔开的编号不视为同组（保留原判）", () => {
        const doc = new TestDoc(["（一）条目甲。", "", "（二）条目乙，含逗号、顿号。"]);
        expect(doc.at(1).kind, "（一）单独成组 → h2").toBe("h2");
        expect(doc.at(3).kind, "（二）长描述 → listItem").toBe("listItem");
    });
});
