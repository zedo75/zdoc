import type {
    FooterConfig,
    GovDocConfig,
    HeaderConfig,
    PageLayoutConfig,
    TypographyConfig,
} from "@/jsa/types";

import * as v from "valibot";

import {
    DEFAULT_FOOTER_CONFIG,
    DEFAULT_HEADER_CONFIG,
    DEFAULT_PAGE_LAYOUT_CONFIG,
    DEFAULT_TYPO_CONFIG,
} from "@/config/defaults";

const PageLayoutSchema = v.object({
    top: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_PAGE_LAYOUT_CONFIG.top),
    bottom: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_PAGE_LAYOUT_CONFIG.bottom),
    left: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_PAGE_LAYOUT_CONFIG.left),
    right: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_PAGE_LAYOUT_CONFIG.right),
    header: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_PAGE_LAYOUT_CONFIG.header),
    footer: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_PAGE_LAYOUT_CONFIG.footer),
});

const TitleFontSchema = v.object({
    zh: v.optional(v.string(), DEFAULT_TYPO_CONFIG.title.zh),
    en: v.optional(v.string(), DEFAULT_TYPO_CONFIG.title.en),
    size: v.optional(v.pipe(v.number(), v.gtValue(0)), DEFAULT_TYPO_CONFIG.title.size),
    spacing: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_TYPO_CONFIG.title.spacing),
});

const MainFontSchema = v.object({
    zh: v.optional(v.string(), DEFAULT_TYPO_CONFIG.main.zh),
    en: v.optional(v.string(), DEFAULT_TYPO_CONFIG.main.en),
    size: v.optional(v.pipe(v.number(), v.gtValue(0)), DEFAULT_TYPO_CONFIG.main.size),
    spacing: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_TYPO_CONFIG.main.spacing),
    indent: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_TYPO_CONFIG.main.indent),
});

const SalutationSchema = v.object({
    font: v.optional(v.string(), DEFAULT_TYPO_CONFIG.salutation.font),
    bold: v.optional(v.boolean(), DEFAULT_TYPO_CONFIG.salutation.bold),
});

const HeadingSchema = v.object({
    font: v.optional(v.string(), DEFAULT_TYPO_CONFIG.h1.font),
    bold: v.optional(v.boolean(), DEFAULT_TYPO_CONFIG.h1.bold),
});

const TypographySchema = v.object({
    title: v.optional(TitleFontSchema, DEFAULT_TYPO_CONFIG.title),
    main: v.optional(MainFontSchema, DEFAULT_TYPO_CONFIG.main),
    salutation: v.optional(SalutationSchema, DEFAULT_TYPO_CONFIG.salutation),
    h1: v.optional(HeadingSchema, DEFAULT_TYPO_CONFIG.h1),
    h2: v.optional(HeadingSchema, DEFAULT_TYPO_CONFIG.h2),
    h3: v.optional(HeadingSchema, DEFAULT_TYPO_CONFIG.h3),
    topicBoldMode: v.optional(
        v.picklist(["auto", "prefix", "none"]),
        DEFAULT_TYPO_CONFIG.topicBoldMode,
    ),
});

const HeaderSchema = v.object({
    content: v.optional(v.string(), DEFAULT_HEADER_CONFIG.content),
    position: v.optional(v.picklist(["left", "center", "right"]), DEFAULT_HEADER_CONFIG.position),
    font: v.optional(v.string(), DEFAULT_HEADER_CONFIG.font),
    fontSize: v.optional(v.pipe(v.number(), v.gtValue(0)), DEFAULT_HEADER_CONFIG.fontSize),
});

const FooterSchema = v.object({
    font: v.optional(v.string(), DEFAULT_FOOTER_CONFIG.font),
    fontSize: v.optional(v.pipe(v.number(), v.gtValue(0)), DEFAULT_FOOTER_CONFIG.fontSize),
    position: v.optional(
        v.picklist(["left", "right", "middle", "inside", "outside"]),
        DEFAULT_FOOTER_CONFIG.position,
    ),
});

const GovDocConfigSchema = v.object({
    pageLayout: v.optional(PageLayoutSchema, DEFAULT_PAGE_LAYOUT_CONFIG),
    typography: v.optional(TypographySchema, DEFAULT_TYPO_CONFIG),
    header: v.optional(HeaderSchema, DEFAULT_HEADER_CONFIG),
    footer: v.optional(FooterSchema, DEFAULT_FOOTER_CONFIG),
});

export function validateGovDocConfig(config: any): GovDocConfig {
    return v.parse(GovDocConfigSchema, config ?? {});
}

export function validateHeaderFooterConfig(config: any): {
    header: HeaderConfig;
    footer: FooterConfig;
} {
    return {
        header: v.parse(HeaderSchema, config?.header || {}),
        footer: v.parse(FooterSchema, config?.footer || {}),
    };
}

export function validatePageLayout(config: any): PageLayoutConfig {
    return v.parse(PageLayoutSchema, config || {});
}

export function validateTypography(config: any): TypographyConfig {
    return v.parse(TypographySchema, config || {});
}
