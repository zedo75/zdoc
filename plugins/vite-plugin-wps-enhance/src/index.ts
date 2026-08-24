import path from "node:path";
import type { Plugin } from "vite";
import type { EnumEnhanceOptions, ImageTypeOptions, WpsEnhanceOptions } from "./common/typings.js";

import { FSWatcher } from "chokidar";

import { logger } from "./common/index.js";
import { generateEnumExports } from "./enum/index.js";
import { generateWpsEnv } from "./enum/wps-env.js";
import { generateImageTypes, setupImageWatcher } from "./image/index.js";
import { writeRibbonXml } from "./ribbon/index.js";

export * from "./ribbon/factory.js";
export * from "./common/typings.js";
export {
    generateEnumExports,
    getAllEnumNames,
    getFlatEnumKeys,
    getRegisteredEnums,
} from "./enum/index.js";
export { scanWpsEnums } from "./enum/scanner.js";
export type { ScannedEnum, EnumDatabase } from "./enum/scanner.js";
export { scanUsedEnums } from "./enum/source-scanner.js";
export type { UsedEnumsResult } from "./enum/source-scanner.js";

/**
 * 虚拟模块 id：在应用入口顶部自动 import 一次，把 WPS 枚举注册到 `window`，
 * 替代业务代码里手动注册。
 */
const ENUMS_VIRTUAL_ID = "virtual:wps-enums-setup";
const RESOLVED_VIRTUAL_ID = `\0${ENUMS_VIRTUAL_ID}`;

const HELPERS_VIRTUAL_ID = "virtual:wps-helpers";
const HELPERS_RESOLVED_ID = `\0${HELPERS_VIRTUAL_ID}`;

/**
 * 虚拟模块 `virtual:wps-helpers` 的内容
 */
function buildHelpersModule(): string {
    return `
export function wpsAlert(msg) {
    Application.alert(msg, true);
}

export function wpsConfirm(msg) {
    return Application.confirm(msg, true);
}

// @ts-ignore
if (typeof window.wpsAlert === 'undefined') {
    window.wpsAlert = wpsAlert;
    window.wpsConfirm = wpsConfirm;
}
`;
}

/**
 * 虚拟模块 `virtual:wps-enums-setup` 的内容：
 * 导入 `Enums` 并把枚举注册到 `window`，启用插件即可裸名使用 wdXXX/msoXXX。
 */
function buildVirtualSetupModule(root: string, enumOptions?: EnumEnhanceOptions): string {
    // 计算生成文件的路径
    const outputFile = enumOptions?.outputFile ?? "src/wps-enums.generated.ts";
    const abs = path.isAbsolute(outputFile) ? outputFile : path.resolve(root, outputFile);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    const specifier = "/" + rel.replace(/\.ts$/, "");

    return `import * as Enums from "${specifier}";

for (const [key, value] of Object.entries(Enums)) {
    // @ts-ignore
    window[key] = value;
}
`;
}

/**
 * WPS 加载项增强插件。
 *
 * 集成以下能力（均可选）：
 * - **ribbon**: 生成 `ribbon.xml` + 图片类型声明文件（`ribbon-images.d.ts`），
 *   开发模式自动监听图片目录变化
 * - **enum**（默认零配置）: 自动扫描源码中使用的 `mso*` / `wd*` 标识符，
 *   从 `wps-jsapi-declare` 匹配真实枚举，生成：
 *   - `wps-enums.generated.ts`：运行时值 + 类型 + 具名导出
 *   - `wps-env.d.ts`：`Wps.Application` 扩展、`Window` 扩展
 */
export function wpsEnhancePlugin(options: WpsEnhanceOptions): Plugin {
    const { ribbon, enum: enumOptions } = options;

    const imageTypeConfig: ImageTypeOptions = {
        imagesDir: "public/images",
        outputFile: "src/ribbon-images.d.ts",
        watch: true,
    };

    let imageWatcher: FSWatcher | null = null;
    let isDev = false;
    let root = process.cwd();

    /**
     * 生成枚举文件（wps-enums.generated.ts + wps-env.d.ts）。
     * dev：全量（所有组、所有成员 + 全量 declare const 裸名补全），不扫源码。
     * build：仅用到（扫源码 + 成员级过滤），bundle 最小。
     */
    async function generateEnumFiles(): Promise<void> {
        if (!enumOptions) return;
        await Promise.all([
            generateEnumExports(enumOptions, isDev),
            generateWpsEnv(enumOptions, isDev),
        ]);
    }

    return {
        name: "vite-plugin-wps-enhance",
        config(_, { command }) {
            isDev = command === "serve";

            // 在 config 钩子中返回要合并的配置
            return {
                define: {
                    ActiveDocument: "Application.ActiveDocument",
                    ActiveWindow: "Application.ActiveWindow",
                    wpsSelection: "Application.Selection",
                },
            };
        },
        configResolved(resolved) {
            root = resolved.root;
        },
        async buildStart() {
            // buildStart 在 dev 和 build 模式下都会最先执行，一次性生成所有文件
            const t0 = performance.now();
            const tasks: Promise<void>[] = [];

            if (ribbon) {
                const { config, fileName = "ribbon.xml" } = ribbon;
                tasks.push(writeRibbonXml(config, fileName));
                tasks.push(generateImageTypes(root, config, imageTypeConfig));
            }
            tasks.push(generateEnumFiles());

            await Promise.all(tasks);
            const t1 = performance.now();
            logger.info(`buildStart done in ${(t1 - t0).toFixed(0)}ms`);
        },
        configureServer() {
            // 仅在 dev 模式下设置文件监听（文件已在 buildStart 中生成）
            if (ribbon && imageTypeConfig.watch) {
                imageWatcher = setupImageWatcher(root, ribbon.config, imageTypeConfig);
            }
        },
        resolveId(id) {
            if (id === ENUMS_VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
            if (id === HELPERS_VIRTUAL_ID) return HELPERS_RESOLVED_ID;
            return null;
        },
        load(id) {
            if (id === RESOLVED_VIRTUAL_ID) return buildVirtualSetupModule(root, enumOptions);
            if (id === HELPERS_RESOLVED_ID) return buildHelpersModule();
            return null;
        },
        transform(code, id) {
            if (!enumOptions) return null;
            const entry = enumOptions.entry ?? "src/main.ts";
            if (!entry) return null;
            const cleanId = id.split("?")[0].replace(/\\/g, "/");
            const entryRel = entry.replace(/\\/g, "/");
            const entryAbs = (path.isAbsolute(entry) ? entry : path.resolve(root, entry)).replace(
                /\\/g,
                "/",
            );
            if (cleanId === entryAbs || cleanId.endsWith("/" + entryRel)) {
                return `import "${ENUMS_VIRTUAL_ID}";
import "${HELPERS_VIRTUAL_ID}";
${code}`;
            }
            return null;
        },
        async buildEnd() {
            // 清理 watcher
            if (imageWatcher) {
                await imageWatcher.close();
                imageWatcher = null;
            }
        },
    };
}
