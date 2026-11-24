import { defineActions } from "#kernel/define";
import { openDialog } from "#kernel/dispatch";

import { viewMailSourceInfo } from "./commands/mergeMail";

/** 邮件合并：Excel 批量合并、插入合并域、数据源信息、更新域 */
export const actions = defineActions({
    btnMailMergeDialog: () => openDialog("mail-merge-excel"),
    btnMailMergeTemplate: () => openDialog("mail-merge-excel"),
    btnInsertMergeField: () => openDialog("mail-merge-field"),
    btnViewMailSource: viewMailSourceInfo,
    btnUpdateFiled: () => {
        const fields = ActiveDocument.Fields;
        for (let i = 1; i <= fields.Count; i++) {
            fields.Item(i).Update();
        }
    },
});
