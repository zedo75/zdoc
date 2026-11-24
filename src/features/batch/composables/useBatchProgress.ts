/**
 * 批量任务进度状态。
 *
 * 批量排版、重命名、转换等弹窗共用；`running` 同时用于禁用操作按钮，
 * 避免任务执行期间再次触发或修改列表。
 */
export function useBatchProgress() {
    const running = ref(false);
    const done = ref(0);
    const total = ref(0);

    const percent = computed(() => {
        if (total.value <= 0) return 0;
        return Math.min(100, Math.round((done.value / total.value) * 100));
    });

    /** 开始一轮批量任务 */
    function start(count: number): void {
        running.value = true;
        done.value = 0;
        total.value = count;
    }

    /** 更新已完成数量（index 从 1 开始） */
    function update(completed: number, overall = total.value): void {
        done.value = completed;
        total.value = overall;
    }

    /** 已处理数 +1（用于不关心总数的简单场景） */
    function advance(): void {
        done.value++;
    }

    /** 结束批量任务，必须在 finally 中调用 */
    function stop(): void {
        running.value = false;
    }

    return { running, done, total, percent, start, update, advance, stop };
}
