// 注意：同段内有多个需要匹配的才加 g 标志
export const SALUTATION_REGEX = /^[^《》〔〕：]*：\r$/; // 抬头；发文事由可能包含转发上级的文件（书名号、六角括号）
export const H1_REGEX = /^[一二三四五六七八九十]+、.*?(?:。|[^；;]\r)/; // 以分号结尾视为列表而不是层级标题
export const H2_REGEX = /^（[一二三四五六七八九十]+）.*?(?:。|[^；;]\r)/;
/**
 * 匹配三级标题正则表达式
 * - `(?!.*：)` 为先行断言，见以下链接
 * - `23` 为一行能容纳的字数：28 - 2（首缩）- 2（"00." 占宽）- 1（考虑标点压缩）
 * - 一二级标题暂不考虑限制 23 字，因为有的材料中会超过一行
 * @see https://mdn.org.cn/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Lookahead_assertion
 */
export const H3_REGEX = /^(?!.*(?:：|\u2005))[0-9]{1,2}\..{1,23}?(?:。|[^；;]\r)/;
export const TOPIC_REGEX = /(?<=^|[。？！])[一二三四五六七八九十][是要].*?。/g; // 小标题
export const TOPIC_PREFIX_REGEX = /^[一二三四五六七八九十][是要]/;
export const DATE_REGEX = /^[0-9X]{4}年[0-9 X]{1,2}月[0-9 X]{1,2}日\s*\r/; // 落款日期

