import { fileURLToPath, URL } from "node:url";

import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { scanUsedEnums, wpsEnhancePlugin } from "#vite-plugin-wps-enhance";
import AutoImport from "unplugin-auto-import/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";
import bundleObfuscator from "vite-plugin-bundle-obfuscator";
import VueRouter from "vue-router/vite";

import { xmlConfig } from "./src/jsa/ribbon/xmlConfig.ts";

// 扫描源码中实际使用的 `mso*` / `wd*` 标识符：
// - usedKeys：喂给 AutoImport（只注入实际使用的 ~30 个，而非全量 600+）
// - usedGroups：插件内部会自动扫描，无需手动维护枚举组列表
const used = scanUsedEnums();

export default defineConfig({
    base: "./",
    build: {
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        { name: "vendor", test: "node_modules" },
                        {
                            name: "main",
                            test: (id) => {
                                const normalized = id.replace(/\\/g, "/");
                                // 在 src 目录下的 ts/vue 文件
                                const isInSrc = normalized.includes("/src/");
                                const isTargetExt = /\.([jt]s|vue)$/.test(normalized);
                                // 排除 dialogs 目录
                                const isInDialogs = normalized.includes("/components/dialogs/");

                                return isInSrc && !isInDialogs && isTargetExt;
                            },
                        },
                    ],
                },
            },
        },
        chunkSizeWarningLimit: 1000,
    },
    plugins: [
        VueRouter({
            // 注意：必须放在 vue() 插件之前
            routesFolder: "src/views", // 指定待生成自动路由文件夹
            dts: "./src/typed-router.d.ts",
        }),
        vue(),
        // wpsEnhancePlugin 需在 AutoImport 之前，确保 enums.generated.ts 已生成
        // enum: {} 表示自动扫描源码中实际使用的枚举（零配置模式）
        wpsEnhancePlugin({
            ribbon: { config: xmlConfig, fileName: "./public/ribbon.xml" },
            enum: {},
        }),
        AutoImport({
            resolvers: [
                ElementPlusResolver({
                    importStyle: "sass", // 或 'css'，必须显式声明，否则样式不会被导入
                }),
            ],
            imports: ["vue", "vue-router"],
            dts: "src/auto-imports.d.ts",
        }),
        Components({
            resolvers: [
                ElementPlusResolver({
                    importStyle: "sass", // 同样需要显式声明
                }),
            ],
            dts: "src/components.d.ts",
            // 仅扫描必要目录
            dirs: ["src/components", "src/views"],
            // 限制文件扩展名，只处理 .vue
            extensions: ["vue"],
            exclude: [/node_modules/, /\.test\.vue$/],
        }),

        bundleObfuscator({
            // 指定需要混淆的 chunk 名称（与 manualChunks 中定义的一致）
            excludes: ["polyfills", "rolldown-runtime", "vendor", "index"], // 排除第三方库，但似乎效果不太理想，暂时放弃
            options: {
                unicodeEscapeSequence: true, // 字符串字面量 → Unicode 转义序列
                transformObjectKeys: false, // 点语法 → 方括号语法 启用后与 legacy 不兼容
                stringArray: true, // 将所有字符串字面量提取到一个全局数组中，然后通过数组索引访问
                // https://obfuscator.io/docs/basic-obfuscation/string-array
                stringArrayEncoding: ["base64", "rc4"], // 对 stringArray 中存储的字符串进行编码
                controlFlowFlattening: true, // 将代码的控制流（if/else, while, for 等）扁平化，打乱逻辑顺序，插入 switch 结构
                deadCodeInjection: true, // 随机注入死代码
                selfDefending: true, // 开启后，代码被格式化则无法执行
                debugProtection: true, // 让开发者工具的 debugger 功能无法使用
            },
        }),
        // legacy 通常放在最后
        legacy({
            targets: ["chrome 85"], // 指定目标浏览器版本
            additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
            renderModernChunks: false, // 不生成现代版 chunk
            renderLegacyChunks: true,
        }),
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },

    server: {
        host: "0.0.0.0",
    },
});
