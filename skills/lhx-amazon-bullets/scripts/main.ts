import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorInfo {
  asin: string;
  bullets: string[];
}

interface ProductInfo {
  asin: string;
  optimizedTitle: string;
  bullets: string[];   // current 5 bullet points
  brand: string;
  category: string;
  competitors?: CompetitorInfo[];
}

interface BulletsScore {
  compliance: number;       // 合规性 0-20
  benefit_bridge: number;   // 利益转化 0-20
  keyword_strategy: number; // 关键词策略 0-20
  pain_coverage: number;    // 痛点覆盖 0-20
  conversion_power: number; // 转化力（买家模拟）0-20
  total: number;
  feedback: string;
  weakest: string;
}

interface IterationLog {
  iteration: number;
  bullets: string[];
  score: BulletsScore;
  action: "initial" | "kept" | "reverted";
  reason?: string;
}

// ─── Claude Runner ────────────────────────────────────────────────────────────

const CLAUDE_BIN = process.env.CLAUDE_BIN
  || execSync("which claude", { encoding: "utf-8", shell: "/bin/bash" }).trim();

function runClaude(promptFile: string, model = "claude-haiku-4-5-20251001"): string {
  const result = execSync(
    `"${CLAUDE_BIN}" -p --model ${model} < "${promptFile}"`,
    { encoding: "utf-8", maxBuffer: 4 * 1024 * 1024, timeout: 180000, shell: "/bin/bash" }
  );
  return result.trim();
}

function tmpFile(content: string): string {
  const f = `/tmp/lhx_bullets_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
  fs.writeFileSync(f, content);
  return f;
}

function formatBullets(bullets: string[]): string {
  return bullets.map((b, i) => `  ${i + 1}. ${b}`).join("\n");
}

// ─── Scoring (Haiku — cheap & fast) ──────────────────────────────────────────

function scoreBullets(bullets: string[], product: ProductInfo): BulletsScore {
  const compText = product.competitors?.length
    ? product.competitors.map(c =>
        `  [${c.asin}]:\n${c.bullets.map((b, i) => `    ${i + 1}. ${b}`).join("\n")}`
      ).join("\n")
    : "  (none provided)";

  // Extract keywords from title for blacklist check
  const titleWords = product.optimizedTitle
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);

  const bulletsText = formatBullets(bullets);
  const totalChars = bullets.join("").length;

  const prompt = `You are an Amazon listing expert AND simulating a real US buyer considering purchasing "${product.category}".

Score the following ${bullets.length} Amazon bullet points on 5 dimensions (0-20 each):

PRODUCT TITLE (already optimized — bullets must NOT repeat its keywords):
"${product.optimizedTitle}"

BULLET POINTS TO SCORE:
${bulletsText}

PRODUCT CONTEXT:
- Brand: ${product.brand}
- Category: ${product.category}
- Total bullet chars: ${totalChars} (ideal: ≤1000)

COMPETITOR BULLETS (for conversion_power comparison):
${compText}

SCORING CRITERIA:

1. compliance (0-20) — Technical rules:
   - No emojis, no symbols (✅, ★, →, etc.)? (+5)
   - No prohibited claims: "eco-friendly", "anti-microbial", "satisfaction guaranteed", "money-back guarantee", "best seller"? (+5)
   - No pricing, shipping info, or external links? (+5)
   - Each bullet ≤255 chars; starts with capital letter; no end punctuation? (+5)

2. benefit_bridge (0-20) — Feature → Benefit conversion:
   Each bullet should pass the "So What?" test: not just state a feature but explain the benefit.
   - Do bullets lead with ALL-CAPS benefit hooks? (+5)
   - Do bullets convert features into tangible user benefits? (+8)
   - Is there emotional resonance or problem-solving language? (+7)

3. keyword_strategy (0-20) — Keyword coverage:
   Bullets should cover NEW keywords NOT already in the title: "${product.optimizedTitle.slice(0, 100)}..."
   - Are bullets using secondary/long-tail keywords not in the title? (+10)
   - Do keywords appear naturally in benefit-driven sentences (not stuffed)? (+5)
   - Do bullets cover different use cases or buyer segments? (+5)

4. pain_coverage (0-20) — Pain points and ordering:
   - Bullet 1 addresses the #1 customer pain point or UVP? (+6)
   - Bullet 2 covers the key advantage over alternatives? (+4)
   - Remaining bullets cover specs, compatibility/ease-of-use, and trust/warranty? (+5)
   - At least one bullet proactively addresses a common buyer concern or objection? (+5)

5. conversion_power (0-20) — Buyer simulation:
   You are a US buyer who clicked on this listing. You're reading the bullet points to decide whether to buy.
   - After reading all bullets, do you feel confident about what you're getting? (+7)
   - Do the bullets collectively persuade you to add to cart? (+8)
   - Compared to competitor bullets above, are these more compelling? (+5)

Return ONLY valid JSON, no other text:
{"compliance":0,"benefit_bridge":0,"keyword_strategy":0,"pain_coverage":0,"conversion_power":0,"feedback":"The single most important improvement needed (be specific about which bullet and what's wrong)","weakest":"one of: compliance|benefit_bridge|keyword_strategy|pain_coverage|conversion_power"}`;

  const f = tmpFile(prompt);
  try {
    const raw = runClaude(f);
    fs.unlinkSync(f);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Score parse failed: ${raw.slice(0, 150)}`);
    const s = JSON.parse(match[0]);
    s.total = (s.compliance || 0) + (s.benefit_bridge || 0) + (s.keyword_strategy || 0) + (s.pain_coverage || 0) + (s.conversion_power || 0);
    return s as BulletsScore;
  } catch (e) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
    throw e;
  }
}

