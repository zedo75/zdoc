import { defineFeature } from "#kernel/define";

export const punctuationFeature = defineFeature({
    id: "punctuation",
    name: "标点规则",
    description: "英文标点转全角、字母数字转半角、标点更正与大小写",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
    panes: [{ name: "punctuation-rules", title: "标点规则", dock: "right", order: 50 }],
});
