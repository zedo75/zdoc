import { defineRibbon } from "#kernel/define";
import { button, menu } from "#vite-plugin-wps-enhance/factory";

export default defineRibbon({
    contributes: [
        {
            container: "grpHelper",
            order: 80,
            controls: [
                menu("标点规则", "mnuFullHalfWidth", { imageMso: "ChangeCase", size: "large" }, [
                    button("英文标点转全角", "btnConvertPunctuation"),
                    button("字母数字转半角", "btnConvertAlphaNum"),
                    button("标点符号更正", "btnCorrectPunctuation"),
                    button("更改大小写", "btnChangeCase"),
                ]),
            ],
        },
    ],
});
