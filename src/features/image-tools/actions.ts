import { defineActions } from "#kernel/define";
import { openPane } from "#kernel/dispatch";

import { withUndoRecord } from "@/wps/withAction";

import { exportAllImages, formatInlineImages } from "./commands/image";

/** 图片工具 */
export const actions = defineActions({
    btnPictureResize: () => openPane("image-resize"),
    btnExportPicture: exportAllImages,
    btnImageTypo: () => withUndoRecord(formatInlineImages),
});
