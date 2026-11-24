import { defineRibbon } from "#kernel/define";
import { button } from "#vite-plugin-wps-enhance/factory";

export default defineRibbon({
    contributes: [
        // 「排版」拆分按钮里的「排版表格」
        {
            container: "menu1",
            order: 20,
            controls: [button("排版表格", "btnTableTypo", { imageMso: "AiSmartOrganize" })],
        },
    ],
});
