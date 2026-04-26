# 避坑清单

来自贝佐斯和马斯克两个项目的真实踩坑记录。**每次启动新项目前必须扫一遍这份清单**。

---

## 部署相关

### 坑 1：DNS 指向"内网 IP"⚠️

**症状**：`dig <子域名> +short` 返回 `198.18.x.x` 这种私有段地址。

**原因**：本地代理软件（Surge、Clash 等）会用 RFC 2544 测试段（`198.18.0.0/15`）作为虚拟 IP。`dig` 看到的是被代理改写过的结果，**不是真正的公网 IP**。

**正确做法**：
- 永远到服务器上 `curl ifconfig.me` 拿真实公网 IP
- 或者 `dig <子域名> @8.8.8.8 +short` 用 Google DNS 查
- 把这个真实 IP 给用户配 A 记录

**贝佐斯项目的真实事故**：第一次告诉用户配 `198.18.0.148`，用户就反问"这不是内网 IP 吗？"——确实是。后来在服务器上 `curl ifconfig.me` 拿到真实 IP `18.191.150.68`，才配对了。

### 坑 2：macOS dotfiles 跟着 tar 上服务器

**症状**：服务器上 `find /var/www/<人名> -name '*.html' | wc -l` 数字翻倍（应该 64 变成 127）。

**原因**：macOS 的扩展属性会创建一堆 `._<filename>` 元数据文件。tar 默认会把它们打包进去，scp 到服务器后，每个 HTML 文件旁边都多一个同名的 `._` 版本。

**正确做法**（每次部署前都做）：
```bash
cd <project-site-dir>
find . -name '._*' -delete  # 在 tar 之前删
tar czf /tmp/<人名>-site.tar.gz --exclude='._*' .
# 服务器上也再删一次防止漏网
ssh ... "sudo find /var/www/<人名>/ -name '._*' -delete"
```

### 坑 3：Caddy 证书重试退避

**症状**：DNS 配好了，但访问网站还是 SSL 错误。

**原因**：Caddy 在 DNS 没生效的时候启动过一次，证书申请失败，进入指数退避（最多 1200 秒）。

**正确做法**：
- DNS 配好后**必须 `sudo systemctl restart caddy`**（不是 reload，是 restart）
- 等 10-20 秒
- 用 `sudo journalctl -u caddy --no-pager -n 10 --since '1 minute ago' | grep -E 'certificate|success|error'` 检查
- 看到 `certificate obtained successfully` 才算成功

### 坑 4：scp 中文文件名失败

**症状**：scp 一个含中文文件名的目录时，部分文件没传过去。

**原因**：scp 对 UTF-8 文件名的处理在不同 OS / 版本之间有差异。

**正确做法**：**永远用 tar 打包再传**，不要直接 `scp -r`。

```bash
tar czf /tmp/site.tar.gz .
scp /tmp/site.tar.gz user@host:/tmp/
ssh user@host "cd /tmp && tar xzf site.tar.gz -C target/"
```

### 坑 5：Caddy 配置 try_files 顺序

**症状**：访问 `/concepts/X` 显示 404，但 `/concepts/X.html` 能打开。

**原因**：Caddy 的 `try_files` 没配置好。

**正确配置**：
```
<人名>.feima.ai {
    root * /var/www/<人名>
    file_server
    encode gzip
    try_files {path} {path}.html {path}/index.html
}
```

注意 `try_files {path} {path}.html {path}/index.html` 的顺序——先试原路径，再试加 `.html`，最后试 `index.html`。

---

## Vault / 文件系统相关

### 坑 6：vault 嵌套在另一个 vault 里

**症状**：在 Obsidian 里打开新建的"马斯克"，发现它显示成了另一个 vault 的子文件夹。

**原因**：你建在 `~/Documents/Obsidian Vault/马斯克/`，但是 `~/Documents/Obsidian Vault/` 本身就是一个 vault（有 `.obsidian` 目录）。Obsidian 不允许 vault 嵌套，会把你新建的当成子文件夹处理。

