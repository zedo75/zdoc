import type {
    PunctuationRule,
    PunctuationRuleGroup,
} from "@/features/punctuation/commands/punctuation";

import { PUNCTUATION_RULES } from "@/features/punctuation/commands/punctuation";

export interface RuleGroup {
    name: PunctuationRuleGroup;
    rules: PunctuationRule[];
}

export function usePunctuationSelection() {
    /** 已勾选的规则 id */
    const checked = ref<string[]>(
        PUNCTUATION_RULES.filter((r) => r.defaultEnabled).map((r) => r.id),
    );

    /** 已交换 find/replace 的规则 id */
    const swapped = ref<string[]>([]);

    /** 按 group 分组（保持 PUNCTUATION_RULES 中的顺序） */
    const groupedRules = computed<RuleGroup[]>(() => {
        const map = new Map<PunctuationRuleGroup, PunctuationRule[]>();
        for (const rule of PUNCTUATION_RULES) {
            const arr = map.get(rule.group) ?? [];
            arr.push(rule);
            map.set(rule.group, arr);
        }
        return Array.from(map, ([name, rules]) => ({ name, rules }));
    });

    /* ---------- 勾选 ---------- */
    const countInGroup = (g: RuleGroup) =>
        g.rules.filter((r) => checked.value.includes(r.id)).length;
    const isGroupAllChecked = (g: RuleGroup) => countInGroup(g) === g.rules.length;
    const isGroupIndeterminate = (g: RuleGroup) => {
        const n = countInGroup(g);
        return n > 0 && n < g.rules.length;
    };

    function toggleRule(id: string, on: boolean) {
        if (on) {
            if (!checked.value.includes(id)) checked.value = [...checked.value, id];
        } else {
            checked.value = checked.value.filter((x) => x !== id);
        }
    }

    function toggleGroup(group: RuleGroup, on: boolean) {
        const ids = group.rules.map((r) => r.id);
        if (on) {
            checked.value = Array.from(new Set([...checked.value, ...ids]));
        } else {
            checked.value = checked.value.filter((id) => !ids.includes(id));
        }
    }

    const selectAll = () => (checked.value = PUNCTUATION_RULES.map((r) => r.id));
    const selectNone = () => (checked.value = []);
    const selectDefault = () =>
        (checked.value = PUNCTUATION_RULES.filter((r) => r.defaultEnabled).map((r) => r.id));

    /* ---------- 交换 ---------- */
    const isSwapped = (id: string) => swapped.value.includes(id);
    function toggleSwap(id: string) {
        if (isSwapped(id)) swapped.value = swapped.value.filter((x) => x !== id);
        else swapped.value = [...swapped.value, id];
    }
    const clearSwapped = () => (swapped.value = []);

    return {
        checked,
        swapped,
        groupedRules,
        countInGroup,
        isGroupAllChecked,
        isGroupIndeterminate,
        toggleRule,
        toggleGroup,
        selectAll,
        selectNone,
        selectDefault,
        isSwapped,
        toggleSwap,
        clearSwapped,
    };
}
