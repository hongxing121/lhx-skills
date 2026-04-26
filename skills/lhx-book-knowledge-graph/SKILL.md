---
name: lhx-book-knowledge-graph
description: 为一本好书创建一座可漫游的中文知识图谱网站。当用户提到要为某本书做"知识图谱"、"知识库"、"读书笔记网站"，或者说"把这本书做成知识图谱"、"把书整理成一个可以漫游的站点"时，必须使用此 Skill。Skill 提供从 PDF 文本提取、章节拆分、概念/案例/人物卡片抽取、一直到静态网站部署上线的完整工作流。复用 lhx-knowledge-graph 的建站引擎（build_site.py）和部署基建，但工作流、卡片类型和组织逻辑针对书籍场景重新设计。
---

# 书籍知识图谱构建 Skill

> 这个 Skill 把"为一本好书建知识图谱网站"的全流程沉淀下来，让每次做新书时不必重新摸索。与 `lhx-knowledge-graph`（名人知识图谱）是兄弟 Skill，共享建站引擎和部署基建，但工作流和内容结构针对书籍场景重新设计。

## 这个 Skill 能做什么

帮你用 **2-3 小时** 的时间，为任何一本有电子版的书籍，从零搭出一座包含 40-80 个节点的中文知识图谱网站，结构包括：

- **章节原文/摘要**：按章节拆分的全书内容，保留作者原有的论证结构
- **核心概念**：15-30 张概念卡片，提炼书中的关键理论、制度、机制
- **典型案例**：8-15 张案例卡片，书中引用的真实案例和数据
- **关键人物**：5-10 张人物卡片，书中提到的重要人物
- **索引页 + 首页 + 反向链接面板**

最终输出：一个可部署到子域名的静态网站（复用 lhx-knowledge-graph 的视觉风格）。

## 与名人知识图谱的关键差异

| 维度 | 名人知识图谱 (lhx-knowledge-graph) | 书籍知识图谱 (本 Skill) |
|------|-------------------------------|-------------------|
| 素材来源 | 多源拼接（股东信、访谈、财报） | 单一完整文本，按章节拆分 |
| 收集阶段 | 最耗时，需爬取多个网站 | 不需要，用户提供电子版 |
| 翻译阶段 | 英→中，核心工作量 | 不需要，中文书直接用 |
| 卡片类型 | 概念/产品公司/人物/方法 | 概念/案例/人物 |
| 组织逻辑 | 按人物时间线 | 按书的章节结构和论证逻辑 |
| 核心价值 | "这个人怎么想" | "这本书的知识结构是什么" |
| 总耗时 | 半天到一晚上 | 2-3 小时 |

## 触发示例

下面这些用户表达都应该触发这个 Skill：

- "帮我把《置身事内》做成知识图谱"
- "我想为这本书建一个知识库网站"
- "把这本书整理成可以漫游的形式"
- "用知识图谱的方式整理这本书"
- "做一个读书笔记网站"

不应触发：
- 用户想为某个**人物**建知识图谱 → 用 `lhx-knowledge-graph`
- 用户只是想"读" / "总结" / "写书评" → 直接回答
- 用户想做 PPT 或思维导图 → 用其他工具

---

## 全流程概览

整个项目分 **7 个阶段**。比名人版砍掉了素材收集和翻译两个最重的阶段。

| 阶段 | 关键动作 | 大致耗时 |
|------|----------|---------|
| 0. 立项与决策 | 确认书名、章节结构、子域名、视觉标识 | 5 分钟 |
| 1. Vault 建立 | 创建独立 Obsidian vault，建立子目录 | 1 分钟 |
| 2. 文本提取 + 章节拆分 | PDF → 文本 → 按章节拆成 markdown 文件 | 15-30 分钟 |
| 3. 知识抽取 | 并行 Agent 建立概念/案例/人物卡片 | 60-90 分钟 |
| 4. 索引页 + 首页 | 直接写 markdown | 10 分钟 |
| 5. 网站构建 | 复制并改造 build_site.py 模板 | 10 分钟 |
| 6. 部署上线 | 服务器目录 + Caddy + DNS + 证书 | 10 分钟 |

**总计：约 2-3 小时**。

---

## 阶段 0：立项与决策（必做）

### 6 件必须确认的事

1. **书名** —— 中文名 + 英文名（如有）+ 作者
2. **电子版路径** —— 用户提供的 PDF/epub 文件路径
3. **章节结构** —— 从目录页提取完整的章节结构（章 → 节），确认总章节数
4. **卡片类型配置** ——

   | 卡片类型 | 默认 | 说明 |
   |---------|------|------|
   | 概念 (concepts/) | 必开 | 书中的核心理论、制度、机制 |
   | 案例 (cases/) | 必开 | 书中的真实案例、数据故事 |
   | 人物 (people/) | 默认开 | 书中提到的关键人物 |

