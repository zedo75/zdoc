import { onBeforeUnmount, onMounted } from "vue";

export type SelectionChangeCallbackFn = (selection: Wps.Selection) => void;

const EVENT_NAME = "WindowSelectionChange";

/**
 * wps.ApiEvent 的事件是按 EventName 整体注册 / 移除的，
 * 多次 Add 会互相覆盖，因此这里维护模块级的单例监听 + 回调集合。
 */
const listeners = new Set<SelectionChangeCallbackFn>();
let registered = false;

function handleSelectionChange(selection: Wps.Selection) {
    if (selection.Type === wdSelectionIP) return; // 光标态直接忽略
    // 复制一份，避免回调里增删监听影响遍历
    for (const listener of [...listeners]) {
        try {
            listener(selection);
        } catch (err) {
            console.error("[useSelectionWatcher] callback error:", err);
        }
    }
}

function registerListener() {
    if (registered) return;
    if (typeof wps === "undefined" || !wps.ApiEvent) return;

    wps.ApiEvent.AddApiEventListener(EVENT_NAME, handleSelectionChange);
    registered = true;
}

function unregisterListener() {
    if (!registered) return;
    if (typeof wps !== "undefined" && wps.ApiEvent) {
        wps.ApiEvent.RemoveApiEventListener(EVENT_NAME);
    }
    registered = false;
}

export function useSelectionWatcher(onChange: SelectionChangeCallbackFn) {
    onMounted(() => {
        listeners.add(onChange);
        registerListener();
    });

    onBeforeUnmount(() => {
        listeners.delete(onChange);
        // 最后一个使用者卸载时才真正移除监听
        if (listeners.size === 0) {
            unregisterListener();
        }
    });
}
