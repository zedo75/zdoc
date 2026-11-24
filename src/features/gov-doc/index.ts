import { defineFeature } from "#kernel/define";

export const govDocFeature = defineFeature({
    id: "gov-doc",
    name: "公文排版",
    description: "一键排版、排版设置面板、快捷样式",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
    panes: [{ name: "settings", title: "公文设置", dock: "right", order: 10 }],
    dialogs: [{ name: "quick-style", title: "快捷样式", width: 360, height: 240 }],
});
