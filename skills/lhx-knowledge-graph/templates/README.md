# Templates

可复用的模板文件。新项目时复制到项目目录并替换 `<人名>` / `<人名拼音>`。

## build_site.py

参数化的网站构建脚本。基于 Bezos / Musk 项目提炼。

### 复制和定制流程

```bash
# 1. 复制到你的项目目录
cp ~/.claude/skills/lhx-knowledge-graph/templates/build_site.py \
   ~/project/webchat/build_<人名拼音>.py

# 2. 用 grep 找出所有 TODO，按编号修改
grep -n "TODO" ~/project/webchat/build_<人名拼音>.py
```

需要修改的地方（在文件里都用 `TODO N:` 标记好了）：

| TODO | 位置 | 改什么 |
|------|------|--------|
| 1 | 顶部 CONFIG | `VAULT` 路径——指向你的 Obsidian vault |
| 2 | 顶部 CONFIG | `OUT` 路径——HTML 输出目录 |
| 3 | 顶部 CONFIG | `SITE_TITLE`——网站标题 |
| 4 | 顶部 CONFIG | `SITE_LOGO`——一个英文字母 |
| 5 | 顶部 CONFIG | `CATEGORY_DIRS`——保留你用到的 categories |
| 6 | 顶部 CONFIG | `CATEGORY_LABELS`——中文标签 |
| 7 | `main()` 函数 | `assets-<人名拼音>` 改成你的资源目录 |

**还需要手动改的地方**（不在 TODO 标记里，但必须改）：

- `build_sidebar_html()` 里的 `order` 列表——侧边栏顺序
- 文件底部的 `build_homepage()` 整个函数——hero 文本、统计数据、nav cards、关于本站文案
- CSS 里的 `.type-XX` 类——每个 category 徽章的颜色
- `main()` 里的 `type_label_map`——文章页顶部徽章的中文标签

### 测试构建

```bash
cd ~/project/webchat
python3 build_<人名拼音>.py
```

期望输出：

```
Collecting files...
  Found N files
  Built link map with N entries
  Built backlinks: N links across N pages
Generated N HTML pages in /Users/hongxing/project/webchat/<人名拼音>-site
```

## caddy-block.txt

Caddy 站点配置模板。复制到 `/etc/caddy/Caddyfile` 末尾，替换 `<人名>` 和 `<子域名>`。

## deploy.sh

一键部署脚本（本地 → 服务器 → Caddy 重启 → 证书签发）。

```bash
./deploy.sh <人名拼音> <子域名> <site-dir>
# 例：
./deploy.sh musk musk /Users/hongxing/project/webchat/musk-site
```

## 案例：参考文件

实际跑通的两个项目脚本可以作为对照：

- 贝佐斯：`~/project/webchat/build_site.py`
- 马斯克：`~/project/webchat/build_musk.py`

新项目改造时可以同时打开它们对照看 hero / nav cards / 关于本站这几段是怎么写的。
