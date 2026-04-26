---
name: lhx-knowledge-graph
description: 为名人创建一座可漫游的中文知识图谱网站。当用户提到要为某个人物（如巴菲特、芒格、稻盛和夫、马云、贝索斯、乔布斯、马斯克等）做"知识库"、"知识图谱"、"读书笔记网站"、"思想网站"，或者说"把某人的著作/演讲/访谈/股东信整理成一个站点"、"做一个像 buffett-letters-eir 那样的站点"、"为 X 建一个知识图谱"时，必须使用此 Skill。Skill 提供从素材收集、Obsidian vault 构建、概念/产品/人物/方法卡片提取、一直到静态网站部署上线的完整工作流，并附带可复用的 build_site.py 模板、Caddy 配置和避坑清单。即使用户没有明确说"按这个 Skill 来"，只要意图是为某个真实人物建立一座基于一手素材的中文知识图谱网站，就应该触发。
---

# 名人知识图谱构建 Skill

> 这个 Skill 把"为一个名人建知识图谱网站"的全流程沉淀下来，让下一次做同类项目（比如芒格、稻盛和夫、罗永浩、张一鸣……）时不必重新摸索。已经成功落地过 [bezos.feima.ai](https://bezos.feima.ai/)（贝佐斯）和 [musk.feima.ai](https://musk.feima.ai/)（马斯克）两个站点。

## 这个 Skill 能做什么

帮你（或 Claude）用**半天到一晚上**的时间，为任何一位有公开素材的名人，从零搭出一座包含 60-100 个节点的中文知识图谱网站，结构包括：

- **一手素材**：股东信 / 演讲稿 / 长访谈 / 财报会议 / Master Plan / 著作选段……（按人选定）
- **核心思想**：15-25 张概念卡片
- **工作方法**：可选，5-10 张可操作的方法卡片（每张含"你能用上吗？"实操指引）
- **产品/公司**：10-15 张档案
- **关键人物**：6-10 张档案
- **索引页 + 首页 + 反向链接面板**

最终输出：一个可部署到子域名的静态网站（参考 [buffett-letters-eir.pages.dev](https://buffett-letters-eir.pages.dev/) 的视觉风格）。

## 触发示例

下面这些用户表达都应该触发这个 Skill：

- "我想给芒格也做一个像贝佐斯那样的知识库"
- "帮我把稻盛和夫的著作做成一个网站"
- "做一个罗永浩的知识图谱"
- "我想为乔布斯建一座思想城堡"
- "把张一鸣历年的内部讲话整理成一个站点"

不应触发：
- 用户只是想"读" / "总结" / "翻译"某人的内容（这只需要直接回答，不需要建网站）
- 用户想给虚构人物或自己建立 wiki
- 用户已经在某个具体项目里期间，只是想优化一下子模块（比如"改一下首页样式"——这种用文本编辑就够了）

---

## 全流程概览

整个项目分 **8 个阶段**。建议按顺序进行，但收集和翻译可以大量并行。

| 阶段 | 关键动作 | 大致耗时（用 Agent 并行） |
|------|----------|---------------------------|
| 0. 立项与决策 | 选定人物、信源类型、子域名、视觉标识 | 5 分钟（和用户确认） |
| 1. Vault 建立 | 创建独立 Obsidian vault，建立子目录 | 1 分钟 |
| 2. 素材收集 | 并行 Agent 抓取原文 | 15-30 分钟 |
| 3. 中文翻译 + 标注 | 并行 Agent 翻译，识别 wikilinks | 30-60 分钟 |
| 4. 知识抽取 | 并行 Agent 建立概念/产品/人物/方法卡片 | 30-60 分钟 |
| 5. 索引页 + 首页 | 直接写 markdown | 10 分钟 |
| 6. 网站构建 | 复制并改造 build_site.py 模板 | 10 分钟 |
| 7. 部署上线 | 服务器目录 + Caddy + DNS + 证书 | 10 分钟 |

**总计：约半天**（很多时间是 Agent 在后台跑，你可以同时做别的）。

---

## 阶段 0：立项与决策（必做，必须先和用户对齐）

在动手之前，**必须**和用户先确认下面 5 件事：

### 5 件必须确认的事

1. **人物名称** —— 中文名 + 英文名（用于文件名和素材搜索）
2. **信源类型** —— 这个人有什么"标准化的长文本素材"？参考下表：

   | 人物类型 | 适合的信源 |
   |----------|------------|
   | 上市公司 CEO | 股东信、财报电话会议、Annual Letter |
   | 创始人型企业家 | Master Plan、内部讲话、Memo |
   | 思想家/学者 | 著作选段、TED 演讲、长访谈 |
   | 公众人物 | 长访谈（Lex Fridman / Joe Rogan / 圆桌等）、媒体专访 |
   | 投资人 | 致投资人信、年报、备忘录、公开演讲 |

   一个好项目通常需要 **15-25 份原文素材**，可以是单一类型（如贝佐斯的 24 封股东信）也可以是混合类型（如马斯克的 3 Master Plan + 11 访谈 + 8 财报会议）。

3. **是否需要"工作方法"维度** —— 不是所有人物都有清晰的"可操作工作方法"。马斯克有（5 步生产力、冲刺模式等），贝佐斯也有（一类/二类决策），但稻盛和夫的"工作方法"和"哲学"边界模糊，可以合并到 concepts 里。**默认不开**，只在用户明确说"想看他的工作方法"或这个人有特别鲜明的方法论时才开。

4. **子域名** —— 一般是 `<英文名>.feima.ai`，比如 `munger.feima.ai`、`inamori.feima.ai`。提醒用户去 DNS 后台配 A 记录指向公网 IP（参见 `references/deployment-checklist.md`）。

5. **视觉标识** —— 一个英文字母作为 Logo（B/M/J/C 等）。其他视觉用默认的 Notion 暖米色 + 海军蓝侧栏 + 金色强调（来自 buffett-letters-eir 配色），不需要每次重新设计。

### 立项检查清单

把上面 5 项写下来给用户确认，类似：

```
即将启动 [人物名] 知识库项目：

- 人物：[中文名] / [English Name]
- 信源：[X 份股东信 + Y 场访谈 + ...]
- 工作方法维度：[启用 / 不启用]
- 子域名：[xxx.feima.ai]
- Logo 字母：[X]

确认后我会先创建 Obsidian vault 并启动素材收集 Agent。
DNS 那边也请你顺便配一条 A 记录指向 18.191.150.68（如果有别的 IP 请告诉我）。
```

---

## 阶段 1：建立 Obsidian Vault

**核心原则**：vault 必须是**独立**的，不能嵌套在另一个 vault 里。否则 Obsidian 会把它当成子文件夹处理。

### 标准目录结构

```
~/Documents/Obsidian Vault/<中文名>/
└── <中文名>/                    ← 这是独立的 Obsidian vault
    ├── .obsidian/               ← vault 标识，必须存在
    ├── <source-dir-1>/          ← 素材类型 1，比如 letters/, master-plans/
    ├── <source-dir-2>/          ← 可选第二类素材
    ├── <source-dir-3>/          ← 可选第三类素材
    ├── concepts/                ← 概念卡片
    ├── methods/                 ← 可选：工作方法卡片
    ├── companies/               ← 公司或产品档案
    ├── people/                  ← 人物档案
    ├── index-pages/             ← 索引页
    └── 欢迎.md                  ← 首页
```

### 命令

```bash
VAULT=~/Documents/Obsidian\ Vault/<中文名>/<中文名>
mkdir -p "$VAULT/.obsidian"
mkdir -p "$VAULT/<source-dir>" "$VAULT/concepts" "$VAULT/companies" "$VAULT/people" "$VAULT/index-pages"
# 如果开了方法维度，再加 methods/
mkdir -p "$VAULT/methods"
```

外层那个同名目录 `~/Documents/Obsidian Vault/<中文名>/` 是为了在 Obsidian 主 vault 里能看到这个项目，但实际的工作 vault 是它里面的 `<中文名>/` 子目录。

---

## 阶段 2：素材收集（并行 Agent）

详见 [`references/source-collection-strategies.md`](references/source-collection-strategies.md)。

### 关键原则

1. **永远启动多个 Agent 并行抓** —— 一个 Agent 抓一类素材，比如 Agent A 抓股东信，Agent B 抓访谈，Agent C 抓财报。
2. **每个 Agent 输出到一个 txt 文件**，存放在项目 work 目录下（如 `/Users/hongxing/project/webchat/<人名>-<类型>.txt`），不要直接写 vault。原文先收集，翻译再写 vault。
3. **告诉每个 Agent 具体的来源 URL 模式**，避免它瞎试。常用来源：
   - 股东信：`aboutamazon.com`、`q4cdn.com`、`sec.gov`
   - Tesla/SpaceX：`tesla.com`（被屏蔽时用 `web.archive.org/web/2020/...` 套层）
   - 长访谈：`lexfridman.com`（有官方转录）、`happyscribe.com`、`podscripts.co`、`rev.com`
   - 财报会议：`motleyfool.com`（2018 年后）、`shacknews.com`
   - **避免**：`seekingalpha.com`（403 屏蔽 WebFetch）

### Agent 任务模板

参考 `references/agent-prompts.md` 里"信源收集 Agent"的标准提示词。

---

## 阶段 3：中文翻译 + wikilinks 标注（并行 Agent）

详见 [`references/translation-guidelines.md`](references/translation-guidelines.md)。

### 翻译策略

| 素材类型 | 策略 | 每篇目标长度 |
|---------|------|------------|
| 短文档（股东信、Master Plan、备忘录） | **完整翻译** | 全文 |
| 长访谈（2-3 小时，3-9 万词） | **精华翻译** | 3000-6000 字 |
| 财报会议（剥离分析师 Q&A，只留主角发言） | **精华翻译** | 1500-3000 字 |
| 著作章节 | 看情况，重要章节完整，次要章节提炼 | - |

### 关键规则

1. **保留语气** —— 不要把所有人都翻译成"宝玉腔"。贝佐斯是温和理性，马斯克是直接挑衅，巴菲特是幽默自嘲。
2. **wikilinks 标注**：识别概念、产品、人物用 `[[双括号]]` 标注。先建立一个 30-50 个候选词的词表给 Agent，避免每个 Agent 各自创造不同的命名。
3. **每篇文件加 YAML frontmatter**：title、date、type、tags。
4. **文件命名规范**：用 `YYYY 标题.md` 或 `YYYY-MM-DD 标题.md` 这种带日期前缀的格式，便于侧边栏按时间排序。

### 并行策略

启动 4-5 个翻译 Agent，每个负责一个时间段或一类素材：

- Agent 1: 1997-2004 股东信
- Agent 2: 2005-2012 股东信
- Agent 3: 长访谈批次 1
- Agent 4: 财报会议
- ...

### 并行 Agent 之后的去重

并行 Agent 偶尔会用不同的命名约定写同一个文件（例如 "2019-04 Lex Fridman.md" vs "Lex Fridman 49 (2019).md"）。**翻译完成后必须 ls 一遍每个目录，删除重复文件**。

---

## 阶段 4：知识抽取（并行 Agent 建卡片）

启动 3-4 个并行 Agent：

| Agent | 输入 | 输出 |
|-------|------|------|
| 概念抽取 | vault 中所有翻译好的素材 | 15-25 张概念卡片 → `concepts/` |
| 产品/公司抽取 | 同上 | 10-15 张档案 → `companies/` |
| 人物抽取 | 同上 | 6-10 张档案 → `people/` |
| 方法抽取（可选） | 同上 | 5-10 张方法卡片 → `methods/` |

### 卡片结构

详见 [`references/card-templates.md`](references/card-templates.md)。每张卡都应该有：

- YAML frontmatter (title, type, tags)
- 定义/起源
- 核心要义（3-4 个子论点 + 原文引用 + `[[文件名]]` 出处链接）
- 实战案例
- 思想演变（如果该概念在不同时期有变化）
- 原话精选
- 相关概念（`[[wikilinks]]`）

### 独有维度：立场演变

对**有明显立场转变**的人物（马斯克的 OpenAI 关系、AI 安全立场等），单独建立"立场演变"类型的概念卡片，按时间线整理。这是知识图谱相对于普通"读书笔记"的核心差异化价值。

### 独有维度：工作方法（可选）

如果在阶段 0 决定开启方法维度，每张方法卡必须包含一节："**你能用上吗？**"——讲普通团队/创业者怎么借鉴这个方法，不能只是介绍方法本身。这是方法卡相对于概念卡的差异化价值。

### Agent 任务模板

参考 `references/agent-prompts.md` 里"知识抽取 Agent"的标准提示词。

---

## 阶段 5：索引页 + 首页

直接由你（Claude）写，不需要 Agent。需要写 5-6 个文件：

- `index-pages/素材总览.md` 或 `<人名>致股东信总览.md`
- `index-pages/核心思想索引.md`
- `index-pages/公司与产品索引.md`
- `index-pages/人物索引.md`
- `index-pages/工作方法索引.md`（如启用方法维度）
- `index-pages/更新日志.md`（可选，强烈推荐 —— 见下文）
- `欢迎.md`（首页）

模板见 [`templates/index-page-templates/`](templates/index-page-templates/)。

### 更新日志（可选但推荐）

如果在 `index-pages/` 下放一个 `更新日志.md`，`build_site.py` 模板会自动识别它并：

1. **从左侧菜单"索引"分组中剥离它**（避免和其他索引混在一起）
2. **在侧边栏底部加一个"📋 更新日志"常驻入口**（用半透明灰字，hover 变金色）
3. **去掉文章页顶部的"索引"类型徽章**，改用专属的 changelog 视觉
4. **应用 changelog 专属样式**：版本号金色徽章、bullet 列表带金色圆点、变更类型标签（feat/fix/plan）

更新日志的写法：以**时间倒序**（最新的在最上面）记录每次迭代。每个版本一个 H2 标题。

```markdown
---
title: "更新日志"
type: 索引
tags: [索引, 更新日志]
---

# 更新日志

<p style="color:var(--text2);font-size:14px;margin-top:-8px;margin-bottom:32px">记录 [人名] 知识库的每一次迭代。</p>

## <span class="version">V 1.2</span> <span class="changelog-date">2026-04-11</span>

<ul class="change-list">
<li><span class="change-type feat">新功能</span><strong>更新日志</strong> — 简短描述本次新增了什么</li>
<li><span class="change-type fix">修复</span>简短描述修复了什么问题</li>
</ul>

## <span class="version">V 1.1</span> <span class="changelog-date">2026-04-10</span>

<ul class="change-list">
<li><span class="change-type feat">视觉</span><strong>Favicon</strong> — 加了一套海军蓝底 + 金色字母的 favicon</li>
</ul>
```

**变更类型标签**（CSS 类名 → 颜色）：

| class | 颜色 | 用途 |
|-------|------|------|
| `feat` | 绿色 | 新功能、新内容、新维度 |
| `fix` | 红色 | bug 修复、链接修正 |
| `plan` | 蓝色 | 计划、未来路线图 |

**写作建议**：每个 li 前面用 `<strong>` 包一个 2-5 字的"变更名"，然后用全角破折号 `—` 接一句话描述。这是从 buffett-letters-eir 的更新日志学来的格式。

#### 写更新日志的两条铁律 ⚠️

1. **不要主动加更新日志条目** —— 哪怕你刚刚帮用户修了个 bug、加了个 favicon、调了 GA、重构了 CSS，都**不要**自动往 `更新日志.md` 里写。只在用户**明确**说"加一条更新日志"或"把 X 写进更新日志"时才动这个文件。
2. **只写用户有感知的大改动** —— 粒度对标"普通访客打开网站会注意到的变化"。
   - ✅ 该写：首次上线、新增"工作方法"板块、新增 8 篇财报访谈、全站视觉重做
   - ❌ 不该写：接入 GA、加 favicon、加反向链接面板、改 CSS Grid、改菜单顺序、修 wikilink、新增姊妹站链接

   一个判断标准：如果一句话描述出来普通访客会觉得"哦这个我感觉到了"，就写；如果是"嗯…然后呢？"，就别写。

**Why this matters**：之前的实践证明，自动堆砌技术性细节会让更新日志膨胀成"开发者 commit log"，普通用户既不会看也没感觉。把它当成给读者的**版本里程碑**而不是开发记录，才是对的姿势。

---

## 阶段 6：构建网站

复制并定制 [`templates/build_site.py`](templates/build_site.py)，改造为目标项目的版本。

### 需要改的配置项

1. `VAULT` 路径
2. `OUT` 路径
3. `SITE_TITLE`、`SITE_LOGO`
4. `CATEGORY_DIRS`、`CATEGORY_LABELS`
5. 侧边栏 `order` 列表的顺序
6. `build_homepage()` 里的 hero 文案、stats、nav cards、关于本站文案
7. `assets-<人名>/` 目录（含定制的 favicon 和二维码）
8. **`GA_MEASUREMENT_ID`（可选）** —— 如果要做流量统计，填上 GA4 的 Measurement ID（比如 `G-XXXXXXX`）。留空字符串则不注入 GA 代码。详见 [`references/google-analytics.md`](references/google-analytics.md)

### Favicon 生成

用 [`scripts/generate_favicon.py`](scripts/generate_favicon.py) 生成新人物的 favicon：

```bash
python3 scripts/generate_favicon.py --letter M --output ~/project/webchat/assets-musk
```

### 测试构建

```bash
python3 build_<人名>.py
```

确认 HTML 文件数符合预期（一般 60-100 个），然后进入部署。

---

## 阶段 7：部署上线

详见 [`references/deployment-checklist.md`](references/deployment-checklist.md)。

### 服务器准备

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@<server-ip> "sudo mkdir -p /var/www/<人名> && sudo chown ubuntu:ubuntu /var/www/<人名>"
```

### 上传部署（用 tar 避免中文文件名编码问题）

```bash
cd /Users/hongxing/project/webchat/<人名>-site
find . -name '._*' -delete  # ⚠️ 一定要删 macOS 元数据文件
tar czf /tmp/<人名>-site.tar.gz --exclude='._*' .
scp -i ~/aws/lhx_key2.pem /tmp/<人名>-site.tar.gz ubuntu@<server-ip>:/tmp/
ssh -i ~/aws/lhx_key2.pem ubuntu@<server-ip> "
  rm -rf /tmp/<人名>-update && mkdir -p /tmp/<人名>-update
  cd /tmp/<人名>-update && tar xzf /tmp/<人名>-site.tar.gz
  sudo rm -rf /var/www/<人名>/*
  sudo cp -r /tmp/<人名>-update/* /var/www/<人名>/
  sudo find /var/www/<人名>/ -name '._*' -delete
  sudo chown -R www-data:www-data /var/www/<人名>/
"
```

### 配置 Caddy

把 [`templates/caddy-block.txt`](templates/caddy-block.txt) 的内容追加到 `/etc/caddy/Caddyfile`，替换 `<人名>` 为实际的子域名。然后：

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@<server-ip> "sudo systemctl restart caddy"
```

### 验证证书签发

```bash
sleep 12
ssh -i ~/aws/lhx_key2.pem ubuntu@<server-ip> "sudo journalctl -u caddy --no-pager -n 5 --since '1 minute ago' | grep -E 'certificate|success'"
```

看到 `certificate obtained successfully` 就成功了。

### 验证线上访问

```bash
curl -sI https://<子域名>/ | head -5
```

返回 `HTTP/2 200` 即上线成功。

---

## 重要避坑指南

详见 [`references/pitfalls.md`](references/pitfalls.md)。**这部分一定要读**——下面是最常见的几个坑：

### 坑 1：DNS 指向"内网 IP"

`dig` 命令可能返回 `198.18.x.x`（这是 RFC 2544 测试段，被本地代理软件用作虚拟 IP）。**永远不要把这个 IP 给用户做 A 记录**。要 SSH 到服务器内 `curl ifconfig.me` 拿真实公网 IP。

### 坑 2：macOS dotfiles 跟着 tar 上服务器

macOS 的扩展属性会创建 `._*` 元数据文件。如果不在 tar 之前 `find . -name '._*' -delete`，服务器上会出现一堆 64 KB 莫名其妙的 HTML 文件，让 `find -name '*.html' | wc -l` 的数字翻倍。

### 坑 3：Caddy 证书重试退避

如果 DNS 没生效就启动 Caddy，它会进入指数退避（最多 1200 秒）。**DNS 配好后必须 `sudo systemctl restart caddy`** 才能立即重试，不能只 reload。

### 坑 4：scp 中文文件名失败

scp 对中文路径偶尔会丢文件。**永远用 tar 打包再上传**，不要直接 scp 目录。

### 坑 5：vault 嵌套在另一个 vault 里

如果你把新 vault 建在 `~/Documents/Obsidian Vault/<人名>/`，它会成为外层 vault 的子文件夹而不是独立 vault。**正确做法是再嵌套一层**：`~/Documents/Obsidian Vault/<人名>/<人名>/.obsidian/`，让里层成为独立 vault。

### 坑 6：并行 Agent 的命名漂移

不同的并行 Agent 会用略微不同的命名约定，最后会有重复文件。**翻译完成后必须 ls 检查并清理重复**。

### 坑 7：seekingalpha.com 屏蔽爬虫

老的 Tesla/SpaceX 财报会议主要在 seekingalpha.com，但它会 403。改用 motleyfool.com（2018 年后）或者 web.archive.org 镜像。

### 坑 8：tesla.com 屏蔽 WebFetch

直接 fetch tesla.com 会 403。用 `web.archive.org/web/2020/https://www.tesla.com/blog/...` 套层。

---

## 完成后的成果验收清单

- [ ] 子域名可以打开
- [ ] HTTPS 证书有效
- [ ] 首页 hero、stats、nav cards、TOP 列表显示正常
- [ ] 任意文章页右侧有"链接到本页"反向链接面板（索引页除外）
- [ ] 左侧导航的"首页"链接、各分组都能正确折叠展开
- [ ] favicon 正确显示（不是默认地球图标）
- [ ] 移动端响应式正常
- [ ] 所有 wikilinks 内部跳转都是 200，没有 404
- [ ] （如启用更新日志）侧边栏底部"📋 更新日志"链接可见，点击后样式正确（金色版本徽章 + 类型标签）

---

## 文件参考索引

| 文件 | 用途 | 何时读 |
|------|------|--------|
| `references/source-collection-strategies.md` | 各类素材的最佳获取来源和绕过反爬的技巧 | 阶段 2 之前 |
| `references/translation-guidelines.md` | 长短文档的不同翻译策略，wikilinks 标注规范 | 阶段 3 之前 |
| `references/card-templates.md` | 概念/产品/人物/方法卡片的结构模板 | 阶段 4 之前 |
| `references/agent-prompts.md` | 给 Agent 的标准提示词模板（收集、翻译、抽取） | 每次启动 Agent 前 |
| `references/deployment-checklist.md` | 部署的完整命令清单 + Caddy 配置 + DNS 注意事项 | 阶段 7 之前 |
| `references/google-analytics.md` | GA4 配置策略：单 ID 跨站 vs 多数据流 | 要加流量统计时 |
| `references/pitfalls.md` | 完整避坑清单 | **每次都读** |
| `references/visual-design.md` | Notion 暖米色 + 金色强调 设计系统的细节 | 想自定义视觉时 |
| `templates/build_site.py` | 可复用的网站构建脚本模板 | 阶段 6 |
| `templates/caddy-block.txt` | Caddy 站点配置模板 | 阶段 7 |
| `templates/index-page-templates/` | 索引页 markdown 模板 | 阶段 5 |
| `scripts/generate_favicon.py` | 从一个字母生成 favicon 文件集 | 阶段 6 |

---

## 案例：已完成的项目

| 项目 | 信源 | 节点数 | 网址 | 项目目录 |
|------|------|--------|------|----------|
| 贝佐斯 | 24 封股东信（1997-2020） | 64 | [bezos.feima.ai](https://bezos.feima.ai/) | `~/project/webchat/build_site.py` |
| 马斯克 | 3 Master Plan + 11 长访谈 + 8 财报会议 | 78 | [musk.feima.ai](https://musk.feima.ai/) | `~/project/webchat/build_musk.py` |

参考这两个 build 脚本作为起点。新项目通常只需要改 5-10 个变量。
