/** 批量处理列表的通用状态 */
export type BatchFileStatus = "pending" | "processing" | "success" | "warning" | "error";

/** Element Plus `el-tag` 的 type 取值范围 */
export type BatchStatusTagType = "info" | "primary" | "success" | "warning" | "danger";

export interface StatusLabelOverrides {
    pending?: string;
    processing?: string;
    success?: string;
    warning?: string;
    error?: string;
}

const DEFAULT_LABELS: Required<StatusLabelOverrides> = {
    pending: "待处理",
    processing: "处理中",
    success: "成功",
    warning: "注意",
    error: "失败",
};

/** 状态 → 中文文案；可通过 overrides 覆盖个别文案（如“等待”） */
export function statusLabel(status: BatchFileStatus, overrides?: StatusLabelOverrides): string {
    return overrides?.[status] ?? DEFAULT_LABELS[status];
}

/** 状态 → el-tag type */
export function statusType(status: BatchFileStatus): BatchStatusTagType {
    switch (status) {
        case "processing":
            return "warning";
        case "success":
            return "success";
        case "warning":
            return "warning";
        case "error":
            return "danger";
        default:
            return "info";
    }
}
