import { FLOATING_PANE_MIN_WIDTH, resolveFloatingPaneSize } from "@/utils/taskPaneSize";
import { getPaneUrl } from "@/utils/url";

const KEY = "__paneIdCache__";
const WIDTH_KEY = "__paneFloatingWidth__";
const WATCH_KEY = "__paneLayoutWatchTimer__";

/** 停靠位置 / 宽度的轮询间隔 */
const WATCH_INTERVAL = 400;
/** 初始停靠宽度稳定所需时间 */
const BASELINE_SETTLE_MS = 600;
/** 判定用户手动调整宽度所需的最小变化 */
const WIDTH_EPSILON = 8;

/**
 * 任务窗格停靠位置。
 *
 * - `left` / `right`：同一侧只保留一个窗格（打开新窗格时隐藏同侧其它窗格）；
 * - `auto`：不主动设置停靠位置，按 WPS 默认位置处理；
 *   顶部 / 底部 / 浮动等「非左右」窗格不会被互斥逻辑隐藏。
 */
export type TaskPaneDock = "left" | "right" | "auto";

/**
 * 左右停靠对应的 WPS 枚举值。
 *
 * 用函数而不是模块级常量：枚举由构建插件注入到入口，模块顶层读枚举会让
 * 「在 Node 里 import 本模块」（例如插件契约测试）直接崩掉。
 */
function dockPosition(dock: Exclude<TaskPaneDock, "auto">): number {
    return dock === "left" ? msoCTPDockPositionLeft : msoCTPDockPositionRight;
}

/** 任务窗格对象 */
type Pane = NonNullable<ReturnType<typeof getPane>>;

/** 单个窗格的布局监测状态 */
interface PaneLayoutState {
    id: number;
    /** 最近一次读到的停靠位置 */
    dock: number | null;
    /** 最近一次读到的宽度 */
    width: number | null;
    /** 自动设置的初始宽度，用于区分用户是否手动拖动过 */
    baselineWidth: number | null;
    /** 最近一次写入偏好的宽度，避免重复写 localStorage */
    savedWidth: number | null;
    /** 本次悬浮是否已经检查/修正过尺寸 */
    floatingSized: boolean;
    baselineTimer?: number;
    sizeTimers: number[];
}

/** 页面名 → 布局监测状态 */
const paneStates = new Map<string, PaneLayoutState>();

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

function saveCache(cache: Record<string, number>): void {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(cache));
    } catch {}
}

/** 读取「页面名 → 用户手动调整过的宽度」缓存 */
function getWidthCache(): Record<string, number> {
    try {
        const cached = JSON.parse(localStorage.getItem(WIDTH_KEY) ?? "{}") as unknown;
        return cached && typeof cached === "object" ? (cached as Record<string, number>) : {};
    } catch {
        return {};
    }
}

function getPreferredWidth(pageName: string): number | null {
    const width = getWidthCache()[pageName];
    return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null;
}

