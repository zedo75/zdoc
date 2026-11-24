/**
 * 非交互打包：把 dist 打成 WPS 离线加载项的 7z
 *
 * 产物结构与 `wpsjs build`（离线插件）保持一致：
 *   wps-addon-build/zdoc_<version>/...  →  wps-addon-build/zdoc-<version>.7z
 *
 * 不直接调用 `wpsjs build` 的原因：它会用 inquirer 询问「在线插件 / 离线插件」，
 * 在 CI 里没有 TTY，无法无人值守执行。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const name = pkg.name;
const version = pkg.version;

if (!name || !version) {
    throw new Error("package.json 缺少 name 或 version");
}
if (!fs.existsSync(path.join(root, "dist", "index.html"))) {
    throw new Error("dist 不存在或缺少 index.html，请先执行 pnpm build");
}

const buildDir = path.join(root, "wps-addon-build");
const folder = `${name}_${version}`;
const stageDir = path.join(buildDir, folder);
const archive = path.join(buildDir, `${name}-${version}.7z`);

// 与 wpsjs 一致：每次重新生成，避免旧文件混入
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });
fs.cpSync(path.join(root, "dist"), stageDir, { recursive: true });

const sevenZip = resolveSevenZip();
execFileSync(sevenZip, ["a", "-t7z", "-mx=9", archive, folder], {
    cwd: buildDir,
    stdio: "inherit",
});

fs.rmSync(stageDir, { recursive: true, force: true });

const size = fs.statSync(archive).size;
console.log(`✓ ${path.relative(root, archive)} (${(size / 1024).toFixed(0)} KB)`);

/** 优先用仓库自带的 7za.exe（Windows），其它平台回退到 PATH 中的 7z */
function resolveSevenZip() {
    const bundled = path.join(root, "scripts", "7za.exe");
    if (process.platform === "win32" && fs.existsSync(bundled)) {
        return bundled;
    }

    for (const command of ["7z", "7za"]) {
        try {
            execFileSync(command, ["i"], { stdio: "ignore" });
            return command;
        } catch {
            // 继续尝试下一个命令
        }
    }

    throw new Error("未找到 7z：Windows 下需要 scripts/7za.exe，其它平台请先安装 p7zip");
}
