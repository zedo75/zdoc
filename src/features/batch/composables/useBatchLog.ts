export type BatchLogType = "success" | "error" | "info";

export interface BatchLogItem {
    time: string;
    message: string;
    type: BatchLogType;
}

function formatTime(date = new Date()): string {
    const pad = (value: number) => value.toString().padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 批量处理日志：带时间戳、自动滚到底部 */
export function useBatchLog() {
    const logs = ref<BatchLogItem[]>([]);
    const logContainerRef = ref<HTMLElement | null>(null);

    function scrollToBottom(): void {
        if (logContainerRef.value) {
            logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight;
        }
    }

    function addLog(message: string, type: BatchLogType = "info"): void {
        logs.value.push({ time: formatTime(), message, type });
        nextTick(scrollToBottom);
    }

    function clearLogs(): void {
        logs.value = [];
    }

    return { logs, logContainerRef, addLog, clearLogs };
}
