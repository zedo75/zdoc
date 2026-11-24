import type { DiffGroup } from "@/features/text-compare/core/textCompare";

/** 结果面板的筛选维度 */
export type ResultFilter = "all" | "replace" | "insert" | "delete";

/** 文档同步的写入目标 */
export type SyncTarget = "none" | "old" | "new";

export const RESULT_FILTER_LABELS: Record<ResultFilter, string> = {
    all: "全部",
    replace: "修改",
    insert: "新增",
    delete: "删除",
};

/** 差异块类型 → 中文标签 */
export const CHANGE_TYPE_LABELS: Record<DiffGroup["type"], string> = {
    replace: "修改",
    insert: "新增",
    delete: "删除",
};
