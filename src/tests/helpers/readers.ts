import type { SnapshotReader } from "@/core/attributes";
import type { ParaAttrValues } from "@/core/types";

/**
 * 从简化的 attribute 表构造 SnapshotReader。
 *
 * @example
 * const reader = makeReader([
 *     { index: 1, attrs: { style: "公文标题" } },
 *     { index: 3, attrs: { style: "公文正文", firstLineIndent: 0 } },
 * ]);
 */
export function makeReader(
    entries: Array<{
        index: number;
        attrs: Partial<Record<keyof ParaAttrValues, unknown>>;
    }>,
): SnapshotReader {
    const m = new Map(entries.map((e) => [e.index, e.attrs]));
    return {
        read(idx1, key) {
            const attrs = m.get(idx1);
            return attrs ? attrs[key] : undefined;
        },
    };
}
