import type { ClauseRow, RenderSegment } from "@/features/text-compare/core/textCompare";

import {
    buildClauseRows,
    computeTextCompare,
    normalizeDocumentText,
    similarityRating,
    splitClauses,
} from "@/features/text-compare/core/textCompare";

const OLD_TEXT = `这三个因素中，英特尔都做不到。

（1）它的核心产品x86芯片停滞了，多年来没有突破，市场不断缩小。
（2）它的生产工艺一直无法改善，生产出来的x86芯片落后于竞争对手AMD。

美国本土的生产成本，远远低于亚洲。`;

const NEW_TEXT = `这三个因素中，英特尔都做不到。我爱这片土地。

（1）它的核心产品x86芯片停滞了，多年来没有突破，市场不断缩小。
（2）它的生产工艺一直无法改善，生产出来的x86芯片落后于竞争对手AMD。

美国本土的生产成本，远远低于亚洲。所以，英特尔从美国制造业失败。`;

function textOf(segments: RenderSegment[]): string {
    return segments
        .filter((segment) => segment.type !== "anchor")
        .map((segment) => segment.text)
        .join("");
}

function groupIds(segments: RenderSegment[]): number[] {
    return segments
        .filter(
            (segment): segment is Extract<RenderSegment, { groupId: number }> =>
                "groupId" in segment,
        )
        .map((segment) => segment.groupId);
}

describe("computeTextCompare", () => {
    it("左右片段都能无损还原原始文本", () => {
        const result = computeTextCompare(OLD_TEXT, NEW_TEXT);

        expect(textOf(result.oldSegments)).toBe(OLD_TEXT);
        expect(textOf(result.newSegments)).toBe(NEW_TEXT);
    });

    it("每个差异块在左右两侧都有定位锚点", () => {
        const result = computeTextCompare(OLD_TEXT, NEW_TEXT);
        const oldIds = new Set(groupIds(result.oldSegments));
        const newIds = new Set(groupIds(result.newSegments));

        for (const group of result.groups) {
            expect(oldIds.has(group.id)).toBe(true);
            expect(newIds.has(group.id)).toBe(true);
        }
    });

    it("统计新增 / 删除 / 修改数量", () => {
        const result = computeTextCompare("abcd", "abXcd");
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]).toMatchObject({
            type: "insert",
            oldStart: 2,
            oldEnd: 2,
            newStart: 2,
            newEnd: 3,
            newText: "X",
        });
        expect(result.stats).toMatchObject({
            insertedChars: 1,
            deletedChars: 0,
            replaceCount: 0,
            insertCount: 1,
            groupCount: 1,
        });

        const replacement = computeTextCompare("abc", "axc");
        expect(replacement.groups).toHaveLength(1);
        expect(replacement.groups[0]).toMatchObject({
            type: "replace",
            oldText: "b",
            newText: "x",
            oldStart: 1,
            newStart: 1,
        });
        expect(replacement.stats.replaceCount).toBe(1);
        expect(replacement.stats.insertedChars).toBe(1);
        expect(replacement.stats.deletedChars).toBe(1);
    });

    it("删除内容时在右侧插入零宽锚点", () => {
        const result = computeTextCompare("abc", "ac");
        const group = result.groups[0];

        expect(group?.type).toBe("delete");
        expect(group?.oldText).toBe("b");
        expect(result.newSegments.some((segment) => segment.type === "anchor")).toBe(true);
        expect(textOf(result.newSegments)).toBe("ac");
    });

    it("完全相同的文本相似度为 100 且评价为完全一致", () => {
        const result = computeTextCompare("同一段文字", "同一段文字");
        expect(result.stats.similarity).toBe(100);
        expect(result.stats.rating).toBe("完全一致");
        expect(result.groups).toHaveLength(0);
    });

    it("空文本不会产生差异块，相似度评价为暂无文本", () => {
        const result = computeTextCompare("", "");
        expect(result.groups).toHaveLength(0);
        expect(result.stats.similarity).toBe(100);
        expect(result.stats.rating).toBe("暂无文本");
    });

    it("相似度计算符合 max 长度模型", () => {
        const result = computeTextCompare("abcdefghij", "abcdeXghij");
        expect(result.stats.similarity).toBe(90);
        expect(result.stats.rating).toBe("高度相似");
    });

    it("不同清理模式都能完成计算", () => {
        for (const mode of ["semantic", "efficiency", "none"] as const) {
            const result = computeTextCompare(OLD_TEXT, NEW_TEXT, {
                cleanupMode: mode,
                editCost: 4,
            });
            expect(textOf(result.oldSegments)).toBe(OLD_TEXT);
            expect(textOf(result.newSegments)).toBe(NEW_TEXT);
            expect(result.stats.groupCount).toBeGreaterThan(0);
        }
    });

    it("差异块的起止位置与文本切片一致", () => {
        const result = computeTextCompare(OLD_TEXT, NEW_TEXT);
        for (const group of result.groups) {
            expect(OLD_TEXT.slice(group.oldStart, group.oldEnd)).toBe(group.oldText);
            expect(NEW_TEXT.slice(group.newStart, group.newEnd)).toBe(group.newText);
        }
    });

    it("生成增删同屏的合并 HTML", () => {
        const result = computeTextCompare("abc", "axc");
        expect(result.mergedHtml).toContain("<del");
        expect(result.mergedHtml).toContain("<ins");
        expect(result.mergedHtml).toContain("b");
        expect(result.mergedHtml).toContain("x");
    });

    it("合并 HTML 会转义用户文本", () => {
        const result = computeTextCompare("<旧>", "<新>");
        expect(result.mergedHtml).not.toContain("<旧>");
        expect(result.mergedHtml).toContain("&lt;");
    });
});

