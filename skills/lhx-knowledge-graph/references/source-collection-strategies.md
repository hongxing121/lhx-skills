# 素材收集策略

按"信源类型"分类，记录每类素材的最佳来源、抓取手段优先级、和绕过反爬的方法。

---

## ⭐ 抓取手段优先级（**这是最重要的部分**）

启动收集 Agent 之前，**必须**告诉它按这个顺序尝试抓取，而不是直接 WebFetch 然后失败就放弃：

| 优先级 | 手段 | 适用场景 |
|--------|------|---------|
| **#1** | **`baoyu-url-to-markdown` skill** | **默认武器**。URL → 干净 markdown，连标题/作者/日期都帮你提取好。能用真实 Chrome 渲染 JS，绕过 Cloudflare 和大部分反爬 |
| #2 | `WebFetch` | 简单静态页面，速度更快。但碰到 Cloudflare、tesla.com、seekingalpha.com 这种就会 403 |
| #3 | `curl` 直接下载 | PDF 文件 |
| #4 | `web.archive.org` 镜像 | 套层 `https://web.archive.org/web/2020/<原 URL>`，原站完全打不开时的兜底 |
| #5 | `gstack` / `browse` skill | 需要交互（登录、点弹窗、滚动加载）才能拿到内容时升级到这个 |

### 经验教训

之前做贝佐斯和马斯克项目时，Agent 们**全程没用 baoyu-url-to-markdown**，结果：
- ❌ Tesla 官网 403 → 不得不用 web.archive.org 镜像（绕了一圈）
- ❌ Seeking Alpha 整站 403 → 直接放弃了 2018 年之前的财报会议
- ❌ TED.com 转录稿是 JS 渲染的 → 直接 fetch 拿到的 HTML 里没有内容

如果一开始就用 baoyu-url-to-markdown，上面这些**大概率都不会成为问题**。

### baoyu-url-to-markdown vs gstack/browse 的边界

- **baoyu-url-to-markdown** = "把这篇公开文章/股东信/转录稿抓下来变成 markdown" → 默认选这个
- **gstack/browse** = "登录 NYT → 关弹窗 → 滚动加载 → 截图" → 真正需要交互流程时才上

90% 的素材抓取场景用 baoyu-url-to-markdown 就够了。

### 标准用法（⚠️ 必须加 `--headless`）

```bash
npx -y bun ~/.claude/skills/baoyu-url-to-markdown/scripts/main.ts --headless <URL>
```

**为什么必须加 `--headless`**：默认模式会弹出可见的 Chrome 窗口，在批量抓取（一次跑十几个 URL）时会反复抢占用户的桌面焦点、打断他们手头的其他工作。`--headless` 跑的是 `--headless=new`，渲染引擎与可见 Chrome 完全一致（同样能跑 JS、绕 Cloudflare），但没有可见窗口。

如果你嫌每次都加这个 flag 麻烦，也可以在 shell 里 export 一次：

```bash
export URL_HEADLESS=1
```

之后这个 session 里所有调用都默认 headless。

输出会保存到 `url-to-markdown/<domain>/<slug>.md`，自带 YAML frontmatter。

**唯一的例外**：登录页 / paywall 用 `--wait` 模式时，必须看见浏览器才能登录，所以那种情况下不能用 `--headless`。

---

## 1. 上市公司股东信 (Annual Shareholder Letters)

| 来源 | 适用 | 备注 |
|------|------|------|
| `aboutamazon.com` | 亚马逊 | 官方页面 |
| `s2.q4cdn.com` | 大部分美股公司 | IR CDN，PDF 直接下载 |
| `media.corporate-ir.net` | 老一些的公司 | 历史 IR 主机 |
| `sec.gov` 10-K filings | 几乎所有美股公司 | shareholder letter 包在 10-K 开头 |
| `berkshirehathaway.com/letters/` | 巴菲特 | 1977-至今全部公开 |

### 已知好用的开源汇编

- 亚马逊：covestreetcapital.com 有 1997-2016 PDF 合集
- 巴菲特：berkshirehathaway.com 自己就有
- Tesla Master Plan：tesla.com 屏蔽 bot，用 baoyu-url-to-markdown 或 web.archive.org

## 2. 长访谈 / Podcast 转录稿

