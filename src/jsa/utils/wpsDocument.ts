import { pickDirectory } from "@/jsa/utils/fileDialog";
import { normalizePath } from "@/utils/filePath";

/**
 * 正则查找处理
 *
 * 对符合正则表达式的 **段落** 进行查找和处理
 * @param regexp 是正则表达式，应带有 "g" 标志
 * @param callback 是回调函数，如 (range) => {...}
 */
export function regexFindAndProcess(regexp: RegExp, callback: (range: Wps.Range) => void) {
    const doc = ActiveDocument;
    const paras = doc.Paragraphs;
    // 确保有 g 标志
    const globalRegex = new RegExp(
        regexp.source,
        regexp.flags.includes("g") ? regexp.flags : regexp.flags + "g",
    );
    for (let i = 1; i <= paras.Count; i++) {
        const para = paras.Item(i);
        const range = para.Range;

        let match: RegExpExecArray | null = null;
        while ((match = globalRegex.exec(range.Text)) !== null) {
            const startPos = range.Start + match.index;
            const endPos = startPos + match[0].length;
            const matchedRange = doc.Range(startPos, endPos); // 全文中匹配的范围
            callback(matchedRange);
        }
    }
}

/**
 * 获取系统剪切板的文本内容
 */
export function getClipboardText(): string {
    // 插入临时文本框
    const shape = ActiveDocument.Shapes.AddTextbox(1, 100, 100, 200, 30);
    shape.TextFrame.TextRange.Select();
    // 执行粘贴操作
    Application.Selection.Paste();

    const clipText = shape.TextFrame.TextRange.Text;
    shape.Delete();
    return clipText;
}

// 重载签名
export function withUndoRecord<T>(undoName: string, action: () => T): T;
export function withUndoRecord<T>(action: () => T): T;

/**
 * 执行带撤销快照的通用操作
 * @param {string} undoName - 显示在撤销列表中的名称
 * @param {Function} action - 要执行的业务函数（可以返回任意值）
 * @returns action 的返回值
 */
export function withUndoRecord<T>(undoNameOrAction: string | (() => T), action?: () => T): T {
    const undoName =
        typeof undoNameOrAction === "string" ? undoNameOrAction : undoNameOrAction.name || "";
    const actionFn = typeof undoNameOrAction === "string" ? action! : undoNameOrAction;

    Application.ScreenUpdating = false;
    Application.EnableEvents = false;
    const record = Application.UndoRecord;
    record.StartCustomRecord(undoName);
    try {
        return actionFn();
    } finally {
        record.EndCustomRecord();
        Application.ScreenUpdating = true;
        Application.EnableEvents = true;
    }
}

export function showFolderPicker(
    title: string = "请选择文件夹",
    initPath: string = "",
): string | null {
    const doc = ActiveDocument;
    const initialPath = (doc ? doc.Path : "C:\\") + "\\";

    return pickDirectory({
        title,
        storageKey: "LastSelectedFolder",
        initialPath: initPath || initialPath,
        // 与原实现保持一致：显式传入 initPath 时优先使用它
        preferRemembered: !initPath,
    });
}

/**
 * 通过视图切换强制重绘当前 Word 文档的界面。
 *
 * 该函数利用 Word 视图类型切换机制，强制操作系统重绘窗口句柄，以刷新界面缓存。
 * 可用于解决 Vue 在任务面板中调用 JSA 命令后，文档界面更新滞后或显示残影的问题。
 */
export function refreshDocumentView(): void {
    try {
        const view = Application.ActiveWindow.View;
        const currentType = view.Type;
        view.Type = 1; // 切换到草稿
        view.Type = currentType; // 立即切回原视图（触发重绘）
    } catch (e) {
        /* 确保函数静默失败，不影响主流程运行 */
    }
}

/**
 * 通过切换“显示合并数据”的视图模式来刷新邮件合并域显示的值
 *
 * 只能刷新文档编辑区，无法刷新 RibbonUI 中当前记录的序号
 */
export function refreshMailMergeDataView(): void {
    ActiveDocument.ActiveWindow.View.MailMergeDataView = false;
    refreshDocumentView();
    ActiveDocument.ActiveWindow.View.MailMergeDataView = true;
}

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

/** 批量处理时临时关闭保存/覆盖提示与屏幕刷新，减少弹窗打断 */
export function withWpsQuiet<T>(action: () => T): T {
    const app = Application;
    const previousAlerts = app.DisplayAlerts;
    const previousScreenUpdating = app.ScreenUpdating;

    app.DisplayAlerts = 0; // wdAlertsNone
    app.ScreenUpdating = false;
    try {
        return action();
    } finally {
        app.DisplayAlerts = previousAlerts;
        app.ScreenUpdating = previousScreenUpdating;
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
