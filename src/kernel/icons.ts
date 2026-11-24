/**
 * 插件内核：图标映射
 *
 * `getImage` 是 WPS 在绘制功能区时**同步**调用的，不能等动态 import。
 * 因此这里静态聚合各插件声明的图标（每个插件一个纯数据模块，只有几行），
 * 而不是把整个插件加载进来。
 *
 * 未登记的控件按 `${id}.png` 约定去 `public/images` 找；找不到时 WPS 显示空图标，
 * 不会崩。
 */
import { icons as batchIcons } from "@/features/batch/icons";
import { icons as docUtilsIcons } from "@/features/doc-utils/icons";
import { icons as formatCheckIcons } from "@/features/format-check/icons";
import { icons as govDocIcons } from "@/features/gov-doc/icons";
import { icons as imageToolsIcons } from "@/features/image-tools/icons";
import { icons as textCompareIcons } from "@/features/text-compare/icons";

export const ICON_MAP: Partial<Record<RibbonControlId, ImageFileName>> = {
    ...govDocIcons,
    ...docUtilsIcons,
    ...textCompareIcons,
    ...formatCheckIcons,
    ...imageToolsIcons,
    ...batchIcons,
};

/** 计算控件对应的图片路径（相对加载项根目录） */
export function resolveControlImage(id: string): string {
    return `images/${ICON_MAP[id as RibbonControlId] ?? `${id}.png`}`;
}
