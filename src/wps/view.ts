/**
 * WPS 视图刷新原语
 *
 * JSA 在任务窗格里改完文档后，文档区不一定立刻重绘；这里用「切视图再切回」
 * 强制触发一次窗口重绘。
 */

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
    } catch {
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
