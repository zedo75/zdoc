# 架构设计

> 面向贡献者和想深入理解设计决策的读者。
> 想了解功能请先看 [功能手册](./FEATURES.md)。

---

## 目录

1. [设计哲学](#1-设计哲学)
2. [分层架构](#2-分层架构)
3. [vite-plugin-wps-enhance 详解](#3-vite-plugin-wps-enhance-详解)
4. [排版引擎详解](#4-排版引擎详解)
5. [前端架构](#5-前端架构)
6. [测试策略](#6-测试策略)
7. [扩展指南](#7-扩展指南)
8. [性能设计](#8-性能设计)
9. [FAQ](#9-faq)

---

## 1. 设计哲学

### 1.1 反对的三件事

| 反模式                          | 后果                               | 本项目的做法                            |
| ------------------------------- | ---------------------------------- | --------------------------------------- |
| **一切都在 COM 上直接写**       | 逻辑不可测、不可移植、改一处崩一片 | 分三层，纯逻辑层可单测                  |
| **每个功能写一个独立函数**      | 新增段落样式要改 5 处 if/else      | 属性注册表，声明式扩展                  |
| **Ribbon XML 手写 + 字符串 ID** | ID 拼错只能在运行时崩              | 插件自动生成 `RibbonControlId` 联合类型 |

### 1.2 遵循的原则

1. **纯逻辑可测试** —— 只要能在 Node 里跑，就一定要写单测
2. **COM 层只做 I/O** —— 不承载任何业务判断
3. **扩展点设计优先于功能本身** —— 属性注册表、枚举生成器都是这个原则的体现
4. **数据指纹优于全量比对** —— 缓存 key 含版本号 + mtime + 文件大小，缓存正确性由架构保证

---

## 2. 分层架构

```
┌────────────────────────────────────────────────┐
│ 第三层：COM 编排层                                │
│ core/pipeline.ts                                │
│ · 批量读段（Range 缓存）                          │
│ · 一次性收集书签跳过区间                          │
│ · 差异应用（倒序处理，避免索引偏移）               │
├────────────────────────────────────────────────┤
│ 第二层：属性注册表 + 差异计算                      │
│ core/attributes.ts                              │
│ · ATTRS 声明式属性描述符                          │
│ · computeModifications / applyModifications      │
│ · 快照接口 SnapshotReader（不依赖 COM）           │
├────────────────────────────────────────────────┤
│ 第一层：纯逻辑分析                                │
│ core/analysis.ts / core/patterns.ts              │
│ · 语义识别（15 种段落类型）                        │
│ · 主标题块 / 落款 / topic 匹配                    │
│ · 不引用任何 Wps.* 全局对象                       │
└────────────────────────────────────────────────┘
```

### 2.1 分层的实际收益

- **第一层**：完全在 vitest 里跑，每次 commit 秒级回归
- **第二层**：`SnapshotReader` 是个接口，测试用 `makeReader` 构造，生产用 `makeComReader`
- **第三层**：只由 `core/typeset.ts` 的两个入口（`quickFormat()` / `applyFullFormat()`）调用，COM 调用集中可控

### 2.2 数据流

```
WPS 文档
  │
  ▼ readParaInfos()
ComParaInfo[]（含 isSkipped 等事实字段）
  │
  ▼ analyzeDocumentStructure()
DocumentStructure（含 semanticKinds、mainTitleBlocks、signatures）
  │
  ▼ computeModifications()   ← 有 ComReader 时做差异检测
ParaModification[]（按段落索引倒序）
  │
  ▼ applyModifications()
写回文档
```

### 2.3 插件式架构（功能层）

排版引擎解决「怎么排」，功能层解决「有哪些功能」。功能层按**插件**组织：
一个功能 = `src/features/<id>/` 一个目录，通过 `src/kernel` 的契约接入应用。

**为什么不用 monorepo？**

| 方案                     | 代价                                                                    | 收益                 | 结论                                                  |
| ------------------------ | ----------------------------------------------------------------------- | -------------------- | ----------------------------------------------------- |
| 一个功能一个 package     | pnpm workspace、tsconfig 引用、版本对齐、跨包 alias、每次构建多一次解析 | 独立发布 / 独立版本  | 不需要：插件随同一个 WPS 加载项一起发布，共用一次构建 |
| **目录即插件**（本方案） | 依赖边界靠约定 + 测试守护                                               | 零构建成本，仍可单测 | ✅                                                    |

`plugins/` 仍然是 pnpm workspace，但那只服务于**构建工具**（`vite-plugin-wps-enhance`），
和功能插件无关。真正需要独立发布构建插件时，workspace 才有价值。

**内核（`src/kernel`）只做四件事**

| 模块                           | 职责                                                     |
| ------------------------------ | -------------------------------------------------------- |
| `types.ts` / `define.ts`       | 插件契约与开发期校验（重名、缺字段）                     |
| `ribbon.ts` + `control-ids.ts` | 把各插件的纯数据声明装配成功能区，校验控件 id 唯一       |
| `registry.ts` + `dispatch.ts`  | 插件清单、页面/弹窗查找、「控件 → 插件」索引与动作懒加载 |
| `icons.ts`                     | 同步的图标映射（`getImage` 不能等异步）                  |

**宿主接入（`src/ribbon`）**

| 模块           | 职责                                                           |
| -------------- | -------------------------------------------------------------- |
| `callbacks.ts` | 把 `window.getImage` / `onAction` 等回调挂给 WPS（零业务依赖） |
| `taskPane.ts`  | 创建任务窗格、设置停靠位置、记忆用户拖动过的宽度               |

它们只做「WPS 宿主 ↔ 内核」的适配，不含任何业务规则；之所以从旧的 `jsa/ribbon` 提到
`src/ribbon`，是因为它和 `kernel` 一起构成加载项自身的骨架，与功能插件无关。

**目录约定**

```text
src/features/<id>/
  index.ts      插件元数据 + 惰性加载声明（唯一注册入口）
  ribbon.ts     纯数据：向分组 / 菜单贡献哪些控件
  icons.ts      自定义图标（可选，未登记按 `${id}.png` 查找）
  actions.ts    Ribbon 动作（点击时才加载）
  commands/     WPS 编排（COM）
  core/         纯逻辑（可单测）
  composables/  业务 composable
  components/   插件专用组件
  dialogs/      弹窗（自动收集，`?dialog=<文件名>`）
  views/        任务窗格页面（自动收集，`?pane=<文件名>`）
  tests/        单测
```

**共享能力放哪**

同一个能力如果不止一个插件要用，就按下表下沉，**不要**让插件互相 import：

| 需求                                                             | 位置                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| WPS COM 原语（开文档、选文件、撤销、书签、视图刷新…）            | `src/wps/`                                                                                      |
| 公文排版的 COM 编排（页边距 / 页眉 / 页码 / 正文 / 落款 / 附件） | `src/core/`（`page.ts`、`header.ts`、`footer.ts`、`styles.ts`、`attachments.ts`、`typeset.ts`） |
| 纯工具（路径、文件名、错误、性能、文本处理）                     | `src/utils/`                                                                                    |
| 配置结构、校验、文件持久化                                       | `src/config/`（`types.ts`、`validator.ts`、`persist.ts`）                                       |
| 跨插件的 UI 状态                                                 | `src/stores/`、`src/composables/`                                                               |

判断标准很简单：**删掉某个插件后它是否还成立？** 成立就下沉，不成立就留在插件内。
例如「批量重命名要用的主标题提取」只有 batch 用，就放在 `features/batch/commands/mainTitle.ts`，
而不是放进 `core/`。

**声明写法**

插件不手写契约类型，统一用内核的 `defineXxx`。内核通过 `package.json` 的 `imports`
暴露成 `#kernel/*`（与 `#vite-plugin-wps-enhance` 同一个机制）：

```ts
// ribbon.ts
import { defineRibbon } from "#kernel/define";

export default defineRibbon({
    contributes: [{ container: "grpHelper", order: 40, controls: [] }],
});
```

插件 id 只写在 `index.ts` 的 `defineFeature` 里：`ribbon.ts` 默认导出纯数据，
`features/ribbon.config.ts` 只负责「导入哪些插件、按什么顺序装配」，两处都不重复写 id。

```ts
// actions.ts
import { defineActions } from "#kernel/define";
import { openPane } from "#kernel/dispatch";

export const actions = defineActions({
    btnTextViewCompare: () => openPane("text-compare"),
});
```

```ts
// icons.ts
import { defineIcons } from "#kernel/define";

export const icons = defineIcons({ btnTextViewCompare: "ReviewCompare.svg" });
```

- 参数位提供上下文类型：键名（`RibbonControlId`）与图标文件名（`ImageFileName`）都有补全和校验；
- 开发期再做一次形状校验（容器为空、动作不是函数、图标缺扩展名等），生产构建里只是原样返回。

**为什么内核用 `#kernel/*` 而不是 `@/`**

`ribbon.ts` 会被 `vite.config.ts` 在 **Node** 里加载（生成 `ribbon.xml`），而 `@` 是配置里
`resolve.alias` 定义的别名——加载配置时它还不存在，所以 `@/kernel/define` 在配置图里
解析不到（`UNRESOLVED_IMPORT` → 构建配置直接加载失败）。

`#kernel/*` 写在 `package.json` 的 `imports` 字段里：

```json
"imports": {
    "#kernel/*": "./src/kernel/*.ts",
    "#vite-plugin-wps-enhance": "./plugins/vite-plugin-wps-enhance/src/index.ts",
    "#vite-plugin-wps-enhance/factory": "./plugins/vite-plugin-wps-enhance/src/ribbon/factory.ts"
}
```

Node（构建配置）和浏览器构建都按包规范解析它，两种环境用的是同一份源码，不存在第二份实现。
因此约定是：**内核入口 `#kernel/*`，应用层 `@/`，模块内部 `./`**。

**依赖规则**

```text
utils / config                 ← 基础能力：纯工具、配置
        ↑
      wps                      ← WPS COM 原语：文档 / 文件 / 视图 / 撤销 / 书签
        ↑
      core                     ← 排版引擎：语义识别 + 属性差异 + COM 编排
        ↑
  ribbon / kernel              ← 宿主接入 + 契约/装配/派发，不 import 插件实现
        ↑
   features/<id>               ← 插件：可以 import 上面所有层，彼此不互相 import
```

- 插件之间共享的能力必须按上表下沉到 `wps/`、`core/`、`utils/`、`config/`；
  不允许 A 插件 import B 插件的组件或动作。
- 这条规则由 `src/tests/unit/layer-boundaries.test.ts` 守护：越层引用、跨插件引用
  会直接报出文件与说明符，`pnpm test` 即失败。
- 唯一横切入口是 `kernel/dispatch`（`openPane` / `openDialog` / `runRibbonAction`）。
  动作里不写窗口尺寸、标题、停靠位置——它们写在插件的 `panes` / `dialogs` 里。
- 插件的 `actions.ts` 顶层不能有副作用（配置读取由 `main.ts` 空闲调度），
  否则懒加载和契约测试都会被拖累。

**功能区装配**

- 骨架（选项卡 + 4 个分组）在 `kernel/layout.ts`，不含任何控件。
- 插件用 `contributes: [{ container, order, controls }]` 贡献控件。`container` 可以是
  分组 id，也可以是**任意 `menu` 的 id**：这是「排版」拆分按钮的菜单 `menu1` 能同时容纳
  图片（image-tools）、表格（table）、附件对齐（gov-doc）三个插件的控件，而三个插件
  互不 import 的原因。
- 构建期由 `vite.config.ts` 经 `features/ribbon.config.ts` 装配出 `public/ribbon.xml`；
  运行期用同一份声明建立「控件 → 插件」索引。装配是纯函数且不修改声明对象
  （菜单条目会被重建），因此同一份声明可以被构建与测试重复装配。
- 两个清单（`kernel/registry.ts` 的 `features` 与 `ribbon.config.ts` 的导入数组）都不写 id：
  id 只有 `index.ts` 一处，`ribbon.config.ts` 的数组顺序只决定同权重控件的先后。
- 拼错容器名、控件 id 重复、控件没有归属插件、插件声明漏进装配，都会在构建期或
  `pnpm test` 直接报错。

**启动与派发**

```text
main.ts
 └─ installRibbonCallbacks()          零业务依赖 + 静态图标表
      └─ 空闲时 import kernel/dispatch → 预热「控件 → 插件」索引
           └─ 点击 → import features/<id>/actions → 执行
```

弹窗与任务窗格用 `import.meta.glob("@/features/*/dialogs|views/*.vue")` 自动收集，
文件名就是 URL 契约（`?dialog=` / `?pane=`），新增页面不需要改 `main.ts`。
导航页的清单来自插件的 `panes` 声明，也不需要手工维护。

**新增一个插件**

1. 建目录 `src/features/<id>/`，写 `index.ts`（`defineFeature`）、`ribbon.ts`（可选）、`actions.ts`；
2. 在 `kernel/registry.ts` 的 `features` 与 `features/ribbon.config.ts` 的导入数组里各加一项
   （两处都只写插件模块，不写 id）；
3. `pnpm test`：`plugin-contract` 会校验「每个插件的控件都进入了装配」、控件归属唯一且
   动作已实现、页面/弹窗文件存在。

---

## 3. vite-plugin-wps-enhance 详解

### 3.1 模块职责

```
enum/   枚举扫描 + 按需生成 + .d.ts 声明
ribbon/ TS 配置 → ribbon.xml
image/  图片目录 → 文件名类型
```

### 3.2 枚举系统（enum/）

**要解决的问题**：WPS 的 `wps-jsapi-declare` 提供了完整 `.d.ts`，但 JSA 运行时**不支持** `import` 枚举。要么全量 `export const`，要么裸写数字。

**本方案**：

1. `scanner.ts` 解析 `.d.ts`，识别 `enum Name { member = value }`，并按所在文件判定命名空间（`lib.kso.d.ts` → `Kso`，`lib.wps.d.ts` → `Wps`）
2. `source-scanner.ts` 扫描源码中实际出现的 `mso*` / `wd*` 标识符
3. `index.ts` 通过反向索引（成员 → 组）反推使用的枚举组
4. 生成 `wps-enums.generated.ts`（具名常量）与 `wps-env.d.ts`（全局声明）

**缓存失效 key**：

```ts
`v2|${version}|${basename}:${mtime}:${size};${basename}:${mtime}:${size}`;
```

只要 `wps-jsapi-declare` 版本升级、或任一 `.d.ts` 被改动，key 即失效并触发重扫。

**注意的坑**：

- 命名空间判断**不能**按成员名前缀（`Mso*` → Kso）——`BackstageGroupStyle` 是 Kso 枚举但不以 Mso 开头
- 枚举体的闭合括号必须用**花括号深度匹配**而非正则（成员默认值可能含 `{`/`}`）

### 3.3 Ribbon 系统（ribbon/）

**要解决的问题**：WPS CustomUI 要求手写 XML，控件 ID 与事件处理器是字符串绑定，改名/重构都容易断。

**本方案**：

```ts
RibbonBuilder.create({
    tabs: [
        tab("公文助手(&Z)", "wpsDocHelperTab", { insertAfterMso: "TabPageLayoutWord" }, [
            group("文档处理", "grpDocument", [
                button("快速排版", "btnGovDocTypo", { imageMso: "TextStyle" }),
            ]),
        ]),
    ],
});
```

- `factory.ts` 提供函数式 API（`tab` / `group` / `button` / `menu` / `splitButton`……）
- `renderer.ts` 把配置对象渲染成 XML
- `collect-ids.ts` 深度遍历所有控件，收集 `id` → 生成 `RibbonControlId` 联合类型

**类型安全的闭环**：

```ts
// features/<id>/actions.ts
export const actions = defineActions({
    btnGovDocTypo: () => {
        /* ... */
    },
});
```

拼错任何 ID 都是**编译期错误**。

**回调注册与动作实现分离**：

```
main.ts（入口第一行）
  └─ ribbon/callbacks.ts              零业务依赖：getImage / onAction / onGetLabel / onGetEnabled
        └─ import("#kernel/dispatch") 空闲预热「控件 → 插件」索引（只加载纯数据声明）
              └─ import("features/<id>/actions") 点击时才加载该插件的动作实现
```

- `callbacks.ts` 不 import 任何业务代码、Vue、Element Plus，保证 WPS 绘制功能区时 `window.getImage` 已就绪；
  唯一的静态依赖是 `kernel/icons.ts`（控件 id → 图片文件名的纯数据）
- 每个插件的 `actions.ts` 只导出 `actions` 映射；点击时由 `kernel/dispatch.ts` 按控件索引到插件再加载
- 枚举与 `ActiveDocument` / `wpsAlert` 等全局辅助函数仍由插件自动注入入口顶部；它们只是一张常量表，
  会先于 `installRibbonCallbacks()` 执行，但不会再把 Vue / Element Plus / 命令模块拖进这条关键路径
- 若首次绘制仍取不到图标，`callbacks.ts` 会在主页面启动 2s 后调用一次
  `Application.ribbonUI.Invalidate()`，让 WPS 重新调用 `getImage`

### 3.4 图片系统（image/）

- 扫描 `public/images`，生成 `ImageFileName` 类型（字面量联合）
- 与 `RibbonControlId` 合并使用：`imageMap: Partial<Record<RibbonControlId, ImageFileName>>`
- 支持 dev 模式监听目录变化自动重生成

---

## 4. 排版引擎详解

引擎按「一次排版从外到内」拆成若干文件，全部位于 `src/core/`：

| 文件                                                         | 职责                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `typeset.ts`                                                 | 顶层入口：`quickFormat`（只排正文）、`applyFullFormat`（页边距 → 页眉 → 页码 → 正文） |
| `styles.ts`                                                  | 建立「公文正文」「公文标题」两个段落样式（后续所有写入都引用样式，而不是逐段设字体）  |
| `page.ts` / `header.ts` / `footer.ts`                        | 页面设置、页眉、页码（含页脚文本框的创建与清理）                                      |
| `attachments.ts`                                             | 「附件：」块的定位、缩进与写回                                                        |
| `pipeline.ts`                                                | 批量读段（Range 缓存）、差异计算、倒序写回                                            |
| `analysis.ts` / `attributes.ts` / `patterns.ts` / `types.ts` | 语义识别、属性注册表、正则与类型                                                      |

**为什么公文排版的 COM 编排放在 `core/` 而不是 `features/gov-doc/`**：`applyFullFormat`
同时被「一键排版」（gov-doc）和「批量排版」（batch）使用。放在插件里，batch 就得 import
gov-doc，违反「插件之间互不引用」；放进 `core/` 后两个插件都只依赖引擎，方向是单向的。

下面按从下往上的顺序展开。

### 4.1 语义识别（core/analysis.ts）

15 种段落类型：

```
empty | mainTitle | subtitle | letterhead | salutation | h1 | h2 | h3 |
listItem | topic | attachment | signatureUnit | signatureDate | body | table
```

**关键判定逻辑**：

| 类型               | 判定方式                                            | 边界                                      |
| ------------------ | --------------------------------------------------- | ----------------------------------------- |
| `h2` vs `listItem` | 同组编号一致性：组内任一条已判为 `listItem`         | `（一）是否同意…` 夹在长条目中 → listItem |
| `h3` vs `listItem` | 首句号前分隔符 < 2 且前段不是 `listItem`            | `1.接到任务后，由甲或乙确定…` → listItem  |
| `salutation`       | 黑名单 + 白名单词级匹配                             | 拆 `、` 后逐词判断，支持多主体抬头        |
| `letterhead`       | 文档首块 + 合并后以机关名称收尾 + 其后紧跟标题块    | 「关于……的通知」含事由词，不会误判        |
| `mainTitle`        | 干净段落 + 前方是 `docStart`/`divider` + 扩展至空行 | 换页符段不是空行，会阻断块                |
| `signatureUnit`    | 从日期向前扫描，遇空行或句末标点即停                | 联合发文支持多行                          |

**为什么 h2 要按「同组编号」回头降格？**

原判定是逐段 + 只看前一段状态：`（一）` 短句会先被升格为 h2，后面的 `（二）（三）` 长条目才判为 `listItem`，已经升格的段落没有机制再降回来。但同组编号不可能一个是二级标题、一个是列表项，因此在分析末尾做一次**整组归一**：

- 组内任一条已判为 `listItem`（首句号前多个逗号顿号 / 分号结尾 / 首句号前含冒号、`@`、书名号或「（送审稿）」式括号）→ 整组 h2 降为 `listItem`；
- 多句**不是**降格理由：`（一）加强组织领导。成立领导小组，明确责任分工。` 这组都是「标题 + 说明」，仍保持 h2（子范围只覆盖标题部分）；
- 组内只有一条编号时保留原判。

`（二）审议《XX工作规则（送审稿）》《XX建议名单》。` 的首句号前带书名号和送审稿括号，所以不按小节标题处理；而 `（五）议程。一是审议《XX（送审稿）》；……` 的书名号在句号之后，标题部分只有「（五）议程」，仍是 h2。

「同组」= 连续、前缀类型相同（都是 `（一）` 这类括号汉字编号）；`（一）` 后接 `1.` 属于不同层级，不参与归一。

**为什么 topic 把分号也当条目边界？**

「一是……；二是……；三是……。」是公文常见写法。原先只认 `。` 作终止符，整串会被当成一条：`auto` 模式下因为超过 26 字只加粗「一是」前缀，后面的条目全部丢失。现在 `。` / `；` 都是终止符，每个条目各自匹配、各自加粗。

**为什么主标题识别要把换页符段特殊处理？**

真实 COM 文本 `\r\f\r` 解析后得到一个 `"\f\r"` 段：`isEmpty=false`、`hasFormFeed=true`。
如果当作空行跳过，会**越过换页符**错误地把封面和正文标题当成一块。

**为什么把「版头（红头）」单独识别？**

版头在标题上方，形态是发文机关名称，例如：

```
中共XX自治县委员会
社会工作部和政法委联席会议办公室
```

它和标题一样是「连续非空段 + 空行」，单靠位置无法区分。旧规则取文档首块当标题，
版头会抢占 `mainTitle`，真正的「关于……的通知」反被降为 `body`（拿不到 22pt 小标宋）。
现在用三条互补规则识别版头：

1. 位于文档最前（前面只允许空行）；
2. 1–4 行合并后**以机关名称收尾**，且不含「关于 / 转发 / 印发」与句读；
3. 其后（隔空行）必须紧跟一个**以文种收尾的标题块**——这条兜底避免把孤立的单位名当版头。

识别后版头段落标为 `letterhead`，同时作为 `divider` 让标题块从它下方起算。

### 4.2 属性注册表（core/attributes.ts）

每个排版属性实现四个方法：

```ts
interface AttrSpec {
    key: keyof ParaAttrValues;
    desired(p, config, ctx): unknown; // 期望值
    readCom?(rng): unknown; // 读当前值（可省略）
    isEqual(expected, current): boolean; // 相等判定（领域规则，不一定是 ===）
    apply(rng, value, doc): void; // 写回
}
```

**新增属性 checklist**：

1. `ParaAttrValues` 加字段
2. `ATTRS` 数组加一项
3. 如果字段可读，实现 `readCom`（能做差异检测）；否则每次都会下发

**不需要**修改 `computeModifications` / `applyModifications`。

### 4.3 差异计算的关键不变量

`computeModifications` 分两步：

1. **先判 `style` 是否会变**
2. **样式会变时，其余属性跳过差异检测，直接下发**

原因：COM 样式是"属性基线"，切换样式会重置它定义的属性（如首行缩进）。
不做这个处理，会出现"差异检测说一致 → 但切换样式后实际值又不对"的隐蔽 bug。

### 4.4 段落跳过策略

```ts
shouldSkipPara(p) === p.isSkipped || p.semanticKinds.has("letterhead");
```

`isSkipped` 由 `readParaInfos` 一次性计算：

- `isTable`（含 `\x07`）
- `currentStyleName === "不排版"`（用户手动标记）
- 被 `zdoc_*` 书签覆盖（`collectSkipRanges` 一次性扫描所有书签，建区间表后纯 JS 比对）

`letterhead`（版头 / 红头）由结构分析阶段标出，同样整段跳过：版头的字体、字号、颜色、
居中位置都是版式设计元素，按正文/标题样式改写会直接破坏红色发文机关标志。

**为什么一次性收集书签？** 逐段读 `rng.Bookmarks.Count` 是 O(N) 次 COM 调用；一次性读全文档书签是 O(M) 次，之后区间比对是纯 JS。

### 4.5 邮件合并引擎（Excel → DOCX）

邮件合并分两层，边界是硬约束：

```
src/features/mail-merge/core/   纯逻辑，禁止引用 WPS 全局对象
  ├─ docx.ts                 DOCX XML：循环块 / 表格行 / #if / 段落替换 / zip
  ├─ expression.ts           #if 条件词法 + 递归下降求值
  ├─ spreadsheet.ts          SheetJS 读取 xls/xlsx/.et、扁平记录归一化
  ├─ pipeline.ts             引号感知管道切分、参数字面量、链式执行
  ├─ formatters.ts           内置函数 + 注册表
  ├─ format.ts               numfmt 适配（Excel TEXT 规则）
  ├─ rmb.ts                  人民币大写
  ├─ custom.ts               new Function 编译与 50ms 告警
  ├─ naming.ts               输出文件名展开与清理
  └─ template.ts / rows.ts   旧版 Mustache / 表格行逻辑（保留给兼容 API 与单测）

src/features/mail-merge/commands/mailMergeBatch.ts   WPS 编排
  ├─ 模板 .doc/.wps 先转一次临时 DOCX
  ├─ 记录在内存中渲染，不再逐条打开 / 关闭 WPS 文档
  ├─ 输出目录、去重文件名、成功/告警/失败汇总
  └─ 预览：临时 DOCX 以“未保存”状态打开

src/features/mail-merge/commands/mergeTemplate.ts    旧版 COM 替换（仍保留给非 Excel 流程）
```

**DOCX 渲染管线**：

1. `JSZip` 取出 `word/document.xml` 与页眉 / 页脚 / 脚注 / 尾注；
2. `@xmldom/xmldom` 解析 XML，保留完整 OOXML 格式；
3. 主文档按正文块（`w:p` / `w:tbl`）扫描 `{{#each}}` 段落；
4. 循环体拆成「表格前段落 / 一个表格 / 表格后段落」；
5. 普通段落按迭代上下文克隆；表格区分静态行与模板行，静态行只留一份，模板行按迭代次数复制；
6. `#if` 在每次迭代的段落内求值，false 时删除整块；段落变空则从正文删除；
7. 变量和管道按 `w:t` 文本节点映射做区间替换，保留第一个 run 的字体格式；
8. `JSZip` 重新打包，`Application.FileSystem.writeAsBinaryString` 直接写 `.docx`。

**row / group**：

- `row in:E..T cols:4 as:...` 只读当前数据行，按列宽 ÷ cols 生成横向组；`@index`、`@count` 为组序号 / 组数。
- `group by:列 keep:true` 扫描所选全部数据行，按列判组；每次迭代是一行，`@group.列名` 取组首行，`@index` / `@count` / `@groupIndex` 均为组内/组序信息。
- 内部元信息 0 基，渲染表达式统一 +1。

**模板结构校验**：循环标记必须在表格外的独立段落；一个循环体最多一个表格；模板行必须连续；循环列宽必须整除 `cols`；合并单元格只取左上角并 warning。对应错误码：`each-crosses-table`、`each-multiple-tables`、`template-rows-not-contiguous`、`row-column-range-error`。

**文本替换**：`collectParagraphText` 把一段拆成多个 `w:t` + 全局偏移。占位符可能被 Word 拆到多个 run；替换时写入起始 run、清空跨越的中间 run，因此不会因为 run 拆分而漏替换。`#if` 和变量都从后往前替换，避免偏移漂移。

**批量输出**：模板只加载 / 转换一次；row 模式每条记录渲染一个文件，group 模式按分组拆成多个文件（每组一个，`groupIndex` 保持原组序号）。文件名由 `expandMergeFileName` 展开，`resolveOutputPath` 处理重名。原模板只读，不会被修改。

**预览**：渲染到临时 `.docx`，用 WPS 打开并标记 `Saved = false`。分页、页眉页脚、表格宽度都是 WPS 真实渲染结果。

**错误分层**：循环未闭合 / 标记位置非法 / 多表格 / 模板行不连续 / 列宽不整除是 error，预检阶段直接拒绝输出；合并单元格、空字段、格式化器告警、`width` 近似是 warn，只记录并继续。

---

## 5. 前端架构

### 5.1 URL 分流启动

```
?dialog=quick-style  → Vue + 单组件（features/*/dialogs/quick-style.vue）
?pane=settings       → Vue + 主应用 + 指令 + Ribbon 绑定（features/*/views/settings.vue）
（无参数）           → Vue + 主应用 + 导航页 views/index.vue（清单来自插件声明）
```

**弹窗模式**关键点：

- 不加载派发模块（`kernel/dispatch`），只注册零依赖的 Ribbon 回调
- 不加载全局错误处理
- 不触发弹窗预加载（避免递归）
- 只 `Promise.all([loader()])`，无并行依赖

**硬约束**：弹窗组件**不能** import 假设主应用已初始化的 composable（共享 `src/composables` 里的那几个），
只能 import 插件自己的 `commands/`、`core/`，以及 `wps/*`、`utils/*`、`config/*` 这些共享层。

### 5.2 配置持久化

- **localStorage**（`useLocalStorage`）—— 运行时快速读写
- **文件系统**（`Application.FileSystem`）—— 跨设备/跨会话配置
- **Valibot 校验** —— 文件加载后 `validateGovDocConfig` 保证结构正确，任何校验失败回落默认值

### 5.3 composable 的分层

composable 变多之后最大的问题不是数量，而是「通用逻辑」和「业务强绑定」混在一起：
改一个业务规则要先翻十几个 `useXxx`。现在的划分标准只有一条——

> **删掉某个业务后它是否还成立？**

| 位置                             | 内容                                                                                                                    | 依赖                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/composables/`               | 通用封装：`useActiveDocumentWatcher` / `useSelectionWatcher` / `useSelectionBookmark` / `useFonts` / `useScrollLinkage` | 只依赖 Vue / WPS 能力 / 纯工具，**不 import store 或业务命令** |
| `src/features/<id>/composables/` | 业务封装：`useBatchProgress` / `useMergeRecordNavigation` / `usePageActions` / `useConfigFile` …                        | 可以依赖该插件的 `commands/`、全局配置 store                   |

判断示例：

- `useActiveDocumentWatcher` 只是「WPS 窗口激活 → 回调」，任何功能都能用 → 通用；
- `useMergeRecordNavigation` 依赖 `mergeMail` 命令与记录语义 → 邮件合并插件；
- `useFonts` 是「取系统字体列表」，不含公文规则 → 通用（即使目前只有 gov-doc 用）。

**设置区仍然是对称拆分**，只是随插件走：

```
src/features/gov-doc/
  components/PageSection.vue        ←→  composables/usePageActions.ts
  components/TypographySection.vue  ←→  composables/useTypographyActions.ts
  components/HeaderSection.vue      ←→  composables/useHeaderActions.ts
  components/FooterSection.vue      ←→  composables/useFooterActions.ts
```

- `XxxSection.vue`：只负责布局，把标题、图标、动作按钮传给共享的 `SectionPanel`（`src/components`）
- `useXxxActions.ts`：只负责动作（apply / remove / reset）
- `settings.vue`（插件自己的 `views/`）组合四个 Section，`applyAll` / `resetAll` 遍历调用即可

### 5.4 任务窗格交互细节

- **`v-wheel-change`**：数字输入框支持鼠标滚轮调值。WPS 里键盘输入远比浏览器别扭，滚轮是从 1 调到 2.4 最快的路径
- **`v-element-hover`**：鼠标进入任务窗格时**主动拉一次文档状态**。WPS 任务窗格不会像浏览器 tab 那样触发 focus/blur 事件
- **三栏常显的响应式布局**：`text-compare.vue` 不再用按钮切换面板。宽窗格三栏；中等宽度原文 / 修改并排、对比结果在下方；更窄时单列堆叠。任何宽度都同时渲染三个面板
- **悬浮窗格尺寸**：`taskPane.ts` 轮询 `DockPosition` / `Width`。用户在左右停靠时手动拖出的宽度会记入 localStorage；拖成 `msoCTPDockPositionFloating` 时优先套用该宽度，没有记录则用 1080 × 720，避免 WPS 默认的极窄浮动窗

### 5.5 文本对比工作台

`features/text-compare/views/text-compare.vue` 的核心是纯函数 `features/text-compare/core/textCompare.ts` + 三个展示组件：

```
oldText / newText (localStorage)
        │
        ▼ computeTextCompare()
groups + oldSegments + newSegments + mergedHtml + stats
        │
        ├── ComparePane × 2      （按片段渲染，data-diff-id 定位）
        ├── CompareResultPanel   （默认合并文本，可切差异列表）
        └── CompareStats         （新增 / 删除 / 修改 / 相似度）
```

**差异模型**：

- 字符级 `diff-match-patch`，可用语义优化 / 效率优化 / 原始输出三种清理策略
- 连续的删除 + 新增合并成一个差异块；只有一侧内容的块归类为新增 / 删除
- **两侧都有锚点**：纯新增时原文侧插入零宽 `anchor`，纯删除时修改侧插入零宽 `anchor`，保证每条差异都能在左右两栏同时定位
- 同时输出 `mergedHtml`（`diffPrettyHtml`），把增删放在同一段文字里，作为「对比结果」的默认视图
- 相似度按「替换取较长一侧、增删取实际长度」的编辑代价计算，与用户对“改了 1 个字”的直觉一致

**交互设计**：

- 三个面板始终同时渲染；窄窗格通过响应式网格调整排列，不再有点击切换
- 点击差异列表条目 → `currentId` → 两个 `ComparePane` 同时 `scrollToGroup()`；滚动期间用时间戳锁避免互相触发
- 手动滚动时按滚动比例双向同步（可关闭）
- 输入抽屉里的选区 / 书签同步：书签模式不再把同步目标重置为“关闭”，否则文档改动会静默丢失
- 只有一侧文本时不计算差异，避免把“还没填另一侧”误判成整篇新增 / 删除

**其他文件**：

- `features/text-compare/components/CompareInputDrawer.vue`：输入、文件导入、选区 / 书签同步
- `features/text-compare/components/ClauseCompareView.vue`：段落级 Myers 对齐 + 行内字符 diff
- `features/text-compare/core/compareReport.ts` + `utils/download.ts`：导出可打印的 HTML 报告
- `utils/readDocument.ts`：`.txt`（UTF-8 / GB18030 回退）与 `.docx`（JSZip + xmldom）解析

---

## 6. 测试策略

### 6.1 测试金字塔

```
        ┌──────────────┐
        │  contract    │  plugin-contract.test.ts（插件注册 / 动作 / 页面文件）
        ├──────────────┤
        │ integration  │  gov-doc.test.ts（端到端样例）
        ├──────────────┤
        │    unit      │  core/analysis.* / core/attributes.* / 插件 core/*
        ├──────────────┤
        │  pure util   │  core/patterns / typo（纯函数）
        └──────────────┘
```

测试文件跟着被测代码走：引擎与共享工具的测试在 `src/tests/`，插件的测试在
`src/features/<id>/tests/`。Vitest 会自动收集，不需要维护测试清单。

### 6.2 TestDoc 的作用

```ts
const doc = new TestDoc(["XX省人民政府办公厅", "关于XX工作的通知", "", "各市、县（区）人民政府："]);
expect(doc.at(4).kind).toBe("salutation");
```

`TestDoc` 内部调用 `analyzePlainText`，把纯文本解析 → 结构分析 → 完整指令一次性跑通，
`ParaView` 提供语义化 getter，避免测试断言里到处 `structure.paragraphs[i].primaryKind`。

### 6.3 差异检测的测试方式

不依赖 COM，用 `makeReader` 构造假快照：

```ts
const reader = makeReader([
    { index: 1, attrs: { style: "公文标题" } },
    { index: 3, attrs: { style: "公文正文", fontName: "楷体", firstLineIndent: 2 } },
]);
const mods = computeModifications(doc.structure.paragraphs, config, ctx, reader);
expect(mods.find((m) => m.index === 3)!.firstLineIndent).toBe(0);
```

---

## 7. 扩展指南

### 7.1 新增一种段落类型

1. `core/types.ts` 的 `ParagraphSemanticKind` 加联合成员
2. `core/patterns.ts` 加正则
3. `core/analysis.ts` 的 `classifyPara` 加判定
4. 如果需要特殊处理（主标题块/落款），对应分支加逻辑
5. 在 `ATTRS` 的 `desired` 里加对该类型的处理（如果影响样式/字体等）

### 7.2 新增一种排版属性

见 [4.2](#42-属性注册表coreattributests)。

### 7.3 新增一个 Ribbon 控件

1. 找到控件归属的插件（例如「图片工具」属于 `image-tools`），在它的 `ribbon.ts` 里用
   `button()` / `menu()` 新增，并用 `contributes` 指定容器与 `order`；
2. 在同一个插件的 `actions.ts` 里补上处理函数（键就是控件 id）；
3. 如果要自定义图标：图片放进 `public/images`，在插件的 `icons.ts` 登记控件 id → 文件名；
   不登记则按 `${id}.png` 约定查找；
4. 如果控件要塞进别的插件声明的菜单（比如「排版」菜单），用
   `contributes: [{ container: "menu1", ... }]`，**不要**去改那个插件的文件；
5. `vite dev` 会自动重新生成 `ribbon.xml` 和 `RibbonControlId`，若 TS 报错说明 ID 拼错；
   `pnpm test` 会检查控件是否有归属、动作是否实现。

### 7.4 新增一个弹窗

1. 在插件的 `dialogs/` 下新建 `<name>.vue`（文件名就是 `?dialog=` 的值）；
2. 在插件 `index.ts` 的 `dialogs` 里登记标题 / 尺寸 / 是否模态；
3. 动作里用 `openDialog("<name>")` 打开，**不要**手写 URL 和尺寸；
4. 也可以直接用 URL 打开：`?dialog=<name>`（调试时最方便）。

**约束**：弹窗组件不能 import 共享 composable（见 [5.1](#51-url-分流启动)）。

### 7.5 新增一个设置区

1. `XxxSection.vue`：用共享的 `SectionPanel` 包一层，传 `title`、`icon`、`actions` 数组；
2. `XxxSettings.vue`：只放表单控件（如果设置区很大才拆，小的话可合并到 Section）；
3. `useXxxActions.ts`：放在插件自己的 `composables/`，实现 `apply` / `reset`（必要时 `remove`）；
4. 插件 `views/settings.vue` 里加一行 `<XxxSection />`（设置面板属于 `gov-doc` 插件）。

### 7.6 新增一个功能插件

见 [2.3 插件式架构](#23-插件式架构功能层)。最小步骤是建目录 + 两行注册 + `pnpm test`。

---

## 8. 性能设计

### 8.1 三级缓存的正确性保证

落盘缓存的 key 是 `v2|version|mtime:size;mtime:size`：

- `version` 变化 → `wps-jsapi-declare` 升级
- `mtime` / `size` 变化 → `.d.ts` 被改动
- 前缀 `v2` 是缓存格式版本（未来若有字段变更，改这里即可让旧缓存全部失效）

**不做** "文件内容 hash"——读取两个大文件计算 hash 反而比重新解析慢。

### 8.2 差异计算对二次排版的意义

假设全文 500 段，每段 6 个属性，全量下发 = 3000 次 COM 写操作。
差异计算后，已排好的段落 0 次写操作。**二次排版接近瞬时。**

### 8.3 弹窗 / 插件动作的冷启动优化

- 弹窗组件不进主 bundle（`import.meta.glob` 动态导入），一个弹窗一个 chunk
- 弹窗模式不初始化主应用的依赖链，也不注册 Ribbon 回调
- 每个插件的动作实现独立成 chunk：点击某插件时只加载那一个插件
- 空闲时 `requestIdleCallback` 只预热「控件 → 插件」索引（纯数据），不预加载动作实现——
  这样启动成本是常数级，不随插件数量增长

### 8.4 COM 调用优化

| 优化点       | 手段                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| 跳过书签判定 | 一次性收集全文档书签，建区间表后纯 JS 比对，避免逐段读 `Bookmarks.Count`    |
| Range 缓存   | `makeComReader` 按段落缓存 `Range`，同一段多次读取同一属性不重复 COM        |
| 样式名复用   | `readParaInfos` 已读过的 `Style.NameLocal` 传给 `makeComReader`，避免二次读 |
| 主标题识别   | 一次遍历计算所有块，不需要二次扫描全文                                      |

---

## 9. FAQ

**Q：为什么 `mainTitle` 块必须在文档首 / 附件后 / 换页符后？**

A：这三种是公文主标题的天然边界。其他位置出现"连续非空段 + 空行"更可能是正文分块，不升级为主标题可避免误判。

**Q：为什么版头必须「后面跟着标题」才成立？**

A：开头孤立的机关名称也可能是简报报头、封面署名。只有确认下方是标题，才能确定被跳过的是「版头」，
而不是把本文标题或落款单位误跳过。这条兜底让版头判定保持保守：判不准时退回旧行为，不会把标题改坏。

**Q：为什么 `h3` 要把"首句号前分隔符 ≥ 2"判为 `listItem`？**

A：`1.接到任务后，由甲或乙确定时间、地点、人数需求。` 这种是并列描述，不是标题。标题的天然特征是短、无内部标点堆砌。

**Q：为什么署名行（byline）要求 2+ 空格？**

A：单空格（如 `某局局长 张某`）在正文中出现概率极高。2+ 空格是排版者刻意为之的强特征。这条是启发式，未来若误判率高可放宽。

**Q：跳过书签为什么用前缀 `zdoc_` 而不是固定名单？**

A：书签是可扩展的——未来可以有 `zdoc_skip`、`zdoc_noformat`、`zdoc_table` 多种标记，统一前缀便于一次扫描全部命中。

**Q：`ATTRS` 里 `alignment` 的 `desired` 现在恒返回 `undefined`，为什么还留着？**

A：作为槽位保留。想启用时只需改 `desired` 的返回逻辑，不需要动其他地方。

**Q：功能为什么不拆成 monorepo 的多包？**

A：插件随同一个加载项发布、共用一次构建，独立 package 只会增加 workspace、tsconfig 引用与版本对齐成本，换不来部署上的独立性。「目录即插件 + 显式契约 + 契约测试」已经能约束边界：插件之间不允许互相 import，共享能力必须下沉到 `wps/`、`core/`、`utils/`、`config/`。真正需要独立发布的是构建工具 `vite-plugin-wps-enhance`，它才是 pnpm workspace 的成员。

**Q：`src/composables` 和 `src/features/<id>/composables` 怎么选？**

A：看「删掉某个业务后它是否还成立」。通用封装只依赖 Vue / WPS 能力 / 纯工具，不 import store 或业务命令，放 `src/composables`；依赖配置、业务命令或业务状态语义的，放对应插件目录。判断标准见 [5.3](#53-composable-的分层)。
