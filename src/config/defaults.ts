import type {
    FooterConfig,
    GovDocConfig,
    HeaderConfig,
    PageLayoutConfig,
    TypographyConfig,
} from "@/config/types";

import { clonePlainData } from "@/utils/clone";

/** 默认页面布局配置（单位：cm） */
export const DEFAULT_PAGE_LAYOUT_CONFIG = {
    top: 3.7,
    left: 2.8,
    right: 2.6,
    bottom: 3.5,
    header: 1.5,
    footer: 2.4,
} as const satisfies PageLayoutConfig;

/**
 * 默认公文样式配置
 *  - 正文：仿宋_GB2312，三号（16pt），固定行距 28.95pt，首行缩进 2 字符
 *  - 标题：方正小标宋简体，二号（22pt），居中，无缩进
 *  - 抬头：楷体_GB2312，顶格
 *  - 一级标题：黑体
 *  - 二级标题：楷体_GB2312
 *  - 三级标题：加粗
 *   字号 / 行距单位均为 pt
 */
export const DEFAULT_TYPO_CONFIG = {
    title: {
        zh: "方正小标宋_GBK",
        en: "方正小标宋_GBK",
        size: 22,
        spacing: 28.95,
    },
    main: {
        zh: "仿宋_GB2312",
        en: "Times New Roman",
        size: 16,
        spacing: 28.95,
        indent: 2,
    },
    salutation: { font: "楷体_GB2312", bold: false },
    h1: { font: "黑体", bold: false },
    h2: { font: "楷体_GB2312", bold: false },
    h3: { font: "仿宋_GB2312", bold: true },
    topicBoldMode: "prefix",
} as const satisfies TypographyConfig;

/** 默认页眉配置（字号单位：pt） */
export const DEFAULT_HEADER_CONFIG = {
    content: "",
    font: "黑体",
    fontSize: 16,
    position: "left",
} as const satisfies HeaderConfig;

/** 默认页脚配置（字号单位：pt） */
export const DEFAULT_FOOTER_CONFIG = {
    font: "宋体",
    fontSize: 14,
    position: "outside",
} as const satisfies FooterConfig;

/**
 * 获取完整的默认公文配置
 */
export function getDefaultConfigFull(): GovDocConfig {
    return {
        pageLayout: clonePlainData(DEFAULT_PAGE_LAYOUT_CONFIG),
        typography: clonePlainData(DEFAULT_TYPO_CONFIG),
        header: clonePlainData(DEFAULT_HEADER_CONFIG),
        footer: clonePlainData(DEFAULT_FOOTER_CONFIG),
    };
}
