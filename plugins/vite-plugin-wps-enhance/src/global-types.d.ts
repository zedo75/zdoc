/// <reference types="wps-jsapi-declare" />

export {};

declare global {
    interface WpsNewEnum {}

    /*
     * Wps 命名空间扩展
     */
    namespace Wps {
        interface Application {
            /**
             * 启用/禁用 WPS 事件。
             *
             * 类型修正：wps-jsapi-declare 未声明此属性，但实际 COM 接口支持。
             */
            EnableEvents: boolean;

            alert(text: string, showWpsCustomDialog?: boolean | 0 | 1): void;

            /**
             * 弹出确认对话框。
             * @see https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/addin-api/Application/member/confirm
             *
             * 实则还有第二个参数，文档不全
             */
            confirm(text: string, showWpsCustomDialog?: boolean | 0 | 1): 1 | 0;

            /**
             * 包含 WPS 各种枚举常量。
             * 使用方法：`wps.Enum.wdFieldPage`
             *
             * 由于从扩展后的 WpsNewEnum 扁平化的类型实在太多（6120+），实测已经严重影响性能，
             * 类型提示非常慢，故此处不做展开，也不推荐这样使用，建议直接使用裸名枚举
             */
            Enum: Record<string, number>;

            /**
             * 包含 WPS 各种枚举常量的根对象。
             * 使用方法：`wps.NewEnum.WdFieldType.wdFieldPage`
             */
            NewEnum: WpsNewEnum;
        }
    }

    /**
     * 补充 WPS 原生样式弹窗类型
     */
    function alert(text: string, showWpsCustomDialog?: boolean | 0 | 1): void;

    /**
     * index.d.ts 中由定义，此处允许参数填入 0 | 1
     */
    function confirm(text: string, showWpsCustomDialog?: boolean | 0 | 1): 1 | 0;

    /**
     * 将 RGB 颜色转换为 WPS JSA 可识别的颜色值
     * @param {number} r - 红色通道 (0-255)
     * @param {number} g - 绿色通道 (0-255)
     * @param {number} b - 蓝色通道 (0-255)
     * @returns {number} WPS JSA 颜色整数
     */
    function RGB(r: number, g: number, b: number): number;

    /**
     * WPS 原生样式弹窗
     */
    const wpsAlert: typeof Application.alert;

    /**
     * WPS 原生样式弹窗
     */
    const wpsConfirm: typeof Application.confirm;

    /**
     * ActiveDocument 裸名引用（等同于 `Application.ActiveDocument`）。
     */
    const ActiveDocument: Wps.Document;

    /**
     * 等同于 `Application.Selection`
     *
     * 折中方案，类型提示无法覆盖原生 Selection
     */
    const wpsSelection: Wps.Selection;
}
