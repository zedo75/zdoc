export function getLineHeight(ta: HTMLTextAreaElement): number {
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight);
    if (Number.isFinite(lh)) return lh;
    const fs = parseFloat(cs.fontSize) || 14;
    return fs * 1.5;
}

/**
 * 测量 textarea 中第 lineNo 行（1-based）的渲染 y 坐标（相对内容顶部）。
 * 正确处理软换行、空行、tab 缩进。
 */
export function measureLineTop(ta: HTMLTextAreaElement, lineNo: number): number {
    const cs = getComputedStyle(ta);
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.cssText = `
    position: absolute;
    top: -99999px;
    left: 0;
    visibility: hidden;
    pointer-events: none;
    overflow: hidden;
    box-sizing: border-box;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: break-word;
    width: ${ta.clientWidth}px;
  `;
    const keys: Array<keyof CSSStyleDeclaration> = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "letterSpacing",
        "lineHeight",
        "textTransform",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "tabSize",
        "wordSpacing",
    ];
    keys.forEach((k) => {
        const v = (cs as any)[k];
        if (typeof v === "string" && v) (mirror.style as any)[k] = v;
    });

    const lines = ta.value.split("\n");
    lines.forEach((line, i) => {
        const span = document.createElement("span");
        span.textContent = line.length > 0 ? line : "\u200b";
        span.dataset.line = String(i);
        mirror.appendChild(span);
        if (i < lines.length - 1) mirror.appendChild(document.createTextNode("\n"));
    });

    document.body.appendChild(mirror);
    const target = mirror.querySelector(`[data-line="${lineNo - 1}"]`) as HTMLElement | null;
    const top = target
        ? target.getBoundingClientRect().top - mirror.getBoundingClientRect().top
        : 0;
    document.body.removeChild(mirror);
    return top;
}
