import { getItem, setItem, STORAGE_KEYS } from "@/jsa/utils/storage";

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
    let folderDialog = Application.FileDialog(msoFileDialogFolderPicker);

    let lastPath = getItem(STORAGE_KEYS.LAST_SELECTED_FOLDER);
    let initialPath: string;

    if (!!lastPath) {
        // 如果上次保存的路径存在且非空，则使用该路径
        initialPath = lastPath;
    } else {
        // 否则使用当前文档所在目录，若文档未保存则使用 C:\
        initialPath = (doc ? doc.Path : "C:\\") + "\\";
    }

    folderDialog.Title = title;
    folderDialog.InitialFileName = initPath || initialPath; // 设置起始路径

    // 显示对话框，返回值 -1 表示用户点击了“确定”
    if (folderDialog.Show() !== -1) {
        return null;
    }
    let selectedPath = folderDialog.SelectedItems.Item(1);
    setItem(STORAGE_KEYS.LAST_SELECTED_FOLDER, selectedPath);
    return selectedPath;
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
