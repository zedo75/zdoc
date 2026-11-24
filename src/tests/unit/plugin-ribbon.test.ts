/**
 * 功能区装配测试
 *
 * 保护的是装配规则本身：顺序、跨插件共用菜单、幂等（不修改插件声明）、错误校验。
 */
import type { RibbonExtension } from "#kernel/types";

import { assembleRibbon } from "#kernel/ribbon";
import { button, menu, splitButton } from "#vite-plugin-wps-enhance/factory";
import { describe, expect, it } from "vitest";

/** 取某个分组的控件 id 序列 */
function groupIds(config: ReturnType<typeof assembleRibbon>, groupId: string): string[] {
    const group = config.tabs[0]!.groups.find((item) => item.id === groupId);
    return (group?.controls ?? []).map((control) => ("id" in control ? control.id : ""));
}

/** 取某个菜单的条目 id 序列 */
function menuIds(config: ReturnType<typeof assembleRibbon>, menuId: string): string[] {
    for (const group of config.tabs[0]!.groups) {
        for (const control of group.controls) {
            if (control.type === "menu" && control.id === menuId) {
                return control.items.map((item) => ("id" in item ? item.id : ""));
            }
            if (control.type === "splitButton" && control.menu?.id === menuId) {
                return control.menu.items.map((item) => ("id" in item ? item.id : ""));
            }
        }
    }
    return [];
}

describe("功能区装配", () => {
    it("按 order 排序，并允许不同插件往同一个菜单里加条目", () => {
        const sharedMenu = menu("排版菜单", "menuShared", []);

        const first: RibbonExtension = {
            contributes: [
                {
                    container: "grpDocument",
                    order: 20,
                    controls: [button("B", "btnB")],
                },
                {
                    container: "grpDocument",
                    order: 10,
                    controls: [splitButton("sb排版", {}, [button("A", "btnA"), sharedMenu])],
                },
                { container: "menuShared", order: 10, controls: [button("M1", "btnM1")] },
            ],
        };
        const second: RibbonExtension = {
            contributes: [
                { container: "menuShared", order: 20, controls: [button("M2", "btnM2")] },
            ],
        };

        const config = assembleRibbon([first, second]);

        expect(groupIds(config, "grpDocument")).toEqual(["sb排版", "btnB"]);
        expect(menuIds(config, "menuShared")).toEqual(["btnM1", "btnM2"]);
        // 装配是幂等的：不能把条目写回插件声明的数组里
        expect(sharedMenu.items).toEqual([]);
        expect(menuIds(assembleRibbon([first, second]), "menuShared")).toEqual(["btnM1", "btnM2"]);
    });

    it("容器不存在时报错，而不是静默丢控件", () => {
        const bad: RibbonExtension = {
            contributes: [{ container: "menuNotExist", controls: [button("X", "btnX")] }],
        };
        expect(() => assembleRibbon([bad])).toThrow(/找不到控件容器/);
    });

    it("控件 id 重复时报错", () => {
        const a: RibbonExtension = {
            contributes: [{ container: "grpHelper", controls: [button("A", "btnDup")] }],
        };
        const b: RibbonExtension = {
            contributes: [{ container: "grpHelper", controls: [button("B", "btnDup")] }],
        };
        expect(() => assembleRibbon([a, b])).toThrow(/控件 id 重复/);
    });
});