**正确做法**：再嵌套一层，让里层成为独立 vault：

```
~/Documents/Obsidian Vault/<人名>/         ← 外层（不是 vault）
└── <人名>/                                 ← 这才是真正的 vault
    └── .obsidian/                          ← 必须有这个目录
```

```bash
mkdir -p "~/Documents/Obsidian Vault/<人名>/<人名>/.obsidian"
```

然后在 Obsidian 里"打开另一个仓库"，选 `~/Documents/Obsidian Vault/<人名>/<人名>/`。

### 坑 7：并行 Agent 的命名漂移

**症状**：同一个文件出现两份，命名不同（比如 `Lex Fridman #49 (2019).md` 和 `2019-04 Lex Fridman 49 - Tesla Autopilot.md`）。

**原因**：并行启动的 Agent 没有共享上下文，会按各自的理解给文件命名，即使你在 prompt 里写了规范它们也偶尔不严格遵守。

**正确做法**：
- prompt 里**明确给出文件名示例**而不是只给规范
- **每个 Agent 完成后必须 ls 检查并去重**：

```bash
ls ~/Documents/Obsidian\ Vault/<人名>/<人名>/interviews/
# 发现重复就 rm 掉旧的 / 不规范的
```

---

## 抓取相关

### 坑 8：seekingalpha.com 屏蔽 WebFetch

**症状**：用 WebFetch 抓 seekingalpha.com 上的 Tesla 财报会议，403 Forbidden。

**正确做法**：
- **首先用 `baoyu-url-to-markdown` 试**——它用真实 Chrome 渲染，经常能直接过
- 如果还不行再用 `web.archive.org` 镜像
- 别一上来就放弃这个站

**贝佐斯/马斯克项目的真实教训**：因为没用 baoyu-url-to-markdown，2018 年之前的 Tesla 财报会议直接放弃了。其实如果用了 baoyu，大概率能拿到。

### 坑 9：tesla.com 屏蔽 bot

**症状**：直接 fetch tesla.com 上的 Master Plan 链接，403。

**正确做法**：
- 用 `baoyu-url-to-markdown`
- 或者套 `web.archive.org/web/2020/https://www.tesla.com/blog/...`

### 坑 10：JS 渲染的页面

**症状**：fetch ted.com 转录稿页面，HTML 里没有正文（只有元数据和 JS 占位符）。

**原因**：现代页面用 JS 客户端渲染，curl/WebFetch 拿到的是 JS 执行前的骨架。

**正确做法**：用 `baoyu-url-to-markdown`，它跑真实 Chrome 等 JS 执行完。

---

## 翻译 / 内容相关

### 坑 11：长访谈不能逐字翻译

**症状**：让 Agent 翻译一场 8.8 万词的 Lex Fridman 访谈，要么 Agent 触发 rate limit，要么翻译质量崩坏。

**原因**：超长内容超出 Agent 的有效注意力。

**正确做法**：明确告诉 Agent 用"**精华翻译**"策略——跳过寒暄、跳过无关闲聊、保留金句和核心论述、控制在 3000-6000 字中文。在 prompt 里就讲明这是精华节选不是全文翻译。

### 坑 12：不同 Agent 用不同的 wikilink 命名

**症状**：一个 Agent 写 `[[Tesla Roadster]]`，另一个写 `[[Roadster]]`，结果同一个东西分裂成两个节点。

**正确做法**：
- 在 prompt 里给每个翻译 Agent 一份**统一的 wikilink 词表**（30-50 个候选词）
- 翻译完成后，运行一个去重检查脚本：
  ```python
  import re, os, glob
  files = glob.glob('vault/**/*.md', recursive=True)
  counts = {}
  for f in files:
      content = open(f).read()
      for link in re.findall(r'\[\[([^\]|]+)', content):
          counts[link.strip()] = counts.get(link.strip(), 0) + 1
  for k, v in sorted(counts.items(), key=lambda x: -x[1]):
      print(f'{v:4d}  {k}')
  ```
