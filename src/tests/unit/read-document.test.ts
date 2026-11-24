import JSZip from "jszip";

import { decodeTextBuffer, extractDocxText, formatFileSize } from "@/utils/readDocument";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function docxXml(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}">
  <w:body>${body}</w:body>
</w:document>`;
}

async function makeDocx(body: string): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file("word/document.xml", docxXml(body));
    return zip.generateAsync({ type: "arraybuffer" });
}

describe("decodeTextBuffer", () => {
    it("解码 UTF-8 并去掉 BOM", () => {
        const bytes = new Uint8Array([
            0xef,
            0xbb,
            0xbf,
            ...new TextEncoder().encode("第一段\n第二段"),
        ]);
        expect(decodeTextBuffer(bytes.buffer as ArrayBuffer)).toBe("第一段\n第二段");
    });

    it("UTF-8 解码失败时回退 GB18030", () => {
        // “中文” 的 GBK 编码
        const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);
        expect(decodeTextBuffer(gbk.buffer as ArrayBuffer)).toBe("中文");
    });

    it("识别 UTF-16LE BOM", () => {
        const bytes = new Uint8Array([0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65]);
        expect(decodeTextBuffer(bytes.buffer as ArrayBuffer)).toBe("中文");
    });
});

describe("extractDocxText", () => {
    it("按段落提取正文", async () => {
        const buffer = await makeDocx(
            `<w:p><w:r><w:t>第一段</w:t></w:r></w:p>
             <w:p><w:r><w:t>第二段</w:t></w:r></w:p>`,
        );
        expect(await extractDocxText(buffer)).toBe("第一段\n第二段");
    });

    it("保留制表符、换行并忽略域代码与修订删除内容", async () => {
        const buffer = await makeDocx(
            `<w:p>
                <w:r><w:t>甲</w:t><w:tab/><w:t>乙</w:t><w:br/><w:t>丙</w:t></w:r>
                <w:r><w:instrText>PAGE</w:instrText></w:r>
                <w:del><w:r><w:delText>已删除</w:delText></w:r></w:del>
            </w:p>`,
        );
        expect(await extractDocxText(buffer)).toBe("甲\t乙\n丙");
    });

    it("不是 docx 时给出明确错误", async () => {
        const zip = new JSZip();
        zip.file("word/styles.xml", "<styles />");
        const buffer = await zip.generateAsync({ type: "arraybuffer" });
        await expect(extractDocxText(buffer)).rejects.toThrow("缺少 word/document.xml");
    });
});

describe("formatFileSize", () => {
    it("按量级格式化", () => {
        expect(formatFileSize(512)).toBe("512 B");
        expect(formatFileSize(2048)).toBe("2.0 KB");
        expect(formatFileSize(3 * 1024 * 1024)).toBe("3.00 MB");
    });
});
