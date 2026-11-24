import type { Component } from "vue";

import { installRibbonCallbacks } from "@/ribbon/callbacks";
import "@/styles/main.css";

import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-notification.css";

// 类型声明：让 TS 知道 import.meta.glob 的返回类型
interface ComponentModules {
    [key: string]: () => Promise<{ default: Component }>;
}

type ComponentLoader = () => Promise<{ default: Component }>;

/**
 * 把 `import.meta.glob` 的结果按文件名建立索引。
 *
 * 插件目录天然带命名空间（`features/<插件>/dialogs|views/<名字>.vue`），但 URL 契约
 * 只暴露文件名（`?dialog=` / `?pane=`），因此这里扁平化；重名时保留第一个并报错，
 * 由 `plugin-contract` 测试兜住。
 */
function indexByBaseName(modules: ComponentModules, kind: string): Map<string, ComponentLoader> {
    const index = new Map<string, ComponentLoader>();

    for (const [path, loader] of Object.entries(modules)) {
        const name = (path.split("/").pop() ?? "").replace(/\.vue$/, "");
        if (index.has(name)) {
            console.error(`[boot] ${kind}重名：${name}（${path}），已忽略`);
            continue;
        }
        index.set(name, loader);
    }

    return index;
}

// 插件自动收集：一个插件一个目录，弹窗 / 任务窗格页面都不需要手工注册
const dialogModules = import.meta.glob<{ default: Component }>(
    "@/features/*/dialogs/*.vue",
) as ComponentModules;
const paneModules = import.meta.glob<{ default: Component }>(
    "@/features/*/views/*.vue",
) as ComponentModules;

// 导航页是唯一的非插件页面
const shellModules = import.meta.glob<{ default: Component }>(
    "@/views/index.vue",
) as ComponentModules;

const dialogs = indexByBaseName(dialogModules, "弹窗");
const panes = indexByBaseName(paneModules, "任务窗格");
const shellLoader = Object.values(shellModules)[0];

const urlParams = new URLSearchParams(window.location.search);
const dialogType = urlParams.get("dialog");
const paneType = urlParams.get("pane");

/** 展示一个可读的错误页，而不是白屏 */
function showFatal(message: string): void {
    console.error(message);
    document.body.innerHTML = `<div style="padding:20px;color:red;">${message}</div>`;
}

/**
 * 空闲时读取一次配置文件。
 *
 * 以前是 Ribbon 动作模块加载时顺带读的；动作改成按插件懒加载后，改由入口统一调度，
 * 避免「第一次点击用的还是 localStorage 旧值」。
 */
function scheduleConfigInit(): void {
    const run = () => {
        void import("@/stores/govDocConfig")
            .then((mod) => mod.initGovDocConfig())
            .catch((error) => console.warn("初始化公文配置失败:", error));
    };

    if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 3000 });
    } else {
        setTimeout(run, 1500);
    }
}

/**
 * 启动函数，根据 URL 参数判断启动模式：
 * - 弹窗模式（?dialog=xxx）：只加载 Vue + 对应组件，不加载主应用依赖 → 秒开。
 * - 窗格模式（?pane=xxx）：只挂载插件 views 下对应的页面组件。
 * - 默认模式（无参数）：挂载 views/index.vue 页面导航。
 *
 * 自执行异步函数，避免顶层 await
 */
(async function boot() {
    // 注意：WPS 枚举与全局辅助函数（ActiveDocument / wpsAlert / RGB 等）由
    // vite-plugin-wps-enhance 自动注入到本文件顶部，这里不需要（也不应该）手动 import。
    // 它们会先于 installRibbonCallbacks() 执行，但只是一张常量表，开销远小于 Vue / 命令模块。

    // 弹窗模式只加载对应组件，不注册 Ribbon 回调，避免把动作分发带进弹窗。
    if (!dialogType) installRibbonCallbacks();

    const { createApp } = await import("vue");

    if (dialogType) {
        // ========== 弹窗模式（极速加载） ==========
        // 注意：文件名必须与 dialogType 完全一致（大小写敏感），建议统一小写
        const loader = dialogs.get(dialogType);
        if (!loader) {
            showFatal(`未知弹窗类型: ${dialogType}`);
            return;
        }

        try {
            const module = await loader();
            createApp(module.default).mount("#app");
        } catch (err) {
            console.error(`加载弹窗失败: ${dialogType}`, err);
        }
        return;
    }

    // ========== 窗格 / 导航页模式 ==========
    const loader: ComponentLoader | undefined = paneType ? panes.get(paneType) : shellLoader;

    if (!loader) {
        showFatal(`未知页面: ${paneType}`);
        return;
    }

    try {
        const [{ default: App }, { registerDirectives }, { setupGlobalErrorHandler }] =
            await Promise.all([
                loader(),
                import("@/directives"),
                import("@/utils/globalErrorHandler"),
            ]);

        const app = createApp(App);
        registerDirectives(app);
        setupGlobalErrorHandler(app);

        app.mount("#app");
    } catch (err) {
        console.error("应用初始化失败:", err);
        return;
    }

    scheduleConfigInit();
})();
