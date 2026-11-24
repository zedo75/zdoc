/**
 * 插件清单（构建期）
 *
 * 这个文件只在 Node 侧被 `vite.config.ts` 使用：把各插件的功能区声明装配成 ribbon.xml。
 * 运行期的「控件 → 插件」索引由 `kernel/registry.ts` 按插件的 `index.ts` 建立；
 * 两边都不写插件 id —— id 只属于插件本身，`plugin-contract` 会校验
 * 「每个插件声明的控件都进入了装配」。
 *
 * 这里刻意用相对路径 + 默认导入：vite.config 的加载器不解析 tsconfig 的 `@` 别名，
 * 也不应该把插件的运行时模块拖进构建配置（`ribbon.ts` 是纯数据声明）。
 */
import { assembleRibbon } from "#kernel/ribbon";

import docUtilsRibbon from "./doc-utils/ribbon.ts";
import govDocRibbon from "./gov-doc/ribbon.ts";
import imageToolsRibbon from "./image-tools/ribbon.ts";
import punctuationRibbon from "./punctuation/ribbon.ts";

/**
 * 参与功能区装配的插件。
 *
 * 数组顺序即插件注册顺序：同一容器里权重相同的控件按这个顺序排列，
 * 与 `kernel/registry.ts` 的 `features` 顺序保持一致。
 */
const ribbonExtensions = [govDocRibbon, imageToolsRibbon, punctuationRibbon, docUtilsRibbon];

/** 生成 ribbon.xml 用的配置 */
export const xmlConfig = assembleRibbon(ribbonExtensions);
