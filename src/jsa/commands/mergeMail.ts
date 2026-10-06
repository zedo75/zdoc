import {
    refreshDocumentView,
    refreshMailMergeDataView,
    withUndoRecord,
} from "@/jsa/utils/document";

// 创建文本框，放入字符串后复制再删除
export function copyText(text: string) {
    withUndoRecord("避免撤回时出现文本框", () => {
        const doc = ActiveDocument;
        const tb = doc.Shapes.AddTextbox(1, 0, 0, 100, 100);
        tb.TextFrame.TextRange.Text = text;
        tb.TextFrame.TextRange.Copy();
        tb.Delete();
    });
}

/**
 * 邮件合并数据源解析结果
 */
type SourceType = "Excel" | "Word";

type MailMergeSourceResultSuccess = {
    success: true;
    filePath: string; // 或非 undefined
    sheetName?: string;
    sourceType?: SourceType;
    error?: undefined; // 或省略
};

type MailMergeSourceResultFailure = {
    success: false;
    error: string;
    filePath?: undefined;
    sheetName?: undefined;
    sourceType?: undefined;
};

export type MailMergeSourceResult = MailMergeSourceResultSuccess | MailMergeSourceResultFailure;

/**
 * 获取邮件合并数据源的文件路径，支持 xls(x), doc(x) 后缀的数据源
 */
export function getMailMergeSourcePath(doc: Wps.Document = ActiveDocument): MailMergeSourceResult {
    const ds = doc.MailMerge.DataSource;
    const cs = ds.ConnectString;
    const qs = ds.QueryString;
    if (!cs && !qs) {
        return { success: false, error: "该文档未引用数据源" };
    }

    let dsPath, sheetName: string | undefined;
    let sourceType: SourceType | "" = ""; // 默认 Word
    if (cs) {
        sourceType = "Excel";
        dsPath = /Data Source=([^;]+)/.exec(cs)?.[1];
        sheetName = /`([^`]+)\$`/.exec(qs)?.[1];
    } else {
        sourceType = "Word";
        dsPath = /SELECT \* FROM\s+(.+)$/i.exec(qs)?.[1]?.replace(/^`|`$/g, "");
    }
    if (!dsPath) return { success: false, error: "路径解析失败，原始连接信息：" + (cs || qs) };
    copyText(dsPath);
    return {
        success: true,
        filePath: dsPath,
        sheetName: sheetName,
        sourceType: sourceType,
    };
}

/**
 * 查看数据源信息
 */
export function viewMailSourceInfo() {
    const res = getMailMergeSourcePath();
    const msg = res.success
        ? `已复制路径！\n\n该文档引用 ${res.sourceType} 数据源：\n\n${res.filePath}\n\n${
              res.sheetName ? "Sheet: [" + res.sheetName + "]" : ""
          }`
        : res.error;
    wpsConfirm(msg);
}

/**
 * 获取当前文档邮件合并数据源中的所有字段名。
 *
 * 使用 MailMerge.DataSource.FieldNames 集合，WPS 已自动解析数据源表头，
 * 无需手动读取 Excel/Word 文件。
 */
export function getMergeFieldNames(doc: Wps.Document = ActiveDocument): string[] {
    try {
        const mailMerge = doc.MailMerge;
        if (!mailMerge) return [];

        const dataSource = mailMerge.DataSource;
        if (!dataSource) return [];

        const fieldNames = (dataSource as any).FieldNames;
        if (!fieldNames || fieldNames.Count === 0) return [];

        const names: string[] = [];
        for (let i = 1; i <= fieldNames.Count; i++) {
            const item = fieldNames.Item(i);
            // 兼容部分版本直接返回字符串
            names.push(typeof item === "string" ? item : item.Name);
        }
        return names;
    } catch (e) {
        console.warn("[mergeMail] 读取数据源字段失败", e);
        return [];
    }
}

/**
 * 在指定 Range 处插入一个邮件合并域。
 *
 * MailMerge.Fields.Add(Range, Name) 是 WPS 官方 API，专用于邮件合并场景，
 * 与 Word VBA 的 ActiveDocument.MailMerge.Fields.Add 语法一致。
 */
export function insertMergeField(range: Wps.Range, fieldName: string): void {
    range.Document.MailMerge.Fields.Add(range, fieldName);
}

/**
 * 在当前选区位置插入 NEXT 域
 * 常用于邮件合并的「下一条记录」规则
 */
export function insertNextField(range: Wps.Range): void {
    range.Fields.Add(range, wdFieldNext, "", false);
}

/** 读取当前"域代码/值"显示模式：0 = 显示值，1 = 显示域代码 */
export function getViewMode(): 0 | 1 {
    return Application.ActiveDocument.MailMerge.ViewMailMergeFieldCodes ? 1 : 0;
}

/** 切换"域代码/值"显示模式 */
export function toggleViewMode() {
    const doc = Application.ActiveDocument;
    if (!doc) return;

    const current = getViewMode();
    doc.MailMerge.ViewMailMergeFieldCodes = current === 0 ? 1 : 0;
    refreshDocumentView(); // 避免有时候不会触发刷新，手动刷新
}

/** 读取当前记录号（1-based）；无活动记录返回 0 */
export function getCurrentRecordNumber(doc: Wps.Document = ActiveDocument): number {
    const num = doc.MailMerge.DataSource.ActiveRecord;
    return num != null && num >= 1 ? num : 0;
}

/** 读取数据源记录总数 */
export function getRecordCount(doc: Wps.Document = ActiveDocument): number {
    return doc.MailMerge.DataSource.RecordCount ?? 0;
}

/**
 * 跳转到指定记录（1-based）。
 * 超出范围时自动 clamp 到 [1, RecordCount]。
 * 注意：此处的"记录号"是查询结果集内的位置，不是数据源绝对行号。
 */
export function gotoRecord(recordNumber: number, doc: Wps.Document = ActiveDocument): boolean {
    try {
        const ds = doc.MailMerge.DataSource;
        if (!ds) return false;

        const total = getRecordCount(doc);
        if (total <= 0) return false;

        const target = Math.max(1, Math.min(Math.floor(recordNumber), total));
        ds.ActiveRecord = target;
        refreshMailMergeDataView();
        return true;
    } catch (e) {
        console.warn("[mergeMail] 跳转记录失败", e);
        return false;
    }
}

/** 三态循环顺序 */
const SHADING_ORDER: Wps.WdFieldShading[] = [
    wdFieldShadingNever,
    wdFieldShadingAlways,
    wdFieldShadingWhenSelected,
];

/**
 * 循环切换域底纹（三态）
 * Never → Always → WhenSelected → Never ...
 * @returns 切换后的状态
 */
export function toggleFieldShading(): Wps.WdFieldShading {
    const view = Application.ActiveWindow.ActivePane.View;

    const current = view.FieldShading as Wps.WdFieldShading;
    const idx = SHADING_ORDER.indexOf(current);
    // 若当前值不在枚举内，退化为从 Never 开始
    const next = SHADING_ORDER[(idx + 1) % SHADING_ORDER.length];

    view.FieldShading = next;
    return next;
}

/**
 * 显式设置域底纹
 */
export function setFieldShading(shading: Wps.WdFieldShading): void {
    Application.ActiveWindow.ActivePane.View.FieldShading = shading;
}

/** 读取当前域底纹状态 */
export function getFieldShading(): Wps.WdFieldShading {
    try {
        return Application.ActiveWindow.ActivePane.View.FieldShading;
    } catch {
        return wdFieldShadingNever;
    }
}
