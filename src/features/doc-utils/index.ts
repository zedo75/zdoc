import { defineFeature } from "#kernel/define";

export const docUtilsFeature = defineFeature({
    id: "doc-utils",
    name: "文档工具",
    description: "清除格式、段落缩进、编号转换、清除空段落、接受修订",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
});
