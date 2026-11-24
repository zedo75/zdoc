/**
 * 插件内核：功能区装配
 *
 * 输入各插件声明的纯数据，输出 `RibbonConfig`。构建期由 `vite.config.ts` 调用并
 * 生成 `public/ribbon.xml`；测试也直接调它来验证「控件 → 插件」归属没有空洞。
 *
 * 装配规则：
 * 1. 预置分组（`layout.ts`）+ 插件自建分组，按 `order` 排序；
 * 2. 指向分组的控件贡献按 `order` 追加到分组末尾；
 * 3. 指向 `menu` 的控件贡献追加到该菜单末尾（可跨插件，天然解决「排版菜单」这种共用菜单）；
 * 4. 全树 id 不得重复，容器找不到直接抛错 —— 拼错容器名在构建期暴露，而不是运行期静默失效。
 */
import type { Control, Group, RibbonConfig } from "vite-plugin-wps-enhance";
import type { RibbonContribution, RibbonExtension } from "./types.ts";

import { group, RibbonBuilder, tab } from "#vite-plugin-wps-enhance/factory";

import { collectControlIds, collectGroupControlIds } from "./control-ids.ts";
import { RIBBON_GROUPS, RIBBON_TAB } from "./layout.ts";

interface PendingContribution extends RibbonContribution {
    /** 插件在 `ribbon.config.ts` 里的注册顺序，用于同权重时的稳定排序 */
    featureIndex: number;
    contributeIndex: number;
    /** 补上默认权重，便于比较 */
    order: number;
}

/** 收集所有可承载贡献的菜单（含 splitButton 里的菜单、嵌套菜单） */
function collectMenus(
    groups: Group[],
    into = new Map<string, Control[]>(),
): Map<string, Control[]> {
    const visit = (control: Control): void => {
        if (control.type === "menu") {
            if (into.has(control.id)) {
                throw new Error(`[ribbon] 菜单 id 重复: ${control.id}`);
            }
            into.set(control.id, control.items);
            control.items.forEach(visit);
        } else if (control.type === "splitButton") {
            if (control.button) visit(control.button);
            if (control.menu) visit(control.menu);
        }
    };

    for (const item of groups) item.controls.forEach(visit);
    return into;
}

/** 排序：权重 → 插件注册顺序 → 声明顺序 */
function sortContributions(items: PendingContribution[]): PendingContribution[] {
    return [...items].sort(
        (a, b) =>
            a.order - b.order ||
            a.featureIndex - b.featureIndex ||
            a.contributeIndex - b.contributeIndex,
    );
}

/** 把各插件声明的纯数据装配成完整的 Ribbon 配置（数组顺序即插件注册顺序） */
export function assembleRibbon(sources: RibbonExtension[]): RibbonConfig {
    interface GroupLayout {
        label: string;
        order: number;
        featureIndex: number;
        /** 插件自建分组自带的控件（预置分组为空） */
        base: Control[];
    }

    const layouts = new Map<string, GroupLayout>();
    for (const item of RIBBON_GROUPS) {
        layouts.set(item.id, { label: item.label, order: item.order, featureIndex: -1, base: [] });
    }

    // 1. 先登记插件自建分组，这样指向它们的贡献也能识别成「分组级」
    sources.forEach((source, featureIndex) => {
        for (const spec of source.groups ?? []) {
            const id = spec.group.id;
            if (!id) {
                throw new Error(`[ribbon] 第 ${featureIndex + 1} 个插件声明了没有 id 的分组`);
            }
            if (layouts.has(id)) {
                throw new Error(`[ribbon] 分组 id 冲突: ${id}（第 ${featureIndex + 1} 个插件）`);
            }
            layouts.set(id, {
                label: spec.group.label,
                order: spec.order ?? 100,
                featureIndex,
                base: spec.group.controls,
            });
        }
    });

    // 2. 贡献归位：分组级 或 菜单级
    const groupContributions = new Map<string, PendingContribution[]>();
    const menuContributions = new Map<string, PendingContribution[]>();

    const push = (
        bucket: Map<string, PendingContribution[]>,
        key: string,
        value: PendingContribution,
    ): void => {
        const list = bucket.get(key);
        if (list) list.push(value);
        else bucket.set(key, [value]);
    };

    sources.forEach((source, featureIndex) => {
        (source.contributes ?? []).forEach((contribution, contributeIndex) => {
            const pending: PendingContribution = {
                ...contribution,
                featureIndex,
                contributeIndex,
                order: contribution.order ?? 100,
            };
            const bucket = layouts.has(contribution.container)
                ? groupContributions
                : menuContributions;
            push(bucket, contribution.container, pending);
        });
    });

    // 3. 分组排序 + 装入贡献
    const orderedGroups = [...layouts.entries()].sort(
        ([aId, a], [bId, b]) =>
            a.order - b.order || a.featureIndex - b.featureIndex || aId.localeCompare(bId),
    );

    const groups: Group[] = orderedGroups.map(([id, layout]) => {
        const controls = [
            ...layout.base,
            ...sortContributions(groupContributions.get(id) ?? []).flatMap((item) => item.controls),
        ];
        return group(layout.label, id, controls);
    });

    // 4. 菜单级贡献：先算出每个菜单的最终条目，再重建菜单（不修改插件声明的数组，
    //    否则同一个声明被装配两次（构建 + 测试、或 HMR）会重复追加）
    const declaredMenus = collectMenus(groups);
    const mergedItems = new Map<string, Control[]>();

    for (const [containerId, contributions] of menuContributions) {
        const items = declaredMenus.get(containerId);
        if (!items) {
            const ids = [
                ...new Set(contributions.flatMap((item) => collectControlIds(item.controls))),
            ];
            throw new Error(
                `[ribbon] 找不到控件容器: ${containerId}（控件 ${ids.join(", ")} 无处安放）`,
            );
        }
        mergedItems.set(containerId, [
            ...items,
            ...sortContributions(contributions).flatMap((item) => item.controls),
        ]);
    }

    const assembledGroups = groups.map((item) => ({
        ...item,
        controls: item.controls.map((control) => rebuildControl(control, mergedItems)),
    }));

    // 5. 全树 id 去重校验
    const seen = new Set<string>();
    for (const id of [RIBBON_TAB.id, ...collectGroupControlIds(assembledGroups)]) {
        if (seen.has(id)) throw new Error(`[ribbon] 控件 id 重复: ${id}`);
        seen.add(id);
    }

    return RibbonBuilder.create({
        tabs: [
            tab(
                RIBBON_TAB.label,
                RIBBON_TAB.id,
                { insertAfterMso: RIBBON_TAB.insertAfterMso },
                assembledGroups,
            ),
        ],
    });
}

/** 按「菜单 id → 最终条目」重建控件树（深层菜单同样处理） */
function rebuildControl(control: Control, mergedItems: Map<string, Control[]>): Control {
    switch (control.type) {
        case "menu": {
            const items = mergedItems.get(control.id) ?? control.items;
            return {
                ...control,
                items: items.map((item) =>
                    rebuildControl(item, mergedItems),
                ) as typeof control.items,
            };
        }
        case "splitButton": {
            return {
                ...control,
                button: control.button
                    ? (rebuildControl(control.button, mergedItems) as typeof control.button)
                    : control.button,
                menu: control.menu
                    ? (rebuildControl(control.menu, mergedItems) as typeof control.menu)
                    : control.menu,
            };
        }
        default:
            return control;
    }
}
