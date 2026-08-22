export const FONT_SIZE_INITIAL = 42;
export const FONT_SIZE_SMALL_INITIAL = 36;
export const FONT_SIZE_ONE = 26;
export const FONT_SIZE_SMALL_ONE = 24;
export const FONT_SIZE_TWO = 22;
export const FONT_SIZE_SMALL_TWO = 18;
export const FONT_SIZE_THREE = 16;
export const FONT_SIZE_SMALL_THREE = 15;
export const FONT_SIZE_FOUR = 14;
export const FONT_SIZE_SMALL_FOUR = 12;
export const FONT_SIZE_FIVE = 10.5;
export const FONT_SIZE_SMALL_FIVE = 9;
export const FONT_SIZE_SIX = 7.5;
export const FONT_SIZE_SMALL_SIX = 6.5;
export const FONT_SIZE_SEVEN = 5.5;
export const FONT_SIZE_EIGHT = 5;

export const FONT_SIZE_MAP: Record<number, string> = {
    [FONT_SIZE_INITIAL]: "初号",
    [FONT_SIZE_SMALL_INITIAL]: "小初",
    [FONT_SIZE_ONE]: "一号",
    [FONT_SIZE_SMALL_ONE]: "小一",
    [FONT_SIZE_TWO]: "二号",
    [FONT_SIZE_SMALL_TWO]: "小二",
    [FONT_SIZE_THREE]: "三号",
    [FONT_SIZE_SMALL_THREE]: "小三",
    [FONT_SIZE_FOUR]: "四号",
    [FONT_SIZE_SMALL_FOUR]: "小四",
    [FONT_SIZE_FIVE]: "五号",
    [FONT_SIZE_SMALL_FIVE]: "小五",
    [FONT_SIZE_SIX]: "六号",
    [FONT_SIZE_SMALL_SIX]: "小六",
    [FONT_SIZE_SEVEN]: "七号",
    [FONT_SIZE_EIGHT]: "八号",
};

const chineseKeywords = ["小标宋", "黑体", "楷体", "仿宋", "宋体", "方正"];
const westernWhitelist = ["Times New Roman", "Nimbus Roman"];

// ----- 缓存变量 -----
let cachedWpsResult: [string[], string[]] | null = null;
let cachedBrowserResult: [string[], string[]] | null = null;

/**
 * 获取 WPS 可用字体（限制白名单）
 * @returns [chineseFonts, westernFonts]
 */
export function getWpsFonts(): [string[], string[]] {
    // 如果已有缓存，直接返回（slice() 浅拷贝 防止外部意外修改原数组）
    if (cachedWpsResult) {
        return [cachedWpsResult[0].slice(), cachedWpsResult[1].slice()];
    }

    let innerFonts: Wps.FontNames | null = null;
    const emptyResult: [string[], string[]] = [[], []];
    try {
        innerFonts = Application.FontNames;
    } catch (e) {
        console.warn("当前不在 WPS 环境中", e);
        return emptyResult;
    }
    if (!innerFonts) return emptyResult;
    const fonts: string[] = [];
    for (let i = 1; i <= innerFonts.Count; i++) {
        fonts.push(innerFonts.Item(i));
    }

    let chineseFonts = fonts.filter(
        (f) => chineseKeywords.some((kw) => f.includes(kw)) || /[\u4e00-\u9fa5]/.test(f),
    );
    let westernFonts = fonts.filter((f) => westernWhitelist.includes(f));

    // 按关键字顺序排序
    chineseFonts = sortByOrder(chineseFonts, chineseKeywords);
    westernFonts = sortByOrder(westernFonts, westernWhitelist);

    // 存入缓存
    cachedWpsResult = [chineseFonts, westernFonts];
    return [chineseFonts.slice(), westernFonts.slice()];
}

/**
 * 获取 浏览器 可用字体（仅用于浏览器调试环境）
 *
 * window.queryLocalFonts 依赖用户授权才能工作，没法在 WPS JS 调试器中使用
 * @returns [chineseFonts, westernFonts]
 */
export async function getBrowserFonts(): Promise<[string[], string[]]> {
    if (cachedBrowserResult) {
        return [cachedBrowserResult[0].slice(), cachedBrowserResult[1].slice()];
    }

    if (!("queryLocalFonts" in window)) {
        console.warn("当前浏览器不支持 queryLocalFonts API");
        return [[], []];
    }

    try {
        const fonts = await window.queryLocalFonts();
        const fontNames = fonts.filter((f) => f.style == "Regular").map((font) => font.fullName);

        let chineseFonts = fontNames.filter(
            (f) => chineseKeywords.some((kw) => f.includes(kw)) || /[\u4e00-\u9fa5]/.test(f),
        );
        let westernFonts = fontNames.filter((f) => westernWhitelist.includes(f));

        chineseFonts = sortByOrder(chineseFonts, chineseKeywords);
        westernFonts = sortByOrder(westernFonts, westernWhitelist);

        cachedBrowserResult = [chineseFonts, westernFonts];
        return [chineseFonts.slice(), westernFonts.slice()];
    } catch (err) {
        console.error("用户拒绝授权或获取失败", err);
        cachedBrowserResult = [[], []];
        return [[], []];
    }
}

/**
 * 按关键词出现顺序对字体列表排序（未匹配的排在末尾）
 * @param fonts 字体名数组
 * @param order 关键词顺序数组
 * @returns 排序后的新数组
 */
function sortByOrder(fonts: string[], order: string[]): string[] {
    const getIndex = (font: string) => {
        for (let i = 0; i < order.length; i++) {
            if (font.includes(order[i])) {
                return i;
            }
        }
        return Infinity; // 未匹配的放到最后
    };
    return [...fonts].sort((a, b) => getIndex(a) - getIndex(b));
}

export function getChineseFontSizeName(pt: number): string {
    return FONT_SIZE_MAP[pt] || "";
}
