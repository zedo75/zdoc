/**
 * 插件内核：契约定义
 *
 * 「一个功能 = 一个插件」。插件声明自己贡献什么（Ribbon 控件、弹窗、任务窗格页面、
 * 动作实现），内核负责装配与派发。契约里只有类型与纯数据，不引用任何业务模块。
 */
import type { TaskPaneDock } from "@/ribbon/taskPane";
import type { Control, Group } from "vite-plugin-wps-enhance";

/** 任务窗格页面声明：对应 `?pane=<name>` 与 `views/<name>.vue` */
export interface PaneSpec {
    /** 页面名，必须与 views 下的文件名一致 */
    name: string;
    /** 窗格标题 */
    title: string;
    /** 停靠位置，默认右侧 */
    dock?: TaskPaneDock;
    /** 导航页排序，越小越靠前，默认 100 */
    order?: number;
}

/** 弹窗声明：对应 `?dialog=<name>` 与 `dialogs/<name>.vue` */
export interface DialogSpec {
    /** 弹窗名，必须与 dialogs 下的文件名一致 */
    name: string;
    /** 窗口标题 */
    title: string;
    /** 宽度，默认 1080 */
    width?: number;
    /** 高度，默认 720 */
    height?: number;
    /** 是否模态，默认 false */
    modal?: boolean;
}

/**
 * Ribbon 控件容器。
 *
 * 可以是内核预置的分组 id（见 `kernel/layout.ts`），也可以是插件自建分组的 id，
 * 或任意 `menu` / `splitButton` 内 `menu` 的 id —— 后者让多个插件能往同一个菜单里加条目。
 */
export type RibbonContainerId = string;

/** 向某个容器追加控件 */
export interface RibbonContribution {
    /** 目标容器 id */
    container: RibbonContainerId;
    /** 要追加的控件 */
    controls: Control[];
    /** 同一容器内的排序权重，默认 100；权重相同按插件注册顺序 */
    order?: number;
}

/** 插件自建的分组（默认排在预置分组之后） */
export interface RibbonGroupSpec {
    group: Group;
    /** 分组顺序权重，默认 100 */
    order?: number;
}

/**
 * 插件对功能区的扩展。
 *
 * 这是纯数据，不 import 任何业务模块；因此构建期（vite.config）也能导入它来生成 ribbon.xml。
 */
export interface RibbonExtension {
    /** 向已有容器追加控件 */
    contributes?: RibbonContribution[];
    /** 自建分组 */
    groups?: RibbonGroupSpec[];
}

/**
 * `ribbon.ts` 的模块形状：默认导出整份纯数据声明。
 *
 * 插件 id 不写在这里——它只属于插件本身（`index.ts` 的 `defineFeature`），
 * 因此 `ribbon.ts` 与 `features/ribbon.config.ts` 都不需要重复写 id。
 */
export interface FeatureRibbonModule {
    default: RibbonExtension;
}

/** Ribbon 动作：只做「点击后要发生的事」，不含参数 */
export type RibbonAction = () => void;

/** 控件 id → 动作。未列出的控件点击时只告警，不抛错 */
export type RibbonActionMap = Partial<Record<RibbonControlId, RibbonAction>>;

/** `actions.ts` 的模块形状（懒加载，点击时才进入首屏） */
export interface FeatureActionsModule {
    actions: RibbonActionMap;
}

/**
 * 插件自定义图标：控件 id → `public/images` 下的文件名。
 *
 * 未登记的控件按 `${id}.png` 约定查找。
 */
export type FeatureIconMap = Partial<Record<RibbonControlId, ImageFileName>>;

/**
 * 插件定义。
 *
 * 约定：
 * - `ribbon` / `actions` 都用惰性 import，避免启动时把全部功能的实现拖进主包；
 * - 模块顶层不要有副作用（配置读取等放到动作里），否则测试与懒加载都会受影响；
 * - 文件夹就是一个插件，插件之间的横向依赖要显式（见 ARCHITECTURE.md）。
 */
export interface FeaturePlugin {
    /** 唯一标识，kebab-case，同时是目录名 */
    id: string;
    /** 展示名 */
    name: string;
    /** 一句话说明 */
    description?: string;
    /** 功能区声明（惰性加载，供运行期建立「控件 → 插件」索引） */
    ribbon?: () => Promise<FeatureRibbonModule>;
    /** 动作实现（惰性加载） */
    actions?: () => Promise<FeatureActionsModule>;
    /** 任务窗格页面 */
    panes?: PaneSpec[];
    /** 弹窗 */
    dialogs?: DialogSpec[];
}
