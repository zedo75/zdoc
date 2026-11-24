import { defineRibbon } from "#kernel/define";
import { button, menu, splitButton } from "#vite-plugin-wps-enhance/factory";

/**
 * 公文排版插件的 Ribbon 声明。
 *
 * 「排版」拆分按钮的菜单（menu1）本身不写条目：排版图片、排版表格分别由
 * image-tools / table 插件往同一个菜单里贡献，附件对齐由本插件贡献。
 */
export default defineRibbon({
    contributes: [
        {
            container: "grpDocument",
            order: 10,
            controls: [
                splitButton("sb排版", { size: "large", supertip: "适用于对文字内容快速调整格式" }, [
                    button("快速排版", "btnGovDocTypo", { imageMso: "TextStyle" }),
                    menu("排版菜单", "menu1", []),
                ]),
            ],
        },
        {
            container: "grpDocument",
            order: 30,
            controls: [
                button("排版设置", "btnTypoConfig", { size: "large", getImage: "getImage" }),
            ],
        },
        {
            container: "menu1",
            order: 30,
            controls: [
                button("附件对齐", "btnJustifyAttach", { imageMso: "OfficialAttachmentList" }),
            ],
        },
        {
            container: "grpStyle",
            order: 10,
            controls: [
                button("快捷样式", "btnQuickStyle", { size: "large", imageMso: "StyleFormat" }),
            ],
        },
    ],
});
