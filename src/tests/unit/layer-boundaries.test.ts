/**
 * 分层边界测试
 *
 * 目录约定的价值全靠「不 import 不该 import 的东西」。ARCHITECTURE.md 里的依赖规则
 * 在这里变成断言：新增文件如果越层引用，`pnpm test` 会直接指出文件与说明符。
 *
 * 约定（箭头表示「可以 import」）：
 *
 * ```text
 * utils / config        ← 基础能力：纯工具、配置
 *       ↑
 * wps                   ← WPS COM 原语：文档 / 文件 / 视图 / 撤销 / 书签…
 *       ↑
 * core                  ← 排版引擎：纯逻辑 + COM 编排
 *       ↑
 * ribbon / kernel       ← 宿主接入：功能区回调、任务窗格、插件装配与派发
 *       ↑
 * features/<id>         ← 插件：可以往下用，插件之间互不引用
 * ```
 */
import { describe, expect, it } from "vitest";

/**
 * 源码原文（key 形如 `/src/core/typeset.ts`）
 *
 * 排除入口 `main.ts`：构建插件会把 WPS 枚举的注入代码拼进入口，
 * 以 `?raw` 读进来时会连带执行那段虚拟模块。
 */
const sources = import.meta.glob(["@/**/*.{ts,vue}", "!@/main.ts"], {
    query: "?raw",
    eager: true,
    import: "default",
}) as Record<string, string>;

const IMPORT_FROM = /\bfrom\s*["'](@\/[^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["'](@\/[^"']+)["']\s*\)/g;

/** 抽出文件里所有 `@/...` 引用（静态 import / export from / 动态 import） */
function importsOf(code: string): string[] {
    const found = new Set<string>();
    for (const pattern of [IMPORT_FROM, DYNAMIC_IMPORT]) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(code)) !== null) found.add(match[1]!);
    }
    return [...found];
}

type Node = { layer: string; feature?: string };

const SHARED_UI = ["composables", "components", "stores", "views", "directives"];

/** 把路径（`src/x/y.ts` / `/src/x/y.ts` / `@/x/y`）归到某一层 */
function classify(path: string): Node | null {
    const rel = path.replace(/^\/?src\//, "").replace(/^@\//, "");
    const parts = rel.split("/");
    const [top, second] = parts;
    if (!top) return null;

    if (top === "features") return second ? { layer: "features", feature: second } : null;
    if (["utils", "config", "wps", "core", "ribbon", "kernel"].includes(top)) return { layer: top };
    if (SHARED_UI.includes(top)) return { layer: "shared" };
    return null; // main.ts / tests / styles / 生成的声明文件
}

/**
 * 每层**禁止**引用的层。
 *
 * 没有列出的层不做限制：`kernel` 本来就要汇总 `features` 的声明（插件清单 / 图标表），
 * 这是它存在的意义。
 */
const FORBIDDEN: Record<string, string[]> = {
    utils: ["config", "wps", "core", "ribbon", "kernel", "shared", "features"],
    wps: ["config", "core", "ribbon", "kernel", "shared", "features"],
    config: ["core", "ribbon", "kernel", "shared", "features"],
    core: ["ribbon", "kernel", "shared", "features"],
    ribbon: ["core", "shared", "features"],
    shared: ["features"],
};

/** 收集所有越层引用：`{ file, spec, reason }` */
function violations(): { file: string; spec: string; reason: string }[] {
    const result: { file: string; spec: string; reason: string }[] = [];

    for (const [file, code] of Object.entries(sources)) {
        const origin = classify(file);
        if (!origin) continue;

        for (const spec of importsOf(code)) {
            if (spec.startsWith("@/jsa")) {
                result.push({ file, spec, reason: "jsa 层已删除，改走 @/wps 或 @/core" });
                continue;
            }

            const target = classify(spec);
            if (!target) continue;

            // 插件之间互不引用（自己的 commands / core / components 除外）
            if (origin.layer === "features" && target.layer === "features") {
                if (origin.feature !== target.feature) {
                    result.push({
                        file,
                        spec,
                        reason: `插件 ${origin.feature} 不能引用插件 ${target.feature}，共享能力要下沉到 @/wps 或 @/core`,
                    });
                }
                continue;
            }

            const forbidden = FORBIDDEN[origin.layer];
            if (forbidden?.includes(target.layer)) {
                result.push({
                    file,
                    spec,
                    reason: `${origin.layer} 层不能引用 ${target.layer} 层`,
                });
            }
        }
    }

    return result;
}

describe("分层边界", () => {
    it("扫描到了源码", () => {
        expect(Object.keys(sources).length).toBeGreaterThan(150);
    });

    it("没有越层引用", () => {
        const bad = violations();
        const message = bad.map((it) => `${it.file}\n  → ${it.spec}\n    ${it.reason}`).join("\n");
        expect(bad, message).toEqual([]);
    });
});
