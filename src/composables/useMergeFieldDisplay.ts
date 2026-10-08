import type { ViewMode } from "@/jsa/commands/mergeMail";

import { computed, ref } from "vue";

import {
    getFieldShading,
    getViewMode,
    setFieldShading,
    setViewMode,
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
    // 内部缓存 —— WPS 是唯一真源，这里只是它在 Vue 的镜像
    /** 0 = 显示值；1 = 显示域 */
    const viewModeSource = ref<ViewMode>(0);
    /** 当前域底纹状态（WPS 枚举） */
    const shadingSource = ref<Wps.WdFieldShading>(wdFieldShadingNever);

    /** 对外派生 —— 模板只读 */
    const viewMode = computed(() => viewModeSource.value);
    const shadingState = computed<ShadingState>(() => {
        if (shadingSource.value === wdFieldShadingAlways) return "always";
        if (shadingSource.value === wdFieldShadingWhenSelected) return "selected";
        return "never";
    });

    /** UI → 文档：设为目标值 */
    function applyViewMode(next: ViewMode) {
        if (viewModeSource.value === next) return;
        setViewMode(next);
        viewModeSource.value = getViewMode();
    }

    /** UI → 文档：设为目标值 */
    function applyShading(state: ShadingState) {
        const mode = SHADING_MAP[state];
        if (shadingSource.value === mode) return;
        setFieldShading(mode);
        shadingSource.value = getFieldShading();
    }

    /** 文档 → Vue：只写 raw */
    function refreshDisplayState() {
        viewModeSource.value = getViewMode();
        shadingSource.value = getFieldShading();
    }

    return {
        viewMode,
        shadingState,
        applyViewMode,
        applyShading,
        refreshDisplayState,
    };
}
