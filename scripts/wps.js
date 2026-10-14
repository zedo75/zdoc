import fs from "node:fs";
import path from "node:path";

import {
    appendEntry,
    getAddonDir,
    readXml,
    removeEntry,
    writeXml,
    XML_PATH,
} from "./publish-xml.js";

const NAME = "zdoc";
const DIST_DIR = path.join(process.cwd(), "dist");

/* 日志 */
const on = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (on ? `\x1b[${code}m${s}\x1b[39m` : s);
const gray = c(90),
    cyan = c(36),
    green = c(32);
const log = (msg) => {
    const d = new Date();
    const t = [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map((n) => String(n).padStart(2, "0"))
        .join(":");
    process.stdout.write(`${gray(t)} ${cyan("[wps]")} ${green(msg)}\n`);
};

/* 参数 */
const args = process.argv.slice(2);
const mode = args[0];
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? args[portIdx + 1] : process.env.WPS_DEBUG_PORT;

/* 清旧条目 + 清旧目录，返回清理后的 XML */
function clearOld(xml) {
    const { xml: cleaned, removedDirs } = removeEntry(xml, NAME);
    const base = path.resolve(getAddonDir());
    for (const d of removedDirs) {
        const abs = path.resolve(d);
        if (fs.existsSync(abs) && abs.startsWith(base)) {
            fs.rmSync(abs, { recursive: true, force: true });
            log(`删除旧目录: ${abs}`);
        }
    }
    return cleaned;
}

/* 判断 XML 中是否已有相同 name + url 的条目 */
function hasEntry(xml, url) {
    const re = /<jsplugin(?:online)?\b[^>]*?>/g;
    for (const tag of xml.match(re) || []) {
        if (
            tag.match(/\bname="([^"]*)"/)?.[1] === NAME &&
            tag.match(/\burl="([^"]*)"/)?.[1] === url
        )
            return true;
    }
    return false;
}

/* 模式分发 */
if (mode === "dev") {
    if (!port) throw new Error("缺少 --port，或设置 WPS_DEBUG_PORT");

    const url = `http://127.0.0.1:${port}/`;
    const entry = `<jspluginonline name="${NAME}" type="wps" url="${url}" debug="" install="null"/>`;
    const xml = readXml(XML_PATH);

    if (hasEntry(xml, url)) {
        log(`配置未变化，跳过写入 → ${url}`);
    } else {
        writeXml(XML_PATH, appendEntry(clearOld(xml), entry));
        log(`调试模式已启用 → ${url}`);
    }
} else if (mode === "install") {
    if (!fs.existsSync(DIST_DIR)) {
        throw new Error(`dist 不存在：${DIST_DIR}，请先运行 pnpm build`);
    }

    const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
    const version = pkg.version || "0.0.0";
    const folderName = `${NAME}_${version}`;
    const addonDir = getAddonDir();
    const targetDir = path.join(addonDir, folderName);
    const url = `file://${addonDir.replace(/\\/g, "/")}/${folderName}/`;
    const entry = `<jsplugin name="${NAME}" type="wps" url="${url}" version="${version}" debug=""/>`;
    const xml = readXml(XML_PATH);
    const registered = hasEntry(xml, url);

    const cleaned = registered ? xml : clearOld(xml);

    fs.mkdirSync(addonDir, { recursive: true });
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(DIST_DIR, targetDir, { recursive: true });
    log(`复制 ${DIST_DIR} → ${targetDir}`);

    if (registered) {
        log(`配置未变化，跳过写入 XML`);
    } else {
        writeXml(XML_PATH, appendEntry(cleaned, entry));
        log(`安装完成: ${NAME} v${version}`);
    }
} else {
    throw new Error(`未知模式: ${mode ?? "(空)"}，可用: dev / install`);
}
