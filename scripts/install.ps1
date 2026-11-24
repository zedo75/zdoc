#Requires -Version 5.1
param(
    [string]$AddonPath  = (Join-Path $env:APPDATA "kingsoft\wps\jsaddons"),
    [string]$XmlName    = "publish.xml",
    [string]$Dir = ""   # 可选：指定 7z 搜索目录，支持相对/绝对路径
)

$ErrorActionPreference = "Stop"

# ===== 控制台中文编码 =====
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

# ===== 退出码 =====
$script:ExitCode = 0

# ===== 输出函数 =====
function Write-Info  { param($m) Write-Host "[INFO] $m"  -ForegroundColor Green }
function Write-Warn2 { param($m) Write-Host "[WARN] $m"  -ForegroundColor Yellow }
function Write-Err   { param($m) Write-Host "[ERROR] $m" -ForegroundColor Red }

# ===== 保存 XML 为无 BOM 的 UTF-8 =====
function Save-XmlUtf8NoBom {
    param(
        [Parameter(Mandatory=$true)][System.Xml.XmlDocument]$Xml,
        [Parameter(Mandatory=$true)][string]$Path
    )
    $settings = New-Object System.Xml.XmlWriterSettings
    $settings.Encoding = New-Object System.Text.UTF8Encoding($false)
    $settings.Indent = $true
    $settings.IndentChars = "  "
    $writer = [System.Xml.XmlWriter]::Create($Path, $settings)
    try   { $Xml.Save($writer) }
    finally { $writer.Close() }
}

# ===== 暂停函数 =====
function Wait-BeforeExit {
    param([int]$Code = 0)

    Write-Host ""
    if ($Code -eq 0) {
        Write-Host "全部完成，按任意键关闭窗口..." -ForegroundColor Green
    } else {
        Write-Host "安装失败（错误码 $Code），按任意键关闭窗口..." -ForegroundColor Red
    }

    try {
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    } catch {
        try { Read-Host "按回车键关闭窗口" } catch { }
    }
}

