# lhx-amazon-title

亚马逊美国站产品**标题**自动优化工具，基于 [Karpathy Loop](https://karpathy.medium.com/software-2-0-a64152b37c35) 迭代打磨。

输入 ASIN，自动抓取当前 Listing → 评分 → 改进 → 保留或回滚，循环 N 轮，输出最优标题。

## 用法

在 Claude Code 中输入：

```
/lhx-amazon-title --asin B0XXXXXX
/lhx-amazon-title --asin B0XXXXXX --comp B0AAAAAA B0BBBBBB
/lhx-amazon-title --asin B0XXXXXX --iterations 12
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--asin` | ✅ | 你的产品 ASIN |
| `--comp` | 可选 | 1~3 个竞品 ASIN，空格分隔 |
| `--iterations` | 可选 | 迭代轮数，默认 8 |

## 评分维度（满分 100）

| 维度 | 分值 | 说明 |
|------|------|------|
| compliance | 0-20 | 技术合规：字符数 ≤200、格式、无禁用词（Best Seller / #1 / 感叹号等） |
| mobile_hook | 0-20 | 移动端钩子：前 80 字符含品牌名 + 核心词 + 差异化卖点 |
| keyword_quality | 0-20 | 关键词：精准描述品类、覆盖使用场景、自然不堆砌 |
| clarity | 0-20 | 清晰度：买家 3 秒内看懂这是什么产品 |
| click_intent | 0-20 | 买家模拟：在手机搜索结果里，这个标题让你想点击吗？ |

## 工作原理

```
抓取 Amazon 页面 → 初始评分（Haiku）
        ↓
    找出最弱维度
        ↓
  针对性改进（Sonnet）
        ↓
  重新评分（Haiku）
        ↓
  比原版好？→ ✅ 保留  |  ❌ 回滚
        ↓
   重复 N 轮
        ↓
  输出最优标题 + 迭代报告
```

- **评分模型**：`claude-haiku-4-5-20251001`（快且省）
- **改进模型**：`claude-sonnet-4-6`（质量优先）

## 输出文件

运行完成后自动保存至产品 JSON 同目录：

| 文件 | 内容 |
|------|------|
| `{ASIN}-title-optimized.txt` | 最优标题文本 |
| `{ASIN}-title-report.md` | 完整迭代报告，含每轮得分与改动说明 |

## 推荐工作流

先优化标题，再用最优标题作为关键词黑名单优化五点描述：

```
/lhx-amazon-title --asin B0XXXXXX
        ↓
/lhx-amazon-bullets --asin B0XXXXXX --title "最优标题"
```

## 依赖

- [Claude Code](https://claude.ai/code)（内置 `claude -p` CLI）
- [Bun](https://bun.sh)（`npx -y bun` 自动安装，无需手动配置）
