import type {
    ParagraphSemanticKind,
    ParaGroup,
    PlainParaInfo,
    StructuredParaInfo,
} from "@/utils/para-types";

import { findMainTitleBlocks } from "@/utils/para-analysis";

import { TestDoc } from "../helpers/doc-test";

/** 段落规格：PlainParaInfo 的可选覆盖 + 必填 text */
type ParaSpec = Partial<PlainParaInfo> & { text: string };

/**
 * 按 ParaSpec 构造 StructuredParaInfo[]。
 * - text 必填，其余字段可选覆盖（spec 显式字段优先）
 * - isEmpty：真空行（trim 后为空且不含换页符）；`"\f"` 段不是空行
 * - hasFormFeed：含 `\f\r` 才算换页符（`A\fB` 视为普通段）
 * - StructuredParaInfo 的额外字段给空默认值
 */
function makeParas(specs: ParaSpec[]): StructuredParaInfo[] {
    return specs.map((spec, index) => {
        const hasFormFeed = spec.hasFormFeed ?? /\f\r/.test(spec.text);
        const isEmpty = spec.isEmpty ?? (spec.text.trim() === "" && !spec.text.includes("\f"));
        return {
            isAttachment: false,
            hasFormFeed,
            hasForbidden: false,
            isHeading: false,
            isInRange: true,
            isTable: false,
            isSkipped: false,
            ...spec,
            text: spec.text,
            index,
            isEmpty,
            semanticKinds: new Set<ParagraphSemanticKind>(),
            primaryKind: isEmpty ? "empty" : "body",
            subMatches: [],
        };
    });
}

function findBlocks(specs: ParaSpec[]): ParaGroup[] {
    return findMainTitleBlocks(makeParas(specs));
}

// ==================== 单元测试：候选起点 ====================

describe("findMainTitleBlocks：候选起点", () => {
    test.each<{ name: string; specs: ParaSpec[]; expected: ParaGroup[] }>([
        {
            name: "文档首单行标题 + 块后空行",
            specs: [{ text: "XX通知" }, { text: "" }, { text: "正文。" }],
            expected: [{ start: 0, end: 0 }],
        },
        {
            name: "文档首多行标题（连续非空）合为一个块",
            specs: [{ text: "关于XX工作的通知" }, { text: "XX省人民政府" }, { text: "" }],
            expected: [{ start: 0, end: 1 }],
        },
        {
            name: "多个空行开头：跳过空行取首个非空段",
            specs: [{ text: "" }, { text: "" }, { text: "XX通知" }, { text: "" }],
            expected: [{ start: 2, end: 2 }],
        },
        {
            name: "附件后有空行：识别附件后首个非空段",
            specs: [
                { text: "附件1", isAttachment: true },
                { text: "" },
                { text: "XX管理办法" },
                { text: "" },
            ],
            expected: [{ start: 2, end: 2 }],
        },
        {
            name: "附件后无空行：仍识别附件后首个非空段",
            specs: [{ text: "附件1", isAttachment: true }, { text: "XX管理办法" }, { text: "" }],
            expected: [{ start: 1, end: 1 }],
        },
        {
            name: "附件后无空行 + 多行标题",
            specs: [
                { text: "附件1", isAttachment: true },
                { text: "XX管理办法" },
                { text: "XX省人民政府" },
                { text: "" },
            ],
            expected: [{ start: 1, end: 2 }],
        },
        {
            // \r\f\r 结构：\f 段独立，但不是空行；封面块被它阻断
            name: "换页符后有空行（\\r\\f\\r 结构）：识别换页符后首个非空段",
            specs: [
                { text: "封面" }, // 0 文档首段 → 候选，但扩展撞到 \f 段 → 不成立
                { text: "\f", hasFormFeed: true }, // 1 换页符段（isEmpty=false）
                { text: "" }, // 2 真空行
                { text: "XX通知" }, // 3 prev=换页符段 → 候选
                { text: "" }, // 4
            ],
            expected: [{ start: 3, end: 3 }],
        },
        {
            // \r\f\r 紧接标题：换页符段后直接是标题，中间无额外空行
            name: "换页符后无空行（\\r\\f\\r 紧接标题）：仍识别",
            specs: [
                { text: "封面" }, // 0 扩展撞到 \f 段 → 不成立
                { text: "\f", hasFormFeed: true }, // 1
                { text: "XX通知" }, // 2 prev=换页符段 → 候选
                { text: "" }, // 3
            ],
            expected: [{ start: 2, end: 2 }],
        },
        {
            // 换页符段不是空行，标题块后没有空行 → 块不成立
            name: "标题后是换页符段（非空行）→ 块不成立",
            specs: [
                { text: "标题行" }, // 0 文档首段 → 候选
                { text: "\f", hasFormFeed: true }, // 1 换页符段，阻断扩展
                { text: "正文。" }, // 2
            ],
            expected: [],
        },
    ])("$name", ({ specs, expected }) => {
        expect(findBlocks(specs)).toEqual(expected);
    });
});

