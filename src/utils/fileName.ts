import { joinPath, normalizePath } from "@/utils/filePath";

/** Windows 不允许用作文件名的保留名 */
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** 文件名主体默认最大长度，避免路径过长 */
export const MAX_BASE_LENGTH = 80;

/** 重名时最多尝试的后缀序号 */
const MAX_SUFFIX_INDEX = 10000;

export interface SanitizeBaseNameOptions {
    /** 最大长度，默认 {@link MAX_BASE_LENGTH} */
    maxLength?: number;
}

/**
 * 把任意标题清理成合法的文件名（不含扩展名）。
 *
 * - 去掉 Windows 非法字符和控制字符；
 * - 去掉首尾空白与点；
 * - 规避 CON / NUL 等系统保留名；
 * - 限制长度，避免路径过长。
 */
export function sanitizeBaseName(raw: string, options: SanitizeBaseNameOptions = {}): string {
    let name = (raw || "")
        .replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // 用户可能顺手把扩展名也填进来，统一去掉
    name = name.replace(/\.(docx?|wps)$/i, "");
    name = name.replace(/^[.\s]+|[.\s]+$/g, "");

    if (WINDOWS_RESERVED_NAMES.test(name)) name = `_${name}`;

    const maxLength = options.maxLength ?? MAX_BASE_LENGTH;
    if (name.length > maxLength) {
        name = name.slice(0, maxLength).replace(/[.\s]+$/g, "");
    }

    return name;
}

export interface ResolveOutputPathOptions {
    /** 本批次已占用的路径（会被原地更新） */
    taken: Set<string>;
    /** 允许覆盖磁盘上已存在的同名文件；默认 false */
    overwrite?: boolean;
    /** 判断磁盘文件是否存在；默认视为不存在 */
    exists?: (path: string) => boolean;
    /** 找不到可用名称时的错误提示，例如“输出目录” */
    errorHint?: string;
    /** 文件名主体最大长度 */
    maxLength?: number;
}

/**
 * 生成不重复的输出路径。
 *
 * 与旧实现的区别仅在于把“覆盖策略”和“磁盘存在性检查”显式参数化：
 * - `overwrite: true` 时，只要本批次没有占用就直接覆盖磁盘文件；
 * - 否则先尝试原名，再追加 `_2`、`_3`……
 */
export function resolveOutputPath(
    dir: string,
    base: string,
    ext: string,
    options: ResolveOutputPathOptions,
): string {
    const { taken, overwrite = false, exists = () => false } = options;
    const cleanBase = sanitizeBaseName(base, { maxLength: options.maxLength }) || "未命名";
    const desired = joinPath(dir, `${cleanBase}${ext}`);

    if (overwrite && !taken.has(normalizePath(desired))) {
        taken.add(normalizePath(desired));
        return desired;
    }

    if (!taken.has(normalizePath(desired)) && !exists(desired)) {
        taken.add(normalizePath(desired));
        return desired;
    }

    for (let index = 2; index < MAX_SUFFIX_INDEX; index++) {
        const candidate = joinPath(dir, `${cleanBase}_${index}${ext}`);
        if (!taken.has(normalizePath(candidate)) && !exists(candidate)) {
            taken.add(normalizePath(candidate));
            return candidate;
        }
    }

    throw new Error(`无法生成不重复的文件名，请检查${options.errorHint ?? "输出目录"}`);
}