// ─── Improvement (Sonnet — smarter) ──────────────────────────────────────────

function improveBullets(
  bullets: string[],
  score: BulletsScore,
  product: ProductInfo,
  failedAttempts: string[]
): { newBullets: string[]; reason: string } {
  const dimLabels: Record<string, string> = {
    compliance: "technical compliance (format, prohibited claims, emojis)",
    benefit_bridge: "benefit bridge (feature→benefit conversion, ALL-CAPS hooks, 'So What?' test)",
    keyword_strategy: "keyword strategy (cover long-tail keywords NOT in the title)",
    pain_coverage: "pain point coverage (ordering, proactive objection handling)",
    conversion_power: "conversion power (buyer persuasion, confidence, add-to-cart impulse)",
  };

  const compText = product.competitors?.length
    ? product.competitors.map(c =>
        `  [${c.asin}]:\n${c.bullets.map((b, i) => `    ${i + 1}. ${b}`).join("\n")}`
      ).join("\n")
    : "  (none)";

  const failedSection = failedAttempts.length > 0
    ? `\n⚠️ These approaches were tried but scored lower — try a completely different angle:\n${failedAttempts.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n`
    : "";

  const prompt = `You are a world-class Amazon listing optimization expert for the US market.

PRODUCT TITLE (KEYWORD BLACKLIST — bullets must NOT repeat these keywords):
"${product.optimizedTitle}"

CURRENT BULLET POINTS:
${formatBullets(bullets)}

CURRENT SCORES: Total ${score.total}/100
- compliance: ${score.compliance}/20
- benefit_bridge: ${score.benefit_bridge}/20
- keyword_strategy: ${score.keyword_strategy}/20
- pain_coverage: ${score.pain_coverage}/20
- conversion_power: ${score.conversion_power}/20

WEAKEST DIMENSION: ${dimLabels[score.weakest] || score.weakest} (${(score as any)[score.weakest]}/20)
FEEDBACK: ${score.feedback}
${failedSection}
PRODUCT INFO:
- Brand: ${product.brand}
- Category: ${product.category}

COMPETITOR BULLETS (reference for keyword gaps & differentiation):
${compText}

BULLET POINT RULES (must follow):
✅ Format per bullet: [ALL-CAPS BENEFIT HOOK]: [Technical feature] + [Emotional result/problem solved]
✅ Ordering: Bullet 1=UVP/top pain point, 2=key advantage, remaining=specs/ease-of-use/trust/warranty
✅ Length: each bullet 10-255 chars; start with capital letter; use semicolons for internal phrases; NO end punctuation
✅ Bullets must cover keywords NOT already in the title above
❌ NO: emojis, ✅, ★, →, or any decorative symbols
❌ NO: "eco-friendly", "anti-microbial", "satisfaction guaranteed", "money-back guarantee"
❌ NO: pricing, shipping info, promotional language
❌ NO: repeating keywords that are already in the product title

YOUR TASK:
Improve ONE bullet point that most directly addresses the weakest dimension: "${dimLabels[score.weakest] || score.weakest}"
Keep the other ${bullets.length - 1} bullets unchanged (or improve slightly if they violate compliance rules).

Return ALL ${bullets.length} bullet points in JSON array format, plus a reason:
<bullets>[${bullets.map(() => '"Bullet text"').join(",")}]</bullets>
<reason>Which bullet was changed and why (one sentence)</reason>`;

  const f = tmpFile(prompt);
  try {
    const raw = runClaude(f, "claude-sonnet-4-6");
    fs.unlinkSync(f);

    const bulletsMatch = raw.match(/<bullets>([\s\S]*?)<\/bullets>/);
    const reasonMatch = raw.match(/<reason>([\s\S]*?)<\/reason>/);

    if (!bulletsMatch) throw new Error("Failed to parse improved bullets");

    const newBullets: string[] = JSON.parse(bulletsMatch[1].trim());
    if (!Array.isArray(newBullets) || newBullets.length !== bullets.length) {
      throw new Error(`Expected ${bullets.length} bullets, got ${newBullets?.length}`);
    }

    const reason = reasonMatch ? reasonMatch[1].trim() : `Improved ${score.weakest}`;
    return { newBullets, reason };
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

  const dims = ["compliance", "benefit_bridge", "keyword_strategy", "pain_coverage", "conversion_power"];
  const dimNames: Record<string, string> = {
    compliance: "合规性",
    benefit_bridge: "利益转化",
    keyword_strategy: "关键词策略",
    pain_coverage: "痛点覆盖",
    conversion_power: "买家转化力",
  };

  let r = `# 📝 Amazon 五点描述 AutoResearch 报告\n\n`;
  r += `**ASIN**: \`${product.asin}\` | **品类**: ${product.category} | **品牌**: ${product.brand}\n`;
  r += `**使用标题**: ${product.optimizedTitle}\n`;
  r += `**迭代**: ${logs.length - 1} 轮 | ✅ 保留 ${kept} | ↩️ 回滚 ${reverted}\n\n`;

  r += `## 得分对比\n\n`;
  r += `| 维度 | 原始 | 最优 | 变化 |\n|---|---|---|---|\n`;
  for (const k of dims) {
    const b = (initial as any)[k];
    const a = (best.score as any)[k];
    const d = a - b;
    r += `| ${dimNames[k]} | ${b}/20 | ${a}/20 | ${d > 0 ? `+${d} ⬆️` : d < 0 ? `${d} ⬇️` : "—"} |\n`;
  }
  r += `| **总分** | **${initial.total}/100** | **${best.score.total}/100** | **${totalDiff >= 0 ? "+" : ""}${totalDiff}** |\n\n`;

  r += `## 五点描述对比\n\n`;
  r += `### 原始版本 (${initial.total}/100)\n`;
  for (let i = 0; i < logs[0].bullets.length; i++) {
    r += `${i + 1}. ${logs[0].bullets[i]}\n`;
  }
  r += `\n### 最优版本 (${best.score.total}/100)\n`;
  for (let i = 0; i < best.bullets.length; i++) {
    const changed = best.bullets[i] !== logs[0].bullets[i];
    r += `${i + 1}. ${best.bullets[i]}${changed ? " *(已优化)*" : ""}\n`;
  }
  r += "\n";

  r += `## 优化依据说明\n\n`;
  r += `### 为什么用 ALL-CAPS 大写开头？\n`;
  r += `亚马逊约 72% 的购物来自手机端。在搜索结果页，五点描述每条仅展示前约 50 个字符。全大写的利益钩子（如 \`DEEP CLEAN IN FEWER PASSES\`）能在截断处即时传达核心卖点，无需买家点击展开。格式为：\`[全大写利益词]: [功能特点] + [用户获益]\`，符合亚马逊 Seller University 推荐及头部卖家的普遍实践。\n\n`;
  r += `### 为什么每条不能重复标题关键词？\n`;
  r += `亚马逊 A9 算法对标题和五点描述分别建立索引。标题关键词已被优先索引；描述中重复相同词不会提升排名，只是浪费有限的字符空间。应用五点描述覆盖长尾词、场景词和买家常用的同义词，最大化整体搜索覆盖面。\n\n`;
  r += `### 评分维度说明\n\n`;
  r += `| 维度 | 满分 | 核心标准 |\n|---|---|---|\n`;
  r += `| 合规性 | 20 | 无 emoji/特殊符号、无违禁词（eco-friendly、best seller 等）、每条 ≤255 字符、大写开头无末尾标点 |\n`;
  r += `| 利益转化 | 20 | 通过"So What?"测试：不只说功能，还说清楚对买家的具体好处；ALL-CAPS 开头强化视觉层次 |\n`;
  r += `| 关键词策略 | 20 | 覆盖标题中没有的长尾词和场景词，关键词自然融入而非堆砌，扩大搜索覆盖面 |\n`;
  r += `| 痛点覆盖 | 20 | 第1条直击最大痛点/UVP，排序从决策关键到辅助信息，主动化解常见购买顾虑 |\n`;
  r += `| 买家转化力 | 20 | 读完全部描述后是否有信心下单，整体说服力是否优于竞品 |\n\n`;

  r += `## 迭代详情\n\n`;
  for (const log of logs) {
    if (log.iteration === 0) {
      r += `### 初始版本 — ${log.score.total}/100\n`;
      r += `反馈: ${log.score.feedback}\n\n`;
    } else {
      const prev = logs[log.iteration - 1]?.score.total ?? 0;
      const diff = log.score.total - prev;
      const emoji = log.action === "kept" ? "✅ 保留" : "↩️ 回滚";
      r += `### 第 ${log.iteration} 轮 — ${emoji} (${diff >= 0 ? "+" : ""}${diff} → ${log.score.total}/100)\n`;
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

  if (!product.bullets || product.bullets.length === 0) {
    console.error("❌ product-info.json must have at least 1 bullet");
    process.exit(1);
  }
  if (!product.optimizedTitle) {
    console.error("❌ product-info.json must have 'optimizedTitle' field");
    process.exit(1);
  }

  console.log(`\n📝 Amazon 五点描述 AutoResearch`);
  console.log(`${"─".repeat(55)}`);
  console.log(`📦 ASIN   : ${product.asin}`);
  console.log(`🏪 品类   : ${product.category}`);
  console.log(`🏷️  标题   : ${product.optimizedTitle.slice(0, 70)}...`);
  console.log(`🔄 迭代   : ${iterations} 轮  (Haiku 评分 + Sonnet 改进)`);
  if (product.competitors?.length) {
    console.log(`🔍 竞品   : ${product.competitors.map(c => c.asin).join(", ")}`);
  }
  console.log(`\n当前描述 (${product.bullets.length}条):`);
  product.bullets.forEach((b, i) => console.log(`  ${i + 1}. ${b.slice(0, 80)}${b.length > 80 ? "..." : ""}`));
  console.log(`${"─".repeat(55)}\n`);

  let bestBullets = [...product.bullets];
  let bestScore: BulletsScore;
  const logs: IterationLog[] = [];
  const failedAttempts: string[] = [];

  process.stdout.write("📊 初始评分中（Haiku）...");
  try {
    bestScore = scoreBullets(bestBullets, product);
  } catch (e: any) {
    console.log(`\n❌ 初始评分失败: ${e.message}`);
    process.exit(1);
  }
  console.log(` ${bestScore.total}/100`);
  console.log(`   最弱维度: ${bestScore.weakest} (${(bestScore as any)[bestScore.weakest]}/20)`);
  console.log(`   反馈: ${bestScore.feedback}\n`);

  logs.push({ iteration: 0, bullets: bestBullets, score: bestScore, action: "initial" });

  for (let i = 1; i <= iterations; i++) {
    console.log(`${"─".repeat(55)}`);
    console.log(`🔄 第 ${i}/${iterations} 轮  (最弱: ${bestScore.weakest} ${(bestScore as any)[bestScore.weakest]}/20)`);

    let newBullets: string[];
    let reason: string;
    try {
      process.stdout.write("  ✍️  改进中（Sonnet）...");
      const result = improveBullets(bestBullets, bestScore, product, failedAttempts.slice(-5));
      newBullets = result.newBullets;
      reason = result.reason;
      console.log(` 完成`);
      console.log(`  💡 ${reason}`);
    } catch (e: any) {
      console.log(`\n  ⚠️  改进失败: ${e.message}，跳过本轮`);
      continue;
    }

    let newScore: BulletsScore;
    try {
      process.stdout.write("  📊 评分中（Haiku）...");
      newScore = scoreBullets(newBullets, product);
    } catch {
      console.log(` 失败，跳过本轮`);
      continue;
    }

    const diff = newScore.total - bestScore.total;
    console.log(` ${newScore.total}/100 (${diff >= 0 ? "+" : ""}${diff})`);

    if (newScore.total > bestScore.total) {
      console.log(`  ✅ 保留`);
      bestBullets = newBullets;
      bestScore = newScore;
      logs.push({ iteration: i, bullets: newBullets, score: newScore, action: "kept", reason });
      failedAttempts.length = 0;
    } else {
      console.log(`  ↩️  回滚`);
      logs.push({ iteration: i, bullets: newBullets, score: newScore, action: "reverted", reason });
      failedAttempts.push(reason);
    }
  }

  // Write outputs
  const outDir = path.dirname(infoPath);
  const optimizedPath = path.join(outDir, `${product.asin}-bullets-optimized.txt`);
  const reportPath = path.join(outDir, `${product.asin}-bullets-report.md`);

  const bulletsOutput = bestBullets.map((b, i) => `${i + 1}. ${b}`).join("\n") + "\n";
  fs.writeFileSync(optimizedPath, bulletsOutput);
  fs.writeFileSync(reportPath, generateReport(logs, product));

  const initial = logs[0].score;
  const totalDiff = bestScore.total - initial.total;

  console.log(`\n${"═".repeat(55)}`);
  console.log(`🎉 完成！${initial.total} → ${bestScore.total}/100 (${totalDiff >= 0 ? "+" : ""}${totalDiff})`);
  console.log(`✅ 保留 ${logs.filter(l => l.action === "kept").length} 轮 | ↩️ 回滚 ${logs.filter(l => l.action === "reverted").length} 轮`);
  console.log(`\n🏆 最优五点描述:`);
  bestBullets.forEach((b, i) => console.log(`   ${i + 1}. ${b}`));
  console.log(`\n📄 已保存至: ${optimizedPath}`);
  console.log(`📊 迭代报告: ${reportPath}`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