// ==================== 单元测试：阻断与丢弃 ====================

describe("findMainTitleBlocks：阻断与丢弃", () => {
    test.each<{ name: string; specs: ParaSpec[]; expected: ParaGroup[] }>([
        {
            name: "块延伸到文档末尾、无空行 → 丢弃",
            specs: [{ text: "XX通知" }, { text: "XX省人民政府" }],
            expected: [],
        },
        {
            name: "块内含层级标题 → 整块丢弃",
            specs: [{ text: "XX通知" }, { text: "一、总则", isHeading: true }, { text: "" }],
            expected: [],
        },
        {
            name: "块内含禁止符 → 整块丢弃",
            specs: [
                { text: "XX通知" },
                { text: "含【禁止符号】", hasForbidden: true },
                { text: "" },
            ],
            expected: [],
        },
        {
            name: "块内含表格 → 整块丢弃",
            specs: [{ text: "XX通知" }, { text: "单元格", isTable: true }, { text: "" }],
            expected: [],
        },
        {
            name: "块内含范围外段落 → 整块丢弃",
            specs: [{ text: "XX通知" }, { text: "范围外", isInRange: false }, { text: "" }],
            expected: [],
        },
        {
            name: "文档首是表格 → 不作为候选",
            specs: [{ text: "表格", isTable: true }, { text: "" }, { text: "正文。" }],
            expected: [],
        },
        {
            name: "文档首是禁止符 → 不作为候选",
            specs: [{ text: "【禁止】", hasForbidden: true }, { text: "" }, { text: "正文。" }],
            expected: [],
        },
        {
            name: "文档首是层级标题 → 不识别",
            specs: [{ text: "一、总则", isHeading: true }, { text: "" }],
            expected: [],
        },
        {
            name: "文档首是附件 → 仅附件本身不识别",
            specs: [{ text: "附件1", isAttachment: true }, { text: "" }],
            expected: [],
        },
        {
            name: "前一个非空段是层级标题（隔空行）→ 后续不识别",
            specs: [
                { text: "一、总则", isHeading: true },
                { text: "" },
                { text: "XX通知" },
                { text: "" },
            ],
            expected: [],
        },
        {
            name: "前一个非空段是层级标题（无空行）→ 后续不识别",
            specs: [{ text: "一、总则", isHeading: true }, { text: "XX通知" }, { text: "" }],
            expected: [],
        },
        {
            name: "块后多个空行 → 正常识别（多个空行不影响）",
            specs: [{ text: "XX通知" }, { text: "" }, { text: "" }, { text: "正文。" }],
            expected: [{ start: 0, end: 0 }],
        },
    ])("$name", ({ specs, expected }) => {
        expect(findBlocks(specs)).toEqual(expected);
    });
});

// ==================== 单元测试：多候选与相邻块 ====================

