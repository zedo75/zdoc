/** 悬浮任务窗格的默认尺寸 */
export const FLOATING_PANE_DEFAULT_WIDTH = 1080;
export const FLOATING_PANE_DEFAULT_HEIGHT = 720;

/** 悬浮任务窗格允许的最小尺寸，避免再次变成一条细缝 */
export const FLOATING_PANE_MIN_WIDTH = 360;
export const FLOATING_PANE_MIN_HEIGHT = 240;

/** 与屏幕边缘保留的间距 */
const SCREEN_MARGIN = 40;

/**
 * 计算悬浮任务窗格的最终尺寸。
 *
 * - 有用户手动调整过的宽度时优先使用；
 * - 否则回退到 1080 × 720；
 * - 根据屏幕分辨率做一次收敛，避免窗口超出屏幕。
 *
 * @param preferredWidth 用户手动调整过的宽度
 * @param screenWidth 屏幕宽度（像素）
 * @param screenHeight 屏幕高度（像素）
 */
export function resolveFloatingPaneSize(
    preferredWidth: number | null | undefined,
    screenWidth: number | null | undefined,
    screenHeight: number | null | undefined,
): { width: number; height: number } {
    const maxWidth =
        screenWidth && screenWidth > 0
            ? Math.max(FLOATING_PANE_MIN_WIDTH, Math.round(screenWidth - SCREEN_MARGIN))
            : Number.POSITIVE_INFINITY;
    const requestedWidth =
        preferredWidth && preferredWidth > 0 ? preferredWidth : FLOATING_PANE_DEFAULT_WIDTH;
    const width = Math.min(Math.max(Math.round(requestedWidth), FLOATING_PANE_MIN_WIDTH), maxWidth);

    const maxHeight =
        screenHeight && screenHeight > 0
            ? Math.max(FLOATING_PANE_MIN_HEIGHT, Math.round(screenHeight - SCREEN_MARGIN))
            : Number.POSITIVE_INFINITY;
    const height = Math.min(FLOATING_PANE_DEFAULT_HEIGHT, maxHeight);

    return { width, height };
}
