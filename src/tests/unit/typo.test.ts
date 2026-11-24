import { expect, test } from "vitest";

import { handleAttachments } from "@/core/attachments";

test("测试附件对齐", () => {
    let str = String.raw`　　附件：1. ××××××
　　　　　2. 《××××××××××××××××××××
　　　　　　×××××××××××××××××××××
　　　　　　×××》
　　　　　3. 《××××××××××2026××××××××
　　　　　　×》`;
    expect(handleAttachments(str)).toBe(str);
    expect(handleAttachments(str.replace(/\n/g, "\r"))).toBe(str); // word 中自动将 \n 转为 \r

    const blankReg = /[ \u3000\u2005]/g;
    let str2 = str.replace(blankReg, "");
    let str3 = str.replace(blankReg, " ");
    console.log(str2, "\n", str3);
    expect(handleAttachments(str2)).toBe(str);
    expect(handleAttachments(str3)).toBe(str);
});