- 看到明显是同一个东西的不同写法（如 "Tesla Roadster" 和 "Roadster"），用 sed 批量替换归一

### 坑 13：财报会议没剥离分析师 Q&A

**症状**：财报会议的卡片里出现"分析师 Adam Jonas 问..."这种内容，混入了非主角的发言。

**正确做法**：在收集 Agent 的 prompt 里**明确要求剥离**：
> 财报会议有大量分析师 Q&A 和其他高管（CFO/COO 等）的回答。你必须只保留 [主角名] 自己的发言，把分析师的问题保留作为上下文，但其他高管的回答全部删除。

---

## 知识抽取相关

### 坑 14：Agent 编造引用

**症状**：概念卡片里的"原话精选"引用看起来很合理，但去素材里 grep 找不到。

**正确做法**：
- prompt 里明确要求"**必须从素材里提取真实内容，不要凭空编造引用**"
- 完成后抽几条原话 grep 验证
- 如果某张卡片在素材里找不到对应内容，要求 Agent 在卡片末尾**诚实标注**"本卡片部分内容基于公开资料补充，素材中无直接引用"
- 马斯克项目里 Gwynne Shotwell 和 JB Straubel 两张人物卡就是这种情况，Agent 主动标注了

### 坑 15：所有 Agent 都触发 rate limit

**症状**：3-4 个并行 Agent 都收到 "You've hit your limit · resets at Xpm" 的报错。

**正确做法**：
- **不要所有 Agent 同时启动**——Token 使用是共享的池子
- 拆批：先启动 2-3 个 Agent 跑一批任务，等它们完成再启动下一批
- 检查它们已经写入的文件：很多时候 fail 之前已经完成大半，**不要重复劳动**
- 启动新 Agent 时明确告诉它"已经存在的文件不要重写"

---

## 网站构建相关

### 坑 16：build_site.py 拷贝时忘了改 VAULT 路径

**症状**：build 出来的 site 是空的或者是上一个项目的内容。

**正确做法**：每次复制 build_site.py 后，**第一件事**就是改文件顶部的 5 个常量：
- `VAULT`
- `OUT`
- `SITE_TITLE`
- `SITE_LOGO`
- `CATEGORY_DIRS`

### 坑 17：build_site.py 里有 home 路径硬编码

**症状**：测试链接都对，但用户访问首页发现某些跳转到了别的项目的页面。

**原因**：homepage builder 函数里写了硬编码的 URL（比如 `/index-pages/贝佐斯致股东信总览.html`），改用人名时忘了改。

**正确做法**：复制 build_site.py 后用 grep 找出所有写死的中文/英文路径，统一替换：
```bash
grep -nE '(贝佐斯|bezos|马斯克|musk)' build_<新人名>.py
```

### 坑 18：favicon 没改

**症状**：浏览器标签页显示的还是上一个项目的字母（B 或 M），不是新项目的。

**正确做法**：用 `scripts/generate_favicon.py --letter X --output ~/project/webchat/assets-<新人名>` 生成新的，并把 build_site.py 里 `assets-<人名>` 路径改对。

---

## 通用：每次都做的检查清单

部署上线前必须过一遍：

- [ ] DNS A 记录指向**真实公网 IP**（不是 198.18.x.x）
- [ ] tar 之前 `find . -name '._*' -delete`
- [ ] 服务器上 `find /var/www/<人名> -name '*.html' | wc -l` 数字符合预期
- [ ] Caddy `restart`（不是 reload）
- [ ] `journalctl -u caddy` 看到 `certificate obtained successfully`
- [ ] `curl -sI https://<子域名>/` 返回 `HTTP/2 200`
- [ ] 浏览器打开首页能看到正确的 favicon
- [ ] 随机点几个内页验证 wikilinks 跳转都是 200
- [ ] 移动端响应式正常（resize 浏览器窗口）
