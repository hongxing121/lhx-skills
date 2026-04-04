import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorInfo {
  asin: string;
  title: string;
}

interface ProductInfo {
  asin: string;
  title: string;
  brand: string;
  category: string;
  bullets?: string[];
  competitors?: CompetitorInfo[];
}

interface TitleScore {
  compliance: number;       // 技术合规性 0-20
  mobile_hook: number;      // 移动端钩子 0-20
  keyword_quality: number;  // 关键词质量 0-20
  clarity: number;          // 清晰度 0-20
  click_intent: number;     // 买家点击意愿 0-20
  total: number;
  feedback: string;
  weakest: string;
}

interface IterationLog {
  iteration: number;
  title: string;
  score: TitleScore;
  action: "initial" | "kept" | "reverted";
  reason?: string;
}

// ─── Claude Runner ────────────────────────────────────────────────────────────

const CLAUDE_BIN = process.env.CLAUDE_BIN
  || execSync("which claude", { encoding: "utf-8", shell: "/bin/bash" }).trim();

function runClaude(promptFile: string, model = "claude-haiku-4-5-20251001"): string {
  const result = execSync(
    `"${CLAUDE_BIN}" -p --model ${model} < "${promptFile}"`,
    { encoding: "utf-8", maxBuffer: 2 * 1024 * 1024, timeout: 120000, shell: "/bin/bash" }
  );
  return result.trim();
}

function tmpFile(content: string): string {
  const f = `/tmp/lhx_title_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
  fs.writeFileSync(f, content);
  return f;
}

// ─── Scoring (Haiku — cheap & fast) ──────────────────────────────────────────

function scoreTitle(title: string, product: ProductInfo): TitleScore {
  const compText = product.competitors?.length
    ? product.competitors.map(c => `  • ${c.title}`).join("\n")
    : "  (none provided)";

  const charCount = title.length;
  const first80 = title.slice(0, 80);

  const prompt = `You are an Amazon listing expert AND simulating a real US buyer searching for "${product.category}".

Score the following Amazon product title on 5 dimensions (0-20 each):

TITLE TO SCORE:
"${title}"

PRODUCT CONTEXT:
- Brand: ${product.brand}
- Category: ${product.category}
- Character count: ${charCount}
- First 80 chars: "${first80}"

COMPETITOR TITLES (for click_intent comparison):
${compText}

SCORING CRITERIA:

1. compliance (0-20) — Technical rules:
   - Characters ≤200 and key info in first 80 chars? (+5)
   - No prohibited words: Best Seller, #1, Free Shipping, Sale, !, $, ★, emojis? (+5)
   - No word repeated more than twice (excluding prepositions/articles)? (+5)
   - Title Case format + Arabic numerals (2-Pack not Two-Pack)? (+5)

2. mobile_hook (0-20) — First 80 character quality:
   - Brand name present in first 80 chars? (+5)
   - Primary keyword (core product type) in first 80 chars? (+8)
   - Key differentiator/UVP in first 80 chars? (+7)

3. keyword_quality (0-20) — Keyword effectiveness:
   - Primary keyword accurately describes product type? (+8)
   - Covers use cases or differentiating features? (+7)
   - Keywords flow naturally (not stuffed)? (+5)

4. clarity (0-20) — 3-second comprehension:
   - As a buyer, can I understand exactly what this product is in 3 seconds? (+10)
   - Product type, key use, and main feature are all clear? (+10)

5. click_intent (0-20) — Buyer simulation:
   You are a US buyer who just searched for "${product.category}" on Amazon mobile.
   You see this title in the search results (truncated after 80 chars on mobile).
   - How relevant does this feel to what you searched for? (+7)
   - Does the title make you want to click and learn more? (+8)
   - Compared to the competitor titles above, does this stand out? (+5)

Return ONLY valid JSON, no other text:
{"compliance":0,"mobile_hook":0,"keyword_quality":0,"clarity":0,"click_intent":0,"feedback":"The single most important improvement needed (be specific about the actual title content)","weakest":"one of: compliance|mobile_hook|keyword_quality|clarity|click_intent"}`;

  const f = tmpFile(prompt);
  try {
    const raw = runClaude(f);
    fs.unlinkSync(f);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Score parse failed: ${raw.slice(0, 150)}`);
    const s = JSON.parse(match[0]);
    s.total = (s.compliance || 0) + (s.mobile_hook || 0) + (s.keyword_quality || 0) + (s.clarity || 0) + (s.click_intent || 0);
    return s as TitleScore;
  } catch (e) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
    throw e;
  }
}

