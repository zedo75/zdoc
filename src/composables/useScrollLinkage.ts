import type { ElScrollbar } from "element-plus";
import type { Ref } from "vue";

import { onBeforeUnmount } from "vue";

import { getLineHeight, measureLineTop } from "@/utils/textarea";

export interface UseScrollLinkageOptions {
    /** 左侧（旧版本）textarea 的 ref */
    oldTaRef: Ref<HTMLTextAreaElement | null>;
    /** 右侧（新版本）textarea 的 ref */
    newTaRef: Ref<HTMLTextAreaElement | null>;
    /** 下方 diff 视图的 ElScrollbar 组件实例 ref（用来拿 wrapRef 真实滚动容器） */
    diffScrollbarRef: Ref<InstanceType<typeof ElScrollbar> | null>;
}

/**
 * 会触发「光标移动」的按键集合。
 * 只有这些按键才会触发 handleTaInteract 里的「滚动 diff 到对应行」逻辑，
 * 避免任意键盘输入（比如打字）都去滚动下方 diff，造成无谓开销。
 */
const NAV_KEYS = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
]);

/**
 * 行号(1-based) → 该行在文本中的字符区间 [start, end]。
 * 例如文本 "ab\ncd\n", 第 2 行 → [3, 5]。
 * 行号越界时返回 [0, 0] 作为安全兜底。
 */
function lineToRange(text: string, lineNo: number): [number, number] {
    const lines = text.split("\n");
    if (lineNo < 1 || lineNo > lines.length) return [0, 0];
    let start = 0;
    // 累加前面所有行的长度 + 1 个换行符，得到当前行起始偏移
    for (let i = 0; i < lineNo - 1; i++) start += lines[i].length + 1;
    return [start, start + lines[lineNo - 1].length];
}

/**
 * 字符偏移 → 行号(1-based)。
 * 通过统计 offset 之前出现的 '\n' 数量得出。
 * 会把 offset 夹取到 [0, text.length] 区间内，防止越界。
 */
function offsetToLine(text: string, offset: number): number {
    const end = Math.min(Math.max(offset, 0), text.length);
    let line = 1;
    for (let i = 0; i < end; i++) {
        if (text.charCodeAt(i) === 10) line++; // 10 === '\n'
    }
    return line;
}

/**
 * 滚动联动 hook：
 * - syncScroll        左右 textarea 纵向滚动同步
 * - handleDiffClick   点下方 diff 单元格 → 上方 textarea 选中该行
 * - handleTaInteract  上方 textarea 点击/光标移动 → 下方 diff 滚到对应行
 */
