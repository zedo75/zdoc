import { defineRibbon } from "#kernel/define";
import { button, menu, separator, splitButton } from "#vite-plugin-wps-enhance/factory";

export default defineRibbon({
    contributes: [
        {
            container: "grpHelper",
            order: 50,
            controls: [
                separator(),
                splitButton("sb邮件合并", {}, [
                    button("邮件合并", "btnMailMergeDialog", { imageMso: "OpenDataSource" }),
                    menu("邮件合并", "mnuMailMerge", [
                        button("Excel 批量合并", "btnMailMergeTemplate", {
                            imageMso: "OpenDataSource",
                        }),
                        button("插入合并域", "btnInsertMergeField", {
                            imageMso: "OpenDataSource",
                        }),
                        button("查看数据源信息", "btnViewMailSource", {
                            imageMso: "OpenDataSource",
                        }),
                        button("更新所有域", "btnUpdateFiled", { imageMso: "UpdateField" }),
                    ]),
                ]),
            ],
        },
    ],
});
