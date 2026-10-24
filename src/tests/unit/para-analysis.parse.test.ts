import { parsePlainTextToParas } from "@/utils/para-analysis";

describe("parsePlainTextToParas 纯文本解析", () => {
    test("支持 \\n / \\r / \\r\\n，且每段尾统一带 \\r", () => {
        const r1 = parsePlainTextToParas("a\nb\nc");
        expect(r1.length, "段落数").toBe(3);
        expect(
            r1.map((p) => p.text),
            "每段尾带 \\r",
        ).toEqual(["a\r", "b\r", "c\r"]);

        const r2 = parsePlainTextToParas("a\r\nb\rc");
        expect(
            r2.map((p) => p.text),
            "混合换行归一",
        ).toEqual(["a\r", "b\r", "c\r"]);
    });

    test("连续空行保留为多段 empty", () => {
        const r = parsePlainTextToParas("\n\n\n");
        expect(r.length, "三个空行 → 三段").toBe(3);
        expect(
            r.every((p) => p.isEmpty),
            "全部为空段",
        ).toBe(true);
    });

    test("空串返回空数组；单段无换行符时补尾 \\r", () => {
        expect(parsePlainTextToParas(""), "空串").toEqual([]);

        const r = parsePlainTextToParas("a");
        expect(r.length, "单段").toBe(1);
        expect(r[0].text, "补尾 \\r").toBe("a\r");
        expect(r[0].isEmpty, "非空").toBe(false);
    });

    test("识别附件、换页符、禁止符号", () => {
        const paras = parsePlainTextToParas(
            [
                "附件1",
                "XXX管理办法",
                "含【标题中禁止符号】的段落",
                "",
                "正常段落。",
                "前有换页\f后有内容",
            ].join("\n"),
        );
        expect(paras[0].isAttachment, "「附件1 ...」识别为附件").toBe(true);
        expect(paras[1].isAttachment, "「正常段落。」不是附件").toBe(false);
        expect(paras[2].hasForbidden, "「含【标题中禁止符号】」命中禁止符").toBe(true);
        expect(paras[5].hasFormFeed, "含 \\f 标记换页符，但不紧跟\r 视为没有").toBe(false);
    });

    test("表格单元格标记 \\x07 → isTable=true", () => {
        const paras = parsePlainTextToParas("单元格1\x07单元格2\x07\r");
        expect(paras[0].isTable, "含 \\x07").toBe(true);
    });

    test("附件前缀：正文引用不算附件，标题行仍算", () => {
        const isAtt = (s: string) => parsePlainTextToParas(s)[0].isAttachment;
        expect(isAtt("附件1和附件2的具体内容见下文。"), "正文引用").toBe(false);
        expect(isAtt("附件1 任务分工表"), "编号后有空格").toBe(true);
        expect(isAtt("附件10"), "编号后段尾").toBe(true);
        expect(isAtt("附件1：任务分工表"), "编号后有冒号").toBe(true);
    });
});