export function useScrollLinkage(opts: UseScrollLinkageOptions) {
    const { oldTaRef, newTaRef, diffScrollbarRef } = opts;
    // 用 requestAnimationFrame 节流 handleTaInteract，
    // 保证每次事件循环只处理最后一次光标位置（同一帧内多次按键只算一次）
    let rafId = 0;

    /** 左右 textarea 同步滚动：谁触发就把它的 scrollTop 同步给另一边 */
    function syncScroll(source: "old" | "new") {
        const src = source === "old" ? oldTaRef.value : newTaRef.value;
        const dst = source === "old" ? newTaRef.value : oldTaRef.value;
        if (!src || !dst) return;
        dst.scrollTop = src.scrollTop;
    }

    /** 点击下方 diff 单元格 → 上方 textarea 选中对应行并滚动可见 */
    function handleDiffClick(e: MouseEvent) {
        // 通过事件委托，向上找最近的 .diff-cell，找不到说明点击不在单元格内
        const cell = (e.target as HTMLElement | null)?.closest(".diff-cell") as HTMLElement | null;
        if (!cell) return;

        // 判断是旧版本还是新版本的单元格（决定操作哪个 textarea）
        const isOld = cell.classList.contains("diff-cell-old");
        const isNew = cell.classList.contains("diff-cell-new");
        if (!isOld && !isNew) return;

        // 从 gutter（行号列）解析行号，解析失败则忽略
        const lineNo = parseInt(cell.querySelector(".diff-gutter")?.textContent?.trim() ?? "", 10);
        if (!Number.isFinite(lineNo)) return;

        const ta = isOld ? oldTaRef.value : newTaRef.value;
        if (!ta) return;

        // 计算该行在文本中的字符区间（用于 setSelectionRange 选中整行）
        const [start, end] = lineToRange(ta.value, lineNo);
        // 该行顶部的像素位置 + 行高，用来把滚动位置调到「行居中」
        const lineTop = measureLineTop(ta, lineNo);
        const lineHeight = getLineHeight(ta);

        ta.focus();
        ta.setSelectionRange(start, end);
        // 把滚动位置放到「让该行垂直居中」的位置
        ta.scrollTop = Math.max(0, lineTop - ta.clientHeight / 2 + lineHeight / 2);
    }

    /** 上方 textarea 点击 / 光标导航 → 下方 diff 滚动到对应行 */
    function handleTaInteract(side: "old" | "new", e?: KeyboardEvent) {
        // 如果是键盘事件，仅响应导航键，其它输入直接忽略
        if (e && !NAV_KEYS.has(e.key)) return;

        // 取消上一帧未执行的调度，避免同一帧内多次触发
        cancelAnimationFrame(rafId);
        // 放到下一帧执行：等 textarea 的 selectionStart 更新后再读取
        // （尤其是键盘事件，selectionStart 在事件回调里可能还是旧值）
        rafId = requestAnimationFrame(() => {
            const ta = side === "old" ? oldTaRef.value : newTaRef.value;
            if (!ta) return;
            // 根据当前光标偏移得到行号
            const lineNo = offsetToLine(ta.value, ta.selectionStart ?? 0);
            scrollDiffToLine(side, lineNo);
        });
    }

    /** 让下方 diff 滚动到指定行；若该行已在可视区内则只做高亮提示 */
    function scrollDiffToLine(side: "old" | "new", lineNo: number) {
        const scrollbar = diffScrollbarRef.value;
        const container = scrollbar?.wrapRef; // 真正的滚动容器（ElScrollbar 的包裹元素）
        if (!container) return;

        // 按 side 决定在 old/new 单元格里找目标行
        const cls = side === "old" ? ".diff-cell-old" : ".diff-cell-new";
        const cells = container.querySelectorAll<HTMLElement>(cls);

        // 找到 gutter 文本等于 lineNo 的那个单元格
        const target = Array.from(cells).find((cell) => {
            const gutter = cell.querySelector(".diff-gutter")?.textContent?.trim() ?? "";
            return parseInt(gutter, 10) === lineNo;
        });
        if (!target) return;

        // 计算目标元素在滚动内容坐标系中的 top / bottom
        // （getBoundingClientRect 是视口坐标，加上 scrollTop 才能得到内容内坐标）
        const cRect = container.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();
        const tTop = tRect.top - cRect.top + container.scrollTop;
        const tBottom = tTop + tRect.height;
        // 当前可视窗口在内容坐标中的上下边界
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;

        // 若目标不在可视区（上下任一边超出），则平滑滚动到「居中」位置
        if (tTop < viewTop || tBottom > viewBottom) {
            const delta = tRect.top - cRect.top - container.clientHeight / 2 + tRect.height / 2;
            container.scrollTo({
                top: Math.max(0, container.scrollTop + delta),
                behavior: "smooth",
            });
        }

        // 无论是否滚动，都给目标单元格一个 outline 高亮闪烁动画，
        // 提示用户当前光标所在行对应下方哪一行（用 Web Animations API）
        target.animate?.(
            [
                { outline: "2px solid rgba(14,165,233,0.9)", outlineOffset: "-2px" },
                { outline: "2px solid rgba(14,165,233,0)" },
            ],
            { duration: 700, easing: "ease-out" },
        );
    }

    // 组件卸载时取消尚未执行的 rAF，避免回调里访问已卸载的 DOM
    onBeforeUnmount(() => cancelAnimationFrame(rafId));

    return { syncScroll, handleDiffClick, handleTaInteract };
}
