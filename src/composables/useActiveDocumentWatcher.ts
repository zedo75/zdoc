import { onBeforeUnmount, onMounted } from "vue";

export type WindowActivationCallbackFn = (Document: Wps.Document, Window: Wps.Window) => void;

export function useActiveDocumentWatcher(onChange: (doc: Wps.Document) => void) {
    const eventName = "WindowActivate";

    const handleWindowActivate: WindowActivationCallbackFn = (doc) => {
        onChange(doc);
    };

    onMounted(() => {
        if (typeof wps !== "undefined" && wps.ApiEvent) {
            // 注册事件监听
            wps.ApiEvent.AddApiEventListener(eventName, handleWindowActivate);
        }
    });

    onBeforeUnmount(() => {
        if (typeof wps !== "undefined" && wps.ApiEvent) {
            // 取消事件监听
            wps.ApiEvent.RemoveApiEventListener(eventName);
        }
    });
}
