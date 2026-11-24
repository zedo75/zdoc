import { defineRibbon } from "#kernel/define";
import { button } from "#vite-plugin-wps-enhance/factory";

export default defineRibbon({
    contributes: [
        {
            container: "grpHelper",
            order: 40,
            controls: [
                button("文本对比", "btnTextViewCompare", {
                    size: "large",
                    getImage: "getImage",
                }),
            ],
        },
    ],
});
