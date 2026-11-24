import { defineFeature } from "#kernel/define";

export const textCompareFeature = defineFeature({
    id: "text-compare",
    name: "文本对比",
    description: "三栏对比工作台、分屏对比、差异统计与 HTML 报告",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
    panes: [{ name: "text-compare", title: "文本对比", dock: "right", order: 20 }],
    dialogs: [{ name: "text-compare-split", title: "文本分屏对比", width: 1000, height: 760 }],
});
