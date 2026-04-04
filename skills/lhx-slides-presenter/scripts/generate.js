#!/usr/bin/env bun
/**
 * slides-presenter/scripts/generate.js
 *
 * 将幻灯片JSON + 音频文件合成为带头像讲解动效的MP4视频。
 * 纯ffmpeg方案，用canvas烧录字幕。
 *
 * Usage:
 *   bun generate.js --slides-file slides.json --audio-dir /tmp/audio/ --output video.mp4 --avatar avatar.png
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const FFMPEG  = process.env.FFMPEG_PATH  || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || '/opt/homebrew/bin/ffprobe';

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

const slidesFile = args['slides-file'];
const audioDir   = args['audio-dir'] || '/tmp/slides-presenter-audio';
const outputFile = path.resolve(args.output || './slides-presenter-output.mp4');
const avatarArg  = args['avatar'] || null;
const WIDTH      = parseInt(args.width  || '1920', 10);
const HEIGHT     = parseInt(args.height || '1080', 10);
const titleArg   = args['title'] || null;

if (!slidesFile) {
  console.error('Error: --slides-file is required');
  process.exit(1);
}

const slides     = JSON.parse(fs.readFileSync(slidesFile, 'utf8'));
const avatarPath = avatarArg ? path.resolve(avatarArg) : null;
const slidesDir  = path.dirname(path.resolve(slidesFile));

// ── 获取音频时长 ──────────────────────────────────────────────────────
function getAudioDuration(audioPath) {
  try {
    const out = execSync(
      `"${FFPROBE}" -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { stdio: 'pipe' }
    ).toString().trim();
    return parseFloat(out) || 5.0;
  } catch {
    return 5.0;
  }
}

// ── 准备圆形头像 ──────────────────────────────────────────────────────
function prepareCircleAvatar(avatarPath, tmpDir, size = 220) {
  const outPath = path.join(tmpDir, 'avatar-circle.png');
  execSync([
    `"${FFMPEG}" -y`,
    `-i "${avatarPath}"`,
    `-vf "scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(pow(X-${size/2},2)+pow(Y-${size/2},2),pow(${size/2},2)),255,0)'"`,
    `"${outPath}"`,
  ].join(' '), { stdio: 'pipe' });
  return outPath;
}

// ── 从时间戳生成字幕段列表 ────────────────────────────────────────────
// 返回 [{text, startMs, endMs}, ...]
// 规则：只在标点符号（。！？；，、）处断句，绝不在无标点处切断
// 若单句超过 softMaxChars，等到下一个标点再断（宁可字幕长一点，不中间截断）
function buildSubtitleSegments(timestamps, speedRatio = 1.2) {
  if (!timestamps || timestamps.length === 0) return [];

  // 去重：DashScope返回累积句子，同一个begin_index会出现多次，保留最后一次（时间最准确）
  const seen = new Map();
  for (const w of timestamps) {
    seen.set(w.begin_index, w);
  }
  const deduped = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);

  const segments = [];
  const breakChars = new Set(['。', '！', '？', '；', '，', '、']);

  let segStart = null;
  let segText = '';
  let segEndMs = 0;

  for (const w of deduped) {
    const startMs = Math.round(w.begin_time / speedRatio);
    const endMs = Math.round(w.end_time / speedRatio);

    if (segStart === null) segStart = startMs;
    segText += w.text;
    segEndMs = endMs;

    // 只在标点处断句，不允许在无标点处截断
    if (breakChars.has(w.text)) {
      segments.push({ text: segText, startMs: segStart, endMs: segEndMs });
      segStart = null;
      segText = '';
    }
  }
  // 末尾剩余文字（无标点收尾时）
  if (segText) {
    segments.push({ text: segText, startMs: segStart, endMs: segEndMs });
  }
  return segments;
}

// ── 把字幕段分成两行显示 ──────────────────────────────────────────────
// 从中点向两侧扫描，找到不在英文单词/数字中间的安全断点
function wrapSubtitle(text, maxChars = 14) {
  if (text.length <= maxChars) return [text];
  const mid = Math.ceil(text.length / 2);
  const isWordChar = (c) => c !== undefined && /[a-zA-Z0-9]/.test(c);

  for (let offset = 0; offset <= mid; offset++) {
    for (const pos of [mid - offset, mid + offset]) {
      if (pos <= 0 || pos >= text.length) continue;
      // 安全断点：断点两侧不同时是英文字母/数字（即不在单词中间）
      if (!isWordChar(text[pos - 1]) || !isWordChar(text[pos])) {
        return [text.slice(0, pos), text.slice(pos)];
      }
    }
  }
  // 万不得已才从正中间断
  return [text.slice(0, mid), text.slice(mid)];
}

const TOP_TITLE = titleArg || slides[0]?.title || '';

// ── 用canvas生成带字幕的帧图片 ────────────────────────────────────────
async function renderFrame(imagePath, subtitleLines, circleAvatarPath, outPng) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // 黑色背景
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 先计算图片位置（图片垂直居中于整个画布）
  const titleH = 80;
  let imgTopY = 0;
  let imgBottomY = HEIGHT;
  if (imagePath && fs.existsSync(imagePath)) {
    const img = await loadImage(imagePath);
    const scale = Math.min(WIDTH / img.width, HEIGHT / img.height);
    const sw = img.width * scale;
    const sh = img.height * scale;
    const sx = (WIDTH - sw) / 2;
    const sy = (HEIGHT - sh) / 2;
    imgTopY = sy;
    imgBottomY = sy + sh;

    // 标题栏：紧贴图片上方
    const titleY = Math.max(0, imgTopY - titleH);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, titleY, WIDTH, titleH);
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px "PingFang SC", "Heiti SC", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(TOP_TITLE, WIDTH / 2, titleY + titleH / 2);

    ctx.drawImage(img, sx, sy, sw, sh);
  } else {
    // 无图片时标题放中间偏上
    const titleY = HEIGHT / 2 - titleH;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, titleY, WIDTH, titleH);
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px "PingFang SC", "Heiti SC", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(TOP_TITLE, WIDTH / 2, titleY + titleH / 2);
  }

  // 字幕区域：紧贴图片底边下方
  if (subtitleLines && subtitleLines.length > 0) {
    const fontSize = 52;
    const lineH = 68;
    const padV = 20;
    const subH = subtitleLines.length * lineH + padV * 2;
    const subY = imgBottomY + 10; // 图片底边下方10px

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, subY, WIDTH, subH);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fontSize}px "PingFang SC", "Heiti SC", sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;

    subtitleLines.forEach((line, i) => {
      ctx.fillText(line, WIDTH / 2, subY + padV + i * lineH);
    });
  }

  // 叠加圆形头像
  if (circleAvatarPath && fs.existsSync(circleAvatarPath)) {
    const avatarSize = 220;
    const avatarRight = 50;
    const avatarBottom = 200;
    const ax = WIDTH - avatarRight - avatarSize;
    const ay = HEIGHT - avatarBottom - avatarSize;
    const avatar = await loadImage(circleAvatarPath);
    ctx.drawImage(avatar, ax, ay, avatarSize, avatarSize);
  }

  fs.writeFileSync(outPng, canvas.toBuffer('image/png'));
}

// ── 单页合成视频 ──────────────────────────────────────────────────────
async function makeSlideVideo(slide, slideIndex, audioPath, outPath, audioDuration, circleAvatarPath, tmpDir) {
  const imagePath = slide.image || null;
  const hasAudio  = audioPath && fs.existsSync(audioPath);

  // 加载时间戳文件
  const tsPath = audioPath ? audioPath.replace(/\.mp3$/, '.timestamps.json') : null;
  const timestamps = tsPath && fs.existsSync(tsPath) ? JSON.parse(fs.readFileSync(tsPath, 'utf8')) : null;

  // 用时间戳生成精确字幕段，否则fallback到均分
  let frameFiles = [];
  if (timestamps && timestamps.length > 0) {
    const segments = buildSubtitleSegments(timestamps, 1.2);
    const totalMs = audioDuration * 1000;

    // 如果第一帧不是从0开始，在前面插入无字幕帧
    const blankPng = path.join(tmpDir, `slide-${slideIndex}-blank.png`);
    await renderFrame(imagePath, [], circleAvatarPath, blankPng);

    if (segments[0]?.startMs > 100) {
      frameFiles.push({ png: blankPng, duration: segments[0].startMs / 1000 });
    }

    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      const framePng = path.join(tmpDir, `slide-${slideIndex}-seg-${s}.png`);
      // 过滤掉 \n 等控制字符，避免显示到字幕里
      const cleanText = seg.text.replace(/[\n\r]/g, '');
      const lines = cleanText ? wrapSubtitle(cleanText) : [];
      await renderFrame(imagePath, lines, circleAvatarPath, framePng);
      // 字幕显示时长 = 从startMs到endMs
      const subtitleDuration = Math.max((seg.endMs - seg.startMs) / 1000, 0.04);
      frameFiles.push({ png: framePng, duration: subtitleDuration });

      // 字幕结束后到下一段开始之间，插入空白帧
      const nextStartMs = s + 1 < segments.length ? segments[s + 1].startMs : totalMs;
      const gapMs = nextStartMs - seg.endMs;
      if (gapMs > 50) {
        frameFiles.push({ png: blankPng, duration: gapMs / 1000 });
      }
    }

    // 确保帧列表总时长 >= 音频时长，防止视频提前结束导致幻灯片早切
    const totalFrameDur = frameFiles.reduce((sum, f) => sum + f.duration, 0);
    if (totalFrameDur < audioDuration - 0.05) {
      frameFiles[frameFiles.length - 1].duration += (audioDuration - totalFrameDur);
    }
  } else {
    // fallback：无时间戳，均分
    const blankPng = path.join(tmpDir, `slide-${slideIndex}-blank.png`);
    await renderFrame(imagePath, [], circleAvatarPath, blankPng);
    frameFiles = [{ png: blankPng, duration: audioDuration }];
  }

  // 生成concat list
  const listPath = outPath + '.frames.txt';
  const listContent = frameFiles.map(f => `file '${f.png}'\nduration ${f.duration.toFixed(3)}`).join('\n')
    + `\nfile '${frameFiles[frameFiles.length - 1].png}'\n`;
  fs.writeFileSync(listPath, listContent);

  // 视频时长以音频为准，加 0.1s 缓冲避免最后一帧被截断
  const silentPath = outPath + '.silent.mp4';
  execSync([
    `"${FFMPEG}" -y`,
    `-f concat -safe 0 -i "${listPath}"`,
    `-vf "scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black"`,
    `-c:v libx264 -pix_fmt yuv420p -r 25 -t ${audioDuration + 0.1}`,
    `"${silentPath}"`,
  ].join(' '), { stdio: 'pipe' });

  if (hasAudio) {
    execSync([
      `"${FFMPEG}" -y`,
      `-i "${silentPath}"`,
      `-i "${audioPath}"`,
      `-c:v copy -c:a aac -b:a 192k`,
      `-map 0:v -map 1:a -shortest`,
      `"${outPath}"`,
    ].join(' '), { stdio: 'pipe' });
    fs.unlinkSync(silentPath);
  } else {
    fs.renameSync(silentPath, outPath);
  }

  fs.unlinkSync(listPath);
}

// ── 合并所有页视频 ────────────────────────────────────────────────────
function concatVideos(videoPaths, outPath) {
  const tmpList = outPath + '.concat.txt';
  fs.writeFileSync(tmpList, videoPaths.map(p => `file '${p}'`).join('\n'));
  execSync([
    `"${FFMPEG}" -y`,
    `-f concat -safe 0 -i "${tmpList}"`,
    `-c copy`,
    `"${outPath}"`,
  ].join(' '), { stdio: 'inherit' });
  fs.unlinkSync(tmpList);
}

// ── 主流程 ────────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slides-presenter-'));

try {
  console.log(`\n生成 ${slides.length} 页幻灯片视频...\n`);

  let circleAvatarPath = null;
  if (avatarPath && fs.existsSync(avatarPath)) {
    process.stdout.write('  准备头像...');
    circleAvatarPath = prepareCircleAvatar(avatarPath, tmpDir);
    console.log(' ✓');
  }

  const slideVideos = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const pad = String(i + 1).padStart(2, '0');
    const audioPath = path.join(audioDir, `slide-${pad}.mp3`);
    const hasAudio = fs.existsSync(audioPath);
    const audioDuration = hasAudio ? getAudioDuration(audioPath) : 5.0;

    process.stdout.write(`  第 ${i + 1}/${slides.length} 页（${audioDuration.toFixed(1)}s）...`);

    const slideVideoPath = path.join(tmpDir, `slide-${pad}.mp4`);
    await makeSlideVideo(slide, i, hasAudio ? audioPath : null, slideVideoPath, audioDuration, circleAvatarPath, tmpDir);

    slideVideos.push(slideVideoPath);
    console.log(' ✓');
  }

  console.log(`\n合并 ${slideVideos.length} 页视频...`);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  concatVideos(slideVideos, outputFile);

  // 嵌入封面图thumbnail
  const coverPath = slides[0]?.image;
  if (coverPath && fs.existsSync(coverPath)) {
    const tmpOut = outputFile + '.tmp.mp4';
    execSync([
      `"${FFMPEG}" -y`,
      `-i "${outputFile}"`,
      `-i "${coverPath}"`,
      `-map 0 -map 1`,
      `-c copy -c:v:1 mjpeg`,
      `-disposition:v:1 attached_pic`,
      `"${tmpOut}"`,
    ].join(' '), { stdio: 'pipe' });
    fs.renameSync(tmpOut, outputFile);
  }

  const totalSec = slides.reduce((sum, _, i) => {
    const pad = String(i + 1).padStart(2, '0');
    const audioPath = path.join(audioDir, `slide-${pad}.mp3`);
    return sum + (fs.existsSync(audioPath) ? getAudioDuration(audioPath) : 5.0);
  }, 0);

  console.log(`\n✅ 视频已生成：${outputFile}`);
  console.log(JSON.stringify({
    success: true,
    output: outputFile,
    slides: slides.length,
    totalSeconds: Math.round(totalSec),
  }));

} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
