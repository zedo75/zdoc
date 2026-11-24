export interface CustomRule {
    id: string;
    find: string;
    replace: string;
    useWildcards: boolean;
    enabled: boolean;
}

export function useCustomRules() {
    const list = ref<CustomRule[]>([]);
    let seq = 0;

    /** 启用的、有查找内容的规则（用于执行 / 计数 / 按钮 disabled） */
    const activeRules = computed(() => list.value.filter((r) => r.enabled && r.find));
    const activeCount = computed(() => activeRules.value.length);

    function add() {
        list.value.push({
            id: `custom-${++seq}`,
            find: "",
            replace: "",
            useWildcards: false,
            enabled: true,
        });
    }

    function remove(id: string) {
        list.value = list.value.filter((r) => r.id !== id);
    }

    /** 直接交换两框的值（直观、无状态） */
    function swap(rule: CustomRule) {
        const t = rule.find;
        rule.find = rule.replace;
        rule.replace = t;
    }

    return { list, activeRules, activeCount, add, remove, swap };
}
