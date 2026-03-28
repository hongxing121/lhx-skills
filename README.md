# lhx-skills

我的 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 自定义技能集。

## 技能

| 技能 | 说明 |
|------|------|
| **lhx-amazon-title** | 亚马逊标题 AutoResearch — 通过 Karpathy Loop 自动迭代优化亚马逊美国站产品标题，5 维度评分（合规性、移动端钩子、关键词质量、清晰度、买家点击意愿） |
| **lhx-amazon-bullets** | 亚马逊五点描述 AutoResearch — 通过 Karpathy Loop 自动迭代优化亚马逊美国站产品五点描述，5 维度评分（合规性、利益转化、关键词策略、痛点覆盖、买家转化力） |
| **lhx-article-to-video-script** | 文章转短视频口播文案 — 输入文章链接，自动生成可直接使用的短视频口播脚本，支持微信公众号、X/Twitter 及任意 URL |
| **lhx-shadowsocks** | 一键部署 Shadowsocks — 自动部署 Shadowsocks-libev 到 AWS 或其他 Ubuntu 服务器，支持自定义端口和加密方式 |
| **lhx-obsidian-notes** | Obsidian 笔记管理 — 用自然语言创建、读取、编辑、删除、搜索 Obsidian 笔记，支持中文与多级文件夹 |

## 安装

```bash
git clone https://github.com/hongxing121/lhx-skills.git ~/.claude/plugins/lhx-skills
```

然后重启 Claude Code。

## 本地开发

技能文件位于 `skills/` 目录，每个子目录包含：
- `SKILL.md` — 技能定义与使用说明
- `scripts/` — 执行脚本（如有）