describe("findMainTitleBlocks：多候选与相邻块", () => {
    test("附件后 + 换页符后：各自成块", () => {
        const specs: ParaSpec[] = [
            { text: "附件1", isAttachment: true }, // 0
            { text: "" }, // 1
            { text: "A标题" }, // 2 prev=附件 → 候选
            { text: "" }, // 3
            { text: "B前页" }, // 4 扩展撞到 \f 段 → 不成立
            { text: "\f", hasFormFeed: true }, // 5 换页符段（非空行）
            { text: "B标题" }, // 6 prev=换页符段 → 候选
            { text: "" }, // 7
        ];
        expect(findBlocks(specs)).toEqual([
            { start: 2, end: 2 },
            { start: 6, end: 6 },
        ]);
    });

    test("附件后标题撞到下一个附件 → 该候选被丢，后续附件后标题仍识别", () => {
        // 验证「不能找到第一个候选就 break」
        const specs: ParaSpec[] = [
            { text: "附件1", isAttachment: true }, // 0
            { text: "标题A" }, // 1 候选，扩展撞到附件2 → null
            { text: "附件2", isAttachment: true }, // 2
            { text: "标题B" }, // 3 prev=附件2 → 候选
            { text: "" }, // 4
        ];
        expect(findBlocks(specs)).toEqual([{ start: 3, end: 3 }]);
    });

    test("相邻两个标题（隔空行）：只有第一个被识别", () => {
        const specs: ParaSpec[] = [
            { text: "标题A" }, // 0 文档首 → 候选
            { text: "" }, // 1
            { text: "标题B" }, // 2 prev=标题A（普通段）→ 不识别
            { text: "" }, // 3
        ];
        expect(findBlocks(specs)).toEqual([{ start: 0, end: 0 }]);
    });

    test("连续多个附件：最后一个附件后的标题被识别", () => {
        const specs: ParaSpec[] = [
            { text: "附件1", isAttachment: true }, // 0
            { text: "" }, // 1
            { text: "附件2", isAttachment: true }, // 2
            { text: "" }, // 3
            { text: "XX管理办法" }, // 4 prev=附件2 → 候选
            { text: "" }, // 5
        ];
        expect(findBlocks(specs)).toEqual([{ start: 4, end: 4 }]);
    });
});

// ==================== 集成测试：真实文档 ====================

