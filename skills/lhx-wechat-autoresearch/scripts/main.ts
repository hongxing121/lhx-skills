import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Score {
  title: number;
  hook: number;
  readability: number;
  clarity: number;
  virality: number;
  total: number;
  feedback: string;
  weakest: string;
}

interface IterationLog {
  iteration: number;
  score: Score;
  action: "initial" | "kept" | "reverted";
  change?: string;
}

// ─── Default program.md ───────────────────────────────────────────────────────

const DEFAULT_PROGRAM = `
# 优化目标：公众号爆款文章

## 核心目标
让这篇文章更容易被转发传播，同时保持内容的真实性和可信度。

## 优化重点（按优先级）
1. 标题和开篇：标题要有反差感或数字冲击力；开头第一段要在3秒内抓住读者
2. 节奏感：段落不要太长，多用短句制造节奏；善用小标题引导阅读
3. 金句提炼：每个章节要有一句可以被截图转发的金句
4. 结尾行动号召：结尾要给读者留下一个清晰的行动或思考

## 约束条件
- 不要改变文章的核心内容和观点
- 不要添加夸大或不实的说法
- 保持中文行文风格，避免翻译腔
- 文章总长度变化不超过±20%
`;

// ─── Run claude -p ────────────────────────────────────────────────────────────

