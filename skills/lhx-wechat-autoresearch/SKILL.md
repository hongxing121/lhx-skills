---
name: wechat-autoresearch
description: >
  AutoResearch: Karpathy Loop for article optimization. Autonomously iterates on a markdown article using LLM-as-judge scoring. Each round: AI improves the article → LLM scores it → keep if better, revert if worse → repeat.
  Use when user wants to: "autoresearch the article", "optimize article with loop", "run autoresearch", "/autoresearch", improve article quality automatically overnight.
---

# AutoResearch — Karpathy Loop for Articles

Inspired by Karpathy's autoresearch: human defines the rules (program.md), tokens run the trial-and-error loop.

## Usage

```bash
# Basic (10 iterations, default program)
/autoresearch article.md

# With custom program and iteration count
/autoresearch article.md --program program.md --iterations 20
```

## How It Works

```
Initial Score → [Loop N times] → Save Best Version + Report
                    ↓
         AI improves article (one focused change)
                    ↓
         LLM judge scores new version (5 dimensions)
                    ↓
         Score improved? → Keep  |  No? → Revert
```

## Scoring Dimensions (0-20 each, total 100)

| Dimension | 维度 | What it measures |
|-----------|------|------------------|
| title | 标题吸引力 | Click-worthiness of the title |
| hook | 开篇钩子 | Does the opening grab attention? |
| readability | 可读性 | Flow, structure, ease of reading |
| clarity | 核心信息清晰度 | Is the main point clear and memorable? |
| virality | 传播潜力 | Would readers share this? |

## Running

```bash
SKILL_DIR="$HOME/.claude/skills/autoresearch"
npx -y bun ${SKILL_DIR}/scripts/main.ts <article.md> [--program <program.md>] [--iterations <n>]
```

## Output Files

| File | Description |
|------|-------------|
| `{name}-optimized.md` | Best version found |
| `{name}-autoresearch-report.md` | Iteration log with scores |

## Workflow for Agent

1. Check if article path is provided; if not, ask user
2. Check if program.md exists; if not, use built-in default
3. Run the script and stream output to user
4. When done, show the score improvement summary
5. Ask if user wants to publish the optimized version
