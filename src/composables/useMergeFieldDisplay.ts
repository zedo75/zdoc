import { computed, ref } from "vue";

import {
    getFieldShading,
    getViewMode,
    setFieldShading,
    toggleViewMode,
} from "@/jsa/commands/mergeMail";

/** 对外暴露的底纹状态字符串 */
export type ShadingState = "never" | "selected" | "always";

/** 视图字符串 → WPS 枚举 的唯一映射表 */
const SHADING_MAP: Record<ShadingState, Wps.WdFieldShading> = {
    never: wdFieldShadingNever,
    selected: wdFieldShadingWhenSelected,
    always: wdFieldShadingAlways,
};

/**
 * 邮件合并 - 视图模式 / 域底纹
 *
 * 对外只暴露字符串状态，WPS 枚举映射封在内部。
 */
export function useMergeFieldDisplay() {
    /** 0 = 显示值；1 = 显示域 */
    const viewMode = ref<0 | 1>(0);

    /** 当前域底纹状态（WPS 枚举） */
    const fieldShading = ref<Wps.WdFieldShading>(wdFieldShadingNever);

    /** 派生给模板用的字符串状态 */
    const shadingState = computed<ShadingState>(() => {
        if (fieldShading.value === wdFieldShadingAlways) return "always";
        if (fieldShading.value === wdFieldShadingWhenSelected) return "selected";
        return "never";
    });

    /** 从 WPS 读最新状态，同步到本地 ref */
    function refreshDisplayState() {
        viewMode.value = getViewMode();
        fieldShading.value = getFieldShading();
    }

    /** 切换“显示值 / 显示域” */
    function toggleView() {
        toggleViewMode();
        viewMode.value = getViewMode();
    }

    /** 模板只传字符串，映射在这里完成 */
    function setShading(state: ShadingState) {
        const mode = SHADING_MAP[state];
        if (fieldShading.value === mode) return;
        fieldShading.value = mode;
        setFieldShading(mode);
    }

    return {
        viewMode,
        shadingState,
        refreshDisplayState,
        toggleView,
        setShading,
    };
}
