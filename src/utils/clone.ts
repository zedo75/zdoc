type DeepMutable<T> = T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T;

/**
 * 深拷贝纯数据对象（仅支持：普通对象 / 数组 / 基本类型）。
 * 不支持 Date / Map / Set / RegExp / 函数 / 循环引用。
 * 返回可变副本，可用于替换 Object.freeze 产出的只读模板。
 */
export function clonePlainData<T>(value: T): DeepMutable<T> {
    if (value === null || typeof value !== "object") {
        return value as DeepMutable<T>;
    }
    if (Array.isArray(value)) {
        return value.map((item) => clonePlainData(item)) as DeepMutable<T>;
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
        result[key] = clonePlainData((value as Record<string, unknown>)[key]);
    }
    return result as DeepMutable<T>;
}
