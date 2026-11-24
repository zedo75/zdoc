import { defineFeature } from "#kernel/define";

export const tableFeature = defineFeature({
    id: "table",
    name: "表格",
    description: "插入 Markdown 表格；表格排版命令待接入",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
    dialogs: [{ name: "markdown-table", title: "插入Markdown表格" }],
});
