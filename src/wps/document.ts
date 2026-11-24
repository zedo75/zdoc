/**
 * WPS 文档生命周期原语
 *
 * 打开 / 关闭 / 查找 / 另存 / 对比。只处理 `Application.Documents`，
 * 不关心文档内容（内容排版见 `core/`）。
 */

import { normalizePath } from "@/utils/filePath";

export interface OpenDocumentOptions {
    /** 只读打开，默认 false */
    readOnly?: boolean;
    /** 是否显示窗口，默认 true；后台批处理传 false */
    visible?: boolean;
    /** 是否加入最近使用列表，默认 false */
    addToRecentFiles?: boolean;
}

/** 查找某个磁盘文件是否已在 WPS 中打开 */
export function findOpenDocument(filePath: string): Wps.Document | null {
    try {
        const docs = Application.Documents;
        const target = normalizePath(filePath);
        for (let i = 1; i <= docs.Count; i++) {
            try {
                const doc = docs.Item(i) as Wps.Document;
                const fullName = doc.FullName as string | undefined;
                if (fullName && normalizePath(fullName) === target) return doc;
            } catch {
                // 单个文档无法访问时忽略
            }
        }
    } catch {
        // 非 WPS 环境或文档集合不可用时忽略
    }
    return null;
}

/**
 * 打开文档。
 *
 * 显式传入全部参数，避免不同 WPS 版本在缺省参数上弹出编码/转换对话框。
 */
export function openDocument(filePath: string, options: OpenDocumentOptions = {}): Wps.Document {
    const { readOnly = false, visible = true, addToRecentFiles = false } = options;

    const doc = Application.Documents.Open(
        filePath,
        false, // ConfirmConversions
        readOnly,
        addToRecentFiles,
        "", // PasswordDocument
        "", // PasswordTemplate
        false, // Revert
        "", // WritePasswordDocument
        "", // WritePasswordTemplate
        wdOpenFormatAuto, // Format
        undefined, // Encoding
        visible,
        false, // OpenAndRepair
        wdLeftToRight, // DocumentDirection
        true, // NoEncodingDialog
    ) as unknown as Wps.Document;

    if (!doc) throw new Error("无法打开文档");
    return doc;
}

/** 后台打开文档（不显示窗口） */
export function openHiddenDocument(filePath: string): Wps.Document {
    return openDocument(filePath, { visible: false });
}

/** 关闭文档并放弃未保存的修改，忽略已关闭等异常 */
export function closeQuietly(doc: Wps.Document | null): void {
    if (!doc) return;
    try {
        doc.Close(wdDoNotSaveChanges);
    } catch {
        // 已关闭或文档不可访问时忽略
    }
}

/** 保持原扩展名另存：.docx 用 OOXML，.doc 用 97-2003，.wps 交给 WPS 按扩展名推断 */
export function saveAsSameFormat(doc: Wps.Document, target: string, ext: string): void {
    if (ext === ".docx") {
        doc.SaveAs2(target, wdFormatXMLDocument);
    } else if (ext === ".doc") {
        doc.SaveAs2(target, wdFormatDocument);
    } else {
        doc.SaveAs2(target);
    }
}

/**
 * 调用 WPS 自带的文档对比，在新文档中显示修订与批注。
 *
 * `CompareDocuments` 要求两个参数都是已打开的 Document 对象，
 * 本函数负责：按需后台打开 → 对比 → 关闭本次打开的原文档（保留结果文档）。
 */
export function compareDocuments(
    originalPath: string,
    revisedPath: string,
    author = "批量排版工具",
): Wps.Document {
    let originalDoc: Wps.Document | null = null;
    let revisedDoc: Wps.Document | null = null;
    let openedOriginal = false;
    let openedRevised = false;

    try {
        originalDoc = findOpenDocument(originalPath);
        if (!originalDoc) {
            originalDoc = openDocument(originalPath, { readOnly: true });
            openedOriginal = true;
        }

        revisedDoc = findOpenDocument(revisedPath);
        if (!revisedDoc) {
            revisedDoc = openDocument(revisedPath, { readOnly: true });
            openedRevised = true;
        }

        const result = Application.CompareDocuments(
            originalDoc,
            revisedDoc,
            2, // wdCompareDestinationNew
            1, // wdGranularityWordLevel
            true, // CompareFormatting
            true, // CompareCaseChanges
            true, // CompareWhitespace
            true, // CompareTables
            true, // CompareHeaders
            true, // CompareFootnotes
            true, // CompareTextboxes
            true, // CompareFields
            true, // CompareComments
            true, // CompareMoves
            author, // RevisedAuthor
            true, // IgnoreAllComparisonWarnings
        ) as Wps.Document | undefined;

        if (!result) throw new Error("CompareDocuments 未返回结果文档");

        try {
            const win = result.ActiveWindow;
            if (win) win.Visible = true;
        } catch {
            // 部分版本 ActiveWindow 不可用，忽略
        }

        return result;
    } finally {
        if (openedOriginal) closeQuietly(originalDoc);
        if (openedRevised) closeQuietly(revisedDoc);
    }
}
