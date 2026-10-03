import type {
    FooterConfig,
    GovDocConfig,
    HeaderConfig,
    PageLayoutConfig,
    TypographyConfig,
} from "@/jsa/types";

/** 默认页面布局配置 */
export const DEFAULT_PAGE_LAYOUT_CONFIG: PageLayoutConfig = Object.freeze({
    top: 3.7,
    left: 2.8,
    right: 2.6,
    bottom: 3.5,
    header: 1.5,
    footer: 2.4,
});

/**
 * 默认的公文样式配置
 *  - 正文：仿宋_GB2312，三号（16 磅），固定行距 28.95 磅，首行缩进 2 字符，两端对齐
 *  - 标题：方正小标宋简体，二号（22 磅），居中，无缩进
 *  - 抬头：楷体_GB2312，顶格（无缩进，由代码控制）
 *  - 一级标题：黑体
 *  - 二级标题：楷体_GB2312
 *  - 三级标题：加粗
 *  - 小标题：加粗
 */
export const DEFAULT_TYPO_CONFIG: TypographyConfig = Object.freeze({
    // 公文标题
    title: {
        zh: "方正小标宋_GBK",
        en: "方正小标宋_GBK",
        size: 22, // 二号
        spacing: 28.95,
    },
    main: {
        zh: "仿宋_GB2312",
        en: "Times New Roman",
        size: 16, // 三号
        spacing: 28.95,
        indent: 2,
    },
    salutation: { font: "楷体_GB2312", bold: false },
    h1: { font: "黑体", bold: false },
    h2: { font: "楷体_GB2312", bold: false },
    h3: { font: "仿宋_GB2312", bold: true },
    topicBoldMode: "prefix",
});

/** 默认页眉配置 */
export const DEFAULT_HEADER_CONFIG: HeaderConfig = Object.freeze({
    content: "",
    font: "黑体",
    fontSize: 16,
    position: "left",
});

/** 默认页脚配置 */
export const DEFAULT_FOOTER_CONFIG: FooterConfig = Object.freeze({
    font: "宋体",
    fontSize: 14,
    position: "outside",
});

/**
 * 获取完整的默认公文配置
 */
export function getDefaultConfigFull(): GovDocConfig {
    return {
        pageLayout: { ...DEFAULT_PAGE_LAYOUT_CONFIG },
        typography: { ...DEFAULT_TYPO_CONFIG },
        header: { ...DEFAULT_HEADER_CONFIG },
        footer: { ...DEFAULT_FOOTER_CONFIG },
    };
}
