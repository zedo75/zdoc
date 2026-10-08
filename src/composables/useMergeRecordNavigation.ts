import { computed, ref } from "vue";

import { getCurrentRecordNumber, getRecordCount, gotoRecord } from "@/jsa/commands/mergeMail";
import { refreshMailMergeDataView } from "@/jsa/utils/document";

/** 对外使用的记录导航方向（避免模板里出现 WPS 枚举） */
export type RecordDirection = "first" | "previous" | "next" | "last";

/**
 * 邮件合并 - 记录导航
 *
 * 负责：
 *  - 当前记录号 / 记录总数 的同步（文档镜像）
 *  - 输入框字符串值的维护（UI 编辑态）
 *  - 上一条 / 下一条 / 首末条 / 跳转
 *  - 输入校验与失败回滚
 */
export function useMergeRecordNavigation() {
    // ─── 文档镜像：WPS 是唯一真源，这里只是本地缓存 ───
    // 只由 refreshRecordState() 写入，外部一律通过只读 computed 读取。
    const currentRecordSource = ref(0);
    const recordCountSource = ref(0);

    // ─── UI 编辑态：与文档无关，仅 commit 时单向写入 ───
    const recordInput = ref("");

    // ─── 对外：只读派生 ───
    /** 当前记录号（1-based，0 表示无记录） */
    const currentRecord = computed(() => currentRecordSource.value);
    /** 记录总数（0 表示无数据源） */
    const recordCount = computed(() => recordCountSource.value);

    /** 把输入框恢复成"当前记录号"的字符串（无记录时为空） */
    function resetInput() {
        recordInput.value = currentRecordSource.value > 0 ? String(currentRecordSource.value) : "";
    }

    /** 从 WPS 读最新记录状态，同步到本地 ref —— 只读文档，绝不写回 */
    function refreshRecordState() {
        currentRecordSource.value = getCurrentRecordNumber();
        recordCountSource.value = getRecordCount();
        resetInput();
    }

    /**
     * 按方向移动记录并刷新本地状态。
     *
     * direction 使用字符串，模板里直接写 'first' / 'previous' / 'next' / 'last'。
     * 不直接用 Wps.WdMailMergeActiveRecord 做相对移动（WPS 有时会 +2 / -2），
     * 统一算出目标绝对序号，再交给 gotoRecord（内部会 clamp）。
     */
    function moveRecord(direction: RecordDirection) {
        const total = recordCountSource.value;
        if (total < 1) return;

        const current = currentRecordSource.value;

        let target: number;
        switch (direction) {
            case "first":
                target = 1;
                break;
            case "previous":
                target = current - 1;
                break;
            case "next":
                target = current + 1;
                break;
            case "last":
                target = total;
                break;
            default:
                return;
        }

        if (!gotoRecord(target)) return; // 越界由 gotoRecord 内部处理
        refreshMailMergeDataView();
        refreshRecordState();
    }

    /** 回车或失焦时，把输入框的值提交为跳转 */
    function commitRecord() {
        const raw = recordInput.value.trim();

        // 空输入或非法输入 → 恢复原值
        if (raw === "") {
            resetInput();
            return;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            resetInput();
            return;
        }

        const target = Math.floor(parsed);
        if (target === currentRecordSource.value) return;

        // 跳转（gotoRecord 内部会 clamp 到 [1, RecordCount]）
        if (gotoRecord(target)) {
            refreshRecordState();
        } else {
            // 跳转失败 → 恢复原值
            resetInput();
        }
    }

    return {
        currentRecord,
        recordCount,
        recordInput,
        refreshRecordState,
        moveRecord,
        commitRecord,
    };
}