function runClaude(prompt: string, model = "claude-haiku-4-5-20251001"): string {
  // Write prompt to temp file to avoid shell escaping issues
  const tmpFile = `/tmp/autoresearch_prompt_${Date.now()}.txt`;
  fs.writeFileSync(tmpFile, prompt);
  try {
    const result = execSync(
      `claude -p --model ${model} "$(cat ${tmpFile})"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, timeout: 120000 }
    );
    return result.trim();
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

function runClaudeFromFile(promptFile: string, model = "claude-haiku-4-5-20251001"): string {
  const result = execSync(
    `claude -p --model ${model} < "${promptFile}"`,
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, timeout: 120000, shell: "/bin/bash" }
  );
  return result.trim();
}

// ─── Scoring (Haiku — cheap & fast) ──────────────────────────────────────────

async function scoreArticle(article: string, programMd: string): Promise<Score> {
  const prompt = `你是公众号内容评估专家。对文章从5个维度打分（每项0-20分）：
1. title 标题吸引力：是否有数字/悬念/反差？
2. hook 开篇钩子：能否3秒抓住读者？
3. readability 可读性：段落节奏、结构是否清晰？
4. clarity 核心信息清晰度：主要观点是否令人印象深刻？
5. virality 传播潜力：是否有可截图转发的金句？

优化目标参考：${programMd.slice(0, 300)}

文章（前1500字）：
${article.slice(0, 1500)}

只返回JSON，不要任何其他文字：
{"title":0,"hook":0,"readability":0,"clarity":0,"virality":0,"feedback":"最需改进的一点","weakest":"维度名"}`;

  const tmpFile = `/tmp/ar_score_${Date.now()}.txt`;
  fs.writeFileSync(tmpFile, prompt);

  const raw = execSync(
    `claude -p --model claude-haiku-4-5-20251001 < "${tmpFile}"`,
    { encoding: "utf-8", maxBuffer: 1024 * 1024, timeout: 60000, shell: "/bin/bash" }
  ).trim();

  fs.unlinkSync(tmpFile);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`评分解析失败: ${raw.slice(0, 200)}`);
  const s = JSON.parse(jsonMatch[0]);
  s.total = s.title + s.hook + s.readability + s.clarity + s.virality;
  return s;
}

// ─── Improvement (Sonnet — smarter) ──────────────────────────────────────────

async function improveArticle(
  article: string,
  score: Score,
  programMd: string,
  failedAttempts: string[] = []
): Promise<{ change: string; fullArticle: string }> {
  const dimNames: Record<string, string> = {
    title: "标题吸引力", hook: "开篇钩子",
    readability: "可读性", clarity: "核心信息清晰度", virality: "传播潜力",
  };

  const failedSection = failedAttempts.length > 0
    ? `\n⚠️ 以下方向已经试过但评分下降，必须换一个完全不同的角度：\n${failedAttempts.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n`
    : "";

  const prompt = `你是顶级公众号编辑。当前文章评分：
总分 ${score.total}/100，最弱维度：${dimNames[score.weakest] || score.weakest}（${(score as any)[score.weakest]}/20）
反馈：${score.feedback}
${failedSection}
优化目标：${programMd.slice(0, 200)}

任务：针对最弱维度做一处精准改进，保持原文核心内容不变。如有失败历史，必须选择与之前完全不同的段落和方法。

严格按以下格式返回（不要任何其他内容）：
<change>一句话说明改了什么以及为什么</change>
<search>原文中需要替换的完整原始文本片段（10-150字，必须和原文完全一致）</search>
<replace>替换后的新文本</replace>

原文：
${article}`;

  const tmpFile = `/tmp/ar_improve_${Date.now()}.txt`;
  fs.writeFileSync(tmpFile, prompt);

  const raw = execSync(
    `claude -p --model claude-haiku-4-5-20251001 < "${tmpFile}"`,
    { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024, timeout: 90000, shell: "/bin/bash" }
  ).trim();

  fs.unlinkSync(tmpFile);

  const changeMatch = raw.match(/<change>([\s\S]*?)<\/change>/);
  const searchMatch = raw.match(/<search>([\s\S]*?)<\/search>/);
  const replaceMatch = raw.match(/<replace>([\s\S]*?)<\/replace>/);

  if (!changeMatch || !searchMatch || !replaceMatch) throw new Error(`改进解析失败`);

  const change = changeMatch[1].trim();
  const search = searchMatch[1].trim();
  const replace = replaceMatch[1].trim();

  if (search && replace && article.includes(search)) {
    return { change, fullArticle: article.replace(search, replace) };
  }

  throw new Error(`patch未能匹配原文，跳过本轮`);
}

// ─── Report ───────────────────────────────────────────────────────────────────

function generateReport(logs: IterationLog[], finalScore: Score, articlePath: string): string {
  const initial = logs[0].score;
  const kept = logs.filter(l => l.action === "kept").length;
  const reverted = logs.filter(l => l.action === "reverted").length;
  const totalDiff = finalScore.total - initial.total;

  const dims = ["title","hook","readability","clarity","virality"];
  const dimNames: Record<string,string> = {
    title:"标题吸引力", hook:"开篇钩子",
    readability:"可读性", clarity:"核心信息清晰度", virality:"传播潜力"
  };

  let r = `# AutoResearch 迭代报告\n\n`;
  r += `**文章**: ${path.basename(articlePath)}\n`;
  r += `**迭代轮数**: ${logs.length - 1} | **保留**: ${kept} ✅ | **回滚**: ${reverted} ↩️\n\n`;
  r += `## 得分对比\n\n| 维度 | 初始 | 最终 | 变化 |\n|---|---|---|---|\n`;

  for (const k of dims) {
    const b = (initial as any)[k], a = (finalScore as any)[k];
    const d = a - b;
    r += `| ${dimNames[k]} | ${b}/20 | ${a}/20 | ${d > 0 ? `+${d} ⬆️` : d < 0 ? `${d} ⬇️` : "→"} |\n`;
  }
  r += `| **总分** | **${initial.total}/100** | **${finalScore.total}/100** | **${totalDiff > 0 ? "+" : ""}${totalDiff}** |\n\n`;

  r += `## 迭代详情\n\n`;
  for (const log of logs) {
    if (log.iteration === 0) {
      r += `### 初始版本 — ${log.score.total}/100\n反馈：${log.score.feedback}\n\n`;
    } else {
      const prev = logs[log.iteration - 1]?.score.total || 0;
      const diff = log.score.total - prev;
      const emoji = log.action === "kept" ? "✅ 保留" : "↩️ 回滚";
      r += `### 第 ${log.iteration} 轮 — ${emoji} (${diff > 0 ? "+" : ""}${diff}分 → ${log.score.total}/100)\n`;
      if (log.change) r += `改动：${log.change}\n`;
      r += `反馈：${log.score.feedback}\n\n`;
    }
  }
  return r;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.log("Usage: bun main.ts <article.md> [--program <file>] [--iterations <n>]");
    process.exit(0);
  }

  const articlePath = path.resolve(args[0]);
  if (!fs.existsSync(articlePath)) {
    console.error(`❌ 文件不存在: ${articlePath}`); process.exit(1);
  }

  const programArg = args.find(a => a.startsWith("--program="))?.split("=")[1]
    || (args.indexOf("--program") !== -1 ? args[args.indexOf("--program") + 1] : null);
  const iterArg = args.find(a => a.startsWith("--iterations="))?.split("=")[1]
    || (args.indexOf("--iterations") !== -1 ? args[args.indexOf("--iterations") + 1] : null);

  const iterations = parseInt(iterArg || "5");
  const programMd = programArg && fs.existsSync(programArg)
    ? fs.readFileSync(programArg, "utf-8") : DEFAULT_PROGRAM;

  let bestArticle = fs.readFileSync(articlePath, "utf-8");

  console.log(`\n🔬 AutoResearch 启动（Haiku评分 + Sonnet改进）`);
  console.log(`📄 ${path.basename(articlePath)} | 🔄 ${iterations} 轮\n${"─".repeat(50)}\n`);

  process.stdout.write("📊 初始评分（Haiku）...");
  let bestScore = await scoreArticle(bestArticle, programMd);
  console.log(` ${bestScore.total}/100\n   反馈: ${bestScore.feedback}\n`);

  const logs: IterationLog[] = [{ iteration: 0, score: bestScore, action: "initial" }];
  const failedAttempts: string[] = [];

  for (let i = 1; i <= iterations; i++) {
    console.log(`${"─".repeat(50)}\n🔄 第 ${i}/${iterations} 轮`);

    let improved: string, change: string;
    try {
      process.stdout.write("  ✍️  改进中（Sonnet）...");
      const r = await improveArticle(bestArticle, bestScore, programMd, failedAttempts.slice(-5));
      improved = r.fullArticle; change = r.change;
      console.log(` 完成\n  💡 ${change}`);
    } catch (e: any) {
      console.log(`\n  ⚠️  ${e.message}，跳过`);
      continue;
    }

    process.stdout.write("  📊 评分（Haiku）...");
    let newScore: Score;
    try {
      newScore = await scoreArticle(improved, programMd);
    } catch (e) {
      console.log(` 失败，跳过`); continue;
    }

    const diff = newScore.total - bestScore.total;
    console.log(` ${newScore.total}/100 (${diff > 0 ? "+" : ""}${diff})`);

    if (newScore.total > bestScore.total) {
      console.log(`  ✅ 保留`);
      bestArticle = improved; bestScore = newScore;
      logs.push({ iteration: i, score: newScore, action: "kept", change });
      failedAttempts.length = 0; // 成功后清空失败历史
    } else {
      console.log(`  ↩️  回滚`);
      logs.push({ iteration: i, score: newScore, action: "reverted", change });
      failedAttempts.push(change); // 记录失败的方向
    }
  }

  const dir = path.dirname(articlePath);
  const base = path.basename(articlePath, ".md");
  const optimizedPath = path.join(dir, `${base}-optimized.md`);
  const reportPath = path.join(dir, `${base}-autoresearch-report.md`);

  fs.writeFileSync(optimizedPath, bestArticle);
  fs.writeFileSync(reportPath, generateReport(logs, bestScore, articlePath));

  const totalDiff = bestScore.total - logs[0].score.total;
  console.log(`\n${"─".repeat(50)}`);
  console.log(`🎉 完成！${logs[0].score.total} → ${bestScore.total}/100 (+${totalDiff})`);
  console.log(`✅ 保留 ${logs.filter(l => l.action === "kept").length} 轮 | ↩️ 回滚 ${logs.filter(l => l.action === "reverted").length} 轮`);
  console.log(`\n📄 优化版本: ${optimizedPath}`);
  console.log(`📊 迭代报告: ${reportPath}`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
