/**
 * 批量重命名：从文档里提取主标题
 *
 * 主标题的识别规则在 `core/analysis.ts`（`mainTitle` 语义），这里只负责
 * 「读一个磁盘文件 → 拿到标题文本 → 关掉文档」这条链路。
 */

import { analyzeDocumentStructure } from "@/core/analysis";
import { readParaInfos } from "@/core/pipeline";
import { closeQuietly, findOpenDocument, openHiddenDocument } from "@/wps/document";
import { pathExists } from "@/wps/fileSystem";

/**
 * 从文档结构分析结果中取第一个主标题块里的 mainTitle 段落。
 *
 * 只取 mainTitle，不把副标题（文号、日期、byline 等）拼进文件名。
 */
export function extractMainTitle(doc: Wps.Document): string {
    const infos = readParaInfos(doc);
    const structure = analyzeDocumentStructure(infos, true);
    const block = structure.mainTitleBlocks[0];
    if (!block) return "";

    const lines: string[] = [];
    for (let index = block.start; index <= block.end; index++) {
        const paragraph = structure.paragraphs[index];
        if (!paragraph || !paragraph.semanticKinds.has("mainTitle")) continue;

        const line = paragraph.text
            .replace(/[\r\n\v\f\x07]/g, " ")
            .replace(/[\t\u3000]/g, " ")
            .trim();
        if (line) lines.push(line);
    }

    return joinTitleLines(lines);
}

/** 中文标题换行时直接拼接；英文/数字之间保留一个空格 */
export function joinTitleLines(lines: string[]): string {
    const isCjk = (char: string) => /[\u3400-\u9fff\uf900-\ufaff]/.test(char);

    return lines.reduce((result, line) => {
        if (!result) return line;
        const previous = result[result.length - 1];
        const next = line[0];
        return result + (isCjk(previous) || isCjk(next) ? "" : " ") + line;
    }, "");
}

/**
 * 读取磁盘文档的主标题。
 *
 * 文档已经打开时复用现有实例（不关闭）；否则后台打开、读取后立即关闭。
 */
export function readMainTitleFromFile(filePath: string): string {
    if (!pathExists(filePath)) throw new Error("源文件不存在");

    const existing = findOpenDocument(filePath);
    const doc = existing ?? openHiddenDocument(filePath);

    try {
        return extractMainTitle(doc);
    } finally {
        if (!existing) closeQuietly(doc);
    }
}
