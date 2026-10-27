type Frame = { name: string; start: number; duration: number; children: Frame[] };

const stack: Frame[] = [];
let enabled = process.env.NODE_ENV === "development";

export function enablePerf(v: boolean) {
    enabled = v;
}

/**
 * 包裹一段同步或异步逻辑，记录其耗时并挂到当前调用栈的父节点下。
 * 最外层的 scope 结束时，会把整棵调用树打印出来。
 */
export function scope<T>(name: string, fn: () => T): T {
    if (!enabled) return fn();

    const frame: Frame = { name, start: performance.now(), duration: 0, children: [] };

    // 若当前已有未结束的 frame，则作为它的子节点
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(frame);
    stack.push(frame);

    try {
        const result = fn();
        // 异步分支：等 Promise settle 后再结束当前 frame
        if (result instanceof Promise) {
            return result.finally(() => pop(frame)) as T;
        }
        pop(frame);
        return result;
    } catch (e) {
        pop(frame);
        throw e;
    }
}

/** 结束一个 frame；若它是根节点，则触发整棵树的打印 */
function pop(frame: Frame) {
    frame.duration = performance.now() - frame.start;
    stack.pop();
    if (stack.length === 0) printTree(frame);
}

// --- 打印 ---

/** 毫秒格式化：超过 1s 转成秒，方便读 */
function fmtMs(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(2)}ms`;
}

/** 粗略判断是否为全角字符（中文、日文、全角符号等），显示时占 2 列 */
function isFullWidth(cp: number): boolean {
    return (
        (cp >= 0x1100 && cp <= 0x115f) ||
        cp === 0x2329 ||
        cp === 0x232a ||
        (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xfe30 && cp <= 0xfe6f) ||
        (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6)
    );
}

/** 计算字符串在终端里的显示宽度 */
function displayWidth(s: string): number {
    let w = 0;
    for (const ch of s) w += isFullWidth(ch.codePointAt(0)!) ? 2 : 1;
    return w;
}

/** 把字符串按显示宽度补齐到 width 列 */
function padToWidth(s: string, width: number): string {
    return s + " ".repeat(Math.max(0, width - displayWidth(s)));
}

/** 打印整棵调用树，根节点单独一行，子节点带树形前缀 */
function printTree(root: Frame) {
    console.log(`${root.name}\t${fmtMs(root.duration)}`);
    printChildren(root, "");
}

/**
 * 递归打印子节点。
 * prefix 是当前层累积的竖线前缀（"│  " 或 "   "），
 * 用来保证深层节点的缩进与祖先对齐。
 */
function printChildren(parent: Frame, prefix: string) {
    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
        const c = children[i];
        const isLast = i === children.length - 1;

        // 最后一个子节点用 └─，其余用 ├─
        const branch = isLast ? "└─ " : "├─ ";

        // 左列按显示宽度补齐到固定列，保证后面的 \t 跳到同一制表位
        const left = padToWidth(prefix + branch + c.name, 24);

        // 时间字段右对齐补到固定宽度（最宽为 "999.99ms"，8 列），
        // 这样后面的 "(" 无论耗时多长都会从同一列开始
        const time = fmtMs(c.duration).padStart(8);

        // 相对父节点的耗时占比，便于快速定位瓶颈
        const pct =
            parent.duration > 0 ? `(${((c.duration / parent.duration) * 100).toFixed(1)}%)` : "";

        console.log(`${left}\t${time}  ${pct}`);

        // 若当前节点是最后一个，子节点前缀补空格；否则补竖线，保持视觉连通
        printChildren(c, prefix + (isLast ? "   " : "│  "));
    }
}
