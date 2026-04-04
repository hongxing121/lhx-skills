#!/usr/bin/env bun
/**
 * slides-presenter/scripts/tts.js
 *
 * 调用阿里云DashScope TTS API，为每页幻灯片生成语音文件。
 *
 * Usage:
 *   node tts.js --slides-file slides.json --output-dir /tmp/audio/ --voice longxiaochun
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ── 参数解析 ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      args[key.slice(2)] = argv[i + 1] ?? true;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

// ── 加载API Key ───────────────────────────────────────────────────────
function loadApiKey() {
  if (process.env.DASHSCOPE_API_KEY) return process.env.DASHSCOPE_API_KEY;
  const candidates = [
    path.join(process.cwd(), '.baoyu-skills/.env'),
    path.join(os.homedir(), '.baoyu-skills/.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const line = fs.readFileSync(p, 'utf8').split('\n')
        .find(l => l.startsWith('DASHSCOPE_API_KEY='));
      if (line) return line.split('=')[1].trim();
    }
  }
  throw new Error('DASHSCOPE_API_KEY not found');
}

const API_KEY = loadApiKey();
const slidesFile = args['slides-file'];
const outputDir = args['output-dir'] || '/tmp/slides-presenter-audio';
const voiceId = args['voice'] || 'longxiaochun';

if (!slidesFile) {
  console.error('Error: --slides-file is required');
  process.exit(1);
}

const slides = JSON.parse(fs.readFileSync(slidesFile, 'utf8'));
fs.mkdirSync(outputDir, { recursive: true });

// ── 检测model名称（克隆音色用cosyvoice-v2，系统音色用cosyvoice-v1）──
function detectModel(voice) {
  if (voice.startsWith('cosyvoice-v2-')) return 'cosyvoice-v2';
  if (voice.startsWith('cosyvoice-v1-')) return 'cosyvoice-v1';
  return 'cosyvoice-v1';
}

// ── 标点停顿预处理 ────────────────────────────────────────────────────
// 在句末标点（。！？）后插入换行，让TTS在句末产生更长停顿
// 逗号（，）保持不变，维持短停顿
function preprocessText(text) {
  return text
    .replace(/([。！？])\s*/g, '$1\n')  // 句末标点后加换行 → 长停顿
    .replace(/\n+/g, '\n')             // 合并多余换行
    .trim();
}

// ── DashScope TTS via WebSocket (支持克隆音色 + 字级时间戳) ──────────
async function synthesize(text, outputPath) {
  text = preprocessText(text);
  const model = detectModel(voiceId);
  const taskId = crypto.randomUUID().replace(/-/g, '');
  const timestampsPath = outputPath.replace(/\.mp3$/, '.timestamps.json');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });

    const chunks = [];
    const timestamps = []; // [{text, begin_time, end_time}]

    ws.onopen = () => {
      ws.send(JSON.stringify({
        header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          task_group: 'audio',
          task: 'tts',
          function: 'SpeechSynthesizer',
          model,
          parameters: {
            voice: voiceId,
            format: 'mp3',
            sample_rate: 22050,
            word_timestamp_enabled: true,  // 开启字级时间戳
          },
          input: {},
        },
      }));
    };

    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data);
        const event = msg.header?.event;
        if (event === 'task-started') {
          ws.send(JSON.stringify({
            header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
            payload: { input: { text } },
          }));
          ws.send(JSON.stringify({
            header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
            payload: { input: {} },
          }));
        } else if (event === 'result-generated') {
          // 收集字级时间戳
          const words = msg.payload?.output?.sentence?.words;
          if (words && words.length > 0) timestamps.push(...words);
        } else if (event === 'task-failed') {
          ws.close();
          reject(new Error(`TTS failed: ${msg.header?.error_message || JSON.stringify(msg)}`));
        } else if (event === 'task-finished') {
          const buf = Buffer.concat(chunks);
          fs.writeFileSync(outputPath, buf);
          if (timestamps.length > 0) {
            fs.writeFileSync(timestampsPath, JSON.stringify(timestamps, null, 2));
          }
          ws.close();
          resolve();
        }
      } else {
        chunks.push(Buffer.from(e.data));
      }
    };

    ws.onerror = (e) => reject(new Error(`WebSocket error: ${e.message}`));
  });
}

// ── 主流程 ────────────────────────────────────────────────────────────
console.log(`\n合成 ${slides.length} 页语音（音色：${voiceId}）...\n`);

const results = [];

for (let i = 0; i < slides.length; i++) {
  const slide = slides[i];
  const narration = slide.narration || slide.text;
  const pad = String(i + 1).padStart(2, '0');
  const outputPath = path.join(outputDir, `slide-${pad}.mp3`);

  process.stdout.write(`  合成第 ${i + 1}/${slides.length} 页...`);

  try {
    await synthesize(narration, outputPath);
    console.log(` ✓ (${outputPath})`);
    results.push({ index: i, path: outputPath, success: true });
  } catch (err) {
    console.log(` ✗ 失败: ${err.message}`);
    results.push({ index: i, path: null, success: false, error: err.message });
  }
}

const succeeded = results.filter(r => r.success).length;
console.log(`\n✅ 语音合成完成：${succeeded}/${slides.length} 页成功`);
console.log(JSON.stringify({ success: true, results, outputDir }));
