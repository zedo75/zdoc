import { defineFeature } from "#kernel/define";

export const formatCheckFeature = defineFeature({
    id: "format-check",
    name: "格式检查",
    description: "只读检查文档的段落语义与生效格式，不修改文档",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
    panes: [{ name: "format-check", title: "格式检查", dock: "left", order: 30 }],
});
