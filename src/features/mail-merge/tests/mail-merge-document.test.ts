import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    mergeMailTemplate,
    mergeMailTemplateBatch,
} from "@/features/mail-merge/commands/mergeTemplate";

/**
 * 一个最小可用的 WPS 表格模型，用来验证文档层：
 * 行插入、FormattedText 继承、单元格写入、最小 Range 格式。
 */
class FakeDoc {
    readonly tables: FakeTable[] = [];
    readonly bodyParagraphs: FakeBodyParagraph[] = [];
    readonly operations: Array<{ start: number; end: number; fitWidth: number }> = [];
    Name = "测试.docx";

    get Tables() {
        return collection(this.tables.length, (i) => this.tables[i - 1]);
    }

    get Content() {
        const body = this.bodyParagraphs;
        return {
            Text: [...body.map((p) => p.text), ...this.tables.map((table) => table.text())].join(
                "\r",
            ),
            Tables: collection(0, () => {
                throw new Error("no table in content paragraphs");
            }),
            Paragraphs: collection(body.length, (i) => body[i - 1]),
        };
    }

    Range(start: number, end: number) {
        return new FakeRange({
            doc: this,
            start,
            end,
            text: "",
            onFitWidth: (fitWidth) => {
                this.operations.push({ start, end, fitWidth });
            },
        });
    }
}

class FakeTable {
    rows: FakeRow[] = [];
    addCalls = 0;
    readonly NestingLevel = 1;

    constructor(
        readonly doc: FakeDoc,
        rows: Array<{ cells: string[]; style?: string }>,
    ) {
        for (const row of rows) this.rows.push(new FakeRow(this, row.cells, row.style ?? ""));
    }

    get Rows() {
        return new FakeRows(this);
    }

    get Range() {
        return new FakeRange({
            doc: this.doc,
            start: 0,
            end: this.text().length,
            text: this.text(),
        });
    }

    text(): string {
        return this.rows.map((row) => row.cells.map((cell) => cell.text).join("|")).join("\n");
    }
}

class FakeRows {
    constructor(private readonly table: FakeTable) {}

    get Count() {
        return this.table.rows.length;
    }

    get First() {
        return this.table.rows[0] ?? null;
    }

    Item(index: number) {
        return this.table.rows[index - 1] ?? null;
    }

    Add(before?: FakeRow) {
        this.table.addCalls++;
        const first = this.table.rows[0];
        const width = first?.cells.length ?? 1;
        const row = new FakeRow(
            this.table,
            Array.from({ length: width }, () => ""),
            "blank",
        );
        if (before) {
            const index = this.table.rows.indexOf(before);
            this.table.rows.splice(index < 0 ? this.table.rows.length : index, 0, row);
        } else {
            this.table.rows.push(row);
        }
        return row;
    }
}

class FakeRow {
    readonly cells: FakeCell[];

    constructor(
        readonly table: FakeTable,
        texts: string[],
        public style: string,
    ) {
        this.cells = texts.map((text, index) => new FakeCell(this, text, index));
    }

    get Index() {
        return this.table.rows.indexOf(this) + 1;
    }

    get Next(): FakeRow | null {
        const index = this.table.rows.indexOf(this);
        return this.table.rows[index + 1] ?? null;
    }

    get Cells() {
        return collection(this.cells.length, (i) => {
            const cell = this.cells[i - 1];
            if (!cell) throw new Error("cell out of range");
            return cell;
        });
    }

    get Range() {
        return new FakeRange({
            doc: this.table.doc,
            start: this.Index * 1000,
            end: this.Index * 1000 + 100,
            text: this.cells.map((cell) => cell.text).join("|"),
            row: this,
        });
    }

    Delete() {
        const index = this.table.rows.indexOf(this);
        if (index >= 0) this.table.rows.splice(index, 1);
    }
}

class FakeCell {
    readonly Tables = collection(0, () => {
        throw new Error("no nested table");
    });

    constructor(
        readonly row: FakeRow,
        public text: string,
        readonly index: number,
    ) {}

