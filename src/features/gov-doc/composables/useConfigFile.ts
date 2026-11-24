import { ElMessage, ElNotification } from "element-plus";

import { useGovDocConfig } from "@/stores/govDocConfig";

export function useConfigFile() {
    const config = useGovDocConfig();

    function save() {
        const result = config.saveToFile();
        if (result.success) {
            ElNotification.success({
                title: "保存成功",
                message: `文件路径：${result.path}`,
                duration: 3000,
            });
        } else {
            ElMessage.error(`保存失败，路径：${result.path}`);
        }
    }

    function load() {
        config.loadFromFile();
        ElMessage.success("已从配置文件重新载入");
    }

    return { save, load };
}
