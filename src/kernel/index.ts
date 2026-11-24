/**
 * 插件内核：对外入口
 *
 * 插件作者通常只需要：
 * - `defineFeature` / 类型：声明插件；
 * - `openPane` / `openDialog`：打开自己声明的页面/弹窗。
 *
 * 其余（装配、派发、图标）由内核与 `callbacks.ts` 使用。
 */
export type {
    DialogSpec,
    FeatureIconMap,
    FeatureActionsModule,
    FeaturePlugin,
    FeatureRibbonModule,
    PaneSpec,
    RibbonAction,
    RibbonActionMap,
    RibbonContribution,
    RibbonExtension,
    RibbonGroupSpec,
} from "./types";

export { openDialog, openPane, prewarmKernel, runRibbonAction } from "./dispatch";
export { defineActions, defineFeature, defineIcons, defineRibbon, validateFeature } from "./define";
export { RIBBON_GROUP_IDS, RIBBON_GROUPS, RIBBON_TAB } from "./layout";
export { features, findDialog, findPane, listPanes, validateRegistry } from "./registry";
