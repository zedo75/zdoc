/**
 * 本地文件读取：把 .txt / .md / .docx 转成纯文本。
 *
 * 只在浏览器 / WPS 前端运行，不依赖 Node；docx 解析库按需加载，
 * 避免没用文件比对时把 JSZip / xmldom 带进首屏。
 */
const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** 单个文件大小上限（20 MB），避免误选超大文件卡死界面 */
export const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024;

/** 支持的文件扩展名 */
export function isSupportedDocumentFile(fileName: string): boolean {
    return /\.(txt|md|markdown|docx)$/i.test(fileName);
}

/** 人类可读的文件大小 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 解码纯文本文件。
 *
 * 中文 Windows 下的 .txt 经常是 GBK，先严格按 UTF-8 解，失败再回退 GB18030。
 */
export function decodeTextBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);

    // UTF-16 BOM（Windows 记事本另存为 Unicode 时常见）
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        try {
            return new TextDecoder("utf-16be").decode(bytes.subarray(2));
        } catch {
            // 个别内核不支持 utf-16be，继续走 UTF-8 / GB18030
        }
    }

    // 去掉 UTF-8 BOM
    const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    const body = start ? bytes.subarray(start) : bytes;

    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
        try {
            return new TextDecoder("gb18030").decode(body);
        } catch {
            return new TextDecoder("utf-8").decode(body);
        }
    }
}

function collectNodeText(node: Node): string {
    let text = "";

    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType !== 1) continue;

        const element = child as Element;
        const localName = element.localName || element.nodeName.split(":").pop() || "";

        if (localName === "t") {
            text += element.textContent ?? "";
            continue;
        }
        if (localName === "tab") {
            text += "\t";
            continue;
        }
        if (localName === "br" || localName === "cr") {
            text += "\n";
            continue;
        }
        // 域代码、修订删除内容不进入正文
        if (localName === "instrText" || localName === "delText" || localName === "pPr") {
            continue;
        }

        text += collectNodeText(element);
    }

    return text;
}

/** 从 docx 的 word/document.xml 提取正文，段落之间以换行分隔 */
export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
    const [{ default: JSZip }, { DOMParser }] = await Promise.all([
        import("jszip"),
        import("@xmldom/xmldom"),
    ]);

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) throw new Error("不是有效的 .docx 文件（缺少 word/document.xml）");

    const xml = await documentXml.async("string");
    const document = new DOMParser().parseFromString(xml, "application/xml");

    const namespaced = document.getElementsByTagNameNS(WORD_NAMESPACE, "p");
    // 个别工具生成的是 Strict OOXML（命名空间不同），回退按前缀查找
    const paragraphs = namespaced.length
        ? Array.from(namespaced)
        : Array.from(document.getElementsByTagName("w:p"));

    const lines: string[] = [];
    for (const paragraph of paragraphs) {
        lines.push(collectNodeText(paragraph).replace(/\r\n?/g, "\n"));
    }

    return lines.join("\n");
}

/** 读取用户选择的一个文件，返回纯文本 */
export async function readDocumentFile(file: File): Promise<string> {
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
        throw new Error(
            `文件过大（${formatFileSize(file.size)}），请选择 ${formatFileSize(
                MAX_DOCUMENT_FILE_SIZE,
            )} 以内的文件`,
        );
    }

    const name = file.name.toLowerCase();
    if (name.endsWith(".doc")) {
        throw new Error("暂不支持旧版 .doc，请先在 WPS 中另存为 .docx");
    }

    const buffer = await file.arrayBuffer();

    if (name.endsWith(".docx")) {
        const text = await extractDocxText(buffer);
        return text.replace(/\r\n?/g, "\n");
    }

    return decodeTextBuffer(buffer).replace(/\r\n?/g, "\n");
}