// 标题中禁止出现的符号
export const FORBIDDEN_SYMBOLS_REGEX = /[。；！？【】〖〗_=|{}<>#&~$^*※\[\]\\]/;
export const ATTACHMENT_WILDCARDS = "^m附件[0-9]{1,}^p"; // 附件通配符
export const ATTACHMENT_LIST_REGEX = /[ \u3000]*附件[：:]\s*([\s\S]+?)(?=[\r\n]{2}|\f|$)/g;
export const ATTACHMENT_LIST_WILDCARDS = "附件[:：]*^p^p";

// 抬头相关正则
export const SALUTATION_EXCLUDE_REGEX = /贯彻|落实|关于|根据|如下|以下|下列|包括|。/; // 抬头黑名单
export const SALUTATION_ORG_DEPT_REGEX =
    /省|自治区|市|县|乡|镇|村|社区|委.*?(?:部|办)|局|工会|妇联|企业|党组织|大学/; // 抬头白名单
export const SALUTATION_EACH_UNIT_REGEX = /各.*?(?:单位|部门)/;
export const SALUTATION_GREETING_REGEX = /尊敬的|敬爱的|亲爱的|同志们/; // 敬语、称呼
export const SALUTATION_JOB_TITLE_REGEX = /副?书记|副?主任|副?参谋长|副?政委/; // 职务名称

export const SIGNATURE_DATE_REGEX = /^[0-9X]{4}年[0-9 X]{1,2}月[0-9 X]{1,2}日\s*\r?$/;

/**
 * 将厘米转换为磅（WPS 默认单位）
 * @param cm 厘米数
 * @returns 磅数
 */
export function cmToPoints(cm: number): number {
    return cm * (72 / 2.54);
}

const LINE_MAX_CHARS = 28; // 一行最大中文字数（基于默认页边距和字号）
const ATTACHMENT_ALIGN_SINGLE = 5; // 单附件对齐空格数
const ATTACHMENT_ALIGN_MULTI = 6; // 多附件对齐空格数（多一个序号）

/**
 * 处理附件对齐
 * - 使用 `\n` 换行，Word 内部会转为 `\r`；
 * - 无序号附件回行使用 5 缩进，有序号的使用 6 缩进；
 * - 为了方便，缩进默认使用全角空格 `\u3000` 代替，
 *
 * @param content 满足正则表达式 `/[ \u3000]*附件[：:]\s*([\s\S]+?)(?=[\r\n]{2}|\f|$)/` 的字符串
 */
export function handleAttachments(content: string) {
    // 1. 以“附件：”或数字序号（如“1.”）作为分隔符拆分
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
        const maxWidth = LINE_MAX_CHARS - alignSpacesCount - 1; // 多减1个字符，因为有时加粗字体会导致换行
        const ALIGN = zhSpace.repeat(alignSpacesCount);
        const lines = [];
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

    // 情况1：单个附件（无序号，或只有一个“附件：”块）
    if (names.length === 1) {
        // 单附件：宽度22，对齐空格5（对应“　　附件：”的长度）
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

// ==================== 基础段落信息（纯文本分析） ====================
export interface BaseParaInfo {
    text: string;
    isEmpty: boolean;
    isAttachment: boolean; // 段落开头为“附件X”
    hasFormFeed: boolean; // 包含换页符 \f
    hasForbidden: boolean; // 包含禁止符号
    isHeading: boolean; // 已被识别为层级标题（h1/h2/h3/topic） 由分析阶段计算
    isInRange: boolean; // 是否在排版范围内
    isTable: boolean; // 段落含 \x07（Word 表格单元格标记）
}

/**
 * 根据段落信息数组找出所有应升级为主标题的连续段落块。
 * - 候选起点：文档首非空、附件后、换页符后（可扩展抬头上方）
 * - 向后扩展直到遇空行、层级标题、禁止符号、附件或范围外
 * - 块后必须跟空行（或文档末尾，此处强制必须）
 * - 附件段落自身不会被选为候选，也不会被包含在块内
 */
export function findMainTitleBlocks(paraInfos: BaseParaInfo[]): [number, number][] {
    const n = paraInfos.length;
    const blocks: [number, number][] = [];
    const candidates = new Set<number>();

    // 文档第一个非空段落（排除附件、换页符、禁止符）
    const firstNonEmpty = paraInfos.findIndex((p) => !p.isEmpty);
    if (
        firstNonEmpty !== -1 &&
        !paraInfos[firstNonEmpty].isTable &&
        !paraInfos[firstNonEmpty].isAttachment &&
        !paraInfos[firstNonEmpty].hasFormFeed &&
        !paraInfos[firstNonEmpty].hasForbidden &&
        paraInfos[firstNonEmpty].isInRange
    ) {
        candidates.add(firstNonEmpty);
    }

    // 判断该索引位置的段落能否作为主标题块的候选起点
    const isEligibleBlockStart = (idx: number) =>
        idx < n &&
        !paraInfos[idx].isTable &&
        !paraInfos[idx].isAttachment &&
        !paraInfos[idx].hasForbidden &&
        paraInfos[idx].isInRange;

    // 附件后第一个非空段落（跳过中间空行）
    paraInfos.forEach((p, idx) => {
        if (p.isAttachment) {
            let next = idx + 1;
            while (next < n && paraInfos[next].isEmpty) next++;
            if (isEligibleBlockStart(next)) {
                candidates.add(next);
            }
        }
    });

    // 换页符后第一个非空段落（跳过中间空行，排除附件自身）
    paraInfos.forEach((p, idx) => {
        if (p.hasFormFeed) {
            let next = idx + 1;
            while (next < n && paraInfos[next].isEmpty) next++;
            if (isEligibleBlockStart(next)) {
                candidates.add(next);
            }
        }
    });

    // 抬头上方可扩展（暂略）-----

    // 从候选生成块
    const sorted = Array.from(candidates).sort((a, b) => a - b);
    for (const start of sorted) {
        if (blocks.some(([s, e]) => start >= s && start <= e)) continue;

        const info = paraInfos[start];
        if (info.isTable) continue;
        if (info.isEmpty || info.hasForbidden || info.isHeading) continue;

        // 若前一个非空段落是层级标题，则相邻时不作为标题
        let prev = start - 1;
        while (prev >= 0 && paraInfos[prev].isEmpty) prev--;
        if (prev >= 0 && paraInfos[prev].isHeading) continue;

        // 向后扩展：收集连续的非空、非层级、非禁止、非附件、在范围内的段落
        let end = start;
        while (end < n) {
            const cur = paraInfos[end];
            if (cur.isEmpty) break;
            if (cur.isHeading) break;
            if (cur.hasForbidden) {
                end = -1;
                break;
            }
            if (cur.isAttachment) break; // 附件本身不应包含在标题块内
            if (cur.isTable) break; // 表格切断主标题块
            if (!cur.isInRange) break;
            end++;
        }
        if (end === -1 || end <= start) continue;

        // 块后必须有空行（文档末尾也可接受，但此处强制要求空行）
        if (end < n && paraInfos[end].isEmpty) {
            blocks.push([start, end - 1]);
        }
    }

    // 合并相邻或重叠的块
    if (blocks.length > 1) {
        const merged: typeof blocks = [];
        let [curS, curE] = blocks[0];
        for (let i = 1; i < blocks.length; i++) {
            const [s, e] = blocks[i];
            if (s <= curE + 1) {
                curE = Math.max(curE, e);
            } else {
                merged.push([curS, curE]);
                [curS, curE] = [s, e];
            }
        }
        merged.push([curS, curE]);
        return merged;
    }
    return blocks;
}

export function isSubtitleLine(text: string): boolean {
    const t = text.trim();
    // 匹配中文括号内容，且包含“稿”或“案”，或者破折号开头
    return (
        /^（[^）]*[稿案][^）]*）$/.test(t) ||
        /^[^\s]{2,5}\u3014\d{4}\u3015\d+号$/.test(t) ||
        t.startsWith("——")
    );
}
