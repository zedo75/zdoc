/**
 * 插件内核：动作入口
 *
 * 动作实现只 import 这三个函数：`runRibbonAction` 由 callbacks 调用，
 * `openPane` / `openDialog` 让插件按「名字」打开页面与弹窗，尺寸、标题、停靠位置
 * 统一写在插件声明的 `panes` / `dialogs` 里，不在动作里重复。
 *
 * 本模块只在点击时才被动态加载（见 `ribbon/callbacks.ts`），因此可以放心
 * import 注册表与任务窗格实现。
 */
import { toggleTaskPane } from "@/ribbon/taskPane";

import { dispatchRibbonAction, findDialog, findPane, prewarmRibbonIndex } from "./registry";

/** 执行控件对应的插件动作（callbacks 在点击时调用） */
export function runRibbonAction(id: RibbonControlId): Promise<void> {
    return dispatchRibbonAction(id);
}

/** 预热「控件 → 插件」索引（只加载纯数据声明） */
export function prewarmKernel(): void {
    prewarmRibbonIndex();
}

/** 打开插件声明的任务窗格 */
export function openPane(name: string): void {
    const pane = findPane(name);
    if (!pane) {
        console.warn(`[plugin] 未声明的任务窗格：${name}`);
        return;
    }
    toggleTaskPane(pane.name, pane.title, pane.dock);
}

/** 打开插件声明的弹窗 */
export function openDialog(name: string): void {
    const entry = findDialog(name);
    if (!entry) {
        console.warn(`[plugin] 未声明的弹窗：${name}`);
        return;
    }

    const { spec } = entry;
    const base = window.location.origin + window.location.pathname;
    Application.ShowDialog(
        `${base}?dialog=${spec.name}`,
        spec.title,
        spec.width ?? 1080,
        spec.height ?? 720,
        spec.modal ?? false,
    );
}
