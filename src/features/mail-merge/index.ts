import { defineFeature } from "#kernel/define";

export const mailMergeFeature = defineFeature({
    id: "mail-merge",
    name: "邮件合并",
    description: "Excel 数据源批量合并（row / group / #if）、插入合并域、记录导航",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
    dialogs: [
        { name: "mail-merge-excel", title: "邮件合并", width: 960, height: 720 },
        { name: "mail-merge-field", title: "插入合并域", width: 360, height: 320 },
    ],
});
