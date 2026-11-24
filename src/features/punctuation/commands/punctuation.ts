/**
 * WPS 自带的“更改大小写”对话框
 */
export function openWpsChangeCaseDialog() {
    Application.Dialogs.Item(wdDialogFormatChangeCase).Show();
}

/** 生成全角字符串："Ａ…Ｚ" + "ａ…ｚ" + "０…９" */
function buildFullWidthStr() {
    let s = "";
    // 全角大写字母 Ａ-Ｚ：码点 0xFF21 ~ 0xFF3A
    for (let i = 0; i < 26; i++) s += String.fromCharCode(0xff21 + i);
    // 全角小写字母 ａ-ｚ：码点 0xFF41 ~ 0xFF5A
    for (let i = 0; i < 26; i++) s += String.fromCharCode(0xff41 + i);
    // 全角数字 ０-９：码点 0xFF10 ~ 0xFF19
    for (let i = 0; i < 10; i++) s += String.fromCharCode(0xff10 + i);
    return s;
}

/** 生成半角字符串："A…Z" + "a…z" + "0…9" */
function buildHalfWidthStr() {
    let s = "";
    // 半角大写 A-Z：0x41 ~ 0x5A
    for (let i = 0; i < 26; i++) s += String.fromCharCode(0x41 + i);
    // 半角小写 a-z：0x61 ~ 0x7A
    for (let i = 0; i < 26; i++) s += String.fromCharCode(0x61 + i);
    // 半角数字 0-9：0x30 ~ 0x39
    for (let i = 0; i < 10; i++) s += String.fromCharCode(0x30 + i);
    return s;
}

/** 复用 */
export function replaceAll(findText: string, replaceText: string, useWildcards: boolean) {
    const find = ActiveDocument.Content.Find;
    find.ClearFormatting();
    find.MatchWildcards = useWildcards || false;
    find.Execute(
        findText,
        false, // MatchCase
        false, // MatchWholeWord
        useWildcards || false,
        false, // MatchSoundsLike
        false, // MatchAllWordForms
        true, // Forward
        1, // Wrap = wdFindContinue
        false, // Format
        replaceText,
        2, // Replace = wdReplaceAll
    );
}

/* =========================================================================
 *  规则定义
 * ========================================================================= */

export type PunctuationRuleGroup = "引号配对" | "数字与时间" | "顿号合并" | "标点全角化";

export interface PunctuationRule {
    /** 唯一 id，用于勾选持久化 */
    id: string;
    /** 分组，仅用于 UI 展示 */
    group: PunctuationRuleGroup;
    /** 规则名 */
    label: string;
    /** 简短的“效果演示”，显示在标题下方 */
    description?: string;
    findText: string;
    replaceText: string;
    useWildcards?: boolean;
    /** UI 默认是否勾选 */
    defaultEnabled?: boolean;
}

/**
 * 所有标点相关的替换规则。
 *
 * 注意：顺序会影响最终结果（比如“先配对双引号、再配对单引号”），
 * 请不要随意调整同一个 group 内的规则顺序。
 */
