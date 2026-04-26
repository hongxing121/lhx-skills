# 部署清单

完整的部署流程，包含 SSH、文件上传、Caddy 配置、证书签发、验证。

---

## 前置条件

- 服务器：已经部署的 Ubuntu 主机（贝佐斯/马斯克项目用的是 AWS EC2）
- SSH 密钥：默认在 `~/aws/lhx_key2.pem`，用户名 `ubuntu`
- 公网 IP：**`18.191.150.68`**（贝佐斯/马斯克所在的机器，feima.ai 子域名都指向这里）
- 服务器已安装 Caddy（用作 HTTPS 反向代理 / 静态文件服务器）
- 子域名 DNS A 记录已指向公网 IP

---

## 阶段 1：服务器目录准备

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 \
  "sudo mkdir -p /var/www/<人名> && sudo chown ubuntu:ubuntu /var/www/<人名>"
```

> 临时把 owner 改成 `ubuntu` 是为了等下能用 `cp` 部署。最终会改回 `www-data`。

---

## 阶段 2：本地打包

```bash
cd /Users/hongxing/project/webchat/<人名>-site

# ⚠️ 必须先删 macOS 元数据文件，否则服务器上会出现重复的 ._* 文件
find . -name '._*' -delete

# tar 时再 exclude 一次防止漏网
tar czf /tmp/<人名>-site.tar.gz --exclude='._*' .
```

---

## 阶段 3：上传

```bash
scp -i ~/aws/lhx_key2.pem /tmp/<人名>-site.tar.gz ubuntu@18.191.150.68:/tmp/
```

> **不要直接 `scp -r <目录>`**——scp 对中文文件名有时候会丢文件。永远用 tar 打包再传。

---

## 阶段 4：服务器解包 + 部署

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 "
  rm -rf /tmp/<人名>-update
  mkdir -p /tmp/<人名>-update
  cd /tmp/<人名>-update && tar xzf /tmp/<人名>-site.tar.gz 2>/dev/null

  sudo rm -rf /var/www/<人名>/*
  sudo cp -r /tmp/<人名>-update/* /var/www/<人名>/

  # 服务器上再删一次 ._* 文件防止漏网
  sudo find /var/www/<人名>/ -name '._*' -delete

  # 改回 www-data 所有者
  sudo chown -R www-data:www-data /var/www/<人名>/

  rm /tmp/<人名>-site.tar.gz

  # 验证文件数符合预期
  find /var/www/<人名>/ -name '*.html' -type f | wc -l
  echo deployed
"
```

期望看到的输出是 HTML 文件总数（一般 60-100 个）和 `deployed`。

---

## 阶段 5：Caddy 配置

### 编辑 Caddyfile

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 'cat /etc/caddy/Caddyfile'
```

把下面这一段追加进去（替换 `<人名>` 和 `<子域名>`）：

```
<子域名>.feima.ai {
    root * /var/www/<人名>
    file_server
    encode gzip
    try_files {path} {path}.html {path}/index.html
    log {
        output file /var/log/caddy/<人名>-access.log
        format console
    }
}
```

完整的写入命令（注意 heredoc 转义）：

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 'sudo tee -a /etc/caddy/Caddyfile > /dev/null << '"'"'EOF'"'"'

<子域名>.feima.ai {
    root * /var/www/<人名>
    file_server
    encode gzip
    try_files {path} {path}.html {path}/index.html
    log {
        output file /var/log/caddy/<人名>-access.log
        format console
    }
}
EOF
echo "Caddyfile updated"'
```

### 重启 Caddy（不是 reload）

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 "sudo systemctl restart caddy && echo restarted"
```

> 必须 `restart` 不能 `reload`——之前用 reload 的话，Caddy 已经进入了证书申请的退避状态，reload 不会立即重试。

---

## 阶段 6：证书签发验证

```bash
sleep 12
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 \
  "sudo journalctl -u caddy --no-pager -n 15 --since '1 minute ago' | grep -E 'certificate|success|error'"
