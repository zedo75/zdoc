/**
 * 将厘米转换为磅（WPS 默认单位）
 * @param cm 厘米数
 * @returns 磅数
 */
export function cmToPoints(cm: number): number {
    return cm * (72 / 2.54);
}

// ==================== 附件排版参数 ====================

const LINE_MAX_CHARS = 28; // 一行最大中文字数（基于默认页边距和字号）
const ATTACHMENT_ALIGN_SINGLE = 5; // 单附件对齐空格数
const ATTACHMENT_ALIGN_MULTI = 6; // 多附件对齐空格数（多一个序号）

/**
 * 处理附件对齐
 *
 * - 使用 `\n` 换行，Word 内部会转为 `\r`；
 * - 无序号附件回行使用 5 缩进，有序号的使用 6 缩进；
 * - 为了方便，缩进默认使用全角空格 `\u3000` 代替。
 *
 * @param content 满足正则表达式 `/[ \u3000]*附件[：:]\s*([\s\S]+?)(?=[\r\n]{2}|\f|$)/` 的字符串
 */
export function handleAttachments(content: string): string {
    // 1. 以 "附件：" 或数字序号（如 "1."）作为分隔符拆分
    // 统一用 "\n" 以便于测试，word会自动转为 \r
    const parts = content.replace(/\r/g, "\n").split(/(?:附件[：:]|\d+[.．])\s*/);
    // 2. 清洗每个片段：去除首尾空白，过滤空字符串
    let names = parts.map((part) => part.trim()).filter((name) => name !== "");

    if (names.length === 0) return "";

    // 3. 名称预处理：将换行符替换为空格，合并连续空格
    const cleanName = (raw: string) => {
        return raw
            .replace(/\n+/g, " ") // 换行变空格
            .replace(/\s+/g, "") // 删除连续空白字符
            .trim();
    };
    names = names.map(cleanName);

    // 字符宽度：半角数字/字母 => 0.5，其他 => 1
    function charWidth(ch: string) {
        const code = ch.charCodeAt(0);
        if ((code >= 48 && code <= 57) || (code >= 97 && code <= 122)) return 0.5;
        return 1;
    }

    const zhSpace = "\u3000"; // 中文空格
    const flIndent = zhSpace.repeat(2); // 首行缩进（空格表示）
    // 通用折行函数
    function wrapName(name: string, alignSpacesCount: number) {
        const maxWidth = LINE_MAX_CHARS - alignSpacesCount - 1; // 多减 1 个字符，因为有时加粗字体会导致换行
        const ALIGN = zhSpace.repeat(alignSpacesCount);
        const lines: string[] = [];
        let currentLine = "";
        let currentWidth = 0;

        for (let i = 0; i < name.length; i++) {
            const ch = name[i];
            const w = charWidth(ch);
            if (currentWidth + w > maxWidth) {
                lines.push(currentLine);
                currentLine = ch;
                currentWidth = w;
            } else {
                currentLine += ch;
                currentWidth += w;
            }
        }
        if (currentLine) lines.push(currentLine);

        if (lines.length === 0) return "";
        let result = lines[0];
        for (let i = 1; i < lines.length; i++) {
            result += "\n" + ALIGN + lines[i];
        }
        return result;
    }

    // 情况1：单个附件（无序号，或只有一个 "附件：" 块）
    if (names.length === 1) {
        // 单附件：宽度 22，对齐空格 5（对应 "　　附件：" 的长度）
        const wrapped = wrapName(names[0], ATTACHMENT_ALIGN_SINGLE);
        return flIndent + "附件：" + wrapped;
    }

    // 情况2：多个附件（有序号）
    let output = flIndent + "附件：" + "1.\u2005" + wrapName(names[0], ATTACHMENT_ALIGN_MULTI);
    for (let i = 2; i <= names.length; i++) {
        const name = names[i - 1];
        if (!name) continue;
        const prefix = zhSpace.repeat(5) + i + ".\u2005";
        output += "\n" + prefix + wrapName(name, ATTACHMENT_ALIGN_MULTI);
    }
    // 如果最后一个名称原本以换行结尾，保持输出末尾换行（原逻辑保留）
    if (names[names.length - 1].endsWith("\n")) output += "\n";
    return output;
}
