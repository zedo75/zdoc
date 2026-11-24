import { defineFeature } from "#kernel/define";

export const batchFeature = defineFeature({
    id: "batch",
    name: "批量处理",
    description: "批量排版、批量转换 / 导出 PDF、批量重命名",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
    dialogs: [
        { name: "batch-typo", title: "批量排版", width: 1080, height: 720, modal: true },
        { name: "batch-convert", title: "批量转换" },
        { name: "batch-rename", title: "批量重命名" },
    ],
});