    get Range() {
        return new FakeRange({
            doc: this.row.table.doc,
            start: this.row.Index * 1000 + this.index * 100,
            end: this.row.Index * 1000 + this.index * 100 + this.text.length,
            text: this.text,
            cell: this,
        });
    }
}

interface RangeOptions {
    doc: FakeDoc;
    start: number;
    end: number;
    text: string;
    cell?: FakeCell;
    row?: FakeRow;
    onFitWidth?: (n: number) => void;
}

class FakeRange {
    readonly Font = { Spacing: 0 };

    constructor(private readonly options: RangeOptions) {}

    get Start() {
        return this.options.start;
    }

    get End() {
        return this.options.end;
    }

    get Text() {
        if (this.options.cell) return `${this.options.cell.text}\r\u0007`;
        return this.options.text;
    }

    set Text(value: string) {
        if (!this.options.cell) return;
        this.options.cell.text = value.replace(/\r\u0007/g, "").replace(/\r$/, "");
    }

    get FormattedText() {
        if (this.options.row) {
            return {
                cells: this.options.row.cells.map((cell) => ({ text: cell.text })),
                style: this.options.row.style,
            };
        }
        return this.Text;
    }

    set FormattedText(value: unknown) {
        if (!this.options.row || !value || typeof value !== "object") return;
        const snapshot = value as {
            cells: Array<{ text: string }>;
            style: string;
        };
        if (this.options.row.cells.length !== snapshot.cells.length) return;
        this.options.row.cells.forEach((cell, index) => {
            cell.text = snapshot.cells[index]?.text ?? "";
        });
        this.options.row.style = snapshot.style;
    }
}

// 拦截 FitTextWidth 的赋值，记录文档层真正施加的范围
Object.defineProperty(FakeRange.prototype, "FitTextWidth", {
    get() {
        return (this as unknown as { _fitWidth?: number })._fitWidth ?? 0;
    },
    set(value: number) {
        (this as unknown as { _fitWidth?: number })._fitWidth = value;
        (this as unknown as { options: RangeOptions }).options.onFitWidth?.(value);
    },
});

function collection<T>(count: number, item: (i: number) => T) {
    return { Count: count, Item: (i: number) => item(i) };
}

class FakeBodyParagraph {
    constructor(
        readonly doc: FakeDoc,
        public text: string,
        readonly base: number,
    ) {}

    get Range() {
        return new FakeBodyRange(this, 0, this.text.length);
    }
}

class FakeBodyRange {
    private fitWidthValue = 0;

    constructor(
        private readonly owner: FakeBodyParagraph,
        private startRel: number,
        private endRel: number,
    ) {}

    get Start() {
        return this.owner.base + this.startRel;
    }

    get End() {
        return this.owner.base + this.endRel;
    }

    set End(value: number) {
        this.endRel = value - this.owner.base;
    }

    get Text() {
        return this.owner.text.slice(this.startRel, this.endRel);
    }

    set Text(value: string) {
        const old = this.owner.text;
        this.owner.text = old.slice(0, this.startRel) + value + old.slice(this.endRel);
        this.endRel = this.startRel + value.length;
    }

    get TextRetrievalMode() {
        return { IncludeHiddenText: false };
    }

    readonly Font = { Spacing: 0 };

    get FitTextWidth() {
        return this.fitWidthValue;
    }

    set FitTextWidth(value: number) {
        this.fitWidthValue = value;
        this.owner.doc.operations.push({
            start: this.Start,
            end: this.End,
            fitWidth: value,
        });
    }

    get Duplicate() {
        return new FakeBodyRange(this.owner, this.startRel, this.endRel);
    }

    SetRange(start: number, end: number) {
        this.startRel = start - this.owner.base;
        this.endRel = end - this.owner.base;
    }
}

function makeDoc(
    rows: Array<{ cells: string[]; style?: string }>,
    bodyTexts: string[] = [],
): {
    doc: FakeDoc;
    table: FakeTable;
} {
    const doc = new FakeDoc();
    const table = new FakeTable(doc, rows);
    doc.tables.push(table);
    doc.bodyParagraphs.push(
        ...bodyTexts.map((text, index) => new FakeBodyParagraph(doc, text, 100000 + index * 10000)),
    );
    return { doc, table };
}

