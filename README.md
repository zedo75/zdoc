<h1 align="center">ZDoc</h1>
<p align="center">
  <strong>WPS Office JS 加载项 — 公文排版工具集，符合 GB/T 9704 标准</strong>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-green?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-Custom-blue?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/WPS-JSAPI-orange?style=flat-square" alt="WPS JSAPI" />
  <img src="https://img.shields.io/badge/Vue-3-brightgreen?style=flat-square" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=flat-square" alt="TypeScript" />
</p>

## ✨ 功能特性

- **一键排版** — 自动设置页边距、页眉页脚、文档网格，应用标准正文/标题样式，智能识别小标题
- **页面布局** — 快速设置页边距（上 3.7cm / 下 3.5cm / 左 2.8cm / 右 2.6cm）、页眉页脚距离
- **图片处理** — 批量修改嵌入型图片尺寸、排版居中、压缩及导出
- **快捷样式** — 通过 Ribbon 下拉菜单快速切换字体（二号小标宋 / 三号黑体 / 楷体 / 仿宋）、固定行距、清除格式
- **编号转换** — 动态自动编号与静态文本互转（含一 / 二级标题序号转动态编号）
- **页眉页脚** — 已在「公文设置」中统一配置页眉内容 / 字体 / 位置，页脚支持页码（外侧 / 居中 / 内侧）、奇偶页
- **文本对比** — 支持效率 / 字符两种对比模式及差异精度调节，并支持与文档选区 / 段落书签实时同步
- **邮件合并** — 增强合并域弹窗、记录导航、数据源信息查看与一键更新域
- **批量排版** — 多文档批量应用公文格式
- **辅助清理** — 清除空段落、空格与缩进互转、正则替换、标点全半角转换
- **自定义 Ribbon** — 通过 `vite-plugin-wps-enhance` 生成功能区选项卡，同时自动扫描并生成 WPS 枚举类型

## 🚀 快速开始

### 安装

**方式一：下载 Release（推荐）**

