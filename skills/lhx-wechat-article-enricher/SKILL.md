---
name: lhx-wechat-article-enricher
description: 为公众号文章追加"推荐阅读"和"二维码引导"。通过浏览器登录公众号后台，按阅读量筛选近期爆款文章，追加到 markdown 文件末尾；同时可追加群二维码+引导语。当用户说"加推荐阅读"、"加二维码"、"加上推荐"、"enricher"、"导流"时使用。不要主动触发，仅在用户明确要求时使用。
---

# 公众号文章追加：推荐阅读 & 二维码

为已写好的公众号 markdown 文章追加两个可选模块：
1. **推荐阅读** — 从公众号后台获取近期高阅读量文章，以链接列表追加到文末
2. **二维码引导** — 在文末追加群二维码图片 + 引导文案

两个模块独立可选，用户说加哪个就加哪个。

## 触发词

"加推荐阅读"、"加二维码"、"加推荐"、"推荐阅读"、"导流"、"enricher"、"加上二维码"

**不要主动触发。** 仅在用户明确要求时使用。

## 用法

```
/lhx-wechat-article-enricher <markdown_file>
/lhx-wechat-article-enricher <markdown_file> --recommended-only
/lhx-wechat-article-enricher <markdown_file> --qrcode-only
```

不带参数时两个模块都执行。

## 配置

配置文件路径：`$HOME/.baoyu-skills/lhx-wechat-article-enricher/EXTEND.md`

```md
# 推荐阅读
recommended_reading_count: 5
recommended_reading_days: 30

# 二维码
qrcode_path: ~/Downloads/IMG_0540.jpg
qrcode_text: 欢迎扫码加入交流群，一起探讨、碰撞想法。
```

| Key | Default | Description |
|-----|---------|-------------|
| `recommended_reading_count` | `5` | 推荐文章数量 |
| `recommended_reading_days` | `30` | 回溯天数，从发表记录中筛选 |
| `qrcode_path` | empty | 二维码图片路径（绝对路径或相对于文章目录） |
| `qrcode_text` | empty | 二维码上方的引导文案 |

## 工作流

### 模块一：推荐阅读

**目标**：从公众号发表记录中选出近期阅读量最高的 N 篇文章，追加到 markdown 末尾。

**步骤**：

1. **获取文章数据** — 优先尝试 WeChat API（`draft/batchget`），获取近期文章标题和链接
2. **获取阅读量** — 如果 API 无法获取阅读量（通常需要服务号权限），使用浏览器（gstack browse）：
   - 导入 Chrome cookies（`cookie-import-browser chrome --domain mp.weixin.qq.com` 和 `--domain .qq.com`）
   - 导航到 `https://mp.weixin.qq.com`
   - 如果未登录，使用 `connect` 打开有头浏览器让用户扫码登录
   - 登录后导航到发表记录页面：`https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&begin=0&count=10&token=TOKEN&lang=zh_CN`
   - 截图读取阅读量数据
   - 使用 JS 提取文章链接：遍历页面上所有 `<a>` 标签，筛选 `href` 包含 `/s/` 的链接
3. **按阅读量排序**，选取前 N 篇（排除当前正在编辑的文章）
4. **追加到 markdown 末尾**：

```markdown
---

### 推荐阅读

- [文章标题1](https://mp.weixin.qq.com/s/xxx)
- [文章标题2](https://mp.weixin.qq.com/s/yyy)
- ...
```

### 模块二：二维码引导

**目标**：在 markdown 末尾追加二维码图片和引导文案。

**步骤**：

1. **读取配置** — 从 EXTEND.md 获取 `qrcode_path` 和 `qrcode_text`
2. **如果没有配置**，用 AskUserQuestion 询问：
   - 二维码图片路径
   - 引导文案（提供默认值："欢迎扫码加入交流群，一起探讨、碰撞想法。"）
3. **验证图片存在**，复制到文章同目录（如果不在同目录的话）
4. **追加到 markdown 末尾**（在推荐阅读之后）：

```markdown
---

[引导文案]

<p align="center"><img src="qrcode-group.jpg" alt="扫码加入交流群" width="220" /></p>
```

二维码使用 `<img width="220">` 而非原生 markdown 语法，避免在公众号渲染时撑满宽度。

### 执行顺序

推荐阅读在前，二维码在后。两者之间用 `---` 分隔。

## 注意事项

- 此 Skill 只修改 markdown 文件，不负责 HTML 转换和发布（那些由 `baoyu-post-to-wechat` 处理）
- 追加内容前检查 markdown 末尾是否已有"推荐阅读"或二维码，避免重复追加
- 如果文章标题中包含"原创"标记，在推荐阅读列表中去掉该标记
- 浏览器登录状态可能过期，如遇到登录页面需要重新扫码
