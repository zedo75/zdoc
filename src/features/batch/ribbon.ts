import { defineRibbon } from "#kernel/define";
import { button, menu, menuSeparator } from "#vite-plugin-wps-enhance/factory";

export default defineRibbon({
    contributes: [
        {
            container: "grpDocument",
            order: 20,
            controls: [
                menu(
                    "批量处理",
                    "mnuBatchDocs",
                    {
                        size: "large",
                        getImage: "getImage",
                        supertip: "批量排版、批量转换、批量重命名",
                    },
                    [
                        button("批量排版", "btnBatchTypo", { imageMso: "SmartRearrange" }),
                        menuSeparator("msBatchDocs"),
                        button("批量转换 / 导出 PDF", "btnBatchConvert", { getImage: "getImage" }),
                        button("批量重命名", "btnBatchRename", { getImage: "getImage" }),
                    ],
                ),
            ],
        },
    ],
});
