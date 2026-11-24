import { statusLabel, statusType } from "@/features/batch/utils/fileStatus";
import { resolveOutputPath, sanitizeBaseName } from "@/utils/fileName";
import {
    baseNameOf,
    dirOf,
    extOf,
    fileNameOf,
    joinPath,
    normalizePath,
    samePath,
} from "@/utils/filePath";

describe("filePath 路径解析", () => {
    test("解析 Windows 路径", () => {
        const path = "C:\\Users\\a\\报告.DOCX";

        expect(fileNameOf(path)).toBe("报告.DOCX");
        expect(dirOf(path)).toBe("C:\\Users\\a");
        expect(extOf(path)).toBe(".docx");
        expect(baseNameOf(path)).toBe("报告");
        expect(joinPath(dirOf(path), "新文件.docx")).toBe("C:\\Users\\a\\新文件.docx");
        expect(normalizePath(path)).toBe("c:/users/a/报告.docx");
    });

    test("路径比较忽略斜杠方向和大小写", () => {
        expect(samePath("C:\\A\\b.DOCX", "c:/a/B.docx")).toBe(true);
        expect(samePath("C:\\A\\b.DOCX", "C:\\A\\c.docx")).toBe(false);
    });

    test("无扩展名和仅有文件名", () => {
        expect(fileNameOf("报告")).toBe("报告");
        expect(dirOf("报告")).toBe("");
        expect(extOf("报告")).toBe("");
        expect(baseNameOf("报告")).toBe("报告");
        expect(extOf("C:\\a\\b")).toBe("");
    });

    test("目录分隔符风格", () => {
        expect(joinPath("C:\\out", "a.pdf")).toBe("C:\\out\\a.pdf");
        expect(joinPath("C:/out/", "a.pdf")).toBe("C:/out/a.pdf");
    });
});

describe("sanitizeBaseName 文件名清洗", () => {
    test("替换非法字符并压缩空白", () => {
        expect(sanitizeBaseName("  A/B:C*D?  ")).toBe("A B C D");
    });

    test("去掉扩展名和首尾点", () => {
        expect(sanitizeBaseName("报告.docx")).toBe("报告");
        expect(sanitizeBaseName("..报告..")).toBe("报告");
    });

    test("规避 Windows 保留名", () => {
        expect(sanitizeBaseName("CON")).toBe("_CON");
        expect(sanitizeBaseName("nul")).toBe("_nul");
    });

    test("限制最大长度", () => {
        expect(sanitizeBaseName("a".repeat(100), { maxLength: 10 })).toBe("a".repeat(10));
    });
});

describe("resolveOutputPath 生成不重复路径", () => {
    test("优先使用原名", () => {
        expect(resolveOutputPath("C:\\out", "报告", ".pdf", { taken: new Set() })).toBe(
            "C:\\out\\报告.pdf",
        );
    });

    test("本批次已占用时追加 _2", () => {
        const taken = new Set([normalizePath("C:\\out\\报告.pdf")]);
        expect(resolveOutputPath("C:\\out", "报告", ".pdf", { taken })).toBe("C:\\out\\报告_2.pdf");
    });

    test("磁盘已存在时追加 _2", () => {
        const taken = new Set<string>();
        const exists = (path: string) => samePath(path, "C:\\out\\报告.pdf");

        expect(resolveOutputPath("C:\\out", "报告", ".pdf", { taken, exists })).toBe(
            "C:\\out\\报告_2.pdf",
        );
        expect(taken.has(normalizePath("C:\\out\\报告_2.pdf"))).toBe(true);
    });

    test("overwrite 模式允许覆盖磁盘文件", () => {
        const taken = new Set<string>();
        const exists = () => true;

        expect(
            resolveOutputPath("C:\\out", "报告", ".pdf", {
                taken,
                overwrite: true,
                exists,
            }),
        ).toBe("C:\\out\\报告.pdf");
    });

    test("空文件名回退为“未命名”", () => {
        expect(resolveOutputPath("C:\\out", "  ", ".pdf", { taken: new Set() })).toBe(
            "C:\\out\\未命名.pdf",
        );
    });
});

describe("fileStatus 状态映射", () => {
    test("默认文案与覆盖文案", () => {
        expect(statusLabel("pending")).toBe("待处理");
        expect(statusLabel("pending", { pending: "等待" })).toBe("等待");
        expect(statusLabel("error")).toBe("失败");
    });

    test("el-tag type", () => {
        expect(statusType("pending")).toBe("info");
        expect(statusType("processing")).toBe("warning");
        expect(statusType("success")).toBe("success");
        expect(statusType("error")).toBe("danger");
    });
});
