import type { PageLayoutConfig } from "@/config/types";

import { DEFAULT_PAGE_LAYOUT_CONFIG } from "@/config/defaults";

/**
 * 设置当前文档的页面布局
 * @param options 页面参数
 */
export function setPageLayout(options: PageLayoutConfig, doc: Wps.Document = ActiveDocument) {
    const merged = Object.assign({}, DEFAULT_PAGE_LAYOUT_CONFIG, options);
    const { top, bottom, left, right, header, footer } = merged;

    const ps = doc.PageSetup; // 获取页面设置对象
    // 设置上下左右边距（厘米）
    ps.TopMargin = Application.CentimetersToPoints(top);
    ps.BottomMargin = Application.CentimetersToPoints(bottom);
    ps.LeftMargin = Application.CentimetersToPoints(left);
    ps.RightMargin = Application.CentimetersToPoints(right);
    // 页眉页脚
    ps.HeaderDistance = Application.CentimetersToPoints(header);
    ps.FooterDistance = Application.CentimetersToPoints(footer);
}
