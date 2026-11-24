/**
 * 人民币金额中文大写。
 *
 * 规则：
 * - 整数部分按「万 / 亿」四位分节，节内零合并、末尾零不读；
 * - 无角分时补「整」；
 * - 有角无分时补「整」（壹元伍角整）；
 * - 有分时角位为零要读「零」（壹元零伍分）；
 * - 金额为零读「零元整」。
 */
const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const SMALL_UNITS = ["", "拾", "佰", "仟"];
const BIG_UNITS = ["", "万", "亿", "万亿", "亿亿"];

/** 把 0–9999 转成大写，内部零合并、末尾零省略 */
function sectionToChinese(section: number): string {
    if (section === 0) return "";

    let result = "";
    let zero = false;
    let pos = 0;
    let n = section;

    while (n > 0) {
        const digit = n % 10;
        if (digit === 0) {
            if (result) zero = true;
        } else {
            result = DIGITS[digit] + SMALL_UNITS[pos] + (zero ? "零" : "") + result;
            zero = false;
        }
        n = Math.floor(n / 10);
        pos++;
    }
    return result;
}

/** 非负整数（可到万亿级）转中文大写 */
export function integerToRmbUpper(integer: number): string {
    if (!Number.isFinite(integer) || integer < 0) return "";
    if (integer === 0) return "零";

    const sections: number[] = [];
    let rest = Math.floor(integer);
    while (rest > 0) {
        sections.push(rest % 10000);
        rest = Math.floor(rest / 10000);
    }

    let result = "";
    let zeroGap = false;

    for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section === 0) {
            if (result) zeroGap = true;
            continue;
        }

        const needZero = Boolean(result) && (zeroGap || section < 1000);
        if (needZero && !result.endsWith("零")) result += "零";

        result += sectionToChinese(section) + (BIG_UNITS[i] ?? "");
        zeroGap = false;
    }

    return result || "零";
}

/**
 * 人民币金额转中文大写。
 *
 * @param value 数字、数字字符串，或带 `¥` / `,` / `元` 的金额字符串
 * @returns 合法金额返回大写；空值 / 无法解析时返回空字符串（由调用方记 warning）
 */
export function rmbUpper(value: unknown): string {
    const amount = parseAmount(value);
    if (amount == null) return "";

    const negative = amount < 0;
    const cents = Math.round(Math.abs(amount) * 100);
    if (!Number.isSafeInteger(cents)) return "";

    const integer = Math.floor(cents / 100);
    const jiao = Math.floor(cents / 10) % 10;
    const fen = cents % 10;

    let result = negative ? "负" : "";

    if (integer > 0) {
        result += integerToRmbUpper(integer) + "元";
    }

    if (integer === 0 && cents === 0) {
        return result + "零元整";
    }

    if (jiao > 0) {
        result += DIGITS[jiao] + "角";
    } else if (fen > 0 && integer > 0) {
        result += "零";
    }

    if (fen > 0) {
        result += DIGITS[fen] + "分";
    } else if (jiao > 0 || integer > 0) {
        result += "整";
    }

    return result;
}

function parseAmount(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== "string") return null;

    const cleaned = value
        .trim()
        .replace(/[¥￥,\s]/g, "")
        .replace(/元$/, "");
    if (cleaned === "") return null;

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}
