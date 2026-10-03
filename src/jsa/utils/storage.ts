// 存储键名常量
export const STORAGE_KEYS = {
    DOC_SETTINGS_ID: "official_taskpane_id",
    IMAGE_RESIZE_TASKPANE_ID: "image_resize_taskpane_id",
    TEXT_COMPARE_TASKPANE_ID: "text_compare_taskpane_id",
    LAST_SELECTED_FOLDER: "LastSelectedFolder",
    TYPO: "typo",
    PAGE: "page",
    HEADER: "header",
    FOOTER: "footer",
};

export function getItem(key: string): string | null {
    return Application.PluginStorage.getItem(key) || null;
}

export function setItem(key: string, value: string): void {
    Application.PluginStorage.setItem(key, value);
}

export function removeItem(key: string): void {
    Application.PluginStorage.removeItem(key);
}