| 来源 | 适用 | 质量 |
|------|------|------|
| `lexfridman.com/<人名>` | Lex Fridman 访谈 | ⭐⭐⭐⭐⭐ 官方 PDF 转录，带时间戳 |
| `rev.com` | 各类访谈 | ⭐⭐⭐⭐ 人工转录 |
| `happyscribe.com` | 各类播客 | ⭐⭐⭐⭐ 经常被 Cloudflare 拦——**baoyu-url-to-markdown 能过** |
| `podscripts.co` | 各类播客 | ⭐⭐⭐ ASR 自动转录 |
| `singjupost.com` | TED、长演讲 | ⭐⭐⭐⭐ |
| `youtubetranscript.com` | YouTube 字幕兜底 | ⭐⭐ |

## 3. 财报电话会议 (Earnings Calls)

| 来源 | 时间范围 | 备注 |
|------|----------|------|
| `motleyfool.com/earnings/call-transcripts/` | 2018 至今 | 大公司全覆盖，**首选** |
| `seekingalpha.com` | 全部历史 | WebFetch 是 403，**用 baoyu-url-to-markdown 试**——之前直接放弃是错的 |
| `yahoo.finance` | 偶尔有 | 备选 |
| `shacknews.com` | 偶尔有 | 备选 |

### 处理财报会议的关键步骤

财报会议有两类内容：
1. **管理层 prepared remarks**（开场陈述）
2. **分析师 Q&A**

抓回原文后**必须剥离分析师的问题和其他高管的回答**，只保留主角（CEO 或被研究的那个人）的发言，否则知识库会混入大量噪音。

抽取规则：
- 找说话人标签（"Elon Musk:" / "Jeff Bezos:" / "Warren Buffett:"）
- 只保留这些段落 + 段落之前的分析师问题（作为上下文）
- 删除其他高管段落（CFO、COO 等）

## 4. 备忘录 / 内部讲话 / 公开信 (Memos)

- `oaktreecapital.com/insights/memos` —— 霍华德·马克斯的全部备忘录
- `letter.ly` —— Coatue、Sequoia 等的备忘录
- 个人博客（pmarca.com、paulgraham.com 等）
- `ben-evans.com/benedictevans` 类型的分析师备忘录

## 5. 著作选段 (Book Excerpts)

**注意版权**：不能直接复制完整书籍。但可以：
- 公开的 sample chapter（出版社页面）
- 作者本人在博客上分享的章节
- 公共领域作品（巴菲特/格雷厄姆早期著作有些已进入 PD）
- 可以引用 + 评论 + 重述（合理使用）

**实战做法**：让用户自己提供他想纳入的章节扫描件或文本。

## 6. 演讲稿 / Keynote (Speeches & Keynotes)

| 来源 | 适用 |
|------|------|
| `ted.com/talks/<id>/transcript` | TED |
| 公司官方 newsroom | 苹果发布会、SpaceX update |
| `singjupost.com` | 通用演讲转录 |
| YouTube 自动字幕 | 兜底 |

### 注意

`ted.com` 的转录稿用 JS 渲染，**直接 curl 或 WebFetch 拿到的 HTML 里没有正文**。这是 baoyu-url-to-markdown 的典型用例——它会用真实 Chrome 跑 JS 拿到完整内容。

## 7. 推文 / 微博 (Tweets)

通常**不建议**作为知识图谱的主要素材——太碎片、噪音多、容易被误解上下文。

如果某个人物的核心思想主要靠推文（如马斯克），可以做"金句精选"集合，但要：
- 按互动量取 top 1000，再用 LLM 二筛"有信息量的"
- 注明出处时间
- 不要单条推文做成知识卡

可以用 `baoyu-danger-x-to-markdown` skill 抓 X/Twitter 内容。

---

## 启动收集 Agent 时的标准开头

每个收集 Agent 的 prompt 都应该包含这段"抓取手段优先级"指令：

```
**抓取手段优先级（重要，按顺序尝试）：**

1. 优先用 baoyu-url-to-markdown skill **加 --headless**：
   `npx -y bun ~/.claude/skills/baoyu-url-to-markdown/scripts/main.ts --headless <URL>`
   它用 headless Chrome（--headless=new）渲染，与真实 Chrome 渲染结果一致，能绕过 Cloudflare、tesla.com、seekingalpha.com 等大部分反爬，**而且不会弹出窗口打断用户工作**。
   **千万不要省略 --headless**——少了它会反复弹出 Chrome 窗口抢占用户桌面焦点。

2. 失败再用 WebFetch（适合简单静态页面）

3. 仍失败用 web.archive.org 套层：
   `https://web.archive.org/web/2020/<原 URL>`

4. 真的需要交互（登录、点击等）才升级到 gstack/browse skill

5. 实在抓不到的可以跳过，最后告诉我哪些缺失
```

详细的 Agent 提示词模板见 [`agent-prompts.md`](agent-prompts.md)。
