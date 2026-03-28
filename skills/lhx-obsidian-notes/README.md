# Obsidian Notes Skill

一个为 OpenClaw 设计的 Obsidian 笔记管理 Skill，让你可以通过 OpenClaw 轻松创建、编辑、查询和管理 Obsidian 笔记。

## 功能特性

- 📝 **创建笔记** - 快速创建新笔记
- 📖 **读取笔记** - 查看笔记内容
- ✏️ **编辑笔记** - 修改现有笔记
- 🗑️ **删除笔记** - 删除不需要的笔记
- 📋 **列出笔记** - 查看所有笔记
- 🔍 **搜索笔记** - 按关键词搜索笔记
- 🌐 **中文支持** - 完全支持中文标题和内容
- 📁 **文件夹支持** - 支持在子文件夹中组织笔记

## 安装

### 前置要求

- OpenClaw 已安装
- Node.js 环境

### 安装步骤

1. 克隆或下载此仓库到 OpenClaw 的 Skills 目录：

```bash
cd ~/.openclaw/workspace/skills
git clone https://github.com/hongxing121/obsidian-notes-skill.git obsidian-notes
```

2. 重启 OpenClaw：

```bash
pkill -f "openclaw-gateway"
sleep 3
openclaw gateway --force
```

3. 验证安装：

```bash
openclaw skills list | grep obsidian-notes
```

## 使用方法

### 创建笔记

```bash
obsidian-notes create "笔记标题" "笔记内容" [文件夹]
```

示例：
```bash
obsidian-notes create "今日感悟" "今天是周六，起得很早，感觉时间比往常多了一点点。"
```

### 读取笔记

```bash
obsidian-notes read "笔记标题" [文件夹]
```

### 编辑笔记

```bash
obsidian-notes edit "笔记标题" "新内容" [文件夹]
```

### 列出笔记

```bash
obsidian-notes list [文件夹]
```

### 删除笔记

```bash
obsidian-notes delete "笔记标题" [文件夹]
```

### 搜索笔记

```bash
obsidian-notes search "关键词" [文件夹]
```

## 在 OpenClaw 中使用

创建 Skill 后，你可以在 OpenClaw 中直接使用自然语言：

- "帮我创建一个笔记叫'项目计划'"
- "我想写下今天的想法"
- "把这个保存到 Obsidian"
- "搜索包含'周六'的笔记"
- "列出我所有的笔记"

## 配置

Vault 位置默认为：`~/Documents/Obsidian Vault`

如需修改，编辑 `obsidian-cli.js` 中的 `vaultPath` 变量。

## 文件结构

```
obsidian-notes/
├── SKILL.md              # Skill 文档和元数据
├── _meta.json            # Skill 元数据
├── obsidian-cli.js       # 主要脚本
└── README.md             # 本文件
```

## 技术细节

- **语言**: JavaScript (Node.js)
- **依赖**: 无外部依赖
- **兼容性**: macOS, Linux, Windows (WSL)

## 常见问题

### Q: 如何修改 Vault 位置？
A: 编辑 `obsidian-cli.js` 文件，修改 `expandUser('~/Documents/Obsidian Vault')` 为你的 Vault 路径。

### Q: 支持哪些文件格式？
A: 目前仅支持 Markdown (.md) 文件。

### Q: 可以在子文件夹中创建笔记吗？
A: 可以，使用 folder 参数指定路径，例如：
```bash
obsidian-notes create "笔记" "内容" "2026/03"
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 作者

Created with ❤️ for OpenClaw

## 相关链接

- [OpenClaw 文档](https://docs.openclaw.ai)
- [Obsidian 官网](https://obsidian.md)
- [ClawHub](https://clawhub.ai)
