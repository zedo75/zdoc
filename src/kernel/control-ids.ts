/**
 * 插件内核：控件 id 遍历
 *
 * 运行期靠它建立「控件 → 插件」索引（点击时才知道该加载哪个插件的动作），
 * 装配期靠它做重复 id 校验。只处理纯数据，不依赖 WPS。
 */
import type { Control, Group } from "vite-plugin-wps-enhance";
import type { RibbonExtension } from "./types.ts";

/** 递归收集单个控件（含其子项）的 id */
function collectFromControl(control: Control): string[] {
    switch (control.type) {
        case "button":
        case "checkbox":
        case "toggleButton":
        case "editBox":
        case "comboBox":
        case "dropDown":
        case "labelControl":
        case "menuSeparator":
            return [control.id];
        case "splitButton":
            return [
                control.id,
                ...(control.button ? collectFromControl(control.button) : []),
                ...(control.menu ? collectFromControl(control.menu) : []),
            ];
        case "menu":
            return [control.id, ...control.items.flatMap((item) => collectFromControl(item))];
        case "separator":
            return [];
        default:
            return [];
    }
}

/** 收集一组控件（含子项）的 id */
export function collectControlIds(controls: Control[]): string[] {
    return controls.flatMap((control) => collectFromControl(control));
}

/** 收集一组控件（含分组自身 id）的 id */
export function collectGroupControlIds(groups: Group[]): string[] {
    return groups.flatMap((group) => [
        ...(group.id ? [group.id] : []),
        ...group.controls.flatMap((control) => collectFromControl(control)),
    ]);
}

/** 收集插件扩展声明里出现的全部控件 id */
export function collectExtensionControlIds(extension: RibbonExtension): string[] {
    const ids = [
        ...(extension.groups ?? []).flatMap((item) => collectGroupControlIds([item.group])),
        ...(extension.contributes ?? []).flatMap((item) =>
            item.controls.flatMap((control) => collectFromControl(control)),
        ),
    ];
    return [...new Set(ids)];
}

/**
 * 收集**可触发动作**的控件 id。
 *
 * 分组、菜单、拆分按钮、分隔符只是容器，不会触发 `onAction`；派发与契约测试只关心
 * 真正会被点击的控件，否则会要求插件给 `menu1` 这种容器也写一个动作。
 */
function collectActionIdsFromControl(control: Control): string[] {
    switch (control.type) {
        case "button":
        case "checkbox":
        case "toggleButton":
        case "comboBox":
        case "dropDown":
            return [control.id];
        case "splitButton":
            return [
                ...(control.button ? collectActionIdsFromControl(control.button) : []),
                ...(control.menu ? collectActionIdsFromControl(control.menu) : []),
            ];
        case "menu":
            return control.items.flatMap((item) => collectActionIdsFromControl(item));
        default:
            return [];
    }
}

/** 收集一组分组里所有可触发动作的控件 id */
export function collectGroupActionIds(groups: Group[]): string[] {
    return groups.flatMap((item) =>
        item.controls.flatMap((control) => collectActionIdsFromControl(control)),
    );
}

/** 收集插件扩展声明里所有可触发动作的控件 id */
export function collectExtensionActionIds(extension: RibbonExtension): string[] {
    const ids = [
        ...(extension.groups ?? []).flatMap((item) =>
            item.group.controls.flatMap((control) => collectActionIdsFromControl(control)),
        ),
        ...(extension.contributes ?? []).flatMap((item) =>
            item.controls.flatMap((control) => collectActionIdsFromControl(control)),
        ),
    ];
    return [...new Set(ids)];
}
