# lhx-sync-skills

Sync Claude Code skills bidirectionally with GitHub.

- `lhx-*` skills → `hongxing121/lhx-skills` (public)
- All other skills → `hongxing121/lhx-skills-private` (private)

## Usage

```
/lhx-sync-skills          # 双向同步（默认）
/lhx-sync-skills push     # 只推送本地 → GitHub
/lhx-sync-skills pull     # 只拉取 GitHub → 本地
/lhx-sync-skills clean    # 拉取 + 删除本地多余的 skill（与远端完全对齐）
/lhx-sync-skills dry-run  # 预览变更，不执行
```

## Instructions

Check the argument the user provided (if any):

- No argument or "sync": run `~/.claude/skills-repos/sync-skills.sh`
- "push": run `~/.claude/skills-repos/sync-skills.sh --push-only`
- "pull": run `~/.claude/skills-repos/sync-skills.sh --pull-only`
- "clean": run `~/.claude/skills-repos/sync-skills.sh --clean`
- "dry-run": run `~/.claude/skills-repos/sync-skills.sh --dry-run`

Run the appropriate command and report the output.

## What gets skipped

- Skills installed from Claude Code registry (have `ownerId` in `_meta.json`)
- Skills with embedded `.git` repos (e.g. `gstack` — use `/gstack-upgrade` instead)
- `node_modules/`, `bin/`, `browse/`, `data/` directories inside skills

## Setup on a new machine

```bash
# 前提：已安装 gh 并登录
brew install gh && gh auth login

# 一条命令完成初始化（目录已存在时自动 pull，否则 clone）
DIR=~/.claude/skills-repos/lhx-skills-private && \
([ -d "$DIR/.git" ] && git -C "$DIR" pull || \
  git clone https://github.com/hongxing121/lhx-skills-private.git "$DIR") && \
bash "$DIR/sync-skills.sh" --pull-only
```
