/**
 * 将厘米转换为磅（WPS 默认单位）
 * @param cm 厘米数
 * @returns 磅数
 */
export function cmToPoints(cm: number): number {
    return cm * (72 / 2.54);
}
