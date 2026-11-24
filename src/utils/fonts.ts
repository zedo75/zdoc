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
// 注意：失败结果（不在 WPS 环境 / 浏览器不支持 API）同样要缓存，
// 否则每次调用都会重新探测并重复输出告警。
let cachedWpsResult: [string[], string[]] | null = null;
let cachedBrowserResult: [string[], string[]] | null = null;
let browserFontsPromise: Promise<[string[], string[]]> | null = null;

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
        // 缓存失败结果，全局只告警一次
        cachedWpsResult = emptyResult;
        return [[], []];
    }
    if (!innerFonts) {
        cachedWpsResult = emptyResult;
        return [[], []];
    }
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

    // 并发去重：queryLocalFonts 是异步的，缓存要等 await 之后才写入，
    // 多个调用同时进来会各自发起一次查询（甚至多次弹授权框）。
    if (!browserFontsPromise) {
        browserFontsPromise = queryBrowserFonts().finally(() => {
            browserFontsPromise = null;
        });
    }
    const result = await browserFontsPromise;
    // 共享同一个 Promise，但每个调用方拿到独立副本，避免互相修改
    return [result[0].slice(), result[1].slice()];
}

async function queryBrowserFonts(): Promise<[string[], string[]]> {
    if (!("queryLocalFonts" in window)) {
        console.warn("当前浏览器不支持 queryLocalFonts API");
        cachedBrowserResult = [[], []]; // 缓存失败结果，避免重复告警
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

/** 清空内部缓存（仅用于测试 / HMR / 手动重试字体探测） */
export function resetFontCaches(): void {
    cachedWpsResult = null;
    cachedBrowserResult = null;
    browserFontsPromise = null;
}
