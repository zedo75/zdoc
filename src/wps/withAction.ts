/**
 * 执行带撤销快照的通用操作
 * @param {string} undoNameOrAction - 显示在撤销列表中的名称
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

/**
 * 批量处理时临时关闭保存/覆盖提示与屏幕刷新，减少弹窗打断。
 *
 * 与 {@link withUndoRecord} 的区别：本函数只切换全局开关，不建立撤销记录，
 * 适合「后台静默处理大量文档」的场景。
 */
export function withWpsQuiet<T>(action: () => T): T {
    const previousAlerts = Application.DisplayAlerts;
    const previousScreenUpdating = Application.ScreenUpdating;

    Application.DisplayAlerts = 0; // 用 wdAlertsNone 过不了 vitest
    Application.ScreenUpdating = false;
    try {
        return action();
    } finally {
        Application.DisplayAlerts = previousAlerts;
        Application.ScreenUpdating = previousScreenUpdating;
    }
}
