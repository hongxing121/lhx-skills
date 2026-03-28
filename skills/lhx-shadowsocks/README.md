# Shadowsocks-libev 一键部署 Skill

一个 Claude Code skill，用于快速部署 Shadowsocks-libev VPN 服务到 AWS 或其他 Ubuntu 服务器。

## 功能特性

- ✅ 一键自动部署 Shadowsocks-libev
- ✅ 支持自定义密码、端口、加密方式
- ✅ 自动验证 SSH 连接
- ✅ 自动配置 DNS 服务器
- ✅ 支持 Shadowrocket 连接
- ✅ 部署完成后显示配置信息

## 快速开始（非技术人员）

如果你是第一次使用，请按照以下步骤操作：

### 第一步：注册 AWS 账户并创建免费实例

1. 访问 [AWS 官网](https://aws.amazon.com/) 注册账户
2. 登录 [AWS 管理控制台](https://console.aws.amazon.com/)
3. 创建 EC2 实例：
   - 选择 **Ubuntu 20.04 LTS** 或更新版本
   - 选择 **t2.micro** 类型（免费套餐）
   - 创建或下载 SSH 密钥对（保存好密钥文件）
   - 记下实例的公网 IP 地址

### 第二步：安装 Skill

在终端中运行：

```bash
git clone https://github.com/hongxing121/shadowsocks-skill.git ~/.claude/skills/deploy-shadowsocks
```

### 第三步：部署 Shadowsocks

在 Claude Code 中告诉我：

```
帮我在 [你的实例IP] 上部署 Shadowsocks，密钥在 [你的密钥路径]，密码是 [你的密码]
```

例如：
```
帮我在 54.123.45.67 上部署 Shadowsocks，密钥在 ~/.ssh/aws.pem，密码是 MyPassword123
```

### 第四步：配置安全组

1. 在 [AWS 管理控制台](https://console.aws.amazon.com/) 中找到你的实例
2. 点击安全组
3. 添加入站规则：
   - 规则 1：协议 TCP，端口 8388
   - 规则 2：协议 UDP，端口 8388

### 第五步：在 Shadowrocket 中使用

1. 打开 Shadowrocket
2. 添加新服务器，使用部署完成后显示的配置信息
3. 连接并测试

---

## 安装（技术人员）

### 方式一：使用 git clone（推荐）

```bash
git clone https://github.com/hongxing121/shadowsocks-skill.git ~/.claude/skills/deploy-shadowsocks
```

### 方式二：手动下载

1. 下载 [Release v1.0.0-release](https://github.com/hongxing121/shadowsocks-skill/releases/tag/v1.0.0-release)
2. 解压到 `~/.claude/skills/deploy-shadowsocks`

安装完成后，在 Claude Code 中就可以使用 `/deploy-shadowsocks` 命令了。

## 使用方法

### 基础用法

在 Claude Code 中告诉我：

```
帮我在 18.219.179.24 上部署 Shadowsocks，密钥在 ~/.ssh/aws.pem，密码是 MyPassword123
```

### 使用 Skill 命令

```bash
/deploy-shadowsocks -k ~/.ssh/aws.pem -H 18.219.179.24 -p "MyPassword123"
```

### 参数说明

| 参数 | 简写 | 说明 | 必需 | 默认值 |
|------|------|------|------|--------|
| `--key` | `-k` | SSH 私钥路径 | ✓ | - |
| `--host` | `-H` | 服务器 IP 或域名 | ✓ | - |
| `--password` | `-p` | Shadowsocks 密码 | ✓ | - |
| `--user` | `-u` | SSH 用户名 | ✗ | ubuntu |
| `--port` | - | Shadowsocks 端口 | ✗ | 8388 |
| `--method` | - | 加密方式 | ✗ | aes-256-gcm |

### 支持的加密方式

- `aes-256-gcm` (推荐)
- `chacha20-ietf-poly1305`
- `aes-128-gcm`
- `aes-192-gcm`

## 使用示例

### 示例 1：基础部署

```
帮我在 54.123.45.67 上部署 Shadowsocks，密钥在 ~/.ssh/aws.pem，密码是 SecurePassword123
```

### 示例 2：自定义端口和加密

```
/deploy-shadowsocks -k ~/.ssh/key.pem -H 54.123.45.67 -p "Password456" --port 9999 --method chacha20-ietf-poly1305
```

### 示例 3：使用非 ubuntu 用户

```
/deploy-shadowsocks -k ~/.ssh/key.pem -H 54.123.45.67 -p "Password789" --user ec2-user
```

## 部署流程

1. **验证参数** - 检查 SSH 密钥、密码长度、端口范围
2. **测试连接** - 确保能连接到服务器
3. **上传脚本** - 将部署脚本上传到服务器
4. **执行部署** - 在服务器上自动安装和配置
5. **显示信息** - 显示 Shadowrocket 配置信息

## 部署后的步骤

### 1. 配置 AWS 安全组

在 AWS 控制台中为该实例的安全组添加入站规则：

- **规则 1**: 协议 TCP，端口 8388，来源 0.0.0.0/0
- **规则 2**: 协议 UDP，端口 8388，来源 0.0.0.0/0

### 2. 在 Shadowrocket 中添加服务器

使用部署完成后显示的配置信息：
- 服务器：显示的 IP 地址
- 端口：8388（或你指定的端口）
- 密码：你设置的密码
- 加密：aes-256-gcm（或你选择的方式）
- 协议：Shadowsocks

### 3. 测试连接

在 Shadowrocket 中连接并测试访问外网。

## 常用命令

部署完成后，你可能需要的命令：

```bash
# 查看服务状态
ssh -i ~/.ssh/key.pem ubuntu@18.219.179.24 'sudo systemctl status shadowsocks-libev'

# 查看实时日志
ssh -i ~/.ssh/key.pem ubuntu@18.219.179.24 'sudo journalctl -u shadowsocks-libev -f'

# 重启服务
ssh -i ~/.ssh/key.pem ubuntu@18.219.179.24 'sudo systemctl restart shadowsocks-libev'

# 修改配置
ssh -i ~/.ssh/key.pem ubuntu@18.219.179.24 'sudo nano /etc/shadowsocks-libev/config.json'
```

## 支持的系统

- Ubuntu 20.04 LTS 及更新版本
- 其他 Debian 系统（可能需要调整）

## 注意事项

- **密码安全**: 使用强密码，至少 8 个字符
- **安全组限制**: 建议在 AWS 安全组中限制来源 IP，而不是使用 0.0.0.0/0
- **定期更新**: 定期更新系统和 shadowsocks-libev
- **监控日志**: 定期检查日志，查看异常连接

## 故障排查

### SSH 连接失败

检查：
- SSH 密钥路径是否正确
- 服务器 IP 是否正确
- SSH 用户名是否正确（通常 AWS Ubuntu 是 ubuntu，Amazon Linux 是 ec2-user）
- 防火墙是否允许 SSH 连接

### 部署失败

查看错误信息，常见原因：
- 系统包管理器问题
- 磁盘空间不足
- 权限问题

## 文件说明

- `SKILL.md` - Skill 定义和详细工作流程
- `setup-shadowsocks.sh` - Ubuntu 系统部署脚本
- `README.md` - 本文件

## 版本

- **v1.0.0-release** - 初始版本

## 许可证

MIT

## 作者

hongxing121

## 反馈

如有问题或建议，欢迎提交 Issue 或 Pull Request。
