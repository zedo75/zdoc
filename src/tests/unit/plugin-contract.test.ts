/**
 * 插件契约测试
 *
 * 这些断言保护的是「插件式架构本身」而不是某个功能：
 * - 运行期注册表与构建期 ribbon 清单不能漏插件；
 * - 每个控件都必须有且只有一个归属插件，且归属插件必须实现了它的动作；
 * - 声明的任务窗格 / 弹窗必须真的存在对应文件（否则用户点开是白屏）。
 */
import { collectExtensionActionIds, collectGroupActionIds } from "#kernel/control-ids";
import { features, validateRegistry } from "#kernel/registry";
import { describe, expect, it } from "vitest";

import { xmlConfig } from "@/features/ribbon.config";

const viewModules = import.meta.glob("@/features/*/views/*.vue");
const dialogModules = import.meta.glob("@/features/*/dialogs/*.vue");

function baseNames(modules: Record<string, unknown>): Set<string> {
    return new Set(
        Object.keys(modules).map((path) => (path.split("/").pop() ?? "").replace(/\.vue$/, "")),
    );
}

const viewNames = baseNames(viewModules);
const dialogNames = baseNames(dialogModules);

describe("插件契约", () => {
    it("每个插件的功能区声明都进入了装配", async () => {
        const assembled = new Set(collectGroupActionIds(xmlConfig.tabs[0]!.groups));

        for (const feature of features) {
            if (!feature.ribbon) continue;
            const module = await feature.ribbon();
            for (const id of collectExtensionActionIds(module.default)) {
                expect(
                    assembled.has(id),
                    `插件 ${feature.id} 的控件 ${id} 没有进入功能区装配（features/ribbon.config.ts 漏了？）`,
                ).toBe(true);
            }
        }
    });

    it("插件 id / 任务窗格 / 弹窗不重名", () => {
        expect(validateRegistry()).toEqual([]);
    });

    it("任务窗格与弹窗声明的文件都存在", () => {
        for (const feature of features) {
            for (const pane of feature.panes ?? []) {
                expect(viewNames.has(pane.name), `${feature.id} 缺少 views/${pane.name}.vue`).toBe(
                    true,
                );
            }
            for (const dialog of feature.dialogs ?? []) {
                expect(
                    dialogNames.has(dialog.name),
                    `${feature.id} 缺少 dialogs/${dialog.name}.vue`,
                ).toBe(true);
            }
        }
    });

    it("功能区里的每个控件都有唯一归属插件，且动作已实现", async () => {
        const ribbonIds = collectGroupActionIds(xmlConfig.tabs[0]!.groups);

        const owners = new Map<string, string>();
        for (const feature of features) {
            if (!feature.ribbon) continue;
            const module = await feature.ribbon();
            const ids = collectExtensionActionIds(module.default);
            const actions = feature.actions
                ? (await feature.actions()).actions
                : ({} as Record<string, () => void>);

            for (const id of ids) {
                const previous = owners.get(id);
                expect(previous, `控件 ${id} 被 ${previous} 和 ${feature.id} 同时声明`).toBe(
                    undefined,
                );
                owners.set(id, feature.id);

                expect(
                    typeof actions[id as RibbonControlId],
                    `插件 ${feature.id} 声明了控件 ${id}，但 actions 里没有实现`,
                ).toBe("function");
            }
        }

        // 装配结果里的每个控件都必须能在插件声明里找到
        for (const id of ribbonIds) {
            expect(owners.has(id), `功能区控件 ${id} 没有归属插件`).toBe(true);
        }
    });
});
