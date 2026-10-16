import { TestDoc } from "../helpers/doc-test";
import { SAMPLE_GOV_DOC_LINES } from "../helpers/fixtures";

describe("端到端：完整公文样例", () => {
    const doc = new TestDoc(SAMPLE_GOV_DOC_LINES);

    test("所有关键段落都被正确分类", () => {
        const kinds = new Set(doc.all().map((p) => p.kind));
        for (const expected of [
            "mainTitle",
            "salutation",
            "h1",
            "h2",
            "h3",
            "attachment",
            "signatureUnit",
            "signatureDate",
        ] as const) {
            expect(kinds.has(expected), `应包含 kind = ${expected}`).toBe(true);
        }
    });

    test("排版指令数量落在合理区间", () => {
        expect(doc.modifications.length, "指令数下限").toBeGreaterThan(10);
        expect(doc.modifications.length, "指令数不应超过段落数").toBeLessThanOrEqual(doc.length);
    });

    test("主标题段落使用公文标题样式", () => {
        const titleP = doc.kinds("mainTitle")[0];
        expect(titleP.style, `「${titleP.text}」`).toBe("公文标题");
    });

    test("所有抬头 / 附件段落都顶格", () => {
        for (const kind of ["salutation", "attachment"] as const) {
            for (const p of doc.kinds(kind)) {
                expect(p.indent, `${kind}「${p.text}」`).toBe(0);
            }
        }
    });
});
