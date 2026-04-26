#!/usr/bin/env bash
# 一键部署知识图谱站点到 feima.ai 的服务器
# 用法：
#   ./deploy.sh <人名拼音> <子域名> <site-dir>
# 例：
#   ./deploy.sh musk musk /Users/hongxing/project/webchat/musk-site
#   ./deploy.sh bezos bezos /Users/hongxing/project/webchat/bezos-site

set -euo pipefail

# 服务器配置（如果换服务器需要改这里）
SSH_KEY="${SSH_KEY:-$HOME/aws/lhx_key2.pem}"
SSH_USER="${SSH_USER:-ubuntu}"
SSH_HOST="${SSH_HOST:-18.191.150.68}"
SSH_TARGET="${SSH_USER}@${SSH_HOST}"
SSH_OPTS="-i ${SSH_KEY}"

# 参数
NAME="${1:-}"
SUBDOMAIN="${2:-}"
SITE_DIR="${3:-}"

if [[ -z "$NAME" || -z "$SUBDOMAIN" || -z "$SITE_DIR" ]]; then
    echo "用法: $0 <人名拼音> <子域名> <site-dir>"
    echo "例: $0 musk musk /Users/hongxing/project/webchat/musk-site"
    exit 1
fi

if [[ ! -d "$SITE_DIR" ]]; then
    echo "错误: $SITE_DIR 不存在"
    exit 1
fi

echo "==> 1/6 检查 site 目录"
HTML_COUNT=$(find "$SITE_DIR" -name '*.html' -type f | wc -l | tr -d ' ')
echo "    本地 HTML 文件数: $HTML_COUNT"

echo "==> 2/6 清理 macOS 元数据文件"
find "$SITE_DIR" -name '._*' -delete 2>/dev/null || true
find "$SITE_DIR" -name '.DS_Store' -delete 2>/dev/null || true

echo "==> 3/6 服务器目录准备"
ssh ${SSH_OPTS} ${SSH_TARGET} "sudo mkdir -p /var/www/${NAME} && sudo chown ubuntu:ubuntu /var/www/${NAME}"

echo "==> 4/6 打包 + 上传"
TARBALL="/tmp/${NAME}-site.tar.gz"
(cd "$SITE_DIR" && tar czf "$TARBALL" --exclude='._*' --exclude='.DS_Store' .)
scp ${SSH_OPTS} "$TARBALL" "${SSH_TARGET}:/tmp/" >/dev/null

echo "==> 5/6 服务器解包 + 部署"
ssh ${SSH_OPTS} ${SSH_TARGET} bash -s -- "${NAME}" <<'REMOTE'
NAME="$1"
rm -rf /tmp/${NAME}-update
mkdir -p /tmp/${NAME}-update
cd /tmp/${NAME}-update
tar xzf /tmp/${NAME}-site.tar.gz 2>/dev/null
sudo rm -rf /var/www/${NAME}/*
sudo cp -r /tmp/${NAME}-update/* /var/www/${NAME}/
sudo find /var/www/${NAME}/ -name '._*' -delete
sudo chown -R www-data:www-data /var/www/${NAME}/
rm /tmp/${NAME}-site.tar.gz

DEPLOYED_COUNT=$(find /var/www/${NAME}/ -name '*.html' -type f | wc -l | tr -d ' ')
echo "    服务器 HTML 文件数: $DEPLOYED_COUNT"
REMOTE

echo "==> 6/6 检查 Caddyfile 是否已包含 ${SUBDOMAIN}.feima.ai"
if ssh ${SSH_OPTS} ${SSH_TARGET} "grep -q '${SUBDOMAIN}\.feima\.ai' /etc/caddy/Caddyfile"; then
    echo "    Caddyfile 已配置，跳过"
else
    echo "    Caddyfile 未配置，添加站点块..."
    ssh ${SSH_OPTS} ${SSH_TARGET} "sudo tee -a /etc/caddy/Caddyfile > /dev/null << 'EOF'

${SUBDOMAIN}.feima.ai {
    root * /var/www/${NAME}
    file_server
    encode gzip
    try_files {path} {path}.html {path}/index.html
    log {
        output file /var/log/caddy/${NAME}-access.log
        format console
    }
}
EOF"
    echo "    Caddyfile 已更新"
    echo "    正在重启 Caddy..."
    ssh ${SSH_OPTS} ${SSH_TARGET} "sudo systemctl restart caddy"
    sleep 12
    echo "    检查证书签发..."
    ssh ${SSH_OPTS} ${SSH_TARGET} "sudo journalctl -u caddy --no-pager -n 15 --since '1 minute ago' | grep -E 'certificate|success|error' | tail -5"
fi

echo
echo "✓ 部署完成！"
echo "  访问 https://${SUBDOMAIN}.feima.ai/"
echo
echo "本地清理:"
rm -f "$TARBALL"
