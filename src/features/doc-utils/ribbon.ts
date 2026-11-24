import { defineRibbon } from "#kernel/define";
import { button, menu, menuSeparator } from "#vite-plugin-wps-enhance/factory";

/** 文档工具：只操作当前文档的零散命令，没有独立 UI */
export default defineRibbon({
    contributes: [
        {
            container: "grpDocument",
            order: 50,
            controls: [
                menu("清除格式", "mnuClear", { size: "large", imageMso: "ClearAll" }, [
                    button("清除格式（选区/全文）", "btnClearFormat", { imageMso: "ClearFormats" }),
                    button("删除非内置样式", "btnClearNonBuiltinStyles", {
                        imageMso: "ClearStyle",
                    }),
                    button("清除底纹背景", "btnRemoveShading", { getImage: "getImage" }),
                ]),
            ],
        },
        {
            container: "grpHelper",
            order: 10,
            controls: [
                menu("段落缩进", "mnuIndent", { imageMso: "IncreaseIndent", size: "large" }, [
                    button("首行缩进2字", "btnIndent2Char", { imageMso: "ParagraphIndent2Spaces" }),
                    button("取消缩进", "btnClearIndent", { imageMso: "DeletePrefixSpaces" }),
                    menuSeparator("msIndent"),
                    button("空格 ↔️ 缩进", "btnToggleIndentToSpace", {
                        imageMso: "InsertParagraphIndent",
                    }),
                ]),
            ],
        },
        {
            container: "grpHelper",
            order: 20,
            controls: [
                menu("编号转换", "mnuListOrder", { imageMso: "InsertNumber", size: "large" }, [
                    button("动态编号转静态", "btnNumberToStatic", {
                        size: "large",
                        imageMso: "Numbering",
                    }),
                    button("一级标题序号转动态", "btnH1ToNumber", { imageMso: "_1" }),
                    button("二级标题序号转动态", "btnH2ToNumber", { imageMso: "_2" }),
                ]),
            ],
        },
        {
            container: "grpHelper",
            order: 60,
            controls: [
                button("清除空段落", "btnClearEmptyPara", { imageMso: "DeleteBlankParagraph" }),
            ],
        },
        {
            container: "grpOther",
            order: 10,
            controls: [
                menu("修订", "mnu修订", { imageMso: "TrackChanges" }, [
                    button("一键接受", "btn接受所有修订", { imageMso: "AcceptChange" }),
                ]),
            ],
        },
    ],
});