function values(table: FakeTable): string[][] {
    return table.rows.map((row) => row.cells.map((cell) => cell.text));
}

beforeEach(() => {
    (globalThis as unknown as Record<string, unknown>).Application = {
        ScreenUpdating: true,
        EnableEvents: true,
        DisplayAlerts: 1,
        UndoRecord: {
            StartCustomRecord() {
                // noop
            },
            EndCustomRecord() {
                // noop
            },
        },
    };
});

afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).Application;
});

describe("mergeMailTemplate document layer", () => {
    it("expands rows, deletes marker rows and inherits FormattedText", () => {
        const { doc, table } = makeDoc([
            { cells: ["序号", "姓名"], style: "header" },
            { cells: ["{{#each 列表}}"], style: "marker" },
            { cells: ["{{序号}}", "{{姓名}}"], style: "body" },
            { cells: ["{{/each}}"], style: "marker" },
            { cells: ["合计", ""], style: "footer" },
        ]);

        const report = mergeMailTemplate(
            {
                列表: [
                    { 序号: 1, 姓名: "张三" },
                    { 序号: 2, 姓名: "李四" },
                    { 序号: 3, 姓名: "王五" },
                ],
            },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(report.status).toBe("success");
        expect(report.outputRows).toBe(3);
        expect(values(table)).toEqual([
            ["序号", "姓名"],
            ["1", "张三"],
            ["2", "李四"],
            ["3", "王五"],
            ["合计", ""],
        ]);
        expect(table.rows.slice(1, 4).map((row) => row.style)).toEqual(["body", "body", "body"]);
        // items.length - 1 = 2 次插入；模板源行复用为第一条数据
        expect(table.addCalls).toBe(2);
    });

    it("deletes the template region for an empty array", () => {
        const { doc, table } = makeDoc([
            { cells: ["表头"], style: "header" },
            { cells: ["{{#each 列表}}"], style: "marker" },
            { cells: ["{{姓名}}"], style: "body" },
            { cells: ["{{/each}}"], style: "marker" },
        ]);

        const report = mergeMailTemplate(
            { 列表: [] },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(report.status).toBe("success");
        expect(values(table)).toEqual([["表头"]]);
    });

    it("expands nested loops with the current item context", () => {
        const { doc, table } = makeDoc([
            { cells: ["{{#each 主表}}", "", ""], style: "marker" },
            { cells: ["{{名称}}", "", ""], style: "main" },
            { cells: ["{{#each 明细}}", "", ""], style: "marker" },
            { cells: ["", "{{项目}}", "{{金额}}"], style: "detail" },
            { cells: ["{{/each}}", "", ""], style: "marker" },
            { cells: ["{{/each}}", "", ""], style: "marker" },
        ]);

        const report = mergeMailTemplate(
            {
                主表: [
                    {
                        名称: "A",
                        明细: [
                            { 项目: "a1", 金额: 1 },
                            { 项目: "a2", 金额: 2 },
                        ],
                    },
                    {
                        名称: "B",
                        明细: [{ 项目: "b1", 金额: 3 }],
                    },
                ],
            },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(report.status).toBe("success");
        expect(values(table)).toEqual([
            ["A", "", ""],
            ["", "a1", "1"],
            ["", "a2", "2"],
            ["B", "", ""],
            ["", "b1", "3"],
        ]);
        expect(table.rows[1].style).toBe("detail");
    });

    it("applies width ops to the placeholder range, not the whole cell", () => {
        const { doc, table } = makeDoc([{ cells: ["前缀{{姓名 | width(3)}}后缀"], style: "body" }]);

        mergeMailTemplate(
            { 姓名: "张三" },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(values(table)).toEqual([["前缀张三后缀"]]);
        expect(doc.operations).toHaveLength(1);
        expect(doc.operations[0].fitWidth).toBe(3);
        expect(doc.operations[0].end - doc.operations[0].start).toBe(2);
    });

    it("does not apply fitWidth when the text already has n codepoints", () => {
        const { doc, table } = makeDoc([{ cells: ["{{姓名 | width(3)}}"], style: "body" }]);

        mergeMailTemplate(
            { 姓名: "欧阳修" },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(values(table)).toEqual([["欧阳修"]]);
        expect(doc.operations).toHaveLength(0);
    });

    it("rejects structural errors before writing anything", () => {
        const { doc, table } = makeDoc([
            { cells: ["{{#each 列表}}"], style: "marker" },
            { cells: ["{{姓名}}"], style: "body" },
        ]);

        const report = mergeMailTemplate(
            { 列表: [{ 姓名: "张三" }] },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(report.status).toBe("error");
        expect(values(table)).toEqual([["{{#each 列表}}"], ["{{姓名}}"]]);
    });

    it("continues with a warning when a field is missing", () => {
        const { doc, table } = makeDoc([{ cells: ["{{不存在}}"], style: "body" }]);

        const report = mergeMailTemplate(
            {},
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(report.status).toBe("warning");
        expect(values(table)).toEqual([[""]]);
        expect(report.issues.some((issue) => issue.code === "UNDEFINED_PATH")).toBe(true);
    });

    it("summarizes batch results without aborting on a failed document", () => {
        const good = makeDoc([{ cells: ["{{x}}"], style: "body" }]);
        const bad = makeDoc([{ cells: ["{{#each 列表}}"], style: "marker" }]);

        const report = mergeMailTemplateBatch([
            {
                document: good.doc as unknown as Wps.Document,
                data: { x: "ok" },
                name: "good.docx",
            },
            {
                document: bad.doc as unknown as Wps.Document,
                data: { 列表: [] },
                name: "bad.docx",
            },
        ]);

        expect(report.successCount).toBe(1);
        expect(report.errorCount).toBe(1);
        expect(report.status).toBe("error");
        expect(values(good.table)).toEqual([["ok"]]);
    });

    it("replaces simple placeholders in paragraphs outside tables", () => {
        const { doc } = makeDoc(
            [{ cells: ["表格内"], style: "body" }],
            ["姓名：{{姓名}}，部门：{{部门.名称}}", '金额：{{金额 | "0.00"}} 元'],
        );

        const report = mergeMailTemplate(
            { 姓名: "张三", 部门: { 名称: "办公室" }, 金额: 1234.5 },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(report.status).toBe("success");
        expect(doc.bodyParagraphs.map((p) => p.text)).toEqual([
            "姓名：张三，部门：办公室",
            "金额：1234.50 元",
        ]);
    });

    it("merges a document with no tables at all", () => {
        const doc = new FakeDoc();
        doc.bodyParagraphs.push(new FakeBodyParagraph(doc, "收件人：{{姓名}}", 100000));

        const report = mergeMailTemplate(
            { 姓名: "张三" },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(report.status).toBe("success");
        expect(doc.bodyParagraphs[0].text).toBe("收件人：张三");
    });

    it("renders inline each loops in a single body paragraph", () => {
        const { doc } = makeDoc(
            [{ cells: ["表头"], style: "body" }],
            ["{{#each 列表}}{{姓名}}-{{/each}}"],
        );

        mergeMailTemplate(
            { 列表: [{ 姓名: "A" }, { 姓名: "B" }] },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(doc.bodyParagraphs[0].text).toBe("A-B-");
    });

    it("applies width formatting inside a body paragraph", () => {
        const { doc } = makeDoc(
            [{ cells: ["表头"], style: "body" }],
            ["姓名：{{姓名 | width(3)}}。"],
        );

        mergeMailTemplate(
            { 姓名: "张三" },
            { document: doc as unknown as Wps.Document, refresh: false },
        );

        expect(doc.bodyParagraphs[0].text).toBe("姓名：张三。");
        const op = doc.operations[doc.operations.length - 1];
        expect(op?.fitWidth).toBe(3);
        expect((op?.end ?? 0) - (op?.start ?? 0)).toBe(2);
    });
});
