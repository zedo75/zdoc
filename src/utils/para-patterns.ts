/**
 * @file 公文排版相关正则表达式与常量
 *
 * 集中所有 regex 与配置型常量，便于统一调整；
 * 不包含任何逻辑、类型或副作用。
 */

// ==================== 标题与结构 ====================

// 注意：同段内有多个需要匹配的才加 g 标志
export const SALUTATION_REGEX = /^[^《》〔〕：]*：\r$/; // 抬头；发文事由可能包含转发上级的文件（书名号、六角括号）
export const H1_REGEX = /^[一二三四五六七八九十]+、.*?(?:。|[^；;]\r)/; // 以分号结尾视为列表而不是层级标题
export const H2_REGEX = /^（[一二三四五六七八九十]+）.*?(?:。|[^；;]\r)/;
/**
 * 匹配三级标题正则表达式
 * - `(?!.*：)` 为先行断言，见以下链接
 * - `23` 为一行能容纳的字数：28 - 2（首缩）- 2（"00." 占宽）- 1（考虑标点压缩）
 * - 一二级标题暂不考虑限制 23 字，因为有的材料中会超过一行
 * @see https://mdn.org.cn/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Lookahead_assertion
 */
export const H3_REGEX = /^(?!.*(?:：|\u2005))[0-9]{1,2}\..{1,23}?(?:。|[^；;]\r)/;
export const TOPIC_REGEX = /(?<=^|[。？！])[一二三四五六七八九十][是要].*?。/g; // 小标题
export const TOPIC_PREFIX_REGEX = /^[一二三四五六七八九十][是要]/;

// 标题中禁止出现的符号
export const FORBIDDEN_SYMBOLS_REGEX = /[。；！？【】〖〗_=|{}<>#&~$^*※\[\]\\]/;
export const ATTACHMENT_WILDCARDS = "^m附件[0-9]{1,}^p"; // 附件通配符
export const ATTACHMENT_LIST_REGEX = /[ \u3000]*附件[：:]\s*([\s\S]+?)(?=[\r\n]{2}|\f|$)/g;
export const ATTACHMENT_LIST_WILDCARDS = "附件[:：]*^p^p";

// ==================== 抬头相关 ====================

export const SALUTATION_EXCLUDE_REGEX = /贯彻|落实|关于|根据|如下|以下|下列|包括|。/; // 抬头黑名单
export const SALUTATION_ORG_DEPT_REGEX =
    /省|自治区|市|县|乡|镇|村|社区|委.*?(?:部|办)|局|工会|妇联|企业|党组织|大学/; // 抬头白名单
export const SALUTATION_EACH_UNIT_REGEX = /各.*?(?:单位|部门)/;
export const SALUTATION_GREETING_REGEX = /尊敬的|敬爱的|亲爱的|同志们/; // 敬语、称呼
export const SALUTATION_JOB_TITLE_REGEX = /副?书记|副?主任|副?参谋长|副?政委/; // 职务名称

// ==================== 落款 ====================

export const SIGNATURE_DATE_REGEX = /^\s*[0-9X]{4}年[0-9 X]{1,2}月[0-9 X]{1,2}日\s*\r?$/;
