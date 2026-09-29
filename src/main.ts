import { createApp } from "vue";

import "@/styles/main.css";

import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-notification.css";

// 类型声明：让 TS 知道 import.meta.glob 的返回类型
interface DialogModules {
    [key: string]: () => Promise<{ default: import("vue").Component }>;
}

// 收集所有弹窗组件
const dialogModules = import.meta.glob<{ default: import("vue").Component }>(
    "@/components/dialogs/*.vue",
) as DialogModules;

const urlParams = new URLSearchParams(window.location.search);
const dialogType = urlParams.get("dialog");

(
    /**
     * 启动函数，根据 URL 参数判断启动模式：
     * - 弹窗模式：只加载 Vue + 对应组件，不加载主应用依赖 → 秒开。
     * - 主应用模式：完整加载，并预加载所有弹窗以便二次打开秒开。
     *
     * 自执行异步函数，避免顶层 await
     */
    async function boot() {
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
        } else {
            // ========== 主应用模式 ==========
            try {
                const [
                    { default: App },
                    { registerDirectives },
                    { setupRibbonBindings },
                    { router },
                    { setupGlobalErrorHandler },
                ] = await Promise.all([
                    import("@/App.vue"),
                    import("@/directives"),
                    import("@/jsa/ribbon/actions"),
                    import("@/router/"),
                    import("@/utils/globalErrorHandler"),
                ]);

                // 初始化 WPS 回调绑定
                setupRibbonBindings();

                const app = createApp(App);
                app.use(router);
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
                console.error("主应用初始化失败:", err);
            }
        }
    }
)();