5. **子域名** —— 一般是 `<书名拼音或英文缩写>.feima.ai`
6. **视觉标识** —— 一个中文字或英文字母作为 Logo

### 立项检查清单

```
即将启动《书名》知识图谱项目：

- 书名：《中文名》 / English Name
- 作者：xxx
- 章节数：X 章 Y 节
- 电子版：[路径]
- 卡片类型：概念 + 案例 + 人物
- 子域名：xxx.feima.ai
- Logo：X

确认后我会先创建 Obsidian vault 并开始文本提取。
DNS 那边也请配一条 A 记录指向服务器 IP。
```

---

## 阶段 1：建立 Obsidian Vault

与名人版完全一致。vault 必须是**独立**的。

### 标准目录结构

```
~/Documents/Obsidian Vault/<书名>/
└── <书名>/                      ← 独立 Obsidian vault
    ├── .obsidian/               ← vault 标识
    ├── chapters/                ← 按章节拆分的原文
    ├── concepts/                ← 概念卡片
    ├── cases/                   ← 案例卡片
    ├── people/                  ← 人物卡片
    ├── index-pages/             ← 索引页
    └── 欢迎.md                  ← 首页
```

### 命令

```bash
VAULT=~/Documents/Obsidian\ Vault/<书名>/<书名>
mkdir -p "$VAULT/.obsidian"
mkdir -p "$VAULT/chapters" "$VAULT/concepts" "$VAULT/cases" "$VAULT/people" "$VAULT/index-pages"
```

---

## 阶段 2：文本提取 + 章节拆分

详见 [`references/text-extraction-guidelines.md`](references/text-extraction-guidelines.md)。

这是书籍版独有的阶段，替代名人版的"素材收集 + 翻译"。

### 步骤

1. **PDF 文本提取** —— 用 Read 工具直接读取 PDF（每次最多 20 页），或用 `pdf-ocr-skill` 处理扫描版
2. **按章节拆分** —— 根据阶段 0 确认的目录结构，将全书拆成独立的 markdown 文件
3. **wikilinks 标注** —— 在拆分过程中识别关键概念、人物、案例，用 `[[双括号]]` 标注
4. **frontmatter** —— 每个章节文件加 YAML frontmatter

### 章节文件命名规范

```
chapters/
├── 00 前言 从了解现状开始.md
├── 01-01 地方政府的权力与事务 - 政府治理的特点.md
├── 01-02 地方政府的权力与事务 - 外部性与规模经济.md
├── ...
├── 08-03 总结 - 发展目标与发展过程.md
└── 09 结束语.md
```

命名格式：`<章序号>-<节序号> <章标题> - <节标题>.md`

### 章节文件结构

```markdown
---
title: "章标题 - 节标题"
type: 章节
chapter: X
section: Y
tags: [章节, 第X章]
---

# 章标题 - 节标题

（章节原文内容，关键概念用 [[双括号]] 标注）
```

### wikilinks 词表

在开始拆分之前，**必须**先根据目录和前言建立一个 30-50 个候选概念词表。这个词表给后续所有处理 Agent 使用，避免命名漂移。

示例（《置身事内》）：
```
分税制, 土地财政, 城投公司, 地方政府债务, 招商引资,
激励相容, 外部性, 规模经济, 信息不对称, 条块分割,
京东方, 光伏产业, 产业引导基金, 房价, 城市化,
户籍制度, 要素市场, 贫富差距, 产能过剩, 国内大循环,
中美贸易冲突, 债务风险, GDP锦标赛, 官员晋升锦标赛, ...
```

### 并行策略

可以启动多个 Agent 并行处理不同章节：

- Agent 1: 前言 + 第一章 + 第二章
- Agent 2: 第三章 + 第四章
- Agent 3: 第五章 + 第六章
- Agent 4: 第七章 + 第八章 + 结束语

**每个 Agent 必须拿到同一份 wikilinks 词表**。

---

## 阶段 3：知识抽取（并行 Agent 建卡片）

启动 3 个并行 Agent：

| Agent | 输入 | 输出 |
|-------|------|------|
| 概念抽取 | chapters/ 下所有章节文件 | 15-30 张概念卡片 → `concepts/` |
| 案例抽取 | 同上 | 8-15 张案例卡片 → `cases/` |
| 人物抽取 | 同上 | 5-10 张人物卡片 → `people/` |

### 卡片结构

详见 [`references/card-templates.md`](references/card-templates.md)。

### 与名人版抽取的关键差异

