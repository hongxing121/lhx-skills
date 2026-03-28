---
name: lhx-amazon-bullets
description: >
  Auto Research for Amazon US product bullet points (五点描述) optimization. Fetches listing data from ASIN, then iteratively improves all 5 bullet points using Karpathy loop. Uses the optimized title as a keyword blacklist to ensure bullets cover new long-tail keywords.
  Use when user wants to: "optimize amazon bullets", "improve bullet points", "optimize five points", "run bullets autoresearch", "/lhx-amazon-bullets", or provides ASIN for bullet point optimization.
---

# Amazon 五点描述 AutoResearch

通过 Karpathy Loop 自动优化亚马逊美国站产品五点描述。支持直接输入 ASIN，自动抓取当前 Listing 数据后迭代优化。

## 用法

```
/lhx-amazon-bullets --asin B0XXXXXX [--title "已优化的标题"] [--comp B0AAAAAA B0BBBBBB] [--iterations 8]
```

**推荐流程**：先运行 `/lhx-amazon-title` 优化标题，再用 `--title` 参数把最优标题传入本 Skill，确保五点覆盖标题未用过的长尾词。

## 评分维度（共 100 分）

| 维度 | 分值 | 说明 |
|------|------|------|
| compliance | 0-20 | 合规：无 Emoji、无禁用声明、格式正确 |
| benefit_bridge | 0-20 | 利益转化：功能→利益，通过"那又怎样？"测试 |
| keyword_strategy | 0-20 | 关键词策略：覆盖长尾词，不重复标题关键词 |
| pain_coverage | 0-20 | 痛点覆盖：排序合理，主动回应买家顾虑 |
| conversion_power | 0-20 | 转化力：买家模拟，这5条能让我下单吗？ |

## 工作流程

### Step 1：解析参数

从用户输入提取：
- `--asin`（必填）：用户自己的 ASIN
- `--title`（强烈推荐）：已优化的标题（用于关键词去重）；若未提供，从 Amazon 页面抓取当前标题
- `--comp`（可选）：1~3 个竞品 ASIN，空格分隔
- `--iterations`（可选）：迭代次数，默认 8

### Step 2：抓取 Amazon 页面数据

**抓取用户 ASIN：**

用 WebFetch 抓取 `https://www.amazon.com/dp/{ASIN}`，提取：
- 当前五点描述（全部 5 条 bullet points 原文）
- 品牌名
- 产品品类
- 当前标题（如果用户未通过 `--title` 提供）

WebFetch prompt 示例：
```
From this Amazon product page, extract: (1) all bullet points from the "About this item" section (list each one separately), (2) the brand name, (3) the product category from breadcrumbs, (4) the product title. Return as JSON with keys: bullets (array of strings), brand, category, title.
```

**抓取竞品 ASIN（如有）：**

对每个竞品 ASIN，提取其五点描述（用于了解品类内容格局）。

**如果抓取失败：**
告知用户并请求直接提供五点描述文本。

### Step 3：创建产品信息 JSON 文件

将数据写入 `/tmp/amazon_bullets_{ASIN}.json`：

```json
{
  "asin": "B0XXXXXX",
  "optimizedTitle": "用户提供或已优化的标题",
  "bullets": [
    "当前第1条描述",
    "当前第2条描述",
    "...(所有现有条目，数量不限)"
  ],
  "brand": "品牌名",
  "category": "产品品类",
  "competitors": [
    {
      "asin": "B0AAAAAA",
      "bullets": ["竞品1第1条", "竞品1第2条", "竞品1第3条", "竞品1第4条", "竞品1第5条"]
    }
  ]
}
```

### Step 4：运行优化脚本

```bash
SKILL_DIR="$HOME/.claude/skills/lhx-amazon-bullets"
npx -y bun ${SKILL_DIR}/scripts/main.ts /tmp/amazon_bullets_{ASIN}.json --iterations {N}
```

实时流式输出给用户。

### Step 5：展示结果

脚本完成后：
1. 展示初始分数 → 最终分数的提升
2. 并排展示原始五点 vs 优化后五点
3. 说明每条主要改进点
4. 询问用户是否满意或需要针对某条重新优化
