import { expect, test } from "vitest";

import { resolveFloatingPaneSize } from "@/utils/taskPaneSize";

test("没有用户宽度时使用 1080 × 720", () => {
    expect(resolveFloatingPaneSize(null, 1920, 1080)).toEqual({ width: 1080, height: 720 });
});

test("优先使用用户手动调整过的宽度", () => {
    expect(resolveFloatingPaneSize(720, 1920, 1080)).toEqual({ width: 720, height: 720 });
});

test("宽度不会超出屏幕", () => {
    expect(resolveFloatingPaneSize(3000, 1920, 1080)).toEqual({ width: 1880, height: 720 });
});

test("小屏幕下按可用空间收敛", () => {
    expect(resolveFloatingPaneSize(null, 800, 600)).toEqual({ width: 760, height: 560 });
});

test("过窄或非法的用户宽度回退到最小宽度", () => {
    expect(resolveFloatingPaneSize(120, 1920, 1080)).toEqual({ width: 360, height: 720 });
    expect(resolveFloatingPaneSize(Number.NaN, 1920, 1080)).toEqual({ width: 1080, height: 720 });
});
