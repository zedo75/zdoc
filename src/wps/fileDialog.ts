/**
 * WPS 文件 / 目录选择框
 *
 * 只封装 `Application.FileDialog`，并把「上次选过的目录」记在 sessionStorage。
 */

import { dirOf } from "@/utils/filePath";

export interface FileDialogFilter {
    /** 过滤器显示名称 */
    description: string;
    /** 扩展名列表，例如 `*.doc;*.docx;*.wps` */
    extensions: string;
}

export interface PickDocumentsOptions {
    title: string;
    /** 记住上次目录的 sessionStorage 键 */
    storageKey?: string;
    /** 默认使用 {@link DOCUMENT_FILTERS} */
    filters?: FileDialogFilter[];
    /** 是否允许多选，默认 true */
    multi?: boolean;
}

/** 批量文档工具通用的文件类型过滤器 */
export const DOCUMENT_FILTERS: FileDialogFilter[] = [
    { description: "全部支持的文档", extensions: "*.doc;*.docx;*.wps" },
    { description: "Word 文档（.doc / .docx）", extensions: "*.doc;*.docx" },
    { description: "仅 WPS 文档（.wps）", extensions: "*.wps" },
    { description: "仅 Word 97-2003（.doc）", extensions: "*.doc" },
    { description: "Word + WPS（.doc / .wps）", extensions: "*.doc;*.wps" },
];

/**
 * 弹出文件选择框，返回选中的路径。
 *
 * 用户取消时返回空数组；对话框本身异常时向上抛出，由调用方决定提示方式。
 */
export function pickDocuments(options: PickDocumentsOptions): string[] {
    const dialog = Application.FileDialog(msoFileDialogFilePicker);
    dialog.Title = options.title;
    dialog.Filters.Clear();

    for (const filter of options.filters ?? DOCUMENT_FILTERS) {
        dialog.Filters.Add(filter.description, filter.extensions);
    }

    dialog.FilterIndex = 1;
    dialog.AllowMultiSelect = options.multi ?? true;

    const remembered = options.storageKey ? sessionStorage.getItem(options.storageKey) : null;
    if (remembered) dialog.InitialFileName = remembered;

    if (dialog.Show() !== -1) return [];

    const paths: string[] = [];
    for (let i = 1; i <= dialog.SelectedItems.Count; i++) {
        paths.push(dialog.SelectedItems.Item(i));
    }

    if (options.storageKey && paths.length > 0) {
        sessionStorage.setItem(options.storageKey, dirOf(paths[0]));
    }

    return paths;
}

export interface PickDirectoryOptions {
    title?: string;
    /** 记住上次目录的 sessionStorage 键 */
    storageKey?: string;
    /** 没有历史目录时的初始路径 */
    initialPath?: string;
    /** 是否优先使用历史目录，默认 true */
    preferRemembered?: boolean;
}

/**
 * 弹出目录选择框，返回选中目录。
 *
 * 用户取消时返回 null；对话框本身异常时向上抛出。
 */
export function pickDirectory(options: PickDirectoryOptions = {}): string | null {
    const dialog = Application.FileDialog(msoFileDialogFolderPicker);
    dialog.Title = options.title ?? "请选择文件夹";

    const remembered =
        options.preferRemembered !== false && options.storageKey
            ? sessionStorage.getItem(options.storageKey)
            : null;
    const initialPath = remembered || options.initialPath;
    if (initialPath) dialog.InitialFileName = initialPath;

    if (dialog.Show() !== -1) return null;

    const dir = dialog.SelectedItems.Item(1) as string | undefined;
    if (dir && options.storageKey) sessionStorage.setItem(options.storageKey, dir);
    return dir || null;
}

/**
 * 选择文件夹，默认定位到当前文档所在目录。
 *
 * 显式传入 `initPath` 时优先使用它，否则复用上次选择过的目录。
 */
export function showFolderPicker(
    title: string = "请选择文件夹",
    initPath: string = "",
): string | null {
    const doc = ActiveDocument;
    const initialPath = (doc ? doc.Path : "C:\\") + "\\";

    return pickDirectory({
        title,
        storageKey: "LastSelectedFolder",
        initialPath: initPath || initialPath,
        // 与原实现保持一致：显式传入 initPath 时优先使用它
        preferRemembered: !initPath,
    });
}
