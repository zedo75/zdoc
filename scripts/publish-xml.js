import fs from "node:fs";
import osMod from "node:os";
import os from "node:path";
import path from "node:path";

// ===== 跨平台 jsaddons 目录 =====
export function getAddonDir() {
    const home = osMod.homedir();
    switch (osMod.platform()) {
        case "win32":
            return path.join(home, "AppData/Roaming/kingsoft/wps/jsaddons");
        case "darwin":
            return path.join(
                home,
                "Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons",
            );
        default:
            return path.join(home, ".local/share/Kingsoft/wps/jsaddons");
    }
}

export const XML_PATH = path.join(getAddonDir(), "publish.xml");

// 匹配 <jsplugin .../> 或 <jspluginonline .../>（自闭合）
const ENTRY_RE = /<jsplugin(?:online)?\b[^>]*\bname="([^"]+)"[^>]*\/>\s*/g;

export function readXml(xmlPath = XML_PATH) {
    if (!fs.existsSync(xmlPath)) {
        return '<?xml version="1.0" encoding="UTF-8"?>\n<jsplugins>\n</jsplugins>\n';
    }
    const xml = fs.readFileSync(xmlPath, "utf-8");
    if (!/<jsplugins\b/.test(xml)) {
        throw new Error("publish.xml 缺少 <jsplugins> 根节点，已中止");
    }
    return xml;
}

// 删除指定 name 的所有条目，返回 { xml, removedDirs }
export function removeEntry(xml, name) {
    const removedDirs = [];
    const out = xml.replace(ENTRY_RE, (match, nodeName) => {
        if (nodeName !== name) return match;
        const url = match.match(/\burl="([^"]+)"/)?.[1] || "";
        if (url.startsWith("file://")) {
            removedDirs.push(decodeURIComponent(url.slice(7)));
        }
        return "";
    });
    return { xml: out, removedDirs };
}

export function appendEntry(xml, entryXml) {
    if (!/<\/jsplugins>/.test(xml)) throw new Error("publish.xml 缺少 </jsplugins>");
    return xml.replace(/<\/jsplugins>\s*$/, `${entryXml}\n</jsplugins>\n`);
}

export function writeXml(xmlPath, xml) {
    fs.mkdirSync(path.dirname(xmlPath), { recursive: true });
    if (fs.existsSync(xmlPath)) fs.copyFileSync(xmlPath, xmlPath + ".bak");
    fs.writeFileSync(xmlPath, xml, "utf-8"); // Node 默认无 BOM
}
