import { defineActions } from "#kernel/define";
import { openDialog } from "#kernel/dispatch";

/** 表格：当前入口是「插入 Markdown 表格」弹窗；表格排版命令见 commands/table.ts（尚未接入） */
export const actions = defineActions({
    btnTableTypo: () => openDialog("markdown-table"),
});