// ─── Improvement (Sonnet — smarter) ──────────────────────────────────────────

function improveTitle(
  title: string,
  score: TitleScore,
  product: ProductInfo,
  failedAttempts: string[]
): { newTitle: string; reason: string } {
  const dimLabels: Record<string, string> = {
    compliance: "technical compliance (format rules, prohibited words, character limits)",
    mobile_hook: "mobile hook (front-load brand + keyword + UVP in first 80 chars)",
    keyword_quality: "keyword quality (accuracy, coverage of use cases, natural flow)",
    clarity: "clarity (buyer understands product in 3 seconds)",
    click_intent: "buyer click intent (relevance, value communication, differentiation)",
  };

  const compText = product.competitors?.length
    ? product.competitors.map(c => `  • [${c.asin}] ${c.title}`).join("\n")
    : "  (none)";

  const failedSection = failedAttempts.length > 0
    ? `\n⚠️ These approaches were tried but scored lower — try a completely different angle:\n${failedAttempts.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n`
    : "";

  const prompt = `You are a world-class Amazon listing optimization expert for the US market.

CURRENT TITLE:
"${title}"

CURRENT SCORES: Total ${score.total}/100
- compliance: ${score.compliance}/20
- mobile_hook: ${score.mobile_hook}/20
- keyword_quality: ${score.keyword_quality}/20
- clarity: ${score.clarity}/20
- click_intent: ${score.click_intent}/20

WEAKEST DIMENSION: ${dimLabels[score.weakest] || score.weakest} (${(score as any)[score.weakest]}/20)
FEEDBACK: ${score.feedback}
${failedSection}
PRODUCT INFO:
- Brand: ${product.brand}
- Category: ${product.category}

COMPETITOR TITLES (reference for keyword landscape & differentiation):
${compText}

TITLE OPTIMIZATION RULES (must follow):
✅ Structure: [Brand] + [Primary Keyword] + [Key Feature/UVP] + [Use Case] + [Size/Qty/Specs]
✅ First 80 chars: brand name + primary keyword + core selling point
✅ Total length: 150-180 characters
✅ Title Case (capitalize first letter of major words)
✅ Use Arabic numerals (2-Pack, not Two-Pack)
❌ NO: Best Seller, #1, Free Shipping, Sale, Limited Offer, Amazing
❌ NO: Special chars: !, $, ?, _, {, }, ^, ★, emojis
❌ NO: Same word repeated more than twice

YOUR TASK:
Make ONE targeted improvement focused on the weakest dimension: "${dimLabels[score.weakest] || score.weakest}"
Keep the core product information accurate. Preserve what's already working well.

First line: the improved title (complete, ready to use on Amazon)
Second line: REASON: one sentence explaining what you changed and why

Format your response as:
<title>The complete optimized title here</title>
<reason>One sentence explaining the change</reason>`;

  const f = tmpFile(prompt);
  try {
    const raw = runClaude(f, "claude-sonnet-4-6");
    fs.unlinkSync(f);

    const titleMatch = raw.match(/<title>([\s\S]*?)<\/title>/);
    const reasonMatch = raw.match(/<reason>([\s\S]*?)<\/reason>/);

    if (!titleMatch) throw new Error("Failed to parse improved title");

    const newTitle = titleMatch[1].trim().replace(/^["']|["']$/g, "");
    const reason = reasonMatch ? reasonMatch[1].trim() : `Improved ${score.weakest}`;

    return { newTitle, reason };
  } catch (e) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
    throw e;
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

function generateReport(logs: IterationLog[], product: ProductInfo): string {
  const initial = logs[0].score;
  const best = logs.filter(l => l.action !== "reverted").at(-1) || logs[0];
  const kept = logs.filter(l => l.action === "kept").length;
  const reverted = logs.filter(l => l.action === "reverted").length;
  const totalDiff = best.score.total - initial.total;

  const dims = ["compliance", "mobile_hook", "keyword_quality", "clarity", "click_intent"];
  const dimNames: Record<string, string> = {
    compliance: "技术合规性",
    mobile_hook: "移动端钩子",
    keyword_quality: "关键词质量",
    clarity: "清晰度",
    click_intent: "买家点击意愿",
  };

  let r = `# 🏷️ Amazon 标题 AutoResearch 报告\n\n`;
  r += `**ASIN**: \`${product.asin}\` | **品类**: ${product.category} | **品牌**: ${product.brand}\n`;
  r += `**迭代**: ${logs.length - 1} 轮 | ✅ 保留 ${kept} | ↩️ 回滚 ${reverted}\n\n`;

  r += `## 标题对比\n\n`;
  r += `**原始标题** (${initial.total}/100):\n`;
  r += `> ${logs[0].title}\n\n`;
  r += `**最优标题** (${best.score.total}/100):\n`;
  r += `> ${best.title}\n\n`;

  r += `## 得分对比\n\n`;
  r += `| 维度 | 原始 | 最优 | 变化 |\n|---|---|---|---|\n`;
  for (const k of dims) {
    const b = (initial as any)[k];
    const a = (best.score as any)[k];
    const d = a - b;
    r += `| ${dimNames[k]} | ${b}/20 | ${a}/20 | ${d > 0 ? `+${d} ⬆️` : d < 0 ? `${d} ⬇️` : "—"} |\n`;
  }
  r += `| **总分** | **${initial.total}/100** | **${best.score.total}/100** | **${totalDiff >= 0 ? "+" : ""}${totalDiff}** |\n\n`;

  r += `## 优化依据说明\n\n`;
  r += `### 标题结构黄金公式\n`;
  r += `\`[品牌名] + [核心关键词] + [最强差异化特点] + [主要使用场景/人群]\`\n\n`;
  r += `前 80 字符决定手机端第一印象，务必将最核心的价值放在标题开头（约 70% 的亚马逊购物来自手机端，搜索结果页仅展示前 80 字符）。\n\n`;
  r += `### 评分维度说明\n\n`;
  r += `| 维度 | 满分 | 核心标准 |\n|---|---|---|\n`;
  r += `| 技术合规性 | 20 | 字符数 ≤200、品牌名开头、禁用感叹号/价格/促销词（如 sale、free shipping）、无重复词 |\n`;
  r += `| 移动端钩子 | 20 | 前 80 字符能否在搜索截断处独立传达核心价值，不依赖后半段 |\n`;
  r += `| 关键词质量 | 20 | 核心词 + 长尾词覆盖率，关键词顺序是否符合搜索意图优先级（高搜索量词靠前）|\n`;
  r += `| 清晰度 | 20 | 买家 5 秒内能否理解：是什么产品、解决什么问题、和竞品有何不同 |\n`;
  r += `| 买家点击意愿 | 20 | 在搜索结果列表中，标题能否触发"这就是我要找的"的点击冲动 |\n\n`;

  if (product.competitors?.length) {
    r += `## 竞品参考标题\n\n`;
    for (const c of product.competitors) {
      r += `- \`${c.asin}\`: ${c.title}\n`;
    }
    r += "\n";
  }

  r += `## 迭代详情\n\n`;
  for (const log of logs) {
    if (log.iteration === 0) {
      r += `### 初始版本 — ${log.score.total}/100\n`;
      r += `\`${log.title}\`\n`;
      r += `反馈: ${log.score.feedback}\n\n`;
    } else {
      const prev = logs[log.iteration - 1]?.score.total ?? 0;
      const diff = log.score.total - prev;
      const emoji = log.action === "kept" ? "✅ 保留" : "↩️ 回滚";
      r += `### 第 ${log.iteration} 轮 — ${emoji} (${diff >= 0 ? "+" : ""}${diff} → ${log.score.total}/100)\n`;
      r += `\`${log.title}\`\n`;
      if (log.reason) r += `改动: ${log.reason}\n`;
      r += `反馈: ${log.score.feedback}\n\n`;
    }
  }
  return r;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.log("Usage: bun main.ts <product-info.json> [--iterations <n>]");
    process.exit(0);
  }

  const infoPath = path.resolve(args[0]);
  if (!fs.existsSync(infoPath)) {
    console.error(`❌ File not found: ${infoPath}`);
    process.exit(1);
  }

  const iterArg = args.find(a => a.startsWith("--iterations="))?.split("=")[1]
    ?? (args.indexOf("--iterations") !== -1 ? args[args.indexOf("--iterations") + 1] : null);
  const iterations = Math.max(1, parseInt(iterArg ?? "8"));

  let product: ProductInfo;
  try {
    product = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
  } catch {
    console.error("❌ Invalid JSON in product info file");
    process.exit(1);
  }

  if (!product.title || !product.asin) {
    console.error("❌ product-info.json must have 'asin' and 'title' fields");
    process.exit(1);
  }

  console.log(`\n🏷️  Amazon 标题 AutoResearch`);
  console.log(`${"─".repeat(55)}`);
  console.log(`📦 ASIN    : ${product.asin}`);
  console.log(`🏪 品类    : ${product.category}`);
  console.log(`🔤 当前标题: ${product.title}`);
  console.log(`🔄 迭代轮数: ${iterations}  (Haiku 评分 + Sonnet 改进)`);
  if (product.competitors?.length) {
    console.log(`🔍 竞品    : ${product.competitors.map(c => c.asin).join(", ")}`);
  }
  console.log(`${"─".repeat(55)}\n`);

  let bestTitle = product.title;
  let bestScore: TitleScore;
  const logs: IterationLog[] = [];
  const failedAttempts: string[] = [];

  process.stdout.write("📊 初始评分中（Haiku）...");
  try {
    bestScore = scoreTitle(bestTitle, product);
  } catch (e: any) {
    console.log(`\n❌ 初始评分失败: ${e.message}`);
    process.exit(1);
  }
  console.log(` ${bestScore.total}/100`);
  console.log(`   最弱维度: ${bestScore.weakest} (${(bestScore as any)[bestScore.weakest]}/20)`);
  console.log(`   反馈: ${bestScore.feedback}\n`);

  logs.push({ iteration: 0, title: bestTitle, score: bestScore, action: "initial" });

  for (let i = 1; i <= iterations; i++) {
    console.log(`${"─".repeat(55)}`);
    console.log(`🔄 第 ${i}/${iterations} 轮`);

    let newTitle: string;
    let reason: string;
    try {
      process.stdout.write("  ✍️  改进中（Sonnet）...");
      const result = improveTitle(bestTitle, bestScore, product, failedAttempts.slice(-5));
      newTitle = result.newTitle;
      reason = result.reason;
      console.log(` 完成`);
      console.log(`  💡 ${newTitle}`);
    } catch (e: any) {
      console.log(`\n  ⚠️  改进失败: ${e.message}，跳过本轮`);
      continue;
    }

    let newScore: TitleScore;
    try {
      process.stdout.write("  📊 评分中（Haiku）...");
      newScore = scoreTitle(newTitle, product);
    } catch {
      console.log(` 失败，跳过本轮`);
      continue;
    }

    const diff = newScore.total - bestScore.total;
    console.log(` ${newScore.total}/100 (${diff >= 0 ? "+" : ""}${diff})`);

    if (newScore.total > bestScore.total) {
      console.log(`  ✅ 保留`);
      bestTitle = newTitle;
      bestScore = newScore;
      logs.push({ iteration: i, title: newTitle, score: newScore, action: "kept", reason });
      failedAttempts.length = 0;
    } else {
      console.log(`  ↩️  回滚`);
      logs.push({ iteration: i, title: newTitle, score: newScore, action: "reverted", reason });
      failedAttempts.push(reason);
    }
  }

  // Write outputs
  const outDir = path.dirname(infoPath);
  const optimizedPath = path.join(outDir, `${product.asin}-title-optimized.txt`);
  const reportPath = path.join(outDir, `${product.asin}-title-report.md`);

  fs.writeFileSync(optimizedPath, bestTitle + "\n");
  fs.writeFileSync(reportPath, generateReport(logs, product));

  const initial = logs[0].score;
  const totalDiff = bestScore.total - initial.total;

  console.log(`\n${"═".repeat(55)}`);
  console.log(`🎉 完成！${initial.total} → ${bestScore.total}/100 (${totalDiff >= 0 ? "+" : ""}${totalDiff})`);
  console.log(`✅ 保留 ${logs.filter(l => l.action === "kept").length} 轮 | ↩️ 回滚 ${logs.filter(l => l.action === "reverted").length} 轮`);
  console.log(`\n🏆 最优标题:\n   ${bestTitle}`);
  console.log(`\n📄 已保存至: ${optimizedPath}`);
  console.log(`📊 迭代报告: ${reportPath}`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
