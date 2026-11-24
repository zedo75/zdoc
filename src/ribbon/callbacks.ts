/**
 * Ribbon 回调
 *
 * 由 `main.ts` 入口静态导入，但只在非弹窗模式调用 `installRibbonCallbacks()`：
 * 弹窗只加载对应组件，不能在这里预热动作分发。因此本文件不要 import 任何业务代码、
 * Vue、Element Plus —— 一旦引入，回调注册就会被它们的解析/执行拖后，
 * WPS 首次绘制功能区时可能还拿不到 `window.getImage`，表现为图标空白（重启后才恢复）。
 *
 * 图标映射是唯一的静态依赖：它只是「控件 id → 图片文件名」的纯数据（`kernel/icons.ts`），
 * 体积可忽略。真正的业务实现通过 `loadKernel()` 懒加载 `@/kernel/dispatch`。
 */
/** 控件 id → 图片文件名的聚合表在 kernel 里；这里只做同步查询 */
import { resolveControlImage } from "#kernel/icons";

interface RibbonBindings {
    onAction: (control: Kso.RibbonControl) => boolean;
    getImage: (control: Kso.RibbonControl) => string;
    onGetLabel: (control: Kso.RibbonControl) => string;
    onGetEnabled: (control: Kso.RibbonControl) => boolean;
}

function getImage(control: Kso.RibbonControl): string {
    return resolveControlImage(control.Id);
}

function onGetEnabled(_control: Kso.RibbonControl): boolean {
    return true;
}

/**
 * 动态标签钩子。
 *
 * 目前没有需要按状态改标签的控件；保留注册是为了以后 ribbon.xml 里加 `getLabel`
 * 时不用再动回调安装。
 */
function onGetLabel(_control: Kso.RibbonControl): string {
    return "";
}

/* ---------------------------------- 动作懒加载 ---------------------------------- */

type KernelModule = typeof import("@/kernel/dispatch");

let kernelPromise: Promise<KernelModule> | undefined;

/** 加载（并缓存）插件内核的派发模块；首次点击时才会真正加载插件动作 */
function loadKernel(): Promise<KernelModule> {
    kernelPromise ??= import("@/kernel/dispatch");
    return kernelPromise;
}

/**
 * 空闲时预热「控件 → 插件」索引。
 *
 * 目的是把「首次点击不知道该加载哪个插件」的成本挪到启动后的空闲期；
 * 预热失败不影响后续点击（下次会重新发起 import）。
 */
function prewarmKernel(): void {
    const run = () => {
        void loadKernel()
            .then((mod) => mod.prewarmKernel())
            .catch((err) => console.warn("插件内核预热失败:", err));
    };

    if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 3000 });
    } else {
        setTimeout(run, 1500);
    }
}

function onAction(control: Kso.RibbonControl): boolean {
    const eleId = control.Id as RibbonControlId;

    // 必须同步返回 true，否则 WPS 认为回调失败；真正的执行放到微任务里
    void loadKernel()
        .then((mod) => mod.runRibbonAction(eleId))
        .catch((e) => {
            console.error(`执行按钮 ${eleId} 动作失败`, e);
        });

    return true;
}

/**
 * 首次安装后图标空白的兜底：启动完成后让 WPS 重新取一次图标。
 *
 * WPS 在「自定义选项卡第一次显示」时调用 `getImage`，若那一刻回调尚未注册（冷启动 /
 * 首次安装），图标会保持空白且不会自动重试。`Application.ribbonUI.Invalidate()` 会刷新
 * 整个功能区并重新调用 `getImage`（官方已知：刷新后通常要鼠标移到功能区或文档区才重绘，
 * 因此不保证瞬时生效）。只在加载项主页面执行，避免每个弹窗/任务窗格都触发刷新。
 */
function refreshRibbonOnce(): void {
    if (window.location.search) return;

    window.setTimeout(() => {
        try {
            Application.ribbonUI.Invalidate();
        } catch (e) {
            console.warn("刷新功能区失败:", e);
        }
    }, 2000);
}

/**
 * 把回调挂到 window 上（ribbon.xml 通过函数名引用）。
 *
 * 只在非弹窗入口调用；可重复调用，HMR 或主页面重新执行后覆盖即可。
 */
export function installRibbonCallbacks(): void {
    const bindings: RibbonBindings = { onAction, getImage, onGetLabel, onGetEnabled };
    Object.assign(window as unknown as Record<string, unknown>, bindings);
    prewarmKernel();
    refreshRibbonOnce();
}
