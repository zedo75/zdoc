import {
    button,
    group,
    menu,
    menuSeparator,
    RibbonBuilder,
    separator,
    splitButton,
    tab,
} from "#vite-plugin-wps-enhance";

export const xmlConfig = RibbonBuilder.create({
    // onLoad: "onAddinLoad", // 实测无效果，删除
    tabs: [
        tab("公文助手(&Z)", "wpsDocHelperTab", { insertAfterMso: "TabPageLayoutWord" }, [
            group("文档处理", "grpDocument", [
                // splitButton 中 menu 下的所有按钮，supertip 和 screentip 都不生效
                // 且使用 screentip 会作为标题，整体显示在工具栏下方而不是鼠标位置
                splitButton("sb排版", { size: "large", supertip: "适用于对文字内容快速调整格式" }, [
                    button("快速排版", "btnGovDocTypo", {
                        imageMso: "TextStyle",
                    }),
                    menu("排版菜单", "menu1", [
                        button("排版图片", "btnImageTypo", {
                            imageMso: "GeneratePicture",
                        }),
                        button("排版表格", "btnTableTypo", { imageMso: "AiSmartOrganize" }),
                        button("附件对齐", "btnJustifyAttach", {
                            imageMso: "OfficialAttachmentList",
                        }),
                        button("批量排版", "btnBatchTypo", { imageMso: "SmartRearrange" }),
                    ]),
                ]),
                button("排版设置", "btnTypoConfig", {
                    // imageMso: "MoreMarginsOption",
                    size: "large",
                    getImage: "getImage",
                }),
                menu("清除格式", "mnuClear", { size: "large", imageMso: "ClearAll" }, [
                    button("清除格式（选区/全文）", "btnClearFormat", {
                        imageMso: "ClearFormats",
                    }),
                    button("删除非内置样式", "btnClearNonBuiltinStyles", {
                        imageMso: "ClearStyle",
                    }),
                    button("清除底纹背景", "btnRemoveShading", {
                        getImage: "getImage",
                    }),
                ]),
                button("页眉页脚", "btnHeaderFooter", {
                    imageMso: "HeaderFooter",
                    size: "large",
                }),
            ]),
            group("快捷样式", "grpStyle", [
                splitButton("sbQuickStyle", { size: "large" }, [
                    button("快捷样式", "btnQuickStyle", { imageMso: "StyleFormat" }),
                    menu("", "mnuStyleList", [
                        button("二号", "btnFontSize2", { imageMso: "FontSize" }),
                        button("三号", "btnFontSize3", { imageMso: "FontSize" }),
                        menuSeparator("sep1"),
                        button("小标宋", "btnFontFZ", {
                            imageMso: "ReplaceFont",
                            supertip: "对应排版设置中\n“标题”的中文字体",
                        }),
                        button("黑体", "btnFontHei", {
                            imageMso: "ReplaceFont",
                            supertip: "对应排版设置中\n“一级标题”的字体",
                        }),
                        button("楷体", "btnFontKai", {
                            imageMso: "ReplaceFont",
                            supertip: "对应排版设置中\n“二级标题”的字体",
                        }),
                        button("仿宋", "btnFontFS", {
                            imageMso: "ReplaceFont",
                            supertip: "对应排版设置中\n“正文”的中文字体",
                        }),
                        button("西文罗马体", "btnFontRoman", {
                            imageMso: "ReplaceFont",
                            supertip: "西文设为“Times New Roman”\n或“Nimbus Roman”字体",
                        }),
                        button("西文同中文", "btnFontAsciiToEast", {
                            imageMso: "ReplaceFont",
                            supertip: "西文使用中文字体",
                        }),
                        button("固定行距", "btnLineExactly", { imageMso: "LineSpacing" }),
                    ]),
                ]),
            ]),
            group("辅助", "grpHelper", [
                menu("段落缩进", "mnuIndent", { imageMso: "IncreaseIndent", size: "large" }, [
                    button("首行缩进2字", "btnIndent2Char", { imageMso: "ParagraphIndent2Spaces" }),
                    button("取消缩进", "btnClearIndent", { imageMso: "DeletePrefixSpaces" }),
                    menuSeparator("msIndent"),
                    button("空格 ↔️ 缩进", "btnToggleIndentToSpace", {
                        imageMso: "InsertParagraphIndent",
                    }),
                ]),
                menu("编号转换", "mnuListOrder", { imageMso: "InsertNumber", size: "large" }, [
                    button("动态编号转静态", "btnNumberToStatic", {
                        size: "large",
                        imageMso: "Numbering",
                    }),
                    button("一级标题序号转动态", "btnH1ToNumber", { imageMso: "_1" }),
                    button("二级标题序号转动态", "btnH2ToNumber", {
                        imageMso: "_2",
                    }),
                ]),
                menu(
                    "图片工具",
                    "mnuPictureTools",
                    { imageMso: "BatchInsertPicture", size: "large" },
                    [
                        button("调整图片尺寸", "btnPictureResize", {
                            imageMso: "PictureCrop",
                        }),
                        button("导出所有图片", "btnExportPicture", {
                            getImage: "getImage",
                        }),
                    ],
                ),
                button("文本对比", "btnTextViewCompare", {
                    size: "large",
                    getImage: "getImage",
                }),
                separator(),
                menu("邮件合并", "mnuMailMerge", { imageMso: "OpenDataSource" }, [
                    button("查看数据源信息", "btnViewMailSource", { imageMso: "OpenDataSource" }),
                    button("更新所有域", "btnUpdateFiled", { imageMso: "UpdateField" }),
                ]),
                button("清除空段落", "btnClearEmptyPara", { imageMso: "DeleteBlankParagraph" }),
                button("正则替换", "btnRegexReplace", { imageMso: "Replace" }),
                menu("全半角转换", "mnuFullHalfWidth", { imageMso: "ChangeCase", size: "large" }, [
                    button("英文标点转全角", "btnConvertPunctuation"),
                    button("字母数字转半角", "btnConvertAlphaNum"),
                    button("标点符号更正", "btnCorrectPunctuation"),
                    button("更改大小写", "btnChangeCase"),
                ]),
            ]),
            group("其他", "grp222", [
                menu("修订", "mnu修订", { imageMso: "TrackChanges" }, [
                    button("一键接受", "btn接受所有修订", { imageMso: "AcceptChange" }),
                ]),
            ]),
        ]),
    ],
});