1. **引用出处指向章节**，不是指向某年的股东信或访谈。格式：`[[01-03 地方政府的权力与事务 - 复杂信息]]`
2. **概念之间的因果关系是核心价值** —— 概念卡片的"相关概念"一节要特别注明因果方向（A 导致 B、A 是 B 的前提条件等）
3. **不存在"立场演变"** —— 书是一个时间点的快照，不像名人有时间跨度。取而代之的是"跨章节追踪"——同一个概念在不同章节的不同切面
4. **案例卡是独有的** —— 名人版没有专门的案例卡，书籍版需要把作者举的每个重要案例单独建卡

### Agent 任务模板

参考 [`references/agent-prompts.md`](references/agent-prompts.md)。

---

## 阶段 4：索引页 + 首页

直接由你（Claude）写。需要写 4-5 个文件：

- `index-pages/章节总览.md` —— 全书章节目录，每章一句话概要
- `index-pages/核心概念索引.md` —— 按主题分组的概念列表
- `index-pages/典型案例索引.md` —— 所有案例卡的列表
- `index-pages/人物索引.md` —— 所有人物卡的列表
- `index-pages/更新日志.md` —— 可选，格式与名人版一致
- `欢迎.md` —— 首页

### 首页内容建议

```markdown
# 欢迎来到《书名》知识图谱

一句话介绍这本书的核心主题。

## 快速导航

- **📖 章节原文** —— 按章节浏览全书内容
- **💡 核心概念** —— X 个关键概念，可以来回漫游
- **📋 典型案例** —— X 个真实案例
- **👤 关键人物** —— X 位重要人物

## 关于本知识图谱

这个知识图谱是为了xxx目的而建立的。每个概念、案例、人物之间通过双向链接互相关联，
你可以从任何一个节点出发，沿着链接漫游整本书的知识结构。

## 关于本书

书名、作者、出版社、出版年份等基本信息。
```

### 更新日志

格式和写作铁律与名人版完全一致，参考 lhx-knowledge-graph 的 SKILL.md。

---

## 阶段 5：构建网站

复制并定制 `lhx-knowledge-graph` 的 [`templates/build_site.py`](../lhx-knowledge-graph/templates/build_site.py)。

### 需要改的配置项

1. `VAULT` 路径 → 指向书籍 vault
2. `OUT` 路径
3. `SITE_TITLE` → 如 "《置身事内》知识图谱"
4. `SITE_LOGO` → 如 "置" 或 "Z"
5. `CATEGORY_DIRS` → `['chapters', 'concepts', 'cases', 'people', 'index-pages']`
6. `CATEGORY_LABELS` → `{'chapters': '章节', 'concepts': '概念', 'cases': '案例', 'people': '人物', 'index-pages': '索引'}`
7. 侧边栏 `order` 列表
8. `build_homepage()` 里的内容
9. `GA_MEASUREMENT_ID`（可选）

### 类型颜色建议

```python
# 书籍知识图谱的类型颜色
type_colors = {
    '章节': '#4A90D9',   # 蓝色 — 原文
    '概念': '#D4A843',   # 金色 — 思想
    '案例': '#5BA55B',   # 绿色 — 实证
    '人物': '#9B6FC3',   # 紫色 — 人物
    '索引': '#888888',   # 灰色
}
```

### Favicon 生成

复用 lhx-knowledge-graph 的脚本：

```bash
python3 ~/.claude/skills/lhx-knowledge-graph/scripts/generate_favicon.py --letter Z --output ~/project/webchat/assets-zhishenshinei
```

### 测试构建

```bash
python3 build_<书名>.py
```

---

## 阶段 6：部署上线

与名人版完全一致。详见 lhx-knowledge-graph 的 [`references/deployment-checklist.md`](../lhx-knowledge-graph/references/deployment-checklist.md)。

### 快速命令

```bash
# 1. 服务器准备
ssh -i ~/aws/lhx_key2.pem ubuntu@<server-ip> "sudo mkdir -p /var/www/<书名> && sudo chown ubuntu:ubuntu /var/www/<书名>"

# 2. 打包上传
cd /Users/hongxing/project/webchat/<书名>-site
find . -name '._*' -delete
tar czf /tmp/<书名>-site.tar.gz --exclude='._*' .
scp -i ~/aws/lhx_key2.pem /tmp/<书名>-site.tar.gz ubuntu@<server-ip>:/tmp/

# 3. 服务器解压部署
ssh -i ~/aws/lhx_key2.pem ubuntu@<server-ip> "
  rm -rf /tmp/<书名>-update && mkdir -p /tmp/<书名>-update
  cd /tmp/<书名>-update && tar xzf /tmp/<书名>-site.tar.gz
  sudo rm -rf /var/www/<书名>/*
  sudo cp -r /tmp/<书名>-update/* /var/www/<书名>/
  sudo find /var/www/<书名>/ -name '._*' -delete
  sudo chown -R www-data:www-data /var/www/<书名>/
"

# 4. Caddy 配置（如果是新站）
# 追加 caddy-block.txt 到 /etc/caddy/Caddyfile
ssh -i ~/aws/lhx_key2.pem ubuntu@<server-ip> "sudo systemctl restart caddy"

# 5. 验证
sleep 12
curl -sI https://<子域名>/ | head -5
```

