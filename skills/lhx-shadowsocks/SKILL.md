---
name: deploy-shadowsocks
description: 一键部署 Shadowsocks-libev VPN 服务到 AWS 或其他 Ubuntu 服务器。用户只需提供 SSH 密钥路径、服务器 IP 和密码，脚本自动完成所有配置。支持自定义端口和加密方式。
---

# Shadowsocks-libev 一键部署

自动化部署 Shadowsocks-libev VPN 服务到 Ubuntu 服务器，支持 Shadowrocket 连接。

## 使用场景

- 在 AWS EC2 实例上快速部署 VPN
- 在其他 Ubuntu 服务器上部署 Shadowsocks
- 批量部署到多台服务器
- 快速配置和验证服务

## 参数说明

用户调用时需要提供以下参数：

| 参数 | 简写 | 说明 | 必需 | 默认值 |
|------|------|------|------|--------|
| `--key` | `-k` | SSH 私钥路径 | ✓ | - |
| `--host` | `-H` | 服务器 IP 或域名 | ✓ | - |
| `--password` | `-p` | Shadowsocks 密码 | ✓ | - |
| `--user` | `-u` | SSH 用户名 | ✗ | ubuntu |
| `--port` | - | Shadowsocks 端口 | ✗ | 8388 |
| `--method` | - | 加密方式 | ✗ | aes-256-gcm |

## 支持的加密方式

- `aes-256-gcm` (推荐)
- `chacha20-ietf-poly1305`
- `aes-128-gcm`
- `aes-192-gcm`

## 工作流程

### Step 1: 收集用户信息

如果用户没有提供完整的参数，使用 `AskUserQuestion` 一次性收集：
- SSH 密钥路径
- 服务器 IP
- Shadowsocks 密码
- （可选）SSH 用户名、端口、加密方式

### Step 2: 验证输入

检查：
- SSH 密钥文件是否存在
- 密码长度是否至少 8 个字符
- 端口是否在 1024-65535 范围内
- 加密方式是否支持

如果验证失败，提示用户并要求重新输入。

### Step 3: 测试 SSH 连接

在执行部署前，先测试 SSH 连接是否正常：

```bash
ssh -i {key} -o ConnectTimeout=5 {user}@{host} 'echo OK'
```

如果连接失败，提示用户检查：
- SSH 密钥路径是否正确
- 服务器 IP 是否正确
- SSH 用户名是否正确（通常 AWS 是 ubuntu）
- 防火墙是否允许 SSH 连接

### Step 4: 上传部署脚本

将 `setup-shadowsocks.sh` 脚本上传到服务器：

```bash
scp -i {key} ~/.claude/skills/deploy-shadowsocks/setup-shadowsocks.sh {user}@{host}:~/
```

### Step 5: 执行部署

在服务器上执行部署脚本：

```bash
ssh -i {key} {user}@{host} 'chmod +x ~/setup-shadowsocks.sh && ~/setup-shadowsocks.sh "{password}" {port} "{method}"'
```

脚本会自动：
- 更新系统包
- 安装 shadowsocks-libev
- 创建配置文件
- 配置 DNS 服务器
- 启动服务
- 验证服务状态

### Step 6: 显示部署摘要

部署完成后，显示：

```
=== 部署完成 ===

Shadowrocket 配置信息：
  服务器：{server_ip}
  端口：{port}
  密码：{password}
  加密：{method}
  协议：Shadowsocks

AWS 安全组设置：
  添加入站规则 - TCP 端口 {port}
  添加入站规则 - UDP 端口 {port}
  来源：0.0.0.0/0 (或你的 IP)

后续步骤：
  1. 在 AWS 安全组中添加入站规则
  2. 等待 1-2 分钟规则生效
  3. 在 Shadowrocket 中添加服务器
  4. 测试连接
```

## 使用示例

### 基础用法

```
用户：帮我在 18.219.179.24 上部署 Shadowsocks，密钥在 ~/.ssh/aws.pem，密码是 MyPassword123
```

我会：
1. 验证密钥文件存在
2. 测试 SSH 连接
3. 上传部署脚本
4. 执行部署
5. 显示配置信息和后续步骤

### 自定义端口和加密

```
用户：用 deploy-shadowsocks，密钥 ~/.ssh/key.pem，服务器 54.123.45.67，密码 SecurePass456，端口 9999，加密用 chacha20-ietf-poly1305
```

我会按照指定的参数部署。

### 简化调用

```
用户：/deploy-shadowsocks
```

我会询问用户提供必要的参数。

## 故障排查

### SSH 连接失败

提示用户：
- 检查 SSH 密钥路径是否正确
- 检查服务器 IP 是否正确
- 检查 SSH 用户名是否正确（通常 AWS 是 ubuntu）
- 确保本地网络允许 SSH 连接

### 部署脚本找不到

提示用户：
- 确保 `setup-shadowsocks.sh` 在 skill 目录中
- 或提供脚本内容让我上传

### 部署失败

显示服务器返回的错误信息，常见原因：
- 系统包管理器问题
- 磁盘空间不足
- 权限问题

## 部署后的步骤

### 1. 配置 AWS 安全组

在 AWS 控制台中为该实例的安全组添加：
- **入站规则 1**: 协议 TCP，端口 {port}，来源 0.0.0.0/0
- **入站规则 2**: 协议 UDP，端口 {port}，来源 0.0.0.0/0

### 2. 在 Shadowrocket 中添加服务器

使用部署完成后显示的配置信息。

### 3. 测试连接

在 Shadowrocket 中连接并测试访问外网。

## 常用后续命令

部署完成后，用户可能需要的命令：

```bash
# 查看服务状态
ssh -i {key} {user}@{host} 'sudo systemctl status shadowsocks-libev'

# 查看实时日志
ssh -i {key} {user}@{host} 'sudo journalctl -u shadowsocks-libev -f'

# 重启服务
ssh -i {key} {user}@{host} 'sudo systemctl restart shadowsocks-libev'

# 修改密码
ssh -i {key} {user}@{host} 'sudo nano /etc/shadowsocks-libev/config.json'
```

## 注意事项

- **密码安全**: 使用强密码，至少 16 个字符，包含大小写字母、数字和特殊字符
- **安全组限制**: 建议在 AWS 安全组中限制来源 IP，而不是使用 0.0.0.0/0
- **定期更新**: 定期更新系统和 shadowsocks-libev
- **监控日志**: 定期检查日志，查看异常连接

## 支持的系统

- Ubuntu 20.04 LTS 及更新版本
- 其他 Debian 系统（可能需要调整）

## 限制

- 仅支持 Ubuntu 系统
- 需要 sudo 权限
- 需要网络连接下载包
