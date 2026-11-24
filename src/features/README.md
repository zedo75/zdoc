# 功能插件

一个目录就是一个插件，命名、契约与依赖规则见
[ARCHITECTURE · 2.3 插件式架构](../../ARCHITECTURE.md#23-插件式架构功能层)。

```text
<插件 id>/
  index.ts      插件声明（defineFeature）：ribbon / actions / panes / dialogs
  ribbon.ts     纯数据：向分组或 menu 贡献控件（构建期生成 ribbon.xml）
  icons.ts      自定义图标（可选）
  actions.ts    Ribbon 动作，点击时才加载
  commands/     WPS 编排（COM）
  core/         纯逻辑（可单测）
  composables/  业务 composable
  components/   插件专用组件
  dialogs/      弹窗（文件名 = ?dialog= 的值）
  views/        任务窗格页面（文件名 = ?pane= 的值）
  tests/        单测
```

声明统一用 `defineFeature` / `defineRibbon` / `defineActions` / `defineIcons`，不要手写契约类型。
插件 id 只在 `index.ts` 里写一次：`ribbon.ts` 默认导出声明结果，`features/ribbon.config.ts`
只负责「导入哪些插件、按什么顺序装配」，两边都不重复写 id。

```ts
// index.ts
import { defineFeature } from "#kernel/define";

export const batchFeature = defineFeature({
    id: "batch", // 唯一的 id 来源（目录名、控件归属索引、ribbon.config 都对齐它）
    name: "批量处理",
    ribbon: () => import("./ribbon"),
    actions: () => import("./actions"),
});
```

```ts
// ribbon.ts
import { defineRibbon } from "#kernel/define";

export default defineRibbon({ contributes: [] });
```

内核入口统一写成 `#kernel/*`（`package.json` 的 `imports`）：

为什么不用 `@/kernel/*`：`ribbon.ts` 会被 `vite.config.ts` 在 Node 里加载，而 `@` 是配置里
`resolve.alias` 定义的别名，加载配置时还不存在。`#kernel/*` 两种环境都能解析，解析到同一份源码。
约定是：**内核入口 `#kernel/*`，应用层 `@/`，模块内部 `./`**。

插件之间共享的东西不要互相 import，按职责下沉：

| 需要复用的内容                                                   | 放在哪里                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| WPS COM 原语（开文档 / 选文件 / 撤销 / 书签 / 视图刷新）         | `@/wps/*`                                                                         |
| 公文排版的 COM 编排（页边距 / 页眉 / 页码 / 正文 / 落款 / 附件） | `@/core/*`（`page` / `header` / `footer` / `styles` / `attachments` / `typeset`） |
| 纯工具                                                           | `@/utils/*`                                                                       |
| 配置结构与持久化                                                 | `@/config/*`                                                                      |
| 跨插件的 UI 状态                                                 | `@/stores/*`、`@/composables/*`                                                   |

越层引用、跨插件引用都会被 `src/tests/unit/layer-boundaries.test.ts` 拦下。

新增插件时别忘了在 `src/kernel/registry.ts` 与 `src/features/ribbon.config.ts`
各注册一行，然后跑 `pnpm test`：`plugin-contract` 会校验两侧清单一致、
控件归属唯一且动作已实现、页面 / 弹窗文件存在。
