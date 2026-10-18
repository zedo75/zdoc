# zdoc Wiki

> 本文件是 Wiki 索引页，指向项目核心文档。

## 项目文档

| 文档                                 | 面向                  | 内容                                 |
| ------------------------------------ | --------------------- | ------------------------------------ |
| [README.md](./README.md)             | 第一次来的所有人      | 定位、差异化对比、功能速览、快速开始 |
| [FEATURES.md](./FEATURES.md)         | 已决定要用的用户      | 每个功能的操作方式、边界行为、默认值 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 贡献者 / 想 fork 的人 | 三层架构、属性注册表、扩展指南、FAQ  |

## 快捷入口

**我用 WPS，想看看能干什么**
→ [README · 功能速览](./README.md#功能速览)
→ [FEATURES · 完整手册](./FEATURES.md)

**我想知道它和其他公文助手的区别**
→ [README · 为什么不是又一个公文助手](./README.md#为什么不是又一个公文助手)

**我想改代码 / 加功能**
→ [ARCHITECTURE · 扩展指南](./ARCHITECTURE.md#7-扩展指南)

**遇到问题**
→ [ARCHITECTURE · FAQ](./ARCHITECTURE.md#9-faq)
→ [GitHub Issues](https://github.com/zedo75/zdoc/issues/)

## 版本记录

见 [Releases](https://github.com/zedo75/zdoc/releases/)。

## 贡献指南

欢迎提交 Issue 和 Pull Request。提交 PR 前请确保：

1. `pnpm test` 全部通过
2. `pnpm build` 无错误
3. 涉及排版逻辑的改动附带单测
