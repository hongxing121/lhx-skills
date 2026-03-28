---
name: lhx-amazon-title
description: >
  Auto Research for Amazon US product title optimization. Fetches listing data from ASIN, then iteratively improves the title using Karpathy loop with dual scoring: technical compliance (40pts) + buyer simulation (60pts).
  Use when user wants to: "optimize amazon title", "improve my title", "run title autoresearch", "/lhx-amazon-title", or provides ASIN for title optimization.
---

# Amazon 标题 AutoResearch

通过 Karpathy Loop 自动优化亚马逊美国站产品标题。输入 ASIN 即可自动抓取 Listing 数据，然后迭代优化。

## 用法

```
/lhx-amazon-title --asin B0XXXXXX [--comp B0AAAAAA B0BBBBBB] [--iterations 8]
```

## 评分维度（共 100 分）

| 维度 | 分值 | 说明 |
|------|------|------|
| compliance | 0-20 | 技术合规：字符数、格式、无禁用词 |
| mobile_hook | 0-20 | 移动端钩子：前 80 字符质量 |
| keyword_quality | 0-20 | 关键词：精准度、覆盖度、自然度 |
| clarity | 0-20 | 清晰度：3 秒内理解产品 |
| click_intent | 0-20 | 买家模拟：看到标题想点击吗？ |

## 工作流程

### Step 1：解析参数

从用户输入提取：
- `--asin`（必填）：用户自己的 ASIN
- `--comp`（可选）：1~3 个竞品 ASIN，空格分隔
- `--iterations`（可选）：迭代次数，默认 8

如果用户只给了 ASIN 没有参数前缀，直接识别为 `--asin`。

### Step 2：抓取 Amazon 页面数据

**抓取用户 ASIN：**

用 WebFetch 抓取 `https://www.amazon.com/dp/{ASIN}`，提取：
- 当前产品标题（完整文本）
- 五点描述（全部 bullet points）
- 品牌名
- 产品品类（面包屑导航中的品类）

WebFetch prompt 示例：
```
From this Amazon product page, extract: (1) the exact product title text, (2) all bullet points from the "About this item" section, (3) the brand name, (4) the product category from breadcrumbs. Return as JSON with keys: title, bullets (array), brand, category.
```

**抓取竞品 ASIN（如有）：**

对每个竞品 ASIN，用 WebFetch 抓取其页面，只需提取标题即可。

**如果抓取失败：**
告知用户页面无法访问，请用户直接提供：
- 自己产品的标题和五点描述
- 竞品标题（可选）

### Step 3：创建产品信息 JSON 文件

将抓取到的数据写入 `/tmp/amazon_title_{ASIN}.json`：

```json
{
  "asin": "B0XXXXXX",
  "title": "从 Amazon 抓取的当前标题",
  "brand": "品牌名",
  "category": "产品品类",
  "bullets": ["第1条", "第2条", "第3条", "第4条", "第5条"],
  "competitors": [
    {"asin": "B0AAAAAA", "title": "竞品1标题"},
    {"asin": "B0BBBBBB", "title": "竞品2标题"}
  ]
}
```

### Step 4：运行优化脚本

```bash
SKILL_DIR="$HOME/.claude/skills/lhx-amazon-title"
npx -y bun ${SKILL_DIR}/scripts/main.ts /tmp/amazon_title_{ASIN}.json --iterations {N}
```

实时流式输出给用户。

### Step 5：展示结果

脚本完成后：
1. 展示初始分数 → 最终分数的提升
2. 高亮显示最优标题
3. 简要说明主要改进方向
4. 询问用户是否要接着运行 `/lhx-amazon-bullets` 优化五点描述
