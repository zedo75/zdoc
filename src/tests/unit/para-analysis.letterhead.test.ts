import { TestDoc } from "../helpers/doc-test";

// ==================== 版头识别：用户场景 ====================

describe("结构分析：版头（红头）", () => {
    /**
     * 小红头：议事协调机构的发文机关标志折成两行，
     * 下方隔空行才是真正的标题（用户实际文档形态）。
     */
    const RED_HEADER_LINES = [
        "XX省XX市XX区人民政府", // 0 版头第 1 行
        "XX工作领导小组办公室", // 1 版头第 2 行
        "", // 2
        "关于XX部门、XX部门班子成员", // 3 标题第 1 行
        "列席XX级XX联席会议的通知", // 4 标题第 2 行
        "", // 5
        "各XX（镇）党委：", // 6 抬头
        "", // 7
        "为落实上级部署安排，推进XX工作，现就有关工作通知如下。",
    ];

    test("版头两行 → letterhead，标题两行 → mainTitle", () => {
        const doc = new TestDoc(RED_HEADER_LINES);

        expect(doc.at(1).kind, `「${doc.at(1).text}」`).toBe("letterhead");
        expect(doc.at(2).kind, `「${doc.at(2).text}」`).toBe("letterhead");
        expect(doc.at(4).kind, `「${doc.at(4).text}」`).toBe("mainTitle");
        expect(doc.at(5).kind, `「${doc.at(5).text}」`).toBe("mainTitle");
    });

    test("主标题块从标题起算，不再包含版头", () => {
        const doc = new TestDoc(RED_HEADER_LINES);
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 3, end: 4 }]);
    });

    test("版头不参与排版：不下发任何修改指令", () => {
        const doc = new TestDoc(RED_HEADER_LINES);
        expect(doc.at(1).mod, "版头第 1 行").toBeUndefined();
        expect(doc.at(2).mod, "版头第 2 行").toBeUndefined();
        expect(doc.at(4).style, "标题使用公文标题样式").toBe("公文标题");
    });

    test("版头后的抬头仍识别为 salutation", () => {
        const doc = new TestDoc(RED_HEADER_LINES);
        expect(doc.at(7).kind, "抬头").toBe("salutation");
    });

    test("普通「关于……的通知」单行标题：不误判为版头", () => {
        const doc = new TestDoc(["关于XX工作的通知", "", "正文。"]);
        expect(doc.at(1).kind, `「${doc.at(1).text}」`).toBe("mainTitle");
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 0, end: 0 }]);
    });
});

// ==================== 版头识别：形态边界 ====================

describe("结构分析：版头形态", () => {
    test("大红头「XX县人民政府文件」：识别为版头", () => {
        const doc = new TestDoc([
            "XX县人民政府文件",
            "",
            "关于XX工作的通知",
            "",
            "各单位：",
            "",
            "正文。",
        ]);
        expect(doc.at(1).kind, "版头").toBe("letterhead");
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 2, end: 2 }]);
    });

    test("联合发文版头（三行机关名称）：识别为版头", () => {
        const doc = new TestDoc([
            "中共XX县委组织部",
            "中共XX县委宣传部",
            "中共XX县委政法委员会",
            "",
            "关于XX工作的通知",
            "",
            "各单位：",
        ]);
        expect(
            doc
                .all()
                .filter((p) => p.kind === "letterhead")
                .map((p) => p.text),
            "版头三行",
        ).toEqual(["中共XX县委组织部", "中共XX县委宣传部", "中共XX县委政法委员会"]);
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 4, end: 4 }]);
    });

    test("标题本身以机关名称开头（含「关于」）：不拆成版头", () => {
        const doc = new TestDoc([
            "XX省人民政府办公厅",
            "关于印发《XX省2026年XX工作要点》的通知",
            "",
            "各市、县（区）人民政府：",
        ]);
        expect(doc.at(1).kind, "标题第 1 行").toBe("mainTitle");
        expect(doc.at(2).kind, "标题第 2 行").toBe("mainTitle");
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 0, end: 1 }]);
    });

    test("标题不以「关于」开头、以文种收尾：版头后仍识别为标题", () => {
        const doc = new TestDoc([
            "中共XX县委办公室",
            "",
            "XX县2026年XX工作要点",
            "",
            "各乡（镇）党委：",
        ]);
        expect(doc.at(1).kind, "版头").toBe("letterhead");
        expect(doc.at(3).kind, "标题（以「要点」收尾）").toBe("mainTitle");
    });

    test("带括号副题的标题：仍可识别（文种在括号前）", () => {
        const doc = new TestDoc([
            "中共XX县委办公室",
            "",
            "XX县XX工作要点（送审稿）",
            "",
            "各乡（镇）党委：",
        ]);
        expect(doc.at(1).kind, "版头").toBe("letterhead");
        expect(doc.at(3).kind, "标题").toBe("mainTitle");
    });

    test("版头后直接跟正文（没有标题）：不识别为版头", () => {
        const doc = new TestDoc([
            "XX县人民政府办公室",
            "",
            "为做好XX工作，现将有关事项通知如下：",
            "",
            "正文。",
        ]);
        expect(
            doc.all().some((p) => p.kind === "letterhead"),
            "不应有版头",
        ).toBe(false);
    });

    test("版头后跟「关于……」开头的正文（带句读）：不识别为版头", () => {
        const doc = new TestDoc([
            "XX县人民政府办公室",
            "",
            "关于XX工作，现将有关事项通知如下：",
            "",
            "正文。",
        ]);
        expect(
            doc.all().some((p) => p.kind === "letterhead"),
            "正文含逗号 / 冒号，不能当作标题",
        ).toBe(false);
    });

    test("开头超过 4 行：不识别为版头", () => {
        const doc = new TestDoc([
            "中共XX县委办公室",
            "中共XX县委组织部",
            "中共XX县委宣传部",
            "中共XX县委统战部",
            "中共XX县委政法委员会",
            "",
            "关于XX工作的通知",
            "",
            "各单位：",
        ]);
        expect(
            doc.all().some((p) => p.kind === "letterhead"),
            "超过行数上限",
        ).toBe(false);
    });

    test("文档开头有空行：仍识别版头", () => {
        const doc = new TestDoc(["", "中共XX县委办公室", "", "关于XX工作的通知", "", "各单位："]);
        expect(doc.at(2).kind, "版头").toBe("letterhead");
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 3, end: 3 }]);
    });

    test("版头只在文档开头识别：标题之后的机关名称不按版头处理", () => {
        const doc = new TestDoc([
            "关于XX工作的通知",
            "",
            "各单位：",
            "",
            "中共XX县委办公室",
            "2026年X月X日",
        ]);
        // 正文末的「单位 + 日期」是落款，不是版头
        expect(
            doc.all().some((p) => p.kind === "letterhead"),
            "不应有版头",
        ).toBe(false);
        expect(doc.at(5).kind, "落款单位").toBe("signatureUnit");
    });

    test("局部模式 isFullDoc=false：不识别版头", () => {
        const partial = new TestDoc(
            ["中共XX县委办公室", "", "关于XX工作的通知", "", "各单位："],
            undefined,
            { isFullDoc: false },
        );
        expect(
            partial.all().some((p) => p.kind === "letterhead"),
            "局部模式不识别",
        ).toBe(false);
    });
});
