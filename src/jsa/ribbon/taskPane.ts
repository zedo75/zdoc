import { getPaneUrl } from "@/utils/url";

const KEY = "__paneIdCache__";

/**
 * 读取「页面名 → TaskPane ID」缓存
 *
 * HMR 会清空模块作用域，但 localStorage 的数据还在，会找回之前的 TaskPane ID，因此使用 sessionStorage
 */
function getCache(): Record<string, number> {
    try {
        return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
    } catch {
        return {};
    }
}

/**
 * 根据 ID 获取任务窗格实例
 *
 * @param id 任务窗格 ID
 */
function getPane(id?: number) {
    if (!id) return null;
    try {
        return Application.GetTaskPane(id);
    } catch {
        return null;
    }
}

/**
 * 显示指定窗格（互斥：关闭其它已打开的窗格）。
 *
 * 若目标窗格已存在则直接显示；否则创建新的任务窗格，
 * 并按屏幕宽度设置初始最小宽度，随后解除限制，
 * 最后将窗格 ID 写入缓存以便后续复用。
 *
 * @param pageName src/views 下的页面名，对应 URL 的 `?pane=` 参数
 * @param title 任务窗格标题
 */
export function showTaskPane(pageName: string, title?: string): void {
    const cache = getCache();

    // 隐藏其它窗格
    for (const name in cache) {
        if (name === pageName) continue;
        const other = getPane(cache[name]);
        if (other) other.Visible = false;
    }

    // 显示或创建目标
    let pane = getPane(cache[pageName]);
    if (pane) {
        pane.Visible = true;
        return;
    }

    pane = Application.CreateTaskPane(getPaneUrl(pageName), title);
    if (!pane) {
        console.error(`创建任务窗格失败: ${pageName}`);
        return;
    }
    // 介于 1/3 和 1/4 之间的屏幕宽度
    pane.MinWidth = ~~(Application.System.HorizontalResolution * 0.28 * window.devicePixelRatio);
    pane.Visible = true;
    // 面板显示之前限制最小宽度，避免刚打开时需要用户调整尺寸，随后不再限制
    pane.MinWidth = 1;

    cache[pageName] = pane.ID;
    try {
        sessionStorage.setItem(KEY, JSON.stringify(cache));
    } catch {}
}

/**
 * 切换指定窗格的可见性。
 *
 * 窗格当前可见时隐藏；不可见或尚未创建时调用 showTaskPane 显示。
 *
 * @param pageName src/views 下的页面名，对应 URL 的 `?pane=` 参数
 * @param title 任务窗格标题
 */
export function toggleTaskPane(pageName: string, title?: string): void {
    const pane = getPane(getCache()[pageName]);
    if (pane && pane.Visible) pane.Visible = false;
    else showTaskPane(pageName, title);
}
