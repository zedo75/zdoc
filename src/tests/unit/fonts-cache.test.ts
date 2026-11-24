import { getBrowserFonts, getWpsFonts, resetFontCaches } from "@/utils/fonts";

describe("字体探测缓存", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetFontCaches();
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as unknown as Record<string, unknown>).window;
        delete (globalThis as unknown as Record<string, unknown>).Application;
    });

    test("不在 WPS 环境中只告警一次", () => {
        expect(getWpsFonts()).toEqual([[], []]);
        expect(getWpsFonts()).toEqual([[], []]);
        expect(getWpsFonts()).toEqual([[], []]);

        const warnings = warnSpy.mock.calls.filter((args: unknown[]) =>
            String(args[0]).includes("当前不在 WPS 环境中"),
        );
        expect(warnings).toHaveLength(1);
    });

    test("浏览器不支持 queryLocalFonts 时只告警一次", async () => {
        // 空对象：没有 queryLocalFonts
        (globalThis as unknown as Record<string, unknown>).window = {};

        const results = await Promise.all([
            getBrowserFonts(),
            getBrowserFonts(),
            getBrowserFonts(),
        ]);
        expect(results).toEqual([
            [[], []],
            [[], []],
            [[], []],
        ]);
        expect(await getBrowserFonts()).toEqual([[], []]);

        const warnings = warnSpy.mock.calls.filter((args: unknown[]) =>
            String(args[0]).includes("queryLocalFonts"),
        );
        expect(warnings).toHaveLength(1);
    });

    test("并发调用只查询一次本地字体，且各调用方拿到独立数组", async () => {
        const queryLocalFonts = vi.fn().mockResolvedValue([
            { style: "Regular", fullName: "宋体" },
            { style: "Regular", fullName: "Times New Roman" },
            { style: "Bold", fullName: "黑体" }, // 非 Regular，应被过滤
        ]);
        (globalThis as unknown as Record<string, unknown>).window = { queryLocalFonts };

        const [first, second] = await Promise.all([getBrowserFonts(), getBrowserFonts()]);

        expect(queryLocalFonts).toHaveBeenCalledTimes(1);
        expect(first).toEqual([["宋体"], ["Times New Roman"]]);
        expect(second).toEqual([["宋体"], ["Times New Roman"]]);
        expect(first[0]).not.toBe(second[0]);

        // 命中缓存后不应再次查询
        await getBrowserFonts();
        expect(queryLocalFonts).toHaveBeenCalledTimes(1);
    });

    test("resetFontCaches 之后可以重新探测", async () => {
        expect(getWpsFonts()).toEqual([[], []]);

        resetFontCaches();
        expect(getWpsFonts()).toEqual([[], []]);

        const warnings = warnSpy.mock.calls.filter((args: unknown[]) =>
            String(args[0]).includes("当前不在 WPS 环境中"),
        );
        expect(warnings).toHaveLength(2);
    });
});
