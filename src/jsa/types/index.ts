export interface TitleConfig {
    /**
     * 中文字体
     */
    zh: string;
    /**
     * 西文字体，如 "Times New Roman" 等
     */
    en: string;
    /**
     * 字号磅值，如 16 对应 "三号"
     */
    size: number;
    /**
     * 行距，默认为固定磅值
     */
    spacing: number;
}

export interface MainConfig extends TitleConfig {
    /**
     * 首行缩进（字符数）
     */
    indent: number;
}

export interface SimpleFontConfig {
    font: string; // 字体名称
    bold: boolean; // 是否加粗，可选
}

/**
 * 小标题加粗模式
 *
 * - `auto`: 默认整句加粗，内容较长时按 "prefix" 模式处理
 * - `prefix`: 仅加粗段首的 2-3 个字（如"一是"、"二是"）
 * - `none`: 不加粗
 */
export type TopicBoldMode = "auto" | "prefix" | "none";

export const TOPIC_BOLD_MODE_OPTIONS = [
    { value: "auto", label: "自动（短句整句加粗，长句仅前缀）" },
    { value: "prefix", label: `仅前缀（如"一是"、"二是"）` },
    { value: "none", label: "不加粗" },
] as const satisfies readonly { label: string; value: TopicBoldMode }[];

/**
 * 完整排版配置
 */
export interface TypographyConfig {
    title: TitleConfig;
    /**
     * 正文
     */
    main: MainConfig;
    /**
     * 抬头 / 称谓，或主送机关
     */
    salutation: SimpleFontConfig;
    /**
     * 一级标题：一、二、...
     */
    h1: SimpleFontConfig;
    /**
     * 二级标题：（一）（二）...
     */
    h2: SimpleFontConfig;
    /**
     * 三级标题：1. 2. ...
     */
    h3: SimpleFontConfig;
    /**
     * 小标题加粗模式，或段落中对仗的"小标题"（一是...）
     */
    topicBoldMode: TopicBoldMode;
    /**
     * 是否将连续标题行的段落标记改为软换行（制作目录时用）
     */
    softLineBreakForTitle?: boolean;
}

export interface PageLayoutConfig {
    /** 上边距（厘米） */
    top: number;
    /** 下边距（厘米） */
    bottom: number;
    /** 左边距（厘米） */
    left: number;
    /** 右边距（厘米） */
    right: number;
    /** 页眉距纸张顶端距离（厘米） */
    header: number;
    /** 页脚距纸张底端距离（厘米） */
    footer: number;
}

export type HeaderPosition = "left" | "center" | "right";

/**
 * 页眉/页脚内容配置
 * 用于定义文档页眉或页脚的文本样式及对齐方式
 */
export interface HeaderConfig {
    /** 显示的文本内容 */
    content: string;
    /** 水平对齐方式 */
    position: HeaderPosition;
    /** 字体名称 */
    font: string;
    /** 字体大小（单位：磅） */
    fontSize: number;
}

export type PagenumPosition = "left" | "middle" | "right" | "inside" | "outside";

/**
 * 页码配置
 * 用于定义页码的字体样式及在页面中的位置
 */
export interface FooterConfig {
    /** 字体名称 */
    font: string;
    /** 字体大小（单位：磅） */
    fontSize: number;
    /** 页码在页脚中的位置 */
    position: PagenumPosition;
}

/**
 * 页眉/页脚整体配置
 * 组合了头部内容和页码的完整配置项
 */
export interface HeaderFooterConfig {
    /** 页眉/页脚内容配置 */
    header: HeaderConfig;
    /** 页码配置 */
    pagenum: FooterConfig;
}

export interface GovDocConfig {
    pageLayout: PageLayoutConfig;
    typography: TypographyConfig;
    header: HeaderConfig;
    footer: FooterConfig;
}

export interface ParaInfo {
    index: number; // 段落序号（1-based）
    isEmpty: boolean; // 是否空行（trim 后为空）
    isSubtitle: boolean; // 匹配副标题特征（稿、——、双空格、文号）
    isAttachmentLabel: boolean; // 匹配 "附件X" 开头
    isHeading: boolean; // 匹配层级标题（一、 （一） 1.）
    hasForbidden: boolean; // 是否包含禁止符号
}
