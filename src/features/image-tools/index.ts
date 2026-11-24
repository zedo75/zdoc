import { defineFeature } from "#kernel/define";

export const imageToolsFeature = defineFeature({
    id: "image-tools",
    name: "图片工具",
    description: "批量调整图片尺寸、导出所有图片、排版嵌入型图片",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
    panes: [{ name: "image-resize", title: "图片调整", dock: "right", order: 40 }],
});
