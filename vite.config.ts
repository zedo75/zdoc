import { fileURLToPath, URL } from "node:url";

import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { wpsEnhancePlugin } from "#vite-plugin-wps-enhance";
import AutoImport from "unplugin-auto-import/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import { loadEnv } from "vite";
import bundleObfuscator from "vite-plugin-bundle-obfuscator";
import { defineConfig } from "vitest/config";

import { xmlConfig } from "./src/features/ribbon.config.ts";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd());

    const enableObfuscator = env.VITE_OBFUSCATOR === "true";
    const enableLegacy = env.VITE_LEGACY === "true";

    return {
        base: "./",
        resolve: {
            alias: {
                "@": fileURLToPath(new URL("./src", import.meta.url)),
            },
        },
        server: {
            host: "0.0.0.0",
        },
        test: {
            globals: true,
        },
        build: {
            rolldownOptions: {
                output: {
                    strictExecutionOrder: true,
                    codeSplitting: {
                        groups: [
                            // Vue 生态：稳定、极少变更，独立分组便于长期缓存与混淆跳过
                            {
                                name: "vendor-vue",
                                test: /node_modules[\\/](vue|@vue|vue-router|pinia)[\\/]/,
                                entriesAware: true,
                                entriesAwareMergeThreshold: 28000, // 合并过小的子 chunk
                            },
                            // Element Plus：UI 库，独立分组
                            {
                                name: "vendor-element-plus",
                                test: /node_modules[\\/](element-plus|@element-plus)[\\/]/,
                                entriesAware: true,
                                entriesAwareMergeThreshold: 28000,
                            },
                            // 其余 node_modules：兜底 vendor 组，仍然启用 entriesAware 保持精度
                            {
                                name: "vendor-misc",
                                test: /node_modules/,
                                entriesAware: true,
                                entriesAwareMergeThreshold: 28000,
                            },
                            // 业务代码
                            {
                                name: "app",
                                test: (id) => {
                                    const normalized = id.replace(/\\/g, "/");
                                    return (
                                        normalized.includes("/src/") &&
                                        /\.(js|ts|vue)$/.test(normalized)
                                    );
                                },
                                entriesAware: true,
                                entriesAwareMergeThreshold: 28000,
                            },
                        ],
                    },
                    chunkFileNames: (chunkInfo) => {
                        // 取第一个入口名作为基础前缀
                        const prefix = chunkInfo.name.split("~")[0] || "chunk";
                        return `assets/${prefix}-[hash:8].js`;
                    },
                    assetFileNames: (assetInfo) => {
                        const name = assetInfo.name ?? "asset";
                        // 只对 CSS 截断
                        if (name.endsWith(".css")) {
                            const prefix = name.split("~")[0] || "style";
                            return `assets/${prefix}-[hash:8][extname]`;
                        }
                        return `assets/[name]-[hash:8][extname]`;
                    },
                },
            },
        },
        plugins: [
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
                imports: ["vue"],
                dts: "src/auto-imports.d.ts",
            }),
            Components({
                resolvers: [
                    ElementPlusResolver({
                        importStyle: "sass", // 同样需要显式声明
                    }),
                ],
                dts: "src/components.d.ts",
                // 只自动注册共享 UI 组件；插件自己的组件由插件显式 import，避免全局命名空间膨胀
                dirs: ["src/components"],
                // 限制文件扩展名，只处理 .vue
                extensions: ["vue"],
                exclude: [/node_modules/, /\.test\.vue$/],
            }),
            ...(enableObfuscator
                ? [
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
                  ]
                : []),
            // legacy 通常放在最后
            ...(enableLegacy
                ? [
                      legacy({
                          targets: ["chrome 85"], // 指定目标浏览器版本
                          additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
                          renderModernChunks: false, // 不生成现代版 chunk
                          renderLegacyChunks: true,
                      }),
                  ]
                : []),
        ],
    };
});
