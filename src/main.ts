import { createApp } from "vue";

import "@/styles/main.css";

import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-notification.css";

// 类型声明：让 TS 知道 import.meta.glob 的返回类型
interface ComponentModules {
    [key: string]: () => Promise<{ default: Component }>;
}

// 收集所有弹窗组件
const dialogModules = import.meta.glob<{ default: Component }>(
    "@/components/dialogs/*.vue",
) as ComponentModules;

// 收集所有任务窗格页面
const viewModules = import.meta.glob<{ default: Component }>("@/views/*.vue") as ComponentModules;

const urlParams = new URLSearchParams(window.location.search);
const dialogType = urlParams.get("dialog");
const paneType = urlParams.get("pane");

/**
 * 启动函数，根据 URL 参数判断启动模式：
 * - 弹窗模式（?dialog=xxx）：只加载 Vue + 对应组件，不加载主应用依赖 → 秒开。
 * - 窗格模式（?pane=xxx）：只挂载 src/views 下对应的页面组件。
 * - 默认模式（无参数）：挂载 views/index.vue 页面导航。
 *
 * 自执行异步函数，避免顶层 await
 */
(async function boot() {
    if (dialogType) {
        // ========== 弹窗模式（极速加载） ==========
        // 注意：文件命名必须与 dialogType 完全一致（大小写敏感），建议统一小写
        const loader = dialogModules[`/src/components/dialogs/${dialogType}.vue`];
        if (!loader) {
            console.error(`未知弹窗类型: ${dialogType}`);
            document.body.innerHTML = `<div style="padding:20px;color:red;">未知弹窗类型: ${dialogType}</div>`;
            return;
        }

        try {
            // 加载弹窗组件
            const [module] = await Promise.all([loader()]);
            const app = createApp(module.default);
            app.mount("#app");
        } catch (err) {
            console.error(`加载弹窗失败: ${dialogType}`, err);
        }
        return;
    }

    // ========== 窗格 / 导航页模式 ==========
    const viewName = paneType ?? "index";
    const loader = viewModules[`/src/views/${viewName}.vue`];
    if (!loader) {
        console.error(`未知页面: ${viewName}`);
        document.body.innerHTML = `<div style="padding:20px;color:red;">未知页面: ${viewName}</div>`;
        return;
    }

    try {
        const [
            { default: App },
            { registerDirectives },
            { setupRibbonBindings },
            { setupGlobalErrorHandler },
        ] = await Promise.all([
            loader(),
            import("@/directives"),
            import("@/jsa/ribbon/actions"),
            import("@/utils/globalErrorHandler"),
        ]);

        // 初始化 WPS 回调绑定
        setupRibbonBindings();

        const app = createApp(App);
        registerDirectives(app);
        setupGlobalErrorHandler(app);

        app.mount("#app");

        // 空闲时预加载所有弹窗组件（让浏览器缓存）
        const preloadAllDialogs = () => {
            Object.values(dialogModules).forEach((load) => {
                load().catch((e) => console.warn("预加载弹窗失败:", e));
            });
        };
        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(preloadAllDialogs, { timeout: 3000 });
        } else {
            setTimeout(preloadAllDialogs, 1500);
        }
    } catch (err) {
        console.error("应用初始化失败:", err);
    }
})();
