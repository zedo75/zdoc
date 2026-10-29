import { useLocalStorage } from "@vueuse/core";

const serializer = {
    read: (v: string) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 400 ? n : 1000;
    },
    write: (v: number) => String(v),
};

const keyWidth = "zdoc:dialog-text-compare:width";
const keyHeight = "zdoc:dialog-text-compare:height";

/** 文本对比对话框尺寸（模块级单例，跨组件共享） */
const width = useLocalStorage(keyWidth, 1000, {
    serializer,
});

const height = useLocalStorage(keyHeight, 600, {
    serializer,
});

export function useDialogTextCompareSize() {
    return { width, height };
}
