import { ElMessage } from "element-plus";

import { insertMergeField } from "@/jsa/commands/mergeMail";
import { refreshDocumentView } from "@/jsa/utils/document";

/**
 * 邮件合并 - 字段动作
 *
 * 只负责“对域本身的操作”
 */
export function useMergeFieldActions() {
    /**
     * 在当前光标位置插入指定合并域。
     *
     * 每次调用时动态获取 Application.ActiveDocument 和 Selection，
     * 保证插入位置始终是“此刻”的光标位置。
     */
    function insertFieldAtCursor(fieldName: string) {
        const doc = Application.ActiveDocument;
        if (!doc) {
            ElMessage.warning("未找到活动文档");
            return;
        }

        // 数据源检查
        if (!doc.MailMerge?.DataSource) {
            ElMessage.warning("请先连接邮件合并数据源");
            return;
        }

        //"插入合并域"
        const selection = doc.ActiveWindow.Selection;
        insertMergeField(selection.Range, fieldName);

        refreshDocumentView();
    }

    return {
        insertFieldAtCursor,
    };
}
