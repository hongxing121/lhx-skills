# lhx-skills

我的 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 自定义技能集。

## 技能

| 技能 | 说明 |
|------|------|
| **lhx-amazon-title** | 亚马逊标题 AutoResearch — 通过 Karpathy Loop 自动迭代优化亚马逊美国站产品标题，5 维度评分（合规性、移动端钩子、关键词质量、清晰度、买家点击意愿） |
| **lhx-amazon-bullets** | 亚马逊五点描述 AutoResearch — 通过 Karpathy Loop 自动迭代优化亚马逊美国站产品五点描述，5 维度评分（合规性、利益转化、关键词策略、痛点覆盖、买家转化力） |
| **lhx-article-to-video-script** | 文章转短视频口播文案 — 输入文章链接，自动生成可直接使用的短视频口播脚本，支持微信公众号、X/Twitter 及任意 URL |
| **lhx-fuban-review** | 结构化复盘工具 — 通过追问式对话引导完成五步复盘法，最终生成结构化 Markdown 复盘报告 |
| **lhx-post-to-channels** | 自动发布视频号 — 自动上传并发布视频到微信视频号，支持标题、简介、话题标签、合集、声明原创、自动发表 |
| **lhx-shadowsocks** | 一键部署 Shadowsocks — 自动部署 Shadowsocks-libev 到 AWS 或其他 Ubuntu 服务器，支持自定义端口和加密方式 |
| **lhx-slides-presenter** | 文章转幻灯片讲解视频 — 将文章转化为带解说的幻灯片视频，每页显示信息图或文字，右下角头像讲解动效，配合 TTS 语音解说 |
| **lhx-sync-skills** | Skills 双向同步 — 将本地 Claude Code skills 与 GitHub 仓库双向同步，支持 push / pull / clean / dry-run 模式 |
| **lhx-wechat-autoresearch** | 公众号文章 AutoResearch — 通过 Karpathy Loop 自动迭代优化 Markdown 文章，LLM 评分驱动，每轮改进后评分提升则保留，否则回滚 |

## 安装

```bash
git clone https://github.com/hongxing121/lhx-skills.git ~/.claude/skills/lhx-skills
```

然后重启 Claude Code。

## 本地开发

技能文件位于 `skills/` 目录，每个子目录包含：
- `SKILL.md` — 技能定义与使用说明
- `scripts/` — 执行脚本（如有）
