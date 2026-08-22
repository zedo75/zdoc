/**
 * WPS 自带的“更改大小写”对话框
 */
export function openWpsChangeCaseDialog() {
    Application.Dialogs.Item(wdDialogFormatChangeCase).Show();
}

/**
 * 生成全角字符串："ABCD...Z" + "abcd...z" + "0123...9"
 */
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

/**
 * 生成半角字符串："ABCD...Z" + "abcd...z" + "012...9"
 */
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

function replaceAll(findText: string, replaceText: string, useWildcards: boolean) {
    let find = ActiveDocument.Content.Find;
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

/**
 * 英文标点转为全角（即中文标点）
 *
 * 建议配合 withUndoRecord 使用
 */
export function convertPunctuationToFullWidth() {
    let eng = [",", ";", ":", "?", "!", "(", ")"];
    let chn = ["，", "；", "：", "？", "！", "（", "）"];

    // 基本标点替换（无通配符）
    for (let i = 0; i < eng.length; i++) {
        replaceAll(eng[i], chn[i], false);
    }
}

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

/**
 * 标点更正
 * - 基础更正
 * - 公文标点更正
 */
export function correctPunctuation() {
    // WPS 有 bug：https://bbs.wps.cn/topic/87508  https://bbs.wps.cn/topic/42856
    // 半角双引号配对
    replaceAll(`"((*))"`, "\u201C\\2\u201D", true);
    replaceAll(`'((*))'`, "\u2018\\2\u2019", true);
    // 全角双引号配对
    replaceAll(`\uff02((*))\uff02`, "\u201C\\2\u201D", true);
    replaceAll(`\uff07((*))\uff07`, "\u2018\\2\u2019", true);

    // 数字间的句号、冒号（日期、时间）
    replaceAll("([0-9]{1,})：([0-9]{1,})", "\\1:\\2", true);
    replaceAll("([0-9]{1,})。([0-9])", "\\1.\\2", true);
    replaceAll("([0-9]{1,})．([0-9])", "\\1.\\2", true);
    replaceAll("(^p[0-9]{1,})．", "\\1.", true);

    // 顿号
    replaceAll("》、《", "》《", true);
    replaceAll("”、“", "”“", true);
}
