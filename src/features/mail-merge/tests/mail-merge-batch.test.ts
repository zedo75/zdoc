import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mergeExcelRecords } from "@/features/mail-merge/commands/mailMergeBatch";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const TEMPLATE_PATH = "C:\\tmp\\模板.docx";
const OUTPUT_DIR = "C:\\out";

function p(text: string): string {
    return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function doc(body: string): string {
    return `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;
}

async function makeTemplate(body: string): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file("word/document.xml", doc(body));
    return zip.generateAsync({ type: "arraybuffer" });
}

const written = new Map<string, string>();

beforeEach(() => {
    written.clear();
    (globalThis as unknown as Record<string, unknown>).Application = {
        ScreenUpdating: true,
        EnableEvents: true,
        DisplayAlerts: 1,
        Env: {
            GetTempPath: () => "C:\\tmp",
        },
        FileSystem: {
            Exists: (path: string) => path === TEMPLATE_PATH,
            Mkdir: () => {
                // noop
            },
            ReadFileAsArrayBuffer: () => templateBuffer,
            writeAsBinaryString: (path: string, data: string) => {
                written.set(path, data);
                return true;
            },
            copyFileSync: () => false,
        },
    };
});

afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).Application;
});

let templateBuffer: ArrayBuffer;

describe("Excel batch orchestration", () => {
    it("writes one DOCX for row mode", async () => {
        templateBuffer = await makeTemplate(p("姓名：{{姓名}}"));
        const result = await mergeExcelRecords({
            templatePath: TEMPLATE_PATH,
            records: [{ 姓名: "张三" }, { 姓名: "李四" }],
            rowNumbers: [2, 3],
            outputDir: OUTPUT_DIR,
            namePattern: "{{姓名}}",
        });

        expect(result.status).toBe("success");
        expect(result.mode).toBe("none");
        expect(result.results).toHaveLength(2);
        expect(result.results[0].outputPath).toBe("C:\\out\\张三.docx");
        expect(written.size).toBe(2);
    });

    it("renders group mode into one file per group", async () => {
        templateBuffer = await makeTemplate(
            [
                p("{{#each group by:姓名 keep:true}}"),
                p("{{#if @index == 1}}组：{{@group.姓名}}（{{@count}}）{{/if}}"),
                p("{{@index}}.{{家人姓名}}"),
                p("{{/each}}"),
            ].join(""),
        );

        const result = await mergeExcelRecords({
            templatePath: TEMPLATE_PATH,
            records: [
                { 姓名: "小王", 家人姓名: "A" },
                { 姓名: "", 家人姓名: "B" },
                { 姓名: "小李", 家人姓名: "C" },
            ],
            rowNumbers: [2, 3, 4],
            outputDir: OUTPUT_DIR,
            namePattern: "{{姓名}}",
        });

        expect(result.status).toBe("success");
        expect(result.mode).toBe("group");
        expect(result.results).toHaveLength(2);
        expect(written.size).toBe(2);
        expect(result.results.map((item) => item.rowNumber)).toEqual([2, 4]);
    });
});
