# 架构设计

> 面向贡献者和想深入理解设计决策的读者。
> 想了解功能请先看 [功能手册](./FEATURES.md)。

---

## 目录

1. [设计哲学](#1-设计哲学)
2. [三层架构](#2-三层架构)
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

## 2. 三层架构

```
┌────────────────────────────────────────────────┐
│ 第三层：COM 编排层                                │
│ para-pipeline.ts                                │
│ · 批量读段（Range 缓存）                          │
│ · 一次性收集书签跳过区间                          │
│ · 差异应用（倒序处理，避免索引偏移）               │
├────────────────────────────────────────────────┤
│ 第二层：属性注册表 + 差异计算                      │
│ para-attributes.ts                              │
│ · ATTRS 声明式属性描述符                          │
│ · computeModifications / applyModifications      │
│ · 快照接口 SnapshotReader（不依赖 COM）           │
├────────────────────────────────────────────────┤
│ 第一层：纯逻辑分析                                │
│ para-analysis.ts / para-patterns.ts              │
│ · 语义识别（15 种段落类型）                        │
│ · 主标题块 / 落款 / topic 匹配                    │
│ · 不引用任何 Wps.* 全局对象                       │
└────────────────────────────────────────────────┘
```

### 2.1 分层的实际收益

- **第一层**：完全在 vitest 里跑，每次 commit 秒级回归
- **第二层**：`SnapshotReader` 是个接口，测试用 `makeReader` 构造，生产用 `makeComReader`
- **第三层**：只被 `quickFormat()` 一个入口调用，COM 调用集中可控

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
// actions.ts
const actionHandlers: Partial<Record<RibbonControlId, RibbonAction>> = {
    btnGovDocTypo: () => {
        /* ... */
    },
};
```

拼错任何 ID 都是**编译期错误**。

### 3.4 图片系统（image/）

- 扫描 `public/images`，生成 `ImageFileName` 类型（字面量联合）
- 与 `RibbonControlId` 合并使用：`imageMap: Partial<Record<RibbonControlId, ImageFileName>>`
- 支持 dev 模式监听目录变化自动重生成

---

## 4. 排版引擎详解

### 4.1 语义识别（para-analysis.ts）

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

### 4.2 属性注册表（para-attributes.ts）

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

---

## 5. 前端架构

### 5.1 URL 分流启动

```
?dialog=quick-style  → Vue + 单组件
?pane=settings       → Vue + 主应用 + 指令 + Ribbon 绑定
（无参数）           → Vue + 主应用 + 导航页
```

**弹窗模式**关键点：

- 不加载 Ribbon 绑定（`setupRibbonBindings`）
- 不加载全局错误处理
- 不触发弹窗预加载（避免递归）
- 只 `Promise.all([loader()])`，无并行依赖

**硬约束**：弹窗组件**不能** import 任何 composable（它们假设主应用已初始化），只能 import `jsa/commands/*` 和 `jsa/utils/*`。

### 5.2 配置持久化

- **localStorage**（`useLocalStorage`）—— 运行时快速读写
- **文件系统**（`Application.FileSystem`）—— 跨设备/跨会话配置
- **Valibot 校验** —— 文件加载后 `validateGovDocConfig` 保证结构正确，任何校验失败回落默认值

### 5.3 组件对称拆分

每个设置区是**一对文件**：

```
src/components/                src/composables/
  PageSection.vue        ←→      usePageActions.ts
  TypographySection.vue  ←→      useTypographyActions.ts
  HeaderSection.vue      ←→      useHeaderActions.ts
  FooterSection.vue      ←→      useFooterActions.ts
```

- `XxxSection.vue`：只负责布局，把标题、图标、动作按钮传给通用的 `SectionPanel`
- `useXxxActions.ts`：只负责动作（apply / remove / reset）

`settings.vue` 组合四个 Section，`applyAll` / `resetAll` 就是遍历调用四个 composable 的 apply / reset。

### 5.4 三个 WPS 场景专用交互

- **`v-wheel-change`**：数字输入框支持鼠标滚轮调值。WPS 里键盘输入远比浏览器别扭，滚轮是从 1 调到 2.4 最快的路径
- **`v-element-hover`**：鼠标进入任务窗格时**主动拉一次文档状态**。WPS 任务窗格不会像浏览器 tab 那样触发 focus/blur 事件
- **`beforeCollapse` 拦截折叠**：`text-compare.vue` 的结果面板一旦展开，再点标题**不折叠，而是平滑滚回顶部**

### 5.5 活文档对比的实现

`text-compare.vue` 的核心不是 diff 组件，而是 `useSelectionBookmark`：

```
用户选中文本
    │
    ▼ markSelection()
在文档里创建书签 → 保存书签名字 + 原始文本
    │
    ▼ startWatching(callback)
监听这段文字的变化
    │
    ▼ 变化时
callback 拿到 { currentText, previousText }
    │
    ▼ 根据 insertTarget 决定
写入 oldText 或 newText
```

**关键设计**：

- **书签而非选区引用**：选区会在用户点击别处时丢失，书签不会
- **回调拿到的是文本差**：WPS 没有"选中内容变化"事件，只能靠每次选区变化时读一次
- **`insertTarget === "none"` 时不写入**：避免用户正在手动输入对比框时被书签同步打断

---

## 6. 测试策略

### 6.1 测试金字塔

```
        ┌──────────────┐
        │ integration  │  gov-doc.test.ts（端到端样例）
        ├──────────────┤
        │    unit      │  para-analysis.* / para-attributes.*
        ├──────────────┤
        │  pure util   │  para-patterns / typo（纯函数）
        └──────────────┘
```

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

1. `para-types.ts` 的 `ParagraphSemanticKind` 加联合成员
2. `para-patterns.ts` 加正则
3. `para-analysis.ts` 的 `classifyPara` 加判定
4. 如果需要特殊处理（主标题块/落款），对应分支加逻辑
5. 在 `ATTRS` 的 `desired` 里加对该类型的处理（如果影响样式/字体等）

### 7.2 新增一种排版属性

见 [4.2](#42-属性注册表para-attributests)。

### 7.3 新增一个 Ribbon 控件

1. `xmlConfig.ts` 里用 `button()` / `menu()` 等新增
2. `actions.ts` 的 `actionHandlers` 加对应处理
3. 如果按钮有图标，把 SVG 放进 `public/images`（文件名 = `btnXxx.svg`）
4. `vite dev` 会自动重新生成 `ribbon.xml` 和 `RibbonControlId`，若 TS 报错说明 ID 拼错

### 7.4 新增一个弹窗

1. 在 `src/components/dialogs/` 新建 `<name>.vue`
2. 触发方式：`Application.ShowDialog(url + "?dialog=<name>", title, w, h)`
3. 无需注册——`import.meta.glob` 自动收集

**约束**：弹窗组件不能 import composable（见 [5.1](#51-url-分流启动)）。

### 7.5 新增一个设置区

1. `XxxSection.vue`：用 `SectionPanel` 包一层，传 `title`、`icon`、`actions` 数组
2. `XxxSettings.vue`：只放表单控件（如果设置区很大才拆，小的话可合并到 Section）
3. `useXxxActions.ts`：实现 `apply` / `reset`（必要时 `remove`）
4. `settings.vue` 里加一行 `<XxxSection />`

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

### 8.3 弹窗冷启动优化

- 弹窗组件不进主 bundle（`import.meta.glob` 动态导入）
- 弹窗模式不初始化主应用的依赖链
- 空闲时 `requestIdleCallback` 预加载所有弹窗（利用浏览器缓存）

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
