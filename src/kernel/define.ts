/**
 * 插件内核：插件定义辅助
 *
 * 插件不手写 `RibbonExtension` / `RibbonActionMap` / `Partial<Record<...>>` 这些复杂类型，
 * 统一用 `defineXxx` 包一层：参数位提供上下文类型（键名有补全、值有校验），
 * 返回值仍是内核契约里的类型，开发期再做一次约定校验，生产构建里几乎没有成本。
 */
import type { FeatureIconMap, FeaturePlugin, RibbonActionMap, RibbonExtension } from "./types.ts";

const FEATURE_ID_RE = /^[a-z][a-z0-9-]*$/;
const IMAGE_FILE_RE = /\.(svg|png|jpe?g|gif|bmp)$/i;

/**
 * 是否开发环境。
 *
 * `ribbon.ts` 会被 `vite.config.ts`（Node，没有 `import.meta.env`）直接导入，
 * 因此不能直接写 `import.meta.env.DEV`，否则构建配置加载就会抛错。
 */
const DEV = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;

/** 开发期校验一条插件声明；返回错误信息数组，空数组表示通过 */
export function validateFeature(feature: FeaturePlugin): string[] {
    const errors: string[] = [];

    if (!FEATURE_ID_RE.test(feature.id)) {
        errors.push(`插件 id 必须是小写 kebab-case：${feature.id}`);
    }
    if (!feature.name.trim()) {
        errors.push(`插件 ${feature.id} 缺少 name`);
    }
    if (!feature.ribbon && !feature.actions && !feature.panes?.length && !feature.dialogs?.length) {
        errors.push(`插件 ${feature.id} 没有声明任何能力（ribbon/actions/panes/dialogs）`);
    }

    const panes = new Set<string>();
    for (const pane of feature.panes ?? []) {
        if (panes.has(pane.name)) errors.push(`插件 ${feature.id} 的任务窗格重名：${pane.name}`);
        panes.add(pane.name);
        if (!pane.title) errors.push(`插件 ${feature.id} 的任务窗格 ${pane.name} 缺少标题`);
    }

    const dialogs = new Set<string>();
    for (const dialog of feature.dialogs ?? []) {
        if (dialogs.has(dialog.name)) errors.push(`插件 ${feature.id} 的弹窗重名：${dialog.name}`);
        dialogs.add(dialog.name);
        if (!dialog.title) errors.push(`插件 ${feature.id} 的弹窗 ${dialog.name} 缺少标题`);
    }

    return errors;
}

/** 申明一个插件；开发期校验失败时打印错误（不阻断启动，避免一个配置错误让整个加载项打不开） */
export function defineFeature(feature: FeaturePlugin): FeaturePlugin {
    if (DEV) {
        const errors = validateFeature(feature);
        for (const error of errors) console.error(`[plugin] ${error}`);
    }
    return feature;
}

/**
 * 声明插件对功能区的扩展（`ribbon.ts` 的默认导出）。
 *
 * 插件 id 不在这里声明——它只属于插件本身（`index.ts` 的 `defineFeature`）。
 * 只做类型收敛与开发期形状校验；控件 id 唯一性、容器是否存在由装配阶段
 * （`kernel/ribbon.ts`）统一检查——那时才看得到全部插件。
 */
export function defineRibbon(extension: RibbonExtension): RibbonExtension {
    if (DEV) {
        (extension.groups ?? []).forEach((item, index) => {
            if (!item.group.id) console.error(`[plugin] groups[${index}] 缺少分组 id`);
            if (item.order !== undefined && !Number.isFinite(item.order)) {
                console.error(`[plugin] groups[${index}] 的 order 必须是数字`);
            }
        });

        (extension.contributes ?? []).forEach((item, index) => {
            if (!item.container) console.error(`[plugin] contributes[${index}] 缺少 container`);
            if (!item.controls?.length) {
                console.error(`[plugin] contributes[${index}] 没有声明任何控件`);
            }
            if (item.order !== undefined && !Number.isFinite(item.order)) {
                console.error(`[plugin] contributes[${index}] 的 order 必须是数字`);
            }
        });
    }
    return extension;
}

/** 声明插件的 Ribbon 动作（`actions.ts` 的默认导出） */
export function defineActions(actions: RibbonActionMap): RibbonActionMap {
    if (DEV) {
        for (const [id, handler] of Object.entries(actions)) {
            if (typeof handler !== "function") {
                console.error(`[plugin] 控件 ${id} 的动作不是函数`);
            }
        }
    }
    return actions;
}

/** 声明插件的自定义图标（`icons.ts` 的默认导出） */
export function defineIcons(icons: FeatureIconMap): FeatureIconMap {
    if (DEV) {
        for (const [id, file] of Object.entries(icons)) {
            if (!file) {
                console.error(`[plugin] 控件 ${id} 的图标文件名为空`);
            } else if (!IMAGE_FILE_RE.test(file)) {
                console.error(`[plugin] 控件 ${id} 的图标应带扩展名：${file}`);
            }
        }
    }
    return icons;
}