describe("结构分析集成：主标题块", () => {
    test("标准多行标题：连续两行合为一个块，kind 均为 mainTitle", () => {
        const doc = new TestDoc([
            "XX省人民政府办公厅",
            "关于XX工作的通知",
            "",
            "各市、县（区）人民政府：",
            "",
            "正文。",
        ]);

        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 0, end: 1 }]);
        expect(doc.at(1).kind, "标题首行").toBe("mainTitle");
        expect(doc.at(2).kind, "标题次行").toBe("mainTitle");
        expect(doc.at(4).kind, "抬头不被吞").toBe("salutation");
    });

    test("空行开头：从首个非空段起块", () => {
        const doc = new TestDoc(["", "关于XX工作的通知", "", "正文。"]);
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 1, end: 1 }]);
        expect(doc.at(2).kind, "标题").toBe("mainTitle");
    });

    test("文档末尾无空行 → 不识别", () => {
        const doc = new TestDoc(["关于XX工作的通知"]);
        expect(doc.structure.mainTitleBlocks).toEqual([]);
    });

    test("块内含层级标题 → 整块不成立，但层级标题仍被识别", () => {
        const doc = new TestDoc(["关于XX工作的通知", "一、总体要求", "", "正文。"]);
        expect(doc.structure.mainTitleBlocks).toEqual([]);
        expect(doc.at(2).kind, "层级标题仍识别").toBe("h1");
    });

    test("块内含禁止符 → 整块不成立", () => {
        const doc = new TestDoc(["关于XX工作的通知", "含【标题中禁止符号】的段落", "", "正文。"]);
        expect(doc.structure.mainTitleBlocks).toEqual([]);
    });

    test("块内含表格 → 整块不成立", () => {
        const doc = new TestDoc(["关于XX工作的通知", "单元格1\x07单元格2\x07", "", "正文。"]);
        expect(doc.structure.mainTitleBlocks).toEqual([]);
    });

    test("附件后接标题（有空行）→ 识别", () => {
        const doc = new TestDoc(["附件1", "", "XX管理办法", "", "正文。"]);
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 2, end: 2 }]);
        expect(doc.at(1).kind, "附件段").toBe("attachment");
        expect(doc.at(3).kind, "附件后的标题").toBe("mainTitle");
    });

    test("附件后接标题（无空行）→ 仍识别", () => {
        const doc = new TestDoc(["附件1", "XX管理办法", "", "正文。"]);
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 1, end: 1 }]);
        expect(doc.at(1).kind, "附件段").toBe("attachment");
        expect(doc.at(2).kind, "附件后的标题").toBe("mainTitle");
    });

    test("换页符后接标题（\\r\\f\\r 结构）→ 识别", () => {
        // 真实 COM 文本：`封面\r\f\r关于XX的通知\r\r正文。\r`
        // parse 后：封面 / 换页符段（非空行） / 关于XX的通知 / 空段 / 正文。
        const doc = new TestDoc(["封面", "\f", "关于XX工作的通知", "", "正文。"]);

        // 封面块：扩展撞到换页符段 → 不成立
        // 标题：prev 是换页符段 → 候选；块后是空行 → 成立
        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 2, end: 2 }]);
        expect(doc.at(3).kind, "换页符后的标题").toBe("mainTitle");
    });

    test("前有层级标题（隔空行）→ 后续段落不升级", () => {
        const doc = new TestDoc(["一、总体要求", "", "关于XX工作的通知", "", "正文。"]);
        expect(doc.structure.mainTitleBlocks).toEqual([]);
        expect(doc.at(3).kind, "后续段落").not.toBe("mainTitle");
    });

    test("多行块：标题 + 署名 + 日期 + 文种整体成块，各归其位", () => {
        const doc = new TestDoc([
            "在XX县“XX工作”",
            "会议上的讲话",
            "某局局长，某委书记（兼）  李  某",
            "（2026年X月X日）",
            "（送审稿）",
            "",
            "各单位：",
            "",
            "正文。",
        ]);

        expect(doc.structure.mainTitleBlocks).toEqual([{ start: 0, end: 4 }]);
        expect(doc.at(1).kind, "标题首行").toBe("mainTitle");
        expect(doc.at(2).kind, "标题次行").toBe("mainTitle");
        expect(doc.at(3).kind, "署名").toBe("subtitle");
        expect(doc.at(4).kind, "日期").toBe("subtitle");
        expect(doc.at(5).kind, "文种").toBe("subtitle");
        expect(doc.at(7).kind, "抬头不被吞").toBe("salutation");
    });

    test("多个主标题块：附件后 + 换页符后各自成块（\\r\\f\\r 结构）", () => {
        const doc = new TestDoc([
            "附件1", // 0
            "", // 1
            "A标题", // 2
            "", // 3
            "B前页", // 4 扩展撞到换页符段 → 不成立
            "\f", // 5 换页符段（非空行）
            "B标题", // 6
            "", // 7
            "正文。", // 8
        ]);

        expect(doc.structure.mainTitleBlocks).toEqual([
            { start: 2, end: 2 },
            { start: 6, end: 6 },
        ]);
    });

    test("局部模式 isFullDoc=false → 不识别主标题块，但段落级语义仍生效", () => {
        const partial = new TestDoc(
            [
                "XX省人民政府办公厅",
                "关于XX工作的通知",
                "",
                "各市、县（区）人民政府：",
                "",
                "正文。",
            ],
            undefined,
            { isFullDoc: false },
        );
        expect(partial.structure.mainTitleBlocks).toEqual([]);
        expect(partial.at(4).kind, "段落级抬头仍识别").toBe("salutation");
    });
});
