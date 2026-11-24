import type { TypographyConfig } from "@/config/types";
import type { CurrentFormat } from "@/features/format-check/core/inspect";

import { DEFAULT_TYPO_CONFIG } from "@/config/defaults";
import {
    checkFormat,
    formatLineSpacing,
    getExpectedFormat,
    WD_ALIGN,
} from "@/features/format-check/core/inspect";

const config: TypographyConfig = DEFAULT_TYPO_CONFIG;

/** 构造一个「符合默认公文格式」的正文快照 */
function makeFormat(overrides: Partial<CurrentFormat> = {}): CurrentFormat {
    return {
        styleName: "正文",
        fontName: config.main.zh,
        asciiFontName: config.main.en,
        fontSize: config.main.size,
        bold: false,
        alignment: WD_ALIGN.justify,
        firstLineIndent: config.main.indent,
        lineSpacing: config.main.spacing,
        lineSpacingRule: 4,
        ...overrides,
    };
}

/** 构造一个「符合默认公文格式」的主标题快照 */
function makeTitleFormat(overrides: Partial<CurrentFormat> = {}): CurrentFormat {
    return makeFormat({
        fontName: config.title.zh,
        asciiFontName: config.title.en,
        fontSize: config.title.size,
        alignment: WD_ALIGN.center,
        firstLineIndent: 0,
        lineSpacing: config.title.spacing,
        ...overrides,
    });
}

describe("getExpectedFormat", () => {
    test("普通正文严格按主配置检查", () => {
        const expected = getExpectedFormat("body", config);
        expect(expected).toMatchObject({
            font: config.main.zh,
            asciiFont: config.main.en,
            fontSize: config.main.size,
            alignment: WD_ALIGN.justify,
            firstLineIndent: config.main.indent,
            lineSpacing: config.main.spacing,
            lineSpacingRule: 4,
        });
    });

    test("版头是版式设计元素，不检查", () => {
        expect(getExpectedFormat("letterhead", config)).toBeNull();
    });

    test("落款右对齐，但仍按正文行距检查", () => {
        const expected = getExpectedFormat("signatureUnit", config);
        expect(expected?.alignment).toBe(WD_ALIGN.right);
        expect(expected?.firstLineIndent).toBeUndefined();
        expect(expected?.lineSpacing).toBe(config.main.spacing);
    });
});

describe("checkFormat：字体名严格匹配", () => {
    test("设置为仿宋_GB2312，文档使用仿宋时判为异常", () => {
        const issues = checkFormat("body", makeFormat({ fontName: "仿宋" }), config);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
            field: "font",
            expected: config.main.zh,
            actual: "仿宋",
        });
    });

    test("字体名完全一致时不报问题", () => {
        expect(checkFormat("body", makeFormat(), config)).toEqual([]);
    });

    test("中文字体混合 / 未知时判为异常", () => {
        const issues = checkFormat("body", makeFormat({ fontName: "" }), config);
        expect(issues.map((issue) => issue.field)).toEqual(["font"]);
        expect(issues[0].actual).toBe("混合/未知");
    });

    test("西文字体不一致时判为异常", () => {
        const issues = checkFormat("body", makeFormat({ asciiFontName: "宋体" }), config);
        expect(issues.map((issue) => issue.field)).toEqual(["fontAscii"]);
    });

    test("正文整段加粗时判为异常", () => {
        const issues = checkFormat("body", makeFormat({ bold: true }), config);
        expect(issues.map((issue) => issue.field)).toEqual(["bold"]);
    });

    test("topic 的整段 bold 交给小标题加粗逻辑，不在基础检查中报错", () => {
        expect(checkFormat("topic", makeFormat({ bold: true }), config)).toEqual([]);
    });
});

describe("checkFormat：标题与层级", () => {
    test("格式完全符合时不报问题", () => {
        expect(checkFormat("mainTitle", makeTitleFormat(), config)).toEqual([]);
    });

    test("标题字号、对齐、首行缩进不符时逐项报出", () => {
        const issues = checkFormat(
            "mainTitle",
            makeTitleFormat({
                fontSize: 16,
                alignment: WD_ALIGN.justify,
                firstLineIndent: 2,
            }),
            config,
        );
        expect(issues.map((issue) => issue.field)).toEqual(["size", "alignment", "indent"]);
    });

    test("一级标题使用配置中的标题字体", () => {
        const issues = checkFormat("h1", makeFormat({ fontName: "宋体" }), config);
        expect(issues.map((issue) => issue.field)).toEqual(["font"]);
    });

    test("落款必须右对齐", () => {
        const issues = checkFormat(
            "signatureDate",
            makeFormat({ alignment: WD_ALIGN.justify }),
            config,
        );
        expect(issues.map((issue) => issue.field)).toEqual(["alignment"]);
    });

    test("版头不产生问题", () => {
        const issues = checkFormat(
            "letterhead",
            makeFormat({
                fontName: "黑体",
                fontSize: 36,
                alignment: WD_ALIGN.center,
            }),
            config,
        );
        expect(issues).toEqual([]);
    });
});

describe("checkFormat：行距", () => {
    test("行距规则不是固定值时判为异常", () => {
        const issues = checkFormat(
            "body",
            makeFormat({ lineSpacingRule: 0, lineSpacing: 12 }),
            config,
        );
        expect(issues.map((issue) => issue.field)).toEqual(["spacing"]);
        expect(issues[0].actual).toBe("单倍行距");
    });

    test("固定值磅数不一致时判为异常", () => {
        const issues = checkFormat("body", makeFormat({ lineSpacing: 30 }), config);
        expect(issues.map((issue) => issue.field)).toEqual(["spacing"]);
    });

    test("行距一致时不报问题", () => {
        expect(checkFormat("body", makeFormat(), config)).toEqual([]);
    });

    test("行距格式化", () => {
        expect(formatLineSpacing(28.95, 4)).toBe("固定值 28.95pt");
        expect(formatLineSpacing(12, 0)).toBe("单倍行距");
    });
});

describe("checkFormat：混合 / 读不到的数值属性", () => {
    test("字号、加粗、对齐、缩进为 null 时跳过判定", () => {
        const issues = checkFormat(
            "mainTitle",
            makeTitleFormat({
                fontSize: null,
                bold: null,
                alignment: null,
                firstLineIndent: null,
                lineSpacing: null,
            }),
            config,
        );
        expect(issues).toEqual([]);
    });
});
