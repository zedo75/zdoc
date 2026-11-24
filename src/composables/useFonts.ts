import { computed, onMounted, ref } from "vue";

import { getBrowserFonts, getWpsFonts } from "@/utils/fonts";

const DEFAULT_CHINESE_FONTS = ["宋体", "仿宋", "黑体", "楷体"];
const DEFAULT_WESTERN_FONTS = ["Times New Roman", "Nimbus Roman"];

interface FontLists {
    chinese: string[];
    western: string[];
}

// 模块级状态：整个应用只探测/读取一次字体，所有组件实例共享结果
// （否则每个 FontPicker 都会在 onMounted 里各走一遍 getWpsFonts）
let cachedFontLists: FontLists | null = null;
let inflightFontLists: Promise<FontLists> | null = null;

async function loadFontLists(): Promise<FontLists> {
    if (cachedFontLists) return cachedFontLists;
    if (inflightFontLists) return inflightFontLists;

    const task = (async (): Promise<FontLists> => {
        const [wpsChinese, wpsWestern] = getWpsFonts();
        if (wpsChinese.length) {
            return { chinese: wpsChinese, western: wpsWestern };
        }
        const [browserChinese, browserWestern] = await getBrowserFonts();
        return { chinese: browserChinese, western: browserWestern };
    })();

    // 成功才写入缓存；失败时让各调用方自己回退默认字体，避免把异常结果永久缓存
    inflightFontLists = task
        .then((lists) => {
            cachedFontLists = lists;
            return lists;
        })
        .finally(() => {
            inflightFontLists = null;
        });

    return inflightFontLists;
}

export function useFonts(options: { loadWestern?: boolean } = {}) {
    const chineseFonts = ref<string[]>([]);
    const westernFonts = ref<string[]>([]);
    const isLoading = ref(true);

    const chineseFontOptions = computed(() =>
        chineseFonts.value.map((font) => ({ label: font, value: font })),
    );

    const westernFontOptions = computed(() =>
        westernFonts.value.map((font) => ({ label: font, value: font })),
    );

    async function loadFonts() {
        isLoading.value = true;
        try {
            const lists = await loadFontLists();
            // slice() 隔离：各组件实例拿到自己的数组，避免互相影响
            chineseFonts.value = lists.chinese.slice();
            if (options.loadWestern) {
                westernFonts.value = lists.western.slice();
            }
        } catch {
            chineseFonts.value = DEFAULT_CHINESE_FONTS;
            if (options.loadWestern) {
                westernFonts.value = DEFAULT_WESTERN_FONTS;
            }
        } finally {
            isLoading.value = false;
        }
    }

    onMounted(loadFonts);

    return {
        chineseFonts,
        westernFonts,
        chineseFontOptions,
        westernFontOptions,
        isLoading,
        loadFonts,
    };
}