---

## 避坑指南

### 书籍版独有的坑

#### 坑 1：PDF 文本提取不完整
扫描版 PDF 用 Read 工具会得到图片而非文字。如果 PDF 是影印版/扫描版，必须用 `pdf-ocr-skill` 或 `qianfanocr-document-intelligence` 先做 OCR。

#### 坑 2：章节拆分边界错误
PDF 的页码和章节不一定对齐。**必须先从目录页提取完整的章节结构**，然后逐章确认拆分点。不要猜。

#### 坑 3：wikilinks 命名不一致
并行 Agent 处理不同章节时，可能用不同的词指代同一概念（如"分税制"vs"分税制改革"vs"1994年税改"）。**必须在阶段 2 开始前建立统一词表**，并在每个 Agent 的 prompt 里包含这个词表。

#### 坑 4：概念卡引用了不存在的章节文件
如果章节文件名和 wikilink 引用不一致（比如文件名是 `02-01 财税与政府行为 - 分税制改革.md`，但卡片里写的是 `[[第二章第一节]]`），就会产生死链接。**引用必须用精确文件名**。

#### 坑 5：案例卡过于简略
案例卡不是"一句话概要"——它应该包含作者原文中的关键数据、时间线和论证。读者来知识图谱是为了**回顾细节**，不是看摘要。

### 与名人版共有的坑

参见 lhx-knowledge-graph 的 [`references/pitfalls.md`](../lhx-knowledge-graph/references/pitfalls.md)，特别是：
- macOS dotfiles 跟着 tar 上服务器
- Caddy 证书重试退避
- scp 中文文件名失败
- vault 嵌套问题

---

## 完成后的成果验收清单

- [ ] 子域名可以打开
- [ ] HTTPS 证书有效
- [ ] 首页 hero、stats、nav cards 显示正常
- [ ] 章节页面可正常浏览，原文完整
- [ ] 概念卡片的 wikilinks 能正确跳转到章节和其他卡片
- [ ] 案例卡片包含充分的细节和数据
- [ ] 任意文章页右侧有"链接到本页"反向链接面板
- [ ] 左侧导航各分组能正确折叠展开
- [ ] favicon 正确显示
- [ ] 移动端响应式正常
- [ ] 所有 wikilinks 内部跳转都是 200，没有 404

---

## 文件参考索引

| 文件 | 用途 | 何时读 |
|------|------|--------|
| `references/text-extraction-guidelines.md` | PDF 提取和章节拆分的规范 | 阶段 2 之前 |
| `references/card-templates.md` | 概念/案例/人物卡片的结构模板 | 阶段 3 之前 |
| `references/agent-prompts.md` | 给 Agent 的标准提示词模板 | 每次启动 Agent 前 |
| *共享* `lhx-knowledge-graph/references/deployment-checklist.md` | 部署命令清单 | 阶段 6 之前 |
| *共享* `lhx-knowledge-graph/references/google-analytics.md` | GA4 配置 | 要加流量统计时 |
| *共享* `lhx-knowledge-graph/references/pitfalls.md` | 通用避坑清单 | **每次都读** |
| *共享* `lhx-knowledge-graph/templates/build_site.py` | 网站构建脚本模板 | 阶段 5 |
| *共享* `lhx-knowledge-graph/templates/caddy-block.txt` | Caddy 配置模板 | 阶段 6 |
| *共享* `lhx-knowledge-graph/scripts/generate_favicon.py` | Favicon 生成 | 阶段 5 |

---

## 适用的书籍类型

| 书籍类型 | 适用度 | 备注 |
|---------|--------|------|
| 社科/经济类（如《置身事内》） | ⭐⭐⭐⭐⭐ | 概念密集，案例丰富，最适合 |
| 商业/管理类（如《从优秀到卓越》） | ⭐⭐⭐⭐⭐ | 框架清晰，案例多 |
| 历史类（如《枪炮、病菌与钢铁》） | ⭐⭐⭐⭐ | 因果链长，人物多 |
| 科普类（如《思考，快与慢》） | ⭐⭐⭐⭐ | 概念多，实验案例丰富 |
| 哲学/思想类 | ⭐⭐⭐ | 概念抽象，案例少，需要更多背景补充 |
| 文学/小说 | ⭐⭐ | 不太适合，可能需要完全不同的卡片类型 |
| 工具书/教材 | ⭐⭐ | 已经有良好的索引结构，知识图谱附加值低 |
