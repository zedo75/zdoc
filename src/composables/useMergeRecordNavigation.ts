import { ref } from "vue";

import { getCurrentRecordNumber, getRecordCount, gotoRecord } from "@/jsa/commands/mergeMail";
import { refreshMailMergeDataView } from "@/jsa/utils/document";

/** 对外使用的记录导航方向（避免模板里出现 WPS 枚举） */
export type RecordDirection = "first" | "previous" | "next" | "last";

/**
 * 邮件合并 - 记录导航
 *
 * 负责：
 *  - 当前记录号 / 记录总数 的同步
 *  - 输入框字符串值的维护
 *  - 上一条 / 下一条 / 首末条 / 跳转
 *  - 输入校验与失败回滚
 */
export function useMergeRecordNavigation() {
    /** 当前记录号（1-based，0 表示无记录） */
    const currentRecord = ref(0);
    /** 记录总数 */
    const recordCount = ref(0);
    /** 输入框的字符串值（便于处理空输入和非法输入） */
    const recordInput = ref("");

    /** 从 WPS 读最新记录状态，同步到本地 ref */
    function refreshRecordState() {
        currentRecord.value = getCurrentRecordNumber();
        recordCount.value = getRecordCount();
        recordInput.value = currentRecord.value > 0 ? String(currentRecord.value) : "";
    }

    /**
     * 按方向移动记录并刷新本地状态。
     *
     * direction 使用字符串，模板里直接写 'first' / 'previous' / 'next' / 'last'。
     * 直接使用 Wps.WdMailMergeActiveRecord 相对移动有时会 +2 / -2，
     * 因此这里统一算出目标绝对序号再赋值。
     */
    function moveRecord(direction: RecordDirection) {
        const mailMerge = Application.ActiveDocument.MailMerge;
        if (!mailMerge.DataSource) return;

        const ds = Application.ActiveDocument.MailMerge.DataSource;
        const total = ds.RecordCount; // 总记录数
        if (!total || total < 1) return; // 没有数据直接返回

        // 当前序号；某些状态下可能返回 0 / -1
        const current = ds.ActiveRecord;

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

        // 钳制到 [1, total]，避免越界后负数被当成相对位置
        if (target < 1) target = 1;
        if (target > total) target = total;

        ds.ActiveRecord = target; // 始终赋正数 = 绝对序号

        refreshMailMergeDataView();
        refreshRecordState();
    }

    /** 回车或失焦时，把输入框的值提交为跳转 */
    function commitRecord() {
        const raw = recordInput.value.trim();

        // 空输入或非法输入 → 恢复原值
        if (raw === "") {
            recordInput.value = currentRecord.value > 0 ? String(currentRecord.value) : "";
            return;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            recordInput.value = currentRecord.value > 0 ? String(currentRecord.value) : "";
            return;
        }

        const target = Math.floor(parsed);

        // 无变化 → 不做任何操作
        if (target === currentRecord.value) return;

        // 跳转（gotoRecord 内部会 clamp 到 [1, RecordCount]）
        if (gotoRecord(target)) {
            refreshRecordState();
        } else {
            // 跳转失败 → 恢复原值
            recordInput.value = currentRecord.value > 0 ? String(currentRecord.value) : "";
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
