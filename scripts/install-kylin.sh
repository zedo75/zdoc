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
