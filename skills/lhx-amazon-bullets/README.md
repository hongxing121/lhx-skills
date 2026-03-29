# lhx-amazon-bullets

亚马逊美国站产品**五点描述**自动优化工具，基于 [Karpathy Loop](https://karpathy.medium.com/software-2-0-a64152b37c35) 迭代打磨。

输入 ASIN，自动抓取当前五点描述 → 评分 → 改进 → 保留或回滚，循环 N 轮，输出最优版本。

> **推荐先运行 [`lhx-amazon-title`](../lhx-amazon-title) 优化标题**，再把最优标题通过 `--title` 传入，确保五点描述覆盖标题未用过的长尾关键词。

## 用法

在 Claude Code 中输入：

```
/lhx-amazon-bullets --asin B0XXXXXX
/lhx-amazon-bullets --asin B0XXXXXX --title "已优化的标题"
/lhx-amazon-bullets --asin B0XXXXXX --title "已优化的标题" --comp B0AAAAAA B0BBBBBB
/lhx-amazon-bullets --asin B0XXXXXX --iterations 12
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--asin` | ✅ | 你的产品 ASIN |
| `--title` | 强烈推荐 | 已优化的标题，用于关键词去重；未提供则从 Amazon 抓取当前标题 |
| `--comp` | 可选 | 1~3 个竞品 ASIN，空格分隔 |
| `--iterations` | 可选 | 迭代轮数，默认 8 |

## 评分维度（满分 100）

| 维度 | 分值 | 说明 |
|------|------|------|
| compliance | 0-20 | 合规：无 Emoji、无禁用声明（eco-friendly / satisfaction guaranteed 等）、每条 ≤255 字符 |
| benefit_bridge | 0-20 | 利益转化：每条通过「那又怎样？」测试，从功能推导出用户真正得到的好处 |
| keyword_strategy | 0-20 | 关键词策略：覆盖长尾词与不同使用场景，不重复标题已有关键词 |
| pain_coverage | 0-20 | 痛点覆盖：排序合理（UVP → 优势 → 规格 → 信任），主动回应买家常见顾虑 |
| conversion_power | 0-20 | 转化力：买家模拟——读完这 5 条，你会下单吗？与竞品相比更有说服力吗？ |

## 工作原理

```
抓取 Amazon 页面 → 初始评分（Haiku）
        ↓
    找出最弱维度
        ↓
  针对性改进一条（Sonnet）
        ↓
  重新评分（Haiku）
        ↓
  比原版好？→ ✅ 保留  |  ❌ 回滚 + 记录失败思路
        ↓
   重复 N 轮
        ↓
  输出最优五点 + 迭代报告
```

每轮只改动**一条**最需改进的描述，其余保持不变，确保优化方向可追溯。

- **评分模型**：`claude-haiku-4-5-20251001`（快且省）
- **改进模型**：`claude-sonnet-4-6`（质量优先）

## 输出文件

运行完成后自动保存至产品 JSON 同目录：

| 文件 | 内容 |
|------|------|
| `{ASIN}-bullets-optimized.txt` | 最优五点描述（编号文本） |
| `{ASIN}-bullets-report.md` | 完整迭代报告，含每轮得分、改动说明与原始/最优对比 |

## 推荐工作流

```
/lhx-amazon-title --asin B0XXXXXX          ← 第一步：优化标题
        ↓
/lhx-amazon-bullets --asin B0XXXXXX \
  --title "上一步输出的最优标题"              ← 第二步：优化五点，关键词互补
```

## 依赖

- [Claude Code](https://claude.ai/code)（内置 `claude -p` CLI）
- [Bun](https://bun.sh)（`npx -y bun` 自动安装，无需手动配置）
