import { defineRibbon } from "#kernel/define";
import { button } from "#vite-plugin-wps-enhance/factory";

export default defineRibbon({
    contributes: [
        {
            container: "grpDocument",
            order: 40,
            controls: [
                button("检查格式", "btnFormatCheck", {
                    size: "large",
                    getImage: "getImage",
                    supertip: "只读检查文档中的排版要素与格式\n不会修改文档",
                }),
            ],
        },
    ],
});
