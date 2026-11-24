/**
 * 插件内核：功能区骨架
 *
 * 这里只放「选项卡 + 分组」的骨架，不放任何控件。控件由各插件通过
 * `RibbonExtension.contributes` 声明，内核按 `order` 装配。
 *
 * 分组 id 是对外契约的一部分：插件用它指定控件归属。改名等于破坏插件契约，
 * 因此保持稳定；要加分组请优先由插件自建（`RibbonGroupSpec`）。
 */

/** 唯一的选项卡 */
export const RIBBON_TAB = {
    id: "wpsDocHelperTab",
    label: "公文助手(&Z)",
    insertAfterMso: "TabPageLayoutWord",
} as const;

/** 预置分组 */
export interface RibbonGroupLayout {
    id: string;
    label: string;
    /** 分组顺序，小的在前 */
    order: number;
}

/** 预置分组表：插件用这里的 id 作为 `contributes[].container` */
export const RIBBON_GROUPS: RibbonGroupLayout[] = [
    { id: "grpDocument", label: "文档处理", order: 10 },
    { id: "grpStyle", label: "快捷样式", order: 20 },
    { id: "grpHelper", label: "辅助", order: 30 },
    { id: "grpOther", label: "其他", order: 40 },
];

/** 预置分组 id 集合 */
export const RIBBON_GROUP_IDS = new Set(RIBBON_GROUPS.map((item) => item.id));