export const PUNCTUATION_RULES: PunctuationRule[] = [
    /* ---------- 标点全角化（默认不勾选，避免误伤英文/数字） ---------- */
    {
        id: "punct-full-comma",
        group: "标点全角化",
        label: "英文逗号 → 中文逗号",
        description: ", → ，",
        findText: ",",
        replaceText: "，",
        defaultEnabled: true,
    },
    {
        id: "punct-full-semicolon",
        group: "标点全角化",
        label: "英文分号 → 中文分号",
        description: "; → ；",
        findText: ";",
        replaceText: "；",
        defaultEnabled: true,
    },
    {
        id: "punct-full-colon",
        group: "标点全角化",
        label: "英文冒号 → 中文冒号",
        description: ": → ：",
        findText: ":",
        replaceText: "：",
        defaultEnabled: true,
    },
    {
        id: "punct-full-question",
        group: "标点全角化",
        label: "英文问号 → 中文问号",
        description: "? → ？",
        findText: "?",
        replaceText: "？",
        defaultEnabled: true,
    },
    {
        id: "punct-full-exclam",
        group: "标点全角化",
        label: "英文感叹号 → 中文感叹号",
        description: "! → ！",
        findText: "!",
        replaceText: "！",
        defaultEnabled: true,
    },
    {
        id: "punct-full-lparen",
        group: "标点全角化",
        label: "英文左括号 → 中文左括号",
        description: "( → （",
        findText: "(",
        replaceText: "（",
        defaultEnabled: true,
    },
    {
        id: "punct-full-rparen",
        group: "标点全角化",
        label: "英文右括号 → 中文右括号",
        description: ") → ）",
        findText: ")",
        replaceText: "）",
        defaultEnabled: true,
    },

    /* ---------- 引号配对 ---------- */
    {
        id: "quote-double-half",
        group: "引号配对",
        label: "半角双引号 → 中文双引号",
        description: '"内容" → “内容”',
        findText: `"((*))"`,
        replaceText: "\u201C\\2\u201D",
        useWildcards: true,
        defaultEnabled: true,
    },
    {
        id: "quote-single-half",
        group: "引号配对",
        label: "半角单引号 → 中文单引号",
        description: "'内容' → ‘内容’",
        findText: `'((*))'`,
        replaceText: "\u2018\\2\u2019",
        useWildcards: true,
        defaultEnabled: true,
    },
    {
        id: "quote-double-full",
        group: "引号配对",
        label: "全角双引号 → 中文双引号",
        description: "＂内容＂ → “内容”",
        findText: `\uff02((*))\uff02`,
        replaceText: "\u201C\\2\u201D",
        useWildcards: true,
        defaultEnabled: true,
    },
    {
        id: "quote-single-full",
        group: "引号配对",
        label: "全角单引号 → 中文单引号",
        description: "＇内容＇ → ‘内容’",
        findText: `\uff07((*))\uff07`,
        replaceText: "\u2018\\2\u2019",
        useWildcards: true,
        defaultEnabled: true,
    },

    /* ---------- 数字与时间 ---------- */
    {
        id: "time-colon",
        group: "数字与时间",
        label: "时间冒号转半角",
        description: "12：30 → 12:30",
        findText: "([0-9]{1,})：([0-9]{1,})",
        replaceText: "\\1:\\2",
        useWildcards: true,
        defaultEnabled: true,
    },
    {
        id: "num-period",
        group: "数字与时间",
        label: "数字间中文句号转小数点",
        description: "1。5 → 1.5",
        findText: "([0-9]{1,})。([0-9])",
        replaceText: "\\1.\\2",
        useWildcards: true,
        defaultEnabled: false,
    },
    {
        id: "num-period-full",
        group: "数字与时间",
        label: "数字间全角句点转半角",
        description: "1．5 → 1.5",
        findText: "([0-9]{1,})．([0-9])",
        replaceText: "\\1.\\2",
        useWildcards: true,
        defaultEnabled: true,
    },
    {
        id: "para-num-period",
        group: "数字与时间",
        label: "段首序号后全角句点",
        description: "段首「1．」→「1.」",
        findText: "(^p[0-9]{1,})．",
        replaceText: "\\1.",
        useWildcards: true,
        defaultEnabled: true,
    },

    /* ---------- 顿号合并 ---------- */
    {
        id: "book-title-comma",
        group: "顿号合并",
        label: "书名号之间的顿号",
        description: "》、《 → 》《",
        findText: "》、《",
        replaceText: "》《",
        defaultEnabled: false,
    },
    {
        id: "quote-comma",
        group: "顿号合并",
        label: "引号之间的顿号",
        description: "”、“ → ”“",
        findText: "”、“",
        replaceText: "”“",
        defaultEnabled: false,
    },
];

/** 是否允许交换 find/replace（含反向引用的规则不行） */
export function canSwapRule(rule: PunctuationRule): boolean {
    return !/\\[0-9]/.test(rule.replaceText);
}

/* =========================================================================
 *  执行
 * ========================================================================= */

export interface ApplyPunctuationOptions {
    swappedIds?: Iterable<string>;
}

/** 按 id 列表应用规则；swappedIds 中的规则会交换 find/replace */
export function applyPunctuationRules(
    ruleIds: string[],
    options: ApplyPunctuationOptions = {},
): { applied: number } {
    const idSet = new Set(ruleIds);
    const swappedSet = new Set(options.swappedIds ?? []);
    let applied = 0;
    for (const rule of PUNCTUATION_RULES) {
        if (!idSet.has(rule.id)) continue;
        const swapped = swappedSet.has(rule.id) && canSwapRule(rule);
        const find = swapped ? rule.replaceText : rule.findText;
        const replace = swapped ? rule.findText : rule.replaceText;
        replaceAll(find, replace, !!rule.useWildcards);
        applied++;
    }
    return { applied };
}

/**
 * 标点更正（兼容旧调用）
 * - 基础更正
 * - 公文标点更正
 */
export function correctPunctuation() {
    const ids = PUNCTUATION_RULES.filter((r) => r.defaultEnabled).map((r) => r.id);
    applyPunctuationRules(ids);
}

/* =========================================================================
 *  其他标点工具
 * ========================================================================= */

/**
 * 全角英文字母及数字转半角
 *
 * 建议配合 withUndoRecord 使用
 */
export function convertAlphaNumToHalfWidth() {
    // 先检测是否存在全角英数字
    const rng = ActiveDocument.Content;
    const find = rng.Find;
    find.ClearFormatting();
    find.MatchWildcards = true;
    find.Text = "[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]";
    find.Forward = true;
    find.Wrap = wdFindStop; // 查找到末尾后停止，避免循环

    // 仅判断存在性，速度非常快
    if (!find.Execute()) {
        console.log("文档中没有全角英数字，无需转换");
        return;
    }
    // 循环映射（批量替换比操作 rng.CharacterWidth = wdWidthHalfWidth 更快）
    const full = buildFullWidthStr(); // 生成全角字符列表
    const half = buildHalfWidthStr(); // 生成半角字符列表
    for (let i = 0; i < full.length; i++) {
        replaceAll(full.charAt(i), half.charAt(i), false);
    }
}
