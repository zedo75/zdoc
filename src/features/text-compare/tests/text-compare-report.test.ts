import {
    buildCompareReportFileName,
    buildCompareReportHtml,
} from "@/features/text-compare/core/compareReport";
import { computeTextCompare } from "@/features/text-compare/core/textCompare";

describe("buildCompareReportHtml", () => {
    it("包含统计、双侧文本和差异清单", () => {
        const oldText = "第一段。\n第二段旧。";
        const newText = "第一段。\n第二段新。";
        const result = computeTextCompare(oldText, newText);
        const html = buildCompareReportHtml({
            oldText,
            newText,
            result,
            cleanupLabel: "语义优化",
            generatedAt: new Date(2026, 10, 19, 1, 55),
        });

        expect(html).toContain("文本对比报告");
        expect(html).toContain("语义优化");
        expect(html).toContain("2026-11-19 01:55");
        expect(html).toContain("第二段");
        expect(html).toContain("对比结果（共 1 处）");
        expect(html).toContain("<del>旧</del>");
        expect(html).toContain("<ins>新</ins>");
    });

    it("转义用户文本，避免报告被注入", () => {
        const oldText = '<script>alert("x")</script>';
        const newText = "安全文本 & <b>粗体</b>";
        const result = computeTextCompare(oldText, newText);
        const html = buildCompareReportHtml({
            oldText,
            newText,
            result,
            cleanupLabel: "原始输出",
        });

        expect(html).not.toContain("<script>alert");
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain("&amp;");
        expect(html).toContain("&lt;b&gt;");
    });

    it("相同文本的报告给出完全一致提示", () => {
        const result = computeTextCompare("同一段文字", "同一段文字");
        const html = buildCompareReportHtml({
            oldText: "同一段文字",
            newText: "同一段文字",
            result,
            cleanupLabel: "语义优化",
        });

        expect(html).toContain("两段文本完全一致");
        expect(html).toContain("完全一致");
    });
});

describe("buildCompareReportFileName", () => {
    it("按时间生成可读文件名", () => {
        expect(buildCompareReportFileName(new Date(2026, 10, 19, 1, 55))).toBe(
            "文本对比报告-20261119-0155.html",
        );
    });
});
