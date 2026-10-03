import { getItem, removeItem, setItem, STORAGE_KEYS } from "@/jsa/utils/storage";
import { getPaneUrl } from "@/utils/url";

// 窗格标识 → src/views 下的页面名（URL 的 ?pane= 参数）
const PANE_MAP: Record<string, string> = {
    [STORAGE_KEYS.DOC_SETTINGS_ID]: "settings",
    [STORAGE_KEYS.IMAGE_RESIZE_TASKPANE_ID]: "image-resize",
    [STORAGE_KEYS.TEXT_COMPARE_TASKPANE_ID]: "text-compare",
    [STORAGE_KEYS.HEADER_FOOTER_TASKPANE_ID]: "header-footer",
};

const paneIdCache = new Map<string, number>();

function getPaneId(key: string): number | null {
    if (paneIdCache.has(key)) return paneIdCache.get(key)!;
    const stored = getItem(key);
    if (stored) {
        const id = Number(stored);
        paneIdCache.set(key, id);
        return id;
    }
    return null;
}

function hideAllOtherPanes(exclude: string): void {
    for (const key of Object.keys(PANE_MAP)) {
        if (key === exclude) continue;
        const paneId = getPaneId(key);
        if (!paneId) continue;
        const taskPane = Application.GetTaskPane(paneId);
        if (taskPane) {
            taskPane.Visible = false;
        } else {
            paneIdCache.delete(key);
            removeItem(key);
        }
    }
}

export function showTaskPane(key: string): void {
    hideAllOtherPanes(key);

    let paneId = getPaneId(key);
    let taskPane = paneId ? Application.GetTaskPane(paneId) : null;

    if (!taskPane) {
        if (paneId) {
            paneIdCache.delete(key);
            removeItem(key);
        }
        const paneName = PANE_MAP[key];
        if (!paneName) {
            console.error(`找不到窗格页面: ${key}`);
            return;
        }
        const url = getPaneUrl(paneName);
        taskPane = Application.CreateTaskPane(url);
        // 介于 1/3 和 1/4 之间的屏幕宽度
        const width = Application.System.HorizontalResolution * 0.28 * window.devicePixelRatio;
        taskPane.MinWidth = ~~width;
        if (!taskPane) {
            console.error(`创建任务窗格失败: ${key}`);
            return;
        }
        paneIdCache.set(key, taskPane.ID);
        setItem(key, String(taskPane.ID));
    }

    taskPane.Visible = true;
}

export function toggleTaskPane(key: string): void {
    const paneId = getPaneId(key);
    const taskPane = paneId ? Application.GetTaskPane(paneId) : null;

    if (taskPane) {
        if (taskPane.Visible) {
            taskPane.Visible = false;
        } else {
            showTaskPane(key);
        }
    } else {
        showTaskPane(key);
    }
}
