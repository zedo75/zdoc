# ZDoc Wiki

- [条件引导启动](#条件引导启动)
- [开发指南](#开发指南)
- [scripts/wps.js](#scriptswpsjs)
- [配置说明](#配置说明)
- [已知问题](#已知问题)
- [银河麒麟安装脚本](#银河麒麟安装脚本)

---

## 条件引导启动

### 背景

在常规的 Vue 3 单页应用（SPA）开发中，入口文件通常这样写：

```ts
import { createApp } from "vue";

import App from "./App.vue";

const app = createApp(App);
app.mount("#app");
```

这种写法在浏览器中运行良好，但在 **WPS 加载项** 环境中，每次打开弹窗都会重新加载并执行全部脚本，导致 2~3 秒白屏。

### 解决方案：基于 URL 参数的条件式引导加载

核心思想是 **让同一个 `main.ts` 在不同启动场景下加载不同的依赖**：

- **主任务窗格**：需要完整功能，加载所有模块。
- **弹窗**：通常只展示少量内容，仅需 Vue + 对应组件。

通过读取 URL 查询参数（如 `?dialog=msg`），在 `main.ts` 开头进行分支判断，实现按需加载。

### 代码结构示例

```ts
import { createApp } from "vue";

import "@/styles/main.css";

const dialogModules = import.meta.glob<{ default: import("vue").Component }>(
    "@/components/dialogs/*.vue",
);

const urlParams = new URLSearchParams(window.location.search);
const dialogType = urlParams.get("dialog");

(async function boot() {
    if (dialogType) {
        const loader = dialogModules[`/src/components/dialogs/${dialogType}.vue`];
        if (!loader) {
            console.error(`未知弹窗类型: ${dialogType}`);
            document.body.innerHTML = `<div style="padding:20px;color:red;">未知弹窗类型: ${dialogType}</div>`;
            return;
        }
        const [{ default: Dialog }] = await Promise.all([loader()]);
        createApp(Dialog).mount("#app");
    } else {
        const [{ default: App }, { setupRibbonBindings }] = await Promise.all([
            import("@/App.vue"),
            import("@/jsa/ribbon/actions"),
        ]);

        setupRibbonBindings();
        createApp(App).mount("#app");
    }
})();
```

### 为什么传统 Vue 项目没有这种写法？

| 特性               | 传统 SPA             | WPS 插件                 |
| ------------------ | -------------------- | ------------------------ |
| 运行环境           | 浏览器 Tab（单实例） | WPS CEF 多窗口（多实例） |
| `main.ts` 执行次数 | 1 次                 | 每次打开窗口都重新执行   |
| 路由切换           | 内存中替换组件       | 每次都是全新加载         |
| 优化目标           | 首屏加载速度         | **每次弹窗加载速度**     |

> 任务窗格与弹窗均通过 URL 参数 + `import.meta.glob` 直接按需加载组件，不再有 vue-router 路由这一层。

## 开发指南

### 添加新的 Ribbon 按钮

1. 在 `src/jsa/ribbon/xmlConfig.ts` 中使用 `RibbonBuilder` DSL 定义按钮。
2. 在 `src/jsa/ribbon/actions.ts` 的 `actionHandlers` 中注册与按钮 `id` 同名的回调。

### 添加新的任务窗格

1. 在 `src/views/` 下创建 Vue 组件。
2. 在 `src/jsa/ribbon/taskPane.ts` 中新增页面名常量，并注册到页面映射表。
3. 在 `src/jsa/ribbon/actions.ts` 中调用 `toggleTaskPane(pageName, title?)`。

> 任务窗格状态通过 `sessionStorage` 缓存，也可以使用 `PluginStorage`。

### 添加新的弹窗

1. 在 `src/components/dialogs/` 下创建 `xxx.vue`（命名即 `?dialog=xxx` 的参数值）。
2. 在 `actions.ts` 中通过 `ShowDialog`（带 `?dialog=xxx`）打开。

### 排版模块

排版逻辑按职责拆分为五个文件：

| 文件                 | 职责                                 |
| -------------------- | ------------------------------------ |
| `para-patterns.ts`   | 正则与常量                           |
| `para-types.ts`      | 类型定义                             |
| `para-analysis.ts`   | 纯逻辑：结构分析、语义分类、附件处理 |
| `para-attributes.ts` | 属性注册表 + 差异计算 + 应用         |
| `para-pipeline.ts`   | COM 编排：读取 → 分析 → 差异 → 应用  |

**属性注册表**：每个排版属性（style / fontName / fontSize / bold / alignment / firstLineIndent / subRanges）
的 `desired` / `readCom` / `isEqual` / `apply` 内聚在一起，新增属性只需改 2 处（`ParaAttrValues` + `ATTRS`）。

## scripts/wps.js

`scripts/wps.js` 是项目实现的 WPS 加载项脚本，用于在开发阶段快速安装调式。在 `package.json` 中通过生命周期钩子串联：

```json
{
    "predev": "node scripts/wps.js dev --port 3889",
    "prepreview": "node scripts/wps.js dev --port 4173",
    "build:install": "node scripts/wps.js install"
}
```

### 子命令

#### `dev --port <port>`

- 在 WPS 加载项配置中注册本地调试地址 `http://127.0.0.1:<port>`；
- 若配置未变化则跳过写入，避免每次都触发 WPS 重载；
- 由 `predev` / `prepreview` 自动调用，一般不需要手动执行。

#### `install`

- 将 `dist/` 复制到 WPS 的 `jsaddons` 目录；
- 按 `package.json` 中的 `version` 注册安装条目；
- 通过 `pnpm build:install` 调用。

### 相关脚本

- `scripts/publish-xml.js`：发布 `publish.xml`，用于分发。

> 具体行为以 `scripts/wps.js` 源码为准。

---

## 配置说明

### 公文排版默认值（符合国标）

| 元素        | 默认值          | 说明                           |
| ----------- | --------------- | ------------------------------ |
| 标题字体    | 方正小标宋\_GBK | 公文标题（居中、无缩进）       |
| 正文字体    | 仿宋\_GB2312    | 中文三号；西文 Times New Roman |
| 标题字号    | 二号 (22pt)     |                                |
| 正文字号    | 三号 (16pt)     |                                |
| 正文行距    | 固定 28.95pt    | 三号字对应行距                 |
| 首行缩进    | 2 字符          | 即两个中文字符                 |
| 一级标题 H1 | 黑体            | 不加粗                         |
| 二级标题 H2 | 楷体\_GB2312    | 不加粗                         |
| 三级标题 H3 | 仿宋\_GB2312    | 加粗                           |
| 抬头 / 称谓 | 楷体\_GB2312    | 顶格（无缩进，由代码控制）     |
| 小标题加粗  | 前缀加粗        | 可选“整句 / 前缀 / 不加粗”     |

### 页面布局默认值

|   参数   | 默认值 | 说明                   |
| :------: | :----: | ---------------------- |
|  上边距  |  37mm  | 纸张上边缘到正文上边缘 |
|  下边距  |  35mm  | 纸张下边缘到正文下边缘 |
|  左边距  |  28mm  | 纸张左边缘到正文左边缘 |
|  右边距  |  26mm  | 纸张右边缘到正文右边缘 |
| 页眉距离 |  15mm  | 纸张顶端到页眉下边缘   |
| 页脚距离 |  24mm  | 纸张底端到页脚下边缘   |

### 页眉 / 页脚默认值

|   参数   | 默认值 | 说明                         |
| :------: | :----: | ---------------------------- |
| 页眉字体 |  黑体  | 三号（16pt）                 |
| 页眉位置 | 左对齐 | 可选左 / 中 / 右             |
| 页眉内容 |   空   | 由用户填写                   |
| 页脚字体 |  宋体  | 四号（14pt）                 |
| 页脚页码 |  外侧  | 可选左 / 中 / 右 / 内 / 外侧 |

以上数值可在「公文设置」任务窗格中自定义。

---

## 已知问题

### 1. 开发环境下点击自定义功能区（Ribbon）偶现卡顿

**现象**：`pnpm dev` 模式下，首次点击插件自定义选项卡可能卡死 2~3 秒。

**根因**：XML 中的 `getImage` 回调在开发环境存在性能问题，生产构建不会出现。

**规避方案**：

- 启动 WPS 后，先点击其他选项卡（如“开始”或“插入”），等待 2~3 秒再切换。
- 或在插件代码加载完成前（约 3 秒内）避免点击插件选项卡。

### 2. WPS 类型定义不全的修复

`Application.Enum`、`Application.NewEnum` 等属性在官方类型中未定义，但运行时可用。

本项目已通过 `vite-plugin-wps-enhance` 的 `enum` 能力自动扫描并生成 `src/wps-env.d.ts` 进行类型扩充。

由于 `WpsNewEnum` 扁平化后常量过多（6120+），类型提示极慢，故仅定义为 `Record<string, number>`：

```ts
declare namespace Wps {
    interface Application {
        Enum: Record<string, number>;
    }
}
```

### 3. Tailwind CSS v4 兼容性

当前使用 Tailwind CSS **v3**。升级到 v4 后 CSS 样式无法正常加载，请继续使用 v3，暂不建议升级。

### 4. JS 加载项不支持 JSA 编辑器中的 CreateObject

以下代码在 JSA 编辑器中可用，但在 JS 加载项环境中不支持：

```js
function demo() {
    const app = CreateObject("kwps.application");
    const doc = app.Documents.Add();
    doc.Content.Text = "Hello from WPS!";
}
```

---

## 银河麒麟安装脚本

```sh
#!/bin/bash

set -e  # 遇到错误立即退出

# 颜色定义
if [ -t 1 ] && [ -t 2 ]; then
    # 交互式终端，启用颜色
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[0;33m'
    NC='\033[0m' # No Color
else
    GREEN=''
    RED=''
    YELLOW=''
    NC=''
fi

# 彩色输出函数
echo_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
echo_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }

addonPath="$HOME/.local/share/Kingsoft/wps/jsaddons"
xmlFile="$addonPath/jsplugins.xml"

mkdir -p "$addonPath" # 确保目标目录存在

echo_info "正在查找包含 'zdoc' 的最新 .7z 压缩包..."
zdocFile=$(find . -maxdepth 1 -type f -name "*zdoc*.7z" -printf "%T@ %p\n" 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
if [ -z "$zdocFile" ]; then
    echo_error "当前目录下未找到包含 'zdoc' 的 .7z 文件"
    read -p "按回车键退出..."
    exit 1
fi
echo_info "找到文件：$zdocFile"

# 处理备份、删除旧文件、解压缩之前检测
if ! command -v 7z &> /dev/null; then
    echo "错误：未找到 7z 命令，请先安装：sudo apt install p7zip-full"
    exit 1
fi

# 备份并处理 jsplugins.xml
if [ -f "$xmlFile" ]; then
    cp "$xmlFile" "$xmlFile.bak"
    echo_info "已备份 $xmlFile 到 $xmlFile.bak"
fi

# 移除旧版本（如果存在）
if grep -q 'name="zdoc"' "$xmlFile" 2>/dev/null; then
    # 提取旧 URL 中的路径
    oldUrl=$(grep 'name="zdoc"' "$xmlFile" | sed -n 's/.*url="\([^"]*\)".*/\1/p')
    if [ -n "$oldUrl" ]; then
        oldPath="${oldUrl#file://}"   # 去掉 file:// 前缀
        if [ -d "$oldPath" ]; then
            echo_warn "删除旧版本目录：$oldPath"
            rm -rf "$oldPath"
        fi
    fi
    # 删除 XML 中的旧条目
    sed -i '/name="zdoc"/d' "$xmlFile"
    echo_info "已从 XML 中移除旧 zdoc 条目"
fi

echo_info "正在解压 $zdocFile 到 $addonPath ..."
if ! 7z x "$zdocFile" -aoa -o"$addonPath" >/dev/null 2>&1; then
    echo_error "解压失败，请检查文件是否损坏"
    read -p "按回车键退出..."
    exit 1
fi
echo_info "解压成功"

# 获取解压后的文件夹名
newFolder=$(find "$addonPath" -maxdepth 1 -type d -name "zdoc_*" | head -1)
if [ -z "$newFolder" ]; then
    echo_error "解压后未找到 zdoc_* 文件夹"
    read -p "按回车键退出..."
    exit 1
fi
folderName=$(basename "$newFolder")
echo_info "新文件夹：$folderName"

# 提取版本号
version="${folderName#zdoc_}"
if [ -z "$version" ]; then
    echo_error "无法从文件夹名提取版本号：$folderName"
    read -p "按回车键退出..."
    exit 1
fi

# 构建新的 URL（末尾带斜杠）
newUrl="file://$addonPath/$folderName/"

# 若 XML 文件不存在则创建基本结构
if [ ! -f "$xmlFile" ]; then
    echo '<jsplugins>' > "$xmlFile"
    echo '</jsplugins>' >> "$xmlFile"
fi

# 在 </jsplugins> 前插入新条目
sed -i "/<\/jsplugins>/i \  <jsplugin name=\"zdoc\" type=\"wps\" url=\"$newUrl\" version=\"$version\" />" "$xmlFile"
echo_info "已添加/更新 zdoc 插件，版本 $version"

echo_info "正在打开目录：$addonPath"
peony "$addonPath" > /dev/null 2>&1 &

echo_info "全部完成！"

read -p "按回车键退出..."
```

## 报告问题

- 在 [Issues](https://github.com/zedo/zdoc/issues) 页面搜索是否已有类似问题。
- 提供清晰的**复现步骤**、**WPS 版本**（如 2023 春季版 12.1.0.xxxx）、**操作系统**（Windows 10 / 银河麒麟）以及相关截图或错误信息。