```

期望看到的关键行：

```
{"level":"info","msg":"certificate obtained successfully","identifier":"<子域名>.feima.ai"}
```

如果看到 `error` 或 `retry`：
- DNS 没生效 → `dig <子域名> @8.8.8.8 +short` 检查
- DNS 指向错了 → 必须是公网 IP `18.191.150.68`，不是 `198.18.x.x`
- 退避中 → 再 `sudo systemctl restart caddy` 一次，再等

---

## 阶段 7：上线验证

### 访问首页

```bash
curl -sI https://<子域名>.feima.ai/ | head -5
```

期望：`HTTP/2 200`

### 抽查内页

```bash
# 概念页（注意 URL 编码中文）
curl -s -o /dev/null -w '%{http_code}' \
  "https://<子域名>.feima.ai/concepts/$(python3 -c 'import urllib.parse;print(urllib.parse.quote("飞轮效应"))').html"
echo

# 产品页
curl -s -o /dev/null -w '%{http_code}' \
  "https://<子域名>.feima.ai/companies/Tesla.html"
echo
```

期望：每个都返回 `200`

### 浏览器人工抽查

打开 `https://<子域名>.feima.ai/`，验证：

- [ ] 首页 hero、stats、nav cards 显示正常
- [ ] 左侧导航能折叠展开
- [ ] favicon 是新人物的字母（不是上一个项目的）
- [ ] 任意点开一个概念页，右侧有"链接到本页"反向链接面板
- [ ] 点击 wikilink 能跳转到其他卡片
- [ ] 移动端响应式正常（缩窄浏览器窗口测试）

---

## 故障排除

### "ERR_TUNNEL_CONNECTION_FAILED"

不是服务器的问题——是用户本地代理软件（Surge、Clash 等）的问题。让用户：
1. 关掉代理后刷新
2. 或者在代理软件里把 `<子域名>.feima.ai` 加入直连规则
3. 或者用手机 4G 测试

### 服务器上 HTML 数量异常翻倍

`._*` 元数据文件没清干净。运行：
```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 \
  "sudo find /var/www/<人名>/ -name '._*' -delete"
```

### 证书一直签不下来

1. 先确认 DNS 正确：`dig <子域名> @8.8.8.8 +short` 必须返回 `18.191.150.68`
2. 重启 Caddy：`sudo systemctl restart caddy`
3. 等 30 秒
4. 看 journalctl：`sudo journalctl -u caddy --no-pager -n 30`

如果还是不行，可能是 Let's Encrypt 的速率限制——同一个域名 1 周内不能申请超过 5 次失败。这种情况只能等。

### 用户访问 SSL 错误

通常是上面 #1 的代理问题，但也可能是 Caddy 还在用 staging 证书（受信任根不一样）。检查：

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 \
  "sudo journalctl -u caddy | grep 'acme-staging' | tail"
```

如果输出非空，说明 Caddy 用的是测试 CA。需要清掉证书目录后 restart：

```bash
ssh -i ~/aws/lhx_key2.pem ubuntu@18.191.150.68 \
  "sudo rm -rf /var/lib/caddy/.local/share/caddy/certificates/acme-staging-v02.api.letsencrypt.org-directory && sudo systemctl restart caddy"
```

---

## 完整一键部署脚本

`templates/deploy.sh` 把上面所有步骤打包成一个脚本。用法：

```bash
cd ~/.claude/skills/lhx-knowledge-graph/templates
./deploy.sh <人名> <子域名> <site-dir>
# 例：
./deploy.sh musk musk /Users/hongxing/project/webchat/musk-site
```

---

## 子域名命名约定

历史项目用过的子域名：

| 项目 | 子域名 | 目录 |
|------|--------|------|
| 贝佐斯 | `bezos.feima.ai` | `/var/www/bezos` |
| 马斯克 | `musk.feima.ai` | `/var/www/musk` |
| 亚马逊 listing 优化器 | `amazon.feima.ai` | `localhost:3000`（不是静态站） |

新项目建议用 **英文小写名**作为子域名前缀和目录名（比如 `munger.feima.ai` / `inamori.feima.ai`）。