# ===== 获取脚本/exe 所在目录（兼容 ps12exe）=====
function Get-ScriptDirectory {
    try {
        $exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
        if ($exePath -and (Test-Path $exePath)) {
            return Split-Path -Parent $exePath
        }
    } catch { }

    if ($PSCommandPath -and (Test-Path $PSCommandPath)) {
        return Split-Path -Parent $PSCommandPath
    }
    if ($MyInvocation.MyCommand.Path) {
        return Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    return (Get-Location).Path
}

# ===== 解析 7z 搜索目录（支持相对/绝对）=====
function Resolve-Dir {
    param(
        [string]$Dir,
        [string]$ScriptDir
    )

    # 未传入：使用脚本所在目录
    if ([string]::IsNullOrWhiteSpace($Dir)) {
        return $ScriptDir
    }

    $raw = $Dir.Trim().Trim('"')

    # 绝对路径直接用
    if ([System.IO.Path]::IsPathRooted($raw)) {
        $resolved = $raw
    } else {
        # 相对路径：以脚本目录为基准解析
        $resolved = Join-Path $ScriptDir $raw
    }

    # 归一化（处理 ./ ../ 和多余分隔符）
    try {
        $resolved = [System.IO.Path]::GetFullPath($resolved)
    } catch {
        throw "无法解析搜索路径：$Dir"
    }

    if (-not (Test-Path $resolved)) {
        throw "指定的搜索路径不存在：$resolved"
    }
    if (-not (Test-Path $resolved -PathType Container)) {
        throw "指定的搜索路径不是目录：$resolved"
    }

    return $resolved
}

# ===== 主流程 =====
try {
    $xmlFile   = Join-Path $AddonPath $XmlName
    $scriptDir = Get-ScriptDirectory
    $searchDir = Resolve-Dir -Dir $Dir -ScriptDir $scriptDir

    Write-Info "脚本目录：$scriptDir"
    Write-Info "搜索目录：$searchDir"
    Write-Info "加载项目录：$AddonPath"
    Write-Info "配置文件：$xmlFile"

    if (-not (Test-Path $AddonPath)) {
        New-Item -ItemType Directory -Path $AddonPath -Force | Out-Null
    }

    # 1. 找最新的 *zdoc*.7z
    Write-Info "正在查找包含 'zdoc' 的最新 .7z 压缩包..."
    $zdocFile = Get-ChildItem -Path $searchDir -Filter "*zdoc*.7z" -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $zdocFile) { throw "目录中未找到包含 'zdoc' 的 .7z 文件：$searchDir" }
    Write-Info "找到文件：$($zdocFile.FullName)"

    # 2. 定位 7z（优先同目录，再系统）
    $sevenZip = @(
        (Join-Path $scriptDir "7za.exe"),
        (Join-Path $scriptDir "7z.exe"),
        (Join-Path $searchDir "7za.exe"),
        (Join-Path $searchDir "7z.exe"),
        (Get-Command "7z.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        "$env:ProgramFiles\7-Zip\7z.exe",
        "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $sevenZip) { throw "未找到 7z.exe，请把 7za.exe 放到脚本同目录或搜索目录" }
    Write-Info "使用解压工具：$sevenZip"

    # 3. 备份 XML
    if (Test-Path $xmlFile) {
        Copy-Item $xmlFile "$xmlFile.bak" -Force
        Write-Info "已备份 $xmlFile 到 $xmlFile.bak"
    }

    # 4. 删旧目录 + 删旧 XML 条目
    if (Test-Path $xmlFile) {
        [xml]$xml = Get-Content -LiteralPath $xmlFile -Encoding UTF8
        $oldNode = $xml.SelectSingleNode("//jsplugin[@name='zdoc']")
        if ($oldNode) {
            $oldUrl = $oldNode.GetAttribute("url")
            if ($oldUrl -match "^file://(.+)$") {
                $oldPath = $matches[1] -replace "/", "\"
                if (Test-Path $oldPath) {
                    Write-Warn2 "删除旧版本目录：$oldPath"
                    Remove-Item $oldPath -Recurse -Force
                }
            }
            $oldNode.ParentNode.RemoveChild($oldNode) | Out-Null
            Save-XmlUtf8NoBom -Xml $xml -Path $xmlFile
            Write-Info "已从 XML 中移除旧 zdoc 条目"
        }
    } else {
        $xml = New-Object System.Xml.XmlDocument
        $decl = $xml.CreateXmlDeclaration("1.0", "UTF-8", $null)
        $xml.AppendChild($decl) | Out-Null
        $root = $xml.CreateElement("jsplugins")
        $xml.AppendChild($root) | Out-Null
        Save-XmlUtf8NoBom -Xml $xml -Path $xmlFile
        Write-Info "已创建 $xmlFile"
    }

    # 5. 解压
    Write-Info "正在解压 $($zdocFile.Name) 到 $AddonPath ..."
    & $sevenZip x $zdocFile.FullName -aoa "-o$AddonPath" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "解压失败，请检查文件是否损坏" }
    Write-Info "解压成功"

    # 6. 找新文件夹 & 版本号
    $newFolder = Get-ChildItem -Path $AddonPath -Directory -Filter "zdoc_*" -ErrorAction SilentlyContinue |
                 Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $newFolder) { throw "解压后未找到 zdoc_* 文件夹" }
    $folderName = $newFolder.Name
    $version    = $folderName -replace "^zdoc_", ""
    if (-not $version) { throw "无法从文件夹名提取版本号：$folderName" }
    Write-Info "新文件夹：$folderName，版本：$version"

    # 7. 写新条目
    $normalizedPath = $AddonPath -replace "\\", "/"
    $newUrl = "file://$normalizedPath/$folderName/"

    [xml]$xml = Get-Content -LiteralPath $xmlFile -Encoding UTF8
    $newNode = $xml.CreateElement("jsplugin")
    $newNode.SetAttribute("name",    "zdoc")
    $newNode.SetAttribute("type",    "wps")
    $newNode.SetAttribute("url",     $newUrl)
    $newNode.SetAttribute("version", $version)
    $xml.DocumentElement.AppendChild($newNode) | Out-Null
    Save-XmlUtf8NoBom -Xml $xml -Path $xmlFile
    Write-Info "已添加/更新 zdoc 插件，版本 $version"

    # 8. 打开目录
    Start-Process explorer.exe $AddonPath
    Write-Info "全部完成！"
    $script:ExitCode = 0
}
catch {
    Write-Host ""
    Write-Host "========== 错误 ==========" -ForegroundColor Red
    Write-Host "消息：$($_.Exception.Message)" -ForegroundColor Red
    if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) {
        Write-Host "位置：第 $($_.InvocationInfo.ScriptLineNumber) 行" -ForegroundColor Red
    }
    Write-Host "==========================" -ForegroundColor Red

    $script:ExitCode = 1
}
finally {
    Wait-BeforeExit -Code $script:ExitCode
    exit $script:ExitCode
}