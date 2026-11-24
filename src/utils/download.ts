/**
 * 在浏览器 / WPS 前端触发一次文件下载。
 *
 * 用 Blob + 临时 <a download>，不依赖 WPS 的文件对话框；
 * 下载结束后延迟释放 URL，避免部分内核尚未读取就开始释放。
 */
export function downloadTextFile(
    content: string,
    fileName: string,
    mimeType = "text/plain;charset=utf-8",
): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
