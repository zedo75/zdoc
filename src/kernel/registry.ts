/**
 * 插件内核：注册表
 *
 * 职责：
 * 1. 汇总插件列表（唯一需要改动的注册点）；
 * 2. 提供「页面 / 弹窗」查找（导航页、动作里按名字打开）；
 * 3. 维护「控件 id → 插件」索引，点击时只加载对应插件的动作模块。
 *
 * 注意：这里只 import 插件的 `index.ts`（纯元数据）。插件声明里的 `ribbon` / `actions`
 * 都是 `() => import(...)`，所以注册表本身很轻。
 */
import type { DialogSpec, FeaturePlugin, PaneSpec } from "./types";

import { batchFeature } from "@/features/batch";
import { docUtilsFeature } from "@/features/doc-utils";
import { formatCheckFeature } from "@/features/format-check";
import { govDocFeature } from "@/features/gov-doc";
import { imageToolsFeature } from "@/features/image-tools";
import { mailMergeFeature } from "@/features/mail-merge";
import { punctuationFeature } from "@/features/punctuation";
import { tableFeature } from "@/features/table";
import { textCompareFeature } from "@/features/text-compare";

import { collectExtensionActionIds } from "./control-ids";

/**
 * 插件清单。
 *
 * 顺序即默认权重：导航页排序、功能区同权重控件的先后都由它决定。
 */
export const features: FeaturePlugin[] = [
    govDocFeature,
    textCompareFeature,
    mailMergeFeature,
    batchFeature,
    formatCheckFeature,
    imageToolsFeature,
    punctuationFeature,
    tableFeature,
    docUtilsFeature,
];

/** 任务窗格页面 + 所属插件 */
export interface PaneEntry {
    name: string;
    title: string;
    featureId: string;
    featureName: string;
    dock: NonNullable<PaneSpec["dock"]>;
    order: number;
}

/** 弹窗 + 所属插件 */
export interface DialogEntry {
    featureId: string;
    featureName: string;
    spec: DialogSpec;
}

/** 校验插件清单：id / 页面 / 弹窗不能重名。返回错误列表，测试与开发期都用它 */
export function validateRegistry(list: FeaturePlugin[] = features): string[] {
    const errors: string[] = [];
    const featureIds = new Set<string>();
    const paneNames = new Map<string, string>();
    const dialogNames = new Map<string, string>();

    for (const feature of list) {
        if (featureIds.has(feature.id)) {
            errors.push(`插件 id 重复：${feature.id}`);
        }
        featureIds.add(feature.id);

        for (const pane of feature.panes ?? []) {
            const owner = paneNames.get(pane.name);
            if (owner) errors.push(`任务窗格 ${pane.name} 同时被 ${owner} 和 ${feature.id} 声明`);
            paneNames.set(pane.name, feature.id);
        }

        for (const dialog of feature.dialogs ?? []) {
            const owner = dialogNames.get(dialog.name);
            if (owner) errors.push(`弹窗 ${dialog.name} 同时被 ${owner} 和 ${feature.id} 声明`);
            dialogNames.set(dialog.name, feature.id);
        }
    }

    return errors;
}

/** 所有任务窗格页面，按插件顺序 + 页面 order 排序 */
export function listPanes(): PaneEntry[] {
    return features.flatMap((feature) =>
        (feature.panes ?? []).map((pane) => ({
            name: pane.name,
            title: pane.title,
            featureId: feature.id,
            featureName: feature.name,
            dock: pane.dock ?? "right",
            order: pane.order ?? 100,
        })),
    );
}

/** 按页面名查找任务窗格 */
export function findPane(name: string): PaneEntry | undefined {
    return listPanes().find((pane) => pane.name === name);
}

/** 按弹窗名查找弹窗 */
export function findDialog(name: string): DialogEntry | undefined {
    for (const feature of features) {
        const spec = feature.dialogs?.find((dialog) => dialog.name === name);
        if (spec) return { featureId: feature.id, featureName: feature.name, spec };
    }
    return undefined;
}

/* ------------------------------ 动作派发 ------------------------------ */

let ownerIndexPromise: Promise<Map<string, FeaturePlugin>> | undefined;

async function buildOwnerIndex(): Promise<Map<string, FeaturePlugin>> {
    const index = new Map<string, FeaturePlugin>();

    await Promise.all(
        features.map(async (feature) => {
            if (!feature.ribbon) return;
            try {
                const module = await feature.ribbon();
                for (const id of collectExtensionActionIds(module.default)) {
                    const owner = index.get(id);
                    if (owner && owner !== feature) {
                        console.error(`[plugin] 控件 ${id} 同时属于 ${owner.id} 和 ${feature.id}`);
                        continue;
                    }
                    index.set(id, feature);
                }
            } catch (error) {
                console.error(`[plugin] 加载 ${feature.id} 的功能区声明失败`, error);
            }
        }),
    );

    return index;
}

/** 预热「控件 → 插件」索引：只加载纯数据声明，不加载动作实现 */
export function prewarmRibbonIndex(): void {
    ownerIndexPromise ??= buildOwnerIndex();
    void ownerIndexPromise.catch((error) => console.warn("[plugin] 预热功能区索引失败", error));
}

const actionsCache = new Map<string, Promise<unknown>>();

function loadActions(feature: FeaturePlugin): Promise<unknown> {
    let promise = actionsCache.get(feature.id);
    if (!promise) {
        promise = feature.actions!();
        actionsCache.set(feature.id, promise);
    }
    return promise;
}

/**
 * 执行一次 Ribbon 动作。
 *
 * `callbacks.ts` 在点击时动态 import 本模块并调用它：首次点击多一次 chunk 加载，
 * 之后该插件的动作模块常驻；空闲时 `prewarmRibbonIndex()` 已把索引准备好。
 */
export async function dispatchRibbonAction(id: RibbonControlId): Promise<void> {
    ownerIndexPromise ??= buildOwnerIndex();
    const owners = await ownerIndexPromise;
    const feature = owners.get(id);

    if (!feature?.actions) {
        console.warn(`[plugin] 控件没有归属插件或没有动作声明：${id}`);
        return;
    }

    const module = (await loadActions(feature)) as { actions?: Record<string, () => void> };
    const handler = module.actions?.[id];
    if (!handler) {
        console.warn(`[plugin] 插件 ${feature.id} 没有实现控件 ${id} 的动作`);
        return;
    }

    handler();
}
