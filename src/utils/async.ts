/** 等待指定毫秒数 */
export function delay(ms = 0): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 让出主线程，给 Vue 一次渲染机会。
 *
 * WPS 的 COM 调用是同步的，批量循环里必须主动让出，否则进度条不会刷新。
 */
export function yieldToUi(): Promise<void> {
    return delay(0);
}
