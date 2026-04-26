# Google Analytics 4 配置

给知识图谱站点加 GA4 流量统计的完整指南，重点是**多站点场景下的 ID 选择策略**——这个选错了会导致跨站用户追踪完全失效。

---

## 快速配置（单站点）

1. 去 GA4 管理后台 → 创建一个数据流 → 拿到 Measurement ID（形如 `G-XXXXXXX`）
2. 在 build_site.py 顶部 CONFIG 区把 `GA_MEASUREMENT_ID = ""` 改成 `GA_MEASUREMENT_ID = "G-XXXXXXX"`
3. 重新 build + deploy

build_site.py 模板会自动把标准的 gtag.js 代码注入到每个 HTML 页面的 `<head>`。

---

## ⭐ 多站点场景：用同一个 Measurement ID

如果你有多个知识图谱站点在同一个父域名下（比如 `bezos.feima.ai`、`musk.feima.ai`、`munger.feima.ai`），**强烈建议三个站用同一个 Measurement ID**，而不是给每个站分配一个。

### 为什么？

GA4 的默认行为有一个坑：**同一个用户在不同 Measurement ID 之间会被算作不同用户**，即使这三个 ID 在同一个 GA property 下。

具体场景：
- 小明访问 `bezos.feima.ai`（用 ID_A）→ 在 ID_A 的报表里是 1 个用户
- 小明接着访问 `musk.feima.ai`（用 ID_B）→ 在 ID_B 的报表里**又**是 1 个新用户
- 结果：报表显示 2 个用户、2 次会话，而你其实希望看到"同一个用户先看了贝佐斯再看马斯克"

### 正确做法

所有站点**共用同一个 Measurement ID**。因为：
- `_ga` cookie 默认设置在父域 `.feima.ai`，所有子站共享同一个 client_id
- 同一个 ID 接收所有流量，GA4 自然能把跨站行为识别成一个用户
- 想分开看每个站的数据时，在报表里加 `hostname` 作为辅助维度就行

这个决定在项目开始时就定下来最好。GA4 后台创建第一个数据流时，给它起个通用的名字（比如 "feima.ai 集群"），然后所有站都填这一个 ID。

---

## GA4 里怎么区分多个站

共用 ID 之后，在 GA4 报表里区分站点的方法：

1. **报告 → 互动 → 网页和屏幕**
2. 点"加号"添加辅助维度 → 选"主机名"（hostname）
3. 就能看到 `bezos.feima.ai` 和 `musk.feima.ai` 各自的访问量

也可以创建 **受众群体**（Audience）或 **段**（Segment）基于 hostname 来做更细的分析。

---

## 什么时候才应该用独立 ID

只有当两个站**真的完全不是同一个品牌/用户群**时才应该分开。例如：
- A 站是给英文用户看的产品介绍，B 站是给中文用户看的博客 → 分开
- A 站是 B2B 工具，B 站是 C 端游戏 → 分开

对知识图谱矩阵这种场景，几乎永远应该用同一个 ID。

---

## 跨域追踪（Cross-domain tracking）

如果你的站点跨越不同的**根域名**（比如 `bezos.com` 和 `musk.net`），共享 cookie 不管用，需要启用 GA4 的"跨域衡量"：

1. GA4 管理 → 数据流 → 点进去 → 配置跨网域
2. 列出所有要"算作同一个用户"的域名

但这只对**链接点击跳转**的情况有效（GA 自动给链接加 `_gl` 参数传递 client_id）。用户直接打开另一个站就不会被追踪到。

**知识图谱矩阵通常不需要这个功能**——因为一般都共享一个父域（`*.feima.ai`），cookie 自动共享。

---

## 相互导流：在首页加交叉链接

做完 GA 配置后，建议在每个站的首页右上角加一个"姊妹站"链接，方便用户在两个知识库之间跳转：

- 贝佐斯站 → "去看看马斯克知识库 →"
- 马斯克站 → "去看看贝佐斯知识库 →"

这个链接的效果：
1. **导流**：看完一个站的用户有 20-30% 会点进另一个站
2. **GA 加分**：因为共用同一个 Measurement ID，跨站点击被 GA 识别成"同一用户同一 session"，用户旅程完整保留
3. **数据好看**：GA 报表里能看到完整的"访问两个站"的用户路径

build_site.py 模板里已经预置了 `.sister-link` 的 CSS 样式，你只需要在 `build_homepage()` 的 `.fav-wrap` 区域加一个 `<a class="sister-link">` 链接即可。参考马斯克/贝佐斯项目的实现。

---

## 避坑小贴士

### 坑 1：广告拦截器会拦 gtag.js

很多浏览器有 uBlock、AdGuard、Privacy Badger 等扩展，会屏蔽 `googletagmanager.com`。测试 GA 是否生效时：
- 用无痕窗口 + 关闭扩展
- 或用手机浏览器
- 或用纯净环境的新建用户

### 坑 2：Referrer-Policy 可能阻止跨站 referer 传递

如果你开启了严格的 Referrer-Policy（比如 `no-referrer`），跨站用户的来源信息会丢失。Caddy 默认不设这个，一般没事，但值得注意。

### 坑 3：GA4 实时报告有延迟

数据不是秒级的——有时候要等 30 秒才显示。别以为没生效就反复重装代码。

### 坑 4：填错 Measurement ID 前缀

GA4 的 ID 是 `G-XXXX` 开头，GA Universal（老版本）是 `UA-XXXX` 开头。现在只有 GA4 了，但偶尔还会看到老的 UA 代码样本被贴错。统一用 `G-XXX` 格式。

---

## 示例：feima.ai 矩阵的做法

现在 `bezos.feima.ai` 和 `musk.feima.ai` 两个站都用同一个 ID：

```
GA_MEASUREMENT_ID = "G-WLE88B2LL3"
```

报表里筛 hostname 就能看到：
- `bezos.feima.ai` 的访问量
- `musk.feima.ai` 的访问量
- 同时能看到"有多少用户同时访问了两个站"这种跨站行为

下一个站（比如 `munger.feima.ai`）直接复用这个 ID，不需要新建数据流。
