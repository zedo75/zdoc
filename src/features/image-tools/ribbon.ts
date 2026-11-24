import { defineRibbon } from "#kernel/define";
import { button, menu } from "#vite-plugin-wps-enhance/factory";

export default defineRibbon({
    contributes: [
        {
            container: "grpHelper",
            order: 30,
            controls: [
                menu(
                    "图片工具",
                    "mnuPictureTools",
                    { imageMso: "BatchInsertPicture", size: "large" },
                    [
                        button("调整图片尺寸", "btnPictureResize", { imageMso: "PictureCrop" }),
                        button("导出所有图片", "btnExportPicture", { getImage: "getImage" }),
                    ],
                ),
            ],
        },
        // 「排版」拆分按钮里的「排版图片」
        {
            container: "menu1",
            order: 10,
            controls: [button("排版图片", "btnImageTypo", { imageMso: "GeneratePicture" })],
        },
    ],
});