从 [Releases](https://github.com/zedo/zdoc/releases) 下载最新 `zdoc.exe`，双击安装即可。

**方式二：手动安装**

1. 下载 `zdoc.7z`
2. 解压到 WPS 加载项目录：`%APPDATA%\kingsoft\wps\jsaddons\`
3. 重启 WPS，在“组件”选项卡中找到“ZDoc”

**银河麒麟系统**：提供一键安装 / 更新脚本，详见 [wiki - 银河麒麟安装脚本](./wiki.md#银河麒麟安装脚本)。

### 使用

1. 在 WPS 文字中打开需要格式化的公文文档
2. 点击功能区 **“一键排版”** 按钮
3. 如需调整格式，点击 **“格式设置”** 进行配置
4. 点击 **“一键恢复”** 可撤销排版操作
5. 排版后可在侧边面板查看 / 修改元素类型和文字

## 🛠️ 开发

### 环境要求

- Node.js >= 22
- pnpm >= 11
- WPS Office（需支持 JS 加载项）

### 安装依赖

```bash
# 安装项目依赖
pnpm install

# （可选）全局安装 WPS JS 加载项官方工具
npm install -g wpsjs
```

### 开发调试

```bash
pnpm dev
```

`pnpm dev` 会先执行 `predev` 钩子（`node scripts/wps.js dev --port 3889`），完成以下工作：

- 在 WPS 加载项配置中注册本地调试地址 `http://127.0.0.1:3889`；
- 配置未发生变化时跳过写入，避免重复触发 WPS 重载；
- 随后启动 Vite 开发服务器（端口 3889）并自动打开 WPS 加载项。

预览时同样会通过 `prepreview` 调用 `scripts/wps.js dev --port 4173`，逻辑一致。

> `scripts/wps.js` 是项目自带的 WPS 加载项命令行脚本，封装了调试注册与安装两个子命令，详见 [wiki - scripts/wps.js](./wiki.md#scriptswpsjs)。

### 构建

```bash
pnpm build            # 前端构建（输出到 dist/）
pnpm build:install    # 将 dist 复制到 jsaddons 并按版本号注册安装条目
pnpm build:zip        # 打包为 7z 格式（依赖官方 wpsjs，）
pnpm build:exe        # Windows 生成 exe 安装包（依赖官方 wpsjs，）
```

### 代码规范

```bash
pnpm fmt              # Prettier 格式化
pnpm typecheck        # TypeScript 类型检查
pnpm test             # 运行单元测试（Vitest 5）
```

## 📁 目录结构

```text
zdoc/
├── plugins/                        # 自定义 Vite 插件
│   └── vite-plugin-wps-enhance/    # ribbon.xml 生成 + WPS 枚举扫描 + 类型注入
│       └── src/
│           ├── common/             # 通用工具
│           ├── enum/               # WPS 枚举扫描与 wps-env.d.ts 生成
│           ├── image/              # 图标处理
│           └── ribbon/             # Ribbon XML DSL 解析
├── public/                         # 静态资源
│   ├── images/                     # 图标资源
│   ├── favicon.ico
│   ├── logo.svg
│   └── manifest.xml                # 加载项清单
├── scripts/                        # 辅助构建脚本
│   ├── publish-xml.js              # 发布 jsplugins.xml
│   └── wps.js                      # WPS 加载项 dev / install 命令行脚本
├── src/
│   ├── components/                 # 公共 Vue 组件
│   │   ├── dialogs/                # 弹窗组件（按需加载）
│   │   │   ├── mail-merge-field.vue
│   │   │   ├── quick-style.vue
│   │   │   └── regex-replace.vue
│   │   ├── ...
│   │   └── xxx.vue
│   ├── composables/                # 组合式函数
│   │   ├── ...
│   │   └── useXxx.ts
│   ├── config/
│   │   ├── defaults.ts             # 默认排版配置（国标）
│   │   └── validator.ts            # 配置校验（Valibot）
│   ├── directives/                 # 自定义指令
│   │   ├── index.ts
│   │   └── wheelChange.ts          # 滚轮调整数值指令
│   ├── jsa/                        # WPS JS API 相关
│   │   ├── commands/               # 业务命令
│   │   │   ├── batchTypo.ts        # 批量排版
│   │   │   ├── bookmark.ts         # 书签
│   │   │   ├── document.ts         # 页面设置、样式清理
│   │   │   ├── field.ts            # 域操作、编号转换
│   │   │   ├── govDoc.ts           # 公文排版核心
│   │   │   ├── header.ts           # 页眉
│   │   │   ├── image.ts            # 图片
│   │   │   ├── letterhead.ts       # 红头
│   │   │   ├── mergeMail.ts        # 邮件合并
│   │   │   ├── pagenum.ts          # 页脚页码
│   │   │   ├── punctuation.ts      # 标点符号
│   │   │   └── table.ts            # 表格
│   │   ├── ribbon/                 # Ribbon 配置
│   │   │   ├── actions.ts          # 按钮回调
│   │   │   ├── taskPane.ts         # 任务窗格
│   │   │   └── xmlConfig.ts        # Ribbon XML DSL
│   │   ├── types/                  # WPS 业务类型声明
│   │   └── utils/                  # 文档工具函数
│   │       ├── document.ts         # 撤销录制、文档操作辅助
│   │       ├── filesSystem.ts      # 配置读写
│   │       ├── performance.ts      # scope 性能计时
│   │       └── styles.ts           # 字体 / 字号批量设置
│   ├── stores/
│   │   └── govDocConfig.ts         # 公文配置
│   ├── styles/
│   │   └── main.css                # 全局样式
│   ├── utils/
│   │   ├── fonts.ts                # 字体常量
│   │   ├── globalErrorHandler.ts   # 全局错误处理
│   │   ├── para-patterns.ts        # 正则与常量
│   │   ├── para-types.ts           # 类型定义
│   │   ├── para-analysis.ts        # 结构分析、语义分类、附件处理
│   │   ├── para-attributes.ts      # 属性注册表 + 差异计算 + 应用
│   │   ├── para-pipeline.ts        # COM 编排：读取 → 分析 → 差异 → 应用
│   │   ├── typo-model.test.ts      # 测试
│   │   ├── typo.ts                 # 排版工具函数
│   │   └── url.ts
│   ├── views/                      # 任务窗格视图
│   │   ├── index.vue               # 首页
│   │   ├── settings.vue            # 公文设置（含页眉页脚）
│   │   ├── image-resize.vue        # 图片尺寸调整
│   │   ├── batch-typo.vue          # 批量排版
│   │   └── text-compare.vue        # 文本对比
│   ├── main.ts                     # 入口文件（条件引导启动）
│   └── shims-vue.d.ts              # Vue 类型声明
├── index.html                      # 网页入口
├── lefthook.yml                    # lefthook 配置
├── package.json
└── vite.config.ts
```

## 📐 公文格式标准（GB/T 9704）

| 元素     | 字体            | 字号                            | 行距         | 对齐 / 缩进     |
| -------- | --------------- | ------------------------------- | ------------ | --------------- |
| 红头标题 | 方正小标宋\_GBK | 22pt（二号）                    | 固定 28.95pt | 居中            |
| 一级标题 | 黑体            | 16pt（三号）                    | 固定 28.95pt | 左对齐          |
| 二级标题 | 楷体\_GB2312    | 16pt（三号）                    | 固定 28.95pt | 左对齐          |
| 三级标题 | 仿宋\_GB2312    | 16pt（三号）                    | 固定 28.95pt | 首行缩进 2 字符 |
| 正文     | 仿宋\_GB2312    | 16pt（三号）                    | 固定 28.95pt | 首行缩进 2 字符 |
| 页面     | A4（210×297mm） | 上 37mm 下 35mm 左 28mm 右 26mm |              |                 |

## 🧰 技术栈

- **Vue 3** — 前端框架（Composition API）
- **TypeScript** — 类型安全
- **Vite** — 构建工具
- **Tailwind CSS 3** — 样式框架（**暂不升级 v4**，见 [wiki](./wiki.md#3-tailwind-css-v4-兼容性)）
- **Element Plus** — UI 组件库
- **@vueuse/core** — 组合式工具集
- **Valibot** — 配置校验
- **Vitest 5** — 单元测试

## 📝 提交规范

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```text
feat: 新增功能
fix: 修复 bug
refactor: 重构
docs: 文档更新
style: 代码格式
chore: 构建/工具
```

## 📄 开源许可证

本项目目前处于**持续开发完善阶段**，代码、功能及 API 均可能发生较大变动。

- **非商业用途**：在遵守项目文档说明的前提下，允许个人学习、研究及内部使用。
- **商业用途**：**未经明确书面授权，禁止用于任何商业目的**。
- **授权方式**：如需商业使用或获取正式授权，请联系项目维护者。

## 🔗 链接

- [WPS 加载项开发文档](https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/addin-api/wps-addin-availability)
- [报告问题](https://github.com/zedo/zdoc/issues)
