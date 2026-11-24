/**
 * 排版引擎：附件说明
 *
 * 公文的「附件：」块有自己的字形规则（折行悬挂缩进 5 字符等），
 * 文本由本模块的 `handleAttachments` 纯函数计算，这里只负责定位与写回。
 */

import { ATTACHMENT_LIST_WILDCARDS_PATTERN } from "@/core/patterns";

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

/** 带绝对位置的文本片段 */
export interface RangeIndex {
    startIndex: number;
    endIndex: number;
    text: string;
}

/**
 * 提取所有附件段落
 * @param doc 文档
 */
export function getAttachmentsRangesIndex(doc: Wps.Document = ActiveDocument): RangeIndex[] {
    const ranges = [];
    const rng = doc.Content;

    const find = rng.Find;
    find.ClearFormatting();
    // 对应正则表达式 attachmentList
    find.Text = ATTACHMENT_LIST_WILDCARDS_PATTERN; // 这里只找“附件”开头到结尾，^p 只用于定位
    find.MatchCase = false; // 不区分大小写
    find.MatchWildcards = true; // 使用通配符

    while (find.Execute()) {
        // 获取当前匹配所在段落的起始位置（即前一个 ^p 的后面）
        const paraStart = rng.Paragraphs.Item(1).Range.Start;

        rng.Start = paraStart; // 其下一空段仅用于搜索定位，不应包含在处理范围

        const trimmed = rng.Duplicate;
        trimmed.End = trimmed.End - 2; // 去掉末尾的 2 个段落符

        ranges.push({
            startIndex: trimmed.Start,
            endIndex: trimmed.End,
            text: trimmed.Text, // 此时末尾只有单个 \r
        });

        rng.Collapse(0); // 折叠到匹配文本之后，继续向下查找
    }
    return ranges;
}

/**
 * 对齐附件列表
 *
 * 格式化公文中的“附件说明”
 * @param doc 文档
 */
export function formatAttachments(doc: Wps.Document = ActiveDocument) {
    const rangeIndex = getAttachmentsRangesIndex(doc);
    for (let i = rangeIndex.length - 1; i >= 0; i--) {
        const item = rangeIndex[i];
        const result = handleAttachments(item.text);
        const range = doc.Range(item.startIndex, item.endIndex);

        // 防御：实际读到的文本必须与快照一致，否则坐标仍错位，跳过而不是覆盖
        if (range.Text !== item.text) {
            console.warn(
                `[formatAttachments] 范围错位，已跳过：${item.startIndex}-${item.endIndex}`,
            );
            continue;
        }

        // handleAttachments 是幂等性的，因此只需要额外判断缩进是否满足条件
        if (item.text == result.replace(/\n/g, "\r").replace(/\u3000/g, "")) {
            const paras = range.Paragraphs;
            let shouldSkip = false;
            // 段落数≥2 且 第二段缩进<5 时才执行排版，否则跳过（不逐段检查缩进）
            if (paras.Count < 2 || paras.Item(2).Format.CharacterUnitFirstLineIndent >= 5) {
                shouldSkip = true;
            }
            if (shouldSkip) {
                continue;
            }
            // 缩进不对，继续走排版流程
        }

        range.Text = result;
        // 对该块进行缩进转换
        convertIndentForRange(range);
    }
}

/**
 * 对指定Range内的所有段落进行缩进转换（将行首全角空格转为段落缩进）
 */
function convertIndentForRange(range: Wps.Range) {
    const doc = range.Parent as Wps.Document;
    const paras = range.Paragraphs;
    const count = paras.Count;
    // 使用 For Each 遍历，比索引快，但 JS/TS 加载项不支持
    for (let j = 1; j <= count; j++) {
        const para = paras.Item(j);
        const rng = para.Range;
        const text = rng.Text;
        // 只检查前几个字符，不用正则
        if (!text.startsWith("\u3000")) continue;

        // 统计连续全角空格数
        let spaceCount = 0;
        while (spaceCount < text.length && text[spaceCount] === "\u3000") {
            spaceCount++;
        }

        // 删除这些空格
        if (spaceCount > 0) {
            const delRange = doc.Range(rng.Start, rng.Start + spaceCount);
            delRange.Delete();
        }

        // 设置段落缩进（全角空格数作为缩进字符数）
        para.Format.CharacterUnitFirstLineIndent = spaceCount;
    }
}