describe("similarityRating", () => {
    it("按区间给出评价", () => {
        expect(similarityRating(95, true, false)).toBe("高度相似");
        expect(similarityRating(75, true, false)).toBe("较为相似");
        expect(similarityRating(55, true, false)).toBe("存在差异");
        expect(similarityRating(30, true, false)).toBe("差异较大");
        expect(similarityRating(5, true, false)).toBe("差异很大");
        expect(similarityRating(100, false, false)).toBe("暂无文本");
    });
});

describe("条款视图", () => {
    const oldDoc = "第一条 总则\n第二条 甲方义务\n第三条 乙方义务\n第四条 附则";
    const newDoc = "第一条 总则\n第二条 甲方义务（修订）\n第三条 乙方义务\n第五条 争议解决";

    it("相同段落对齐，修改段落配对", () => {
        const rows = buildClauseRows(oldDoc, newDoc);
        const equalRows = rows.filter((row) => row.type === "equal");
        const replaceRows = rows.filter((row) => row.type === "replace");

        expect(equalRows.map((row) => row.oldText)).toEqual(["第一条 总则", "第三条 乙方义务"]);
        expect(replaceRows).toHaveLength(2);
        expect(replaceRows[0]).toMatchObject({
            oldText: "第二条 甲方义务",
            newText: "第二条 甲方义务（修订）",
        });
        expect(replaceRows[1]).toMatchObject({
            oldText: "第四条 附则",
            newText: "第五条 争议解决",
        });
    });

    it("新增或删除的段落单独成行", () => {
        const rows = buildClauseRows("甲\n乙", "甲\n乙\n丙");
        expect(rows.map((row) => row.type)).toEqual(["equal", "equal", "insert"]);
        expect(rows[2]).toMatchObject({ oldNo: null, newNo: 3, newText: "丙" });

        const removed = buildClauseRows("甲\n乙\n丙", "甲\n丙");
        expect(removed.map((row) => row.type)).toEqual(["equal", "delete", "equal"]);
    });

    it("段落数量很大时仍能对齐", () => {
        const oldParas = Array.from({ length: 500 }, (_, index) => `第 ${index} 条 内容`);
        const newParas = [...oldParas];
        newParas.splice(250, 3, "新增条款 A", "新增条款 B");

        const rows = buildClauseRows(oldParas.join("\n"), newParas.join("\n"));
        expect(rows.filter((row) => row.type === "equal")).toHaveLength(497);
        expect(rows.filter((row) => row.type !== "equal").length).toBeGreaterThanOrEqual(3);
    });

    it("段落对齐的相同行数等于最长公共子序列长度", () => {
        let seed = 20261119;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0x100000000;
        };
        const makeParas = (count: number) =>
            Array.from({ length: count }, () => String.fromCharCode(97 + Math.floor(random() * 4)));

        const lcsLength = (a: string[], b: string[]) => {
            const dp = Array.from({ length: a.length + 1 }, () =>
                new Array<number>(b.length + 1).fill(0),
            );
            for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                    dp[i][j] =
                        a[i - 1] === b[j - 1]
                            ? dp[i - 1][j - 1] + 1
                            : Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
            return dp[a.length][b.length];
        };

        for (let round = 0; round < 40; round++) {
            const oldParas = makeParas(Math.floor(random() * 12));
            const newParas = makeParas(Math.floor(random() * 12));
            const rows = buildClauseRows(oldParas.join("\n"), newParas.join("\n"));
            const equalCount = rows.filter((row) => row.type === "equal").length;
            expect(equalCount).toBe(lcsLength(oldParas, newParas));
        }
    });

    it("行类型与文本保持一致", () => {
        const rows: ClauseRow[] = buildClauseRows(oldDoc, newDoc);
        for (const row of rows) {
            if (row.type === "equal") expect(row.oldText).toBe(row.newText);
            if (row.type === "delete") expect(row.newText).toBe("");
            if (row.type === "insert") expect(row.oldText).toBe("");
            if (row.type === "replace") {
                expect(row.oldText.length).toBeGreaterThan(0);
                expect(row.newText.length).toBeGreaterThan(0);
            }
        }
    });
});

describe("文本工具", () => {
    it("统一 WPS / Windows 换行", () => {
        expect(normalizeDocumentText("第一段\r\n第二段\r第三段\u0000\u0007")).toBe(
            "第一段\n第二段\n第三段",
        );
    });

    it("条款切分忽略空行与首尾空格", () => {
        expect(splitClauses("  第一条\n\n 第二条 \n")).toEqual(["第一条", "第二条"]);
    });
});
