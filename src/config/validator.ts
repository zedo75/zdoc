import type {
    FooterConfig,
    GovDocConfig,
    HeaderConfig,
    PageLayoutConfig,
    TypographyConfig,
} from "@/jsa/types";

import { z } from "zod";

import {
    DEFAULT_FOOTER_CONFIG,
    DEFAULT_HEADER_CONFIG,
    DEFAULT_PAGE_LAYOUT_CONFIG,
    DEFAULT_TYPO_CONFIG,
} from "@/config/defaults";

const PageLayoutSchema = z
    .object({
        top: z.number().min(0).default(DEFAULT_PAGE_LAYOUT_CONFIG.top),
        bottom: z.number().min(0).default(DEFAULT_PAGE_LAYOUT_CONFIG.bottom),
        left: z.number().min(0).default(DEFAULT_PAGE_LAYOUT_CONFIG.left),
        right: z.number().min(0).default(DEFAULT_PAGE_LAYOUT_CONFIG.right),
        header: z.number().min(0).default(DEFAULT_PAGE_LAYOUT_CONFIG.header),
        footer: z.number().min(0).default(DEFAULT_PAGE_LAYOUT_CONFIG.footer),
    })
    .strip(); // strict(): 拒绝未知键（抛错）; strip()：删除未知键（静默忽略）

const TitleFontSchema = z
    .object({
        zh: z.string().default(DEFAULT_TYPO_CONFIG.title.zh),
        en: z.string().default(DEFAULT_TYPO_CONFIG.title.en),
        size: z.number().positive().default(DEFAULT_TYPO_CONFIG.title.size),
        spacing: z.number().nonnegative().default(DEFAULT_TYPO_CONFIG.title.spacing),
    })
    .strip();

const MainFontSchema = z
    .object({
        zh: z.string().default(DEFAULT_TYPO_CONFIG.main.zh),
        en: z.string().default(DEFAULT_TYPO_CONFIG.main.en),
        size: z.number().positive().default(DEFAULT_TYPO_CONFIG.main.size),
        spacing: z.number().nonnegative().default(DEFAULT_TYPO_CONFIG.main.spacing),
        indent: z.number().nonnegative().default(DEFAULT_TYPO_CONFIG.main.indent),
    })
    .strip();

const SalutationSchema = z
    .object({
        font: z.string().default(DEFAULT_TYPO_CONFIG.salutation.font),
        bold: z.boolean().default(DEFAULT_TYPO_CONFIG.salutation.bold),
    })
    .strip();

const HeadingSchema = z
    .object({
        font: z.string().default(DEFAULT_TYPO_CONFIG.h1.font),
        bold: z.boolean().default(DEFAULT_TYPO_CONFIG.h1.bold),
    })
    .strip();

const TypographySchema = z
    .object({
        title: TitleFontSchema.default(DEFAULT_TYPO_CONFIG.title),
        main: MainFontSchema.default(DEFAULT_TYPO_CONFIG.main),
        salutation: SalutationSchema.default(DEFAULT_TYPO_CONFIG.salutation),
        h1: HeadingSchema.default(DEFAULT_TYPO_CONFIG.h1),
        h2: HeadingSchema.default(DEFAULT_TYPO_CONFIG.h2),
        h3: HeadingSchema.default(DEFAULT_TYPO_CONFIG.h3),
        topicBoldMode: z
            .enum(["auto", "prefix", "none"])
            .default(DEFAULT_TYPO_CONFIG.topicBoldMode),
    })
    .strip();

const HeaderSchema = z
    .object({
        content: z.string().default(DEFAULT_HEADER_CONFIG.content),
        position: z.enum(["left", "center", "right"]).default(DEFAULT_HEADER_CONFIG.position),
        font: z.string().default(DEFAULT_HEADER_CONFIG.font),
        fontSize: z.number().positive().default(DEFAULT_HEADER_CONFIG.fontSize),
    })
    .strip();

const FooterSchema = z
    .object({
        font: z.string().default(DEFAULT_FOOTER_CONFIG.font),
        fontSize: z.number().positive().default(DEFAULT_FOOTER_CONFIG.fontSize),
        position: z
            .enum(["left", "right", "middle", "inside", "outside"])
            .default(DEFAULT_FOOTER_CONFIG.position),
    })
    .strip();

const GovDocConfigSchema = z
    .object({
        pageLayout: PageLayoutSchema.default(DEFAULT_PAGE_LAYOUT_CONFIG),
        typography: TypographySchema.default(DEFAULT_TYPO_CONFIG),
        header: HeaderSchema.default(DEFAULT_HEADER_CONFIG),
        footer: FooterSchema.default(DEFAULT_FOOTER_CONFIG),
    })
    .strip();

export function validateGovDocConfig(config: any): GovDocConfig {
    return GovDocConfigSchema.parse(config ?? {});
}

export function validateHeaderFooterConfig(config: any): {
    header: HeaderConfig;
    footer: FooterConfig;
} {
    return {
        header: HeaderSchema.parse(config?.header || {}),
        footer: FooterSchema.parse(config?.footer || {}),
    };
}

export function validatePageLayout(config: any): PageLayoutConfig {
    return PageLayoutSchema.parse(config || {});
}

export function validateTypography(config: any): TypographyConfig {
    return TypographySchema.parse(config || {});
}