function savePreferredWidth(pageName: string, width: number): void {
    if (!Number.isFinite(width) || width <= 0) return;

    const cache = getWidthCache();
    cache[pageName] = Math.round(width);
    try {
        localStorage.setItem(WIDTH_KEY, JSON.stringify(cache));
    } catch {}
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

/** 读取窗格当前的停靠位置；读不到返回 null */
function getPaneDock(pane: Pane | null): number | null {
    if (!pane) return null;
    try {
        const position = pane.DockPosition;
        return typeof position === "number" ? position : null;
    } catch {
        return null;
    }
}

/** 读取窗格当前宽度；读不到返回 null */
function getPaneWidth(pane: Pane | null): number | null {
    if (!pane) return null;
    try {
        const width = pane.Width;
        return typeof width === "number" && Number.isFinite(width) ? width : null;
    } catch {
        return null;
    }
}

/** 是否左右停靠（只有左右停靠时，用户拖出来的宽度才有复用价值） */
function isSideDock(dock: number | null): boolean {
    return dock === msoCTPDockPositionLeft || dock === msoCTPDockPositionRight;
}

/** 读取屏幕分辨率（像素）；读不到返回 null */
function getScreenSize(): { width: number | null; height: number | null } {
    try {
        const { HorizontalResolution, VerticalResolution } = Application.System;
        return {
            width: HorizontalResolution > 0 ? HorizontalResolution : null,
            height: VerticalResolution > 0 ? VerticalResolution : null,
        };
    } catch {
        return { width: null, height: null };
    }
}

/** 清除悬浮尺寸的延迟设置 */
function clearSizeTimers(state: PaneLayoutState): void {
    for (const timer of state.sizeTimers) window.clearTimeout(timer);
    state.sizeTimers = [];
}

/** 清除某个窗格的全部定时器 */
function clearTimers(state: PaneLayoutState): void {
    if (state.baselineTimer !== undefined) {
        window.clearTimeout(state.baselineTimer);
        state.baselineTimer = undefined;
    }
    clearSizeTimers(state);
}

/** 忘记某个窗格的监测状态 */
function forgetPane(pageName: string): void {
    const state = paneStates.get(pageName);
    if (state) clearTimers(state);
    paneStates.delete(pageName);
}

/** 解除任务窗格的最小尺寸限制，允许用户继续拖动调整 */
function resetMinSize(pane: Pane | null): void {
    if (!pane) return;
    try {
        pane.MinWidth = 1;
    } catch {}
    try {
        pane.MinHeight = 1;
    } catch {}
}

/**
 * 把悬浮窗格调整为「用户上次手动调整的宽度 / 1080 × 720」。
 *
 * WPS 拖出任务窗格后会异步创建浮动窗口，并在创建过程中写入一个很窄的默认宽度，
 * 因此这里连续设置几次，用 MinWidth / MinHeight 把浮动窗口撑到目标尺寸。
 */
function applyFloatingSize(pageName: string, pane: Pane, state: PaneLayoutState): void {
    clearSizeTimers(state);

    const screen = getScreenSize();
    const { width, height } = resolveFloatingPaneSize(
        getPreferredWidth(pageName),
        screen.width,
        screen.height,
    );

    const setSize = (): void => {
        if (getPaneDock(pane) !== msoCTPDockPositionFloating) return;

        try {
            // WPS 的浮动窗格对 Width 支持不稳定，实测 MinWidth 才能真正撑开宽度，
            // 因此这里同时设置 Width 和 MinWidth / MinHeight。
            pane.MinWidth = width;
            pane.MinHeight = height;
        } catch {}

        try {
            pane.Width = width;
            pane.Height = height;
        } catch (e) {
            console.warn(`设置悬浮任务窗格尺寸失败: ${pageName}`, e);
        }
    };

    // 拖出后 WPS 异步创建浮动窗口，连续设置几次，避免被默认的极窄宽度覆盖
    for (const delay of [0, 150, 400, 800]) {
        state.sizeTimers.push(window.setTimeout(setSize, delay));
    }
}

/** 记录停靠状态下的初始宽度，用于区分「自动宽度」和「用户手动拖出来的宽度」 */
function scheduleBaseline(pane: Pane, state: PaneLayoutState): void {
    if (state.baselineWidth !== null || state.baselineTimer !== undefined) return;

    state.baselineTimer = window.setTimeout(() => {
        state.baselineTimer = undefined;
        if (!isSideDock(state.dock)) return;

        const width = getPaneWidth(pane);
        if (width === null || width <= 0) return;

        state.baselineWidth = width;
        state.width = width;
    }, BASELINE_SETTLE_MS);
}

/** 跟踪停靠宽度，并把用户手动调整过的宽度写入偏好 */
function trackPaneWidth(
    pageName: string,
    pane: Pane,
    state: PaneLayoutState,
    dock: number,
    width: number | null,
): void {
    const previousWidth = state.width;
    if (width !== null && width > 0) state.width = width;

    if (!isSideDock(dock)) return;

    if (state.baselineWidth === null) {
        scheduleBaseline(pane, state);
        return;
    }

    if (width === null || width <= 0) return;
    if (Math.abs(width - state.baselineWidth) <= WIDTH_EPSILON) return;
    if (previousWidth === null || Math.abs(width - previousWidth) >= 1) return;
    if (state.savedWidth !== null && Math.abs(width - state.savedWidth) <= WIDTH_EPSILON) return;

    // 连续两次轮询读到相同宽度才认为拖动结束，避免把停靠动画的中间值写成偏好
    state.savedWidth = width;
    savePreferredWidth(pageName, width);
}

/** 立即提交停靠状态下的手动宽度（用于拖出前最后一次采样） */
function flushDockedWidth(pageName: string, pane: Pane, state: PaneLayoutState): void {
    if (!isSideDock(state.dock) || state.baselineWidth === null) return;

    // 拖出瞬间 WPS 可能已经把 Width 改成了浮动窗的默认极窄值，
    // 因此取「停靠期间最后一次采样」和「当前值」中较大的一个。
    const currentWidth = getPaneWidth(pane);
    const latest = Math.max(state.width ?? 0, currentWidth ?? 0);
    if (latest <= 0) return;
    if (Math.abs(latest - state.baselineWidth) <= WIDTH_EPSILON) return;

    state.savedWidth = latest;
    savePreferredWidth(pageName, latest);
}

/** 停靠位置变化：记录宽度、修正悬浮尺寸、重置最小尺寸限制 */
function handleDockChange(
    pageName: string,
    pane: Pane,
    state: PaneLayoutState,
    nextDock: number,
): void {
    const previousDock = state.dock;

    // 离开左右停靠前，把用户最后一次调整的宽度保存下来（含拖成浮动）
    if (isSideDock(previousDock)) {
        flushDockedWidth(pageName, pane, state);
    }

    clearTimers(state);
    state.dock = nextDock;

    if (nextDock === msoCTPDockPositionFloating) {
        state.floatingSized = true;
        applyFloatingSize(pageName, pane, state);
        return;
    }

    state.floatingSized = false;
    resetMinSize(pane);

    if (isSideDock(nextDock)) scheduleBaseline(pane, state);
}

/** 轮询所有已缓存的窗格，检测拖动停靠、宽度变化 */
function pollPaneLayouts(): void {
    const cache = getCache();

    for (const pageName in cache) {
        const id = cache[pageName];
        const pane = getPane(id);
        if (!pane) {
            forgetPane(pageName);
            continue;
        }

        const dock = getPaneDock(pane);
        if (dock === null) continue;

        const width = getPaneWidth(pane);
        const state = paneStates.get(pageName);

        if (!state || state.id !== id) {
            forgetPane(pageName);

            const next: PaneLayoutState = {
                id,
                dock,
                width,
                baselineWidth: null,
                savedWidth: null,
                floatingSized: false,
                sizeTimers: [],
            };
            paneStates.set(pageName, next);

            if (dock === msoCTPDockPositionFloating) {
                next.floatingSized = true;
                // 上次会话遗留的悬浮窗格可能还是极窄宽度，直接修正
                if (width === null || width < FLOATING_PANE_MIN_WIDTH) {
                    applyFloatingSize(pageName, pane, next);
                }
            } else if (isSideDock(dock)) {
                scheduleBaseline(pane, next);
            }
            continue;
        }

        if (state.dock !== dock) {
            handleDockChange(pageName, pane, state, dock);
            continue;
        }

        if (dock === msoCTPDockPositionFloating && !state.floatingSized) {
            state.floatingSized = true;
            if (width === null || width < FLOATING_PANE_MIN_WIDTH) {
                applyFloatingSize(pageName, pane, state);
            }
        }

        trackPaneWidth(pageName, pane, state, dock, width);
    }
}

/** 启动布局轮询（重复调用会替换旧定时器，避免 HMR 后出现多份轮询） */
function startPaneWatch(): void {
    const holder = window as unknown as Record<string, number | undefined>;

    const previous = holder[WATCH_KEY];
    if (previous !== undefined) window.clearInterval(previous);

    holder[WATCH_KEY] = window.setInterval(pollPaneLayouts, WATCH_INTERVAL);
}

/**
 * 隐藏与目标窗格同侧的其它窗格。
 *
 * 只有目标确实停靠在左侧或右侧时才执行互斥：
 * 顶部 / 底部 / 浮动窗格不参与，保持各自的 `Visible` 状态。
 *
 * @param pageName 当前要显示的页面名（不隐藏自己）
 * @param cache 页面名 → TaskPane ID
 * @param dock 目标窗格实际的停靠位置
 */
function hideOtherPanesOnSameSide(
    pageName: string,
    cache: Record<string, number>,
    dock: number | null,
): void {
    if (!isSideDock(dock)) return;

    for (const name in cache) {
        if (name === pageName) continue;

        const other = getPane(cache[name]);
        if (!other) continue;
        if (getPaneDock(other) !== dock) continue;

        try {
            if (other.Visible) other.Visible = false;
        } catch (e) {
            console.warn(`隐藏任务窗格失败: ${name}`, e);
        }
    }
}

/**
 * 显示指定窗格（按停靠位置互斥：左侧只保留一个，右侧只保留一个）。
 *
 * 若目标窗格已存在则直接显示；否则创建新的任务窗格，
 * 按 `dock` 设置停靠位置（`auto` 时沿用 WPS 默认位置），
 * 并按屏幕宽度设置初始最小宽度，随后解除限制，
 * 最后将窗格 ID 写入缓存以便后续复用。
 *
 * 显示后会持续监测停靠位置：用户把窗格拖成 `msoCTPDockPositionFloating` 时，
 * 自动套用上次手动调整的宽度（没有则用 1080 × 720），避免 WPS 默认的极窄浮动窗。
 *
 * @param pageName src/views 下的页面名，对应 URL 的 `?pane=` 参数
 * @param title 任务窗格标题
 * @param dock 期望停靠位置，默认右侧
 */
export function showTaskPane(pageName: string, title?: string, dock: TaskPaneDock = "right"): void {
    startPaneWatch();

    const cache = getCache();
    const existing = getPane(cache[pageName]);

    if (existing) {
        try {
            // 已存在时以其实际停靠位置为准：用户手动拖到哪一侧，就与哪一侧互斥
            hideOtherPanesOnSameSide(pageName, cache, getPaneDock(existing));
            existing.Visible = true;

            // 重新显示时允许再检查一次悬浮宽度（例如上次残留的极窄浮动窗）
            const state = paneStates.get(pageName);
            if (state) state.floatingSized = false;
            return;
        } catch (e) {
            // 窗格对象可能已被 WPS 销毁，退回创建新窗格
            console.warn(`显示已有任务窗格失败，将重新创建: ${pageName}`, e);
        }
    }

    forgetPane(pageName);

    const pane = Application.CreateTaskPane(getPaneUrl(pageName), title);
    if (!pane) {
        console.error(`创建任务窗格失败: ${pageName}`);
        return;
    }

    const requestedDock = dock === "auto" ? null : dockPosition(dock);
    if (requestedDock !== null) {
        try {
            pane.DockPosition = requestedDock;
        } catch (e) {
            console.warn(`设置任务窗格停靠位置失败: ${pageName}`, e);
        }

        // 停靠位置已生效时先隐藏同侧窗格，避免新窗格显示后闪一下再隐藏
        if (getPaneDock(pane) === requestedDock) {
            hideOtherPanesOnSameSide(pageName, cache, requestedDock);
        }
    }

    // 介于 1/3 和 1/4 之间的屏幕宽度
    pane.MinWidth = ~~(Application.System.HorizontalResolution * 0.28 * window.devicePixelRatio);
    pane.Visible = true;

    // 个别 WPS 版本在 Visible 前设置 DockPosition 不生效，显示后再校正一次
    if (requestedDock !== null && getPaneDock(pane) !== requestedDock) {
        try {
            pane.DockPosition = requestedDock;
        } catch (e) {
            console.warn(`校正任务窗格停靠位置失败: ${pageName}`, e);
        }
    }

    // 以实际停靠位置为准；读不到时退回期望位置（避免创建后出现两个同侧窗格）
    hideOtherPanesOnSameSide(pageName, cache, getPaneDock(pane) ?? requestedDock);

    // 面板显示之前限制最小宽度，避免刚打开时需要用户调整尺寸，随后不再限制
    pane.MinWidth = 1;

    cache[pageName] = pane.ID;
    saveCache(cache);
}

/**
 * 切换指定窗格的可见性。
 *
 * 窗格当前可见时隐藏；不可见或尚未创建时调用 showTaskPane 显示。
 *
 * @param pageName src/views 下的页面名，对应 URL 的 `?pane=` 参数
 * @param title 任务窗格标题
 * @param dock 创建时的期望停靠位置，默认右侧
 */
export function toggleTaskPane(
    pageName: string,
    title?: string,
    dock: TaskPaneDock = "right",
): void {
    const pane = getPane(getCache()[pageName]);
    try {
        if (pane && pane.Visible) {
            pane.Visible = false;
            return;
        }
    } catch (e) {
        // 窗格对象可能已被销毁：继续走 showTaskPane，由它重建
        console.warn(`切换任务窗格可见性失败，将重新显示: ${pageName}`, e);
    }
    showTaskPane(pageName, title, dock);
}
