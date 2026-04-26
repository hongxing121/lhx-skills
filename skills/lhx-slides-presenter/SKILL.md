---
name: slides-presenter
description: |
  将文章转化为带解说的幻灯片视频。每页显示信息图或文字，右下角有头像讲解动效，配合TTS语音解说。
  Use when user wants to: "带解说的视频"、"幻灯片讲解视频"、"slides presenter"、"/slides-presenter"、"右下角头像讲解"。
---

# slides-presenter

将文章转化为带语音解说的幻灯片视频：文章 → 分页 + 解说词 → TTS语音（1.2倍速）→ 合成带头像动效的竖屏MP4。

## Usage

```
/slides-presenter path/to/article.md
/slides-presenter https://mp.weixin.qq.com/s/xxx
/slides-presenter path/to/article.md --output ~/Desktop/video.mp4
/slides-presenter path/to/article.md --slides 5
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--output <path>` | 输出视频路径 | `~/Desktop/slides-presenter-output.mp4` |
| `--slides <n>` | 幻灯片页数（不含结尾页） | 自动（4-5页） |
| `--avatar <path>` | 头像图片路径 | EXTEND.md配置 |
| `--voice <id>` | 阿里云TTS音色ID | EXTEND.md配置 |
| `--title <text>` | 贯穿全片的顶部标题（也用于封面） | 从文章标题生成 |
| `--cover-image <path>` | 封面图路径 | EXTEND.md配置 |
| `--width <px>` | 视频宽度 | 1080（竖屏） |
| `--height <px>` | 视频高度 | 1920（竖屏） |

## Preferences (EXTEND.md)

```bash
test -f .baoyu-skills/slides-presenter/EXTEND.md && echo "project"
test -f "$HOME/.baoyu-skills/slides-presenter/EXTEND.md" && echo "user"
```

支持的配置项：

```yaml
avatar_image:           # 头像图片路径（JPG/PNG），右下角圆形头像
voice_id: longxiaochun  # 阿里云TTS音色（默认龙小淳；克隆音色用cosyvoice-v2-xxx）
default_output_dir: ~/Desktop
ffmpeg_path: /opt/homebrew/bin/ffmpeg
cover_image:            # 封面图路径，用于视频第一帧（固定封面模式下必填）
cover_mode: fixed       # fixed（固定封面）或 auto（从文章封面自动选择）
```

## Workflow

```
输入（文章路径或URL）
      ↓
Step 1: 加载偏好设置
      ↓
Step 2: 读取内容（本地文件或抓取URL）
      ↓
Step 3: 切分幻灯片 + 生成每页解说词（含结尾页）
      ↓
Step 3.2: 爆款审稿人审查（钩子/金句/引导）
      ↓
Step 3.5: 检查插图（有则使用，无则用baoyu-article-illustrator生成）
      ↓
Step 4: TTS合成每页语音（原速）
      ↓
Step 4.5: 音频加速至1.2倍，复制timestamps.json
      ↓
Step 5 & 6: 生成视频（竖屏1080x1920，字幕同步，头像动效）
      ↓
Step 6.5: 封面图（带标题文字）作为第一帧拼接到视频开头
      ↓
Step 7: 完成报告
```

---

### Step 1: 加载偏好

按优先级：CLI参数 → EXTEND.md → 默认值。

读取并存储：`avatar_image`、`voice_id`、`cover_image`、`cover_mode`、`ffmpeg_path`、`default_output_dir`。

#### 封面图模式选择（⚠️ 每次启动必执行）

**情况 A：EXTEND.md 已有 `cover_mode` 配置**

| cover_mode | 行为 |
|-----------|------|
| `fixed` | 直接使用 `cover_image` 路径，跳过询问，继续 Step 2 |
| `auto` | 视频封面从文章封面图/插图中自动选择，跳过询问，继续 Step 2 |

**情况 B：EXTEND.md 没有 `cover_mode` 配置**

用 AskUserQuestion 询问用户：

> 「视频封面图使用哪种方式？」
> - **固定封面**（每次用同一张图片，如个人照片）
> - **自动选择**（从文章封面图自动匹配）

- 选**固定封面**：询问图片路径 → 将图片拷贝到 `~/.baoyu-skills/slides-presenter/cover.JPG` → 在 EXTEND.md 写入 `cover_image: <拷贝后路径>` 和 `cover_mode: fixed` → 继续
- 选**自动选择**：在 EXTEND.md 写入 `cover_mode: auto` → 继续

#### cover_image 解析规则（固定封面模式）

1. CLI `--cover-image` 参数
2. EXTEND.md `cover_image` 字段
3. 均未设置 → 报错：「请先配置封面图，或重新运行并选择封面模式」

**❌ 严禁**：用文章插图目录（`illustrations/`）或 baoyu-cover-image 生成的文章封面作为视频封面。视频封面只能来自 `cover_image` / `avatar_image` 配置的个人图片。

---

### Step 2: 读取内容

- 本地文件（.md）：用Read工具读取，去除YAML frontmatter
- URL（公众号等）：用`baoyu-url-to-markdown` skill抓取
- 检查文章是否已有插图目录（如`illustrations/`），记录图片路径

---

### Step 3: 切分幻灯片 + 生成解说词

将文章切分为4-5页内容页 + 1页结尾页，每页同时生成：
- `text`：显示在幻灯片上的核心文字（精炼）
- `narration`：该页的解说词（展开讲解，口语化，第一人称）
- `image`：对应插图的**绝对路径**（Step 3.5填入）

解说词要求：
- 口语化，像在讲话而不是朗读
- 自然衔接，有起承转合
- 句号处要有停顿感（可用"记住，"、"所以，"等过渡词）
- 结尾页固定解说词：「如果你也对 AI 感兴趣，欢迎关注我。」（根据实际内容调整）
- **标点规范**：完整句子结尾用`。`，句中停顿用`，`；不要用`，`代替`。`结尾，否则TTS停顿会偏短

生成完解说词后，**必须执行 Step 3.1 校对**再继续。

---

### Step 3.1: 解说词校对（⚠️ 不可跳过）

逐页检查所有 `narration` 字段，修正以下问题：

1. **标点符号**：句子末尾必须是`。`或`！`或`？`，不能用`，`结尾；中间自然停顿用`，`
2. **语句通顺**：读出来是否顺口，有没有书面语、长句堆叠
3. **错别字**：仔细检查同音字、形近字

确认无误后，重新用 Python 写入 slides.json（覆盖之前的版本），再继续 Step 3.2。

---

### Step 3.2: 爆款审稿人审查（⚠️ 不可跳过）

以**资深视频号爆款内容专家**的视角，逐页挑剔地审视解说词。重点审查三个维度：

#### 1. 前三秒——开头必须是钩子

第一页的 `narration` 前两句话决定用户是否划走。审查标准：
- **是否有悬念、冲突或反直觉的信息？** 例如"ACOS 150%的广告，反而让月利润翻了两倍"比"前几天我做了一个实验"强得多
- **是否直接抛出了利益点？** 用户3秒内必须知道"看这个视频我能得到什么"
- **禁止**：自我介绍、背景铺垫、"大家好"类开场

#### 2. 章节中间——每页至少一个金句

每页 `narration` 中必须包含至少一句**可以被单独截图传播的金句**。审查标准：
- **是否有观点密度？** 不能只是在复述信息，要有判断、有态度
- **是否有记忆锚点？** 如对比、数字、类比、反常识表述
- **示例金句**："过去十年拼信息差，接下来十年拼提问差"、"亏损广告其实是最赚钱的资产"

#### 3. 结尾——引导行动

最后一页内容页（结尾页之前）的 `narration` 末尾必须有引导：
- 引导关注、收藏、评论中的至少一个
- 要自然融入内容，不能生硬

#### 审查流程

1. 逐页列出问题和改进建议（输出审查报告）
2. 根据审查结果修改 `narration`（同时保持口语化和标点规范）
3. 再次以审稿人视角快速复审，确认改进到位
4. 复审通过后，用 Python 写入 slides.json（覆盖之前的版本），继续 Step 3.5

---

**⚠️ 写入slides.json必须用Python，不能直接Write**，否则narration中的中文引号`""`会导致JSON解析失败：

```python
import json

slides = [...]  # Python列表，字符串用普通引号

with open('/tmp/slides-presenter-slides.json', 'w') as f:
    json.dump(slides, f, ensure_ascii=False, indent=2)
```

slides.json格式：

```json
[
  {
    "text": "幻灯片显示的文字...",
    "narration": "解说词，口语化展开...",
    "image": "/absolute/path/to/image.png"
  },
  {
    "text": "如果你也对 AI 感兴趣\n欢迎关注我",
    "narration": "如果你也对 AI 感兴趣，欢迎关注我。",
    "image": "/absolute/path/to/cover.png"
  }
]
```

---

### Step 3.5: 检查插图

| 情况 | 处理 |
|------|------|
| 文章已有插图目录 | 直接使用，填入`image`字段（绝对路径） |
| 文章无插图 | 调用`baoyu-article-illustrator`为每页生成插图，输出到`illustrations/{slug}/`，填入`image`字段 |
| 结尾页 | 使用文章的封面图（如公众号文章封面，或 baoyu-cover-image 生成的封面图） |

**重要**：`image`字段必须使用绝对路径，不能用相对路径。

---

### Step 4: TTS合成语音（原速）

使用 `bun`（不是node）调用脚本：

```bash
bun ${SKILL_DIR}/scripts/tts.js \
  --slides-file /tmp/slides-presenter-slides.json \
  --output-dir /tmp/slides-presenter-audio/ \
  --voice <voice_id>
```

输出：`/tmp/slides-presenter-audio/slide-01.mp3` + `slide-01.timestamps.json` ...

---

### Step 4.5: 音频加速至1.2倍

```bash
mkdir -p /tmp/slides-presenter-audio-fast/

for i in 01 02 03 ...; do
  ffmpeg -y -i /tmp/slides-presenter-audio/slide-${i}.mp3 \
    -filter:a "atempo=1.2" \
    /tmp/slides-presenter-audio-fast/slide-${i}.mp3

  # timestamps.json直接复制（generate.js内部会除以speedRatio=1.2换算）
  cp /tmp/slides-presenter-audio/slide-${i}.timestamps.json \
     /tmp/slides-presenter-audio-fast/slide-${i}.timestamps.json
done
```

---

### Step 5 & 6: 生成视频

`--title`参数传入视频标题（贯穿全片顶部显示）：

```bash
bun ${SKILL_DIR}/scripts/generate.js \
  --slides-file /tmp/slides-presenter-slides.json \
  --audio-dir /tmp/slides-presenter-audio-fast/ \
  --output <output_path> \
  --avatar <avatar_path> \
  --title "<视频标题>" \
  --width 1080 --height 1920
```

视频布局（竖屏）：
- 图片居中显示，上下留黑边
- 标题栏（黄色文字）紧贴图片上方
- 字幕（白色大字）紧贴图片下方黑边区域，与语音精确同步
- 右下角圆形头像

---

### Step 6.5: 封面图带标题作为第一帧

视频标题要求：**≤16字，不含标点符号**。

**封面图来源**：使用 Step 1 中解析的 `cover_image` 路径（固定封面模式下为用户个人照片，如 `~/.baoyu-skills/slides-presenter/cover.JPG`）。❌ 严禁使用文章插图或 baoyu-cover-image 生成的图片。

```bash
# 1. 用canvas生成带标题的封面图
# imagePath = Step 1 解析的 cover_image（个人固定封面图路径）
cat << 'EOF' > /tmp/make-cover.js
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';

const WIDTH = 1080, HEIGHT = 1920;
const title = '<视频标题>';
const imagePath = '<cover_image从Step1解析>';
const outPath = '/tmp/cover-with-title.png';

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, WIDTH, HEIGHT);

const img = await loadImage(imagePath);
const scale = Math.max(WIDTH / img.width, HEIGHT / img.height);
const sw = img.width * scale, sh = img.height * scale;
ctx.drawImage(img, (WIDTH - sw) / 2, (HEIGHT - sh) / 2, sw, sh);

const fontSize = 90;
ctx.font = `900 ${fontSize}px "PingFang SC", "Heiti SC", sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.shadowColor = 'rgba(0,0,0,0.95)';
ctx.shadowBlur = 20;

const lines = title.length <= 8 ? [title] : [title.slice(0, Math.ceil(title.length/2)), title.slice(Math.ceil(title.length/2))];
const lineH = fontSize * 1.3;
const startY = HEIGHT * 0.58;

ctx.fillStyle = 'rgba(0,0,0,0.45)';
ctx.fillRect(40, startY - 20, WIDTH - 80, lines.length * lineH + 40);

ctx.fillStyle = '#FFE000';
lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, startY + i * lineH));

fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
EOF
bun /tmp/make-cover.js

# 2. 封面图做成0.1秒视频片段（带静音音轨）
ffmpeg -y \
  -loop 1 -i /tmp/cover-with-title.png \
  -f lavfi -i anullsrc=r=22050:cl=mono \
  -vf "scale=1080:1920" \
  -c:v libx264 -pix_fmt yuv420p -r 25 \
  -c:a aac -b:a 192k -t 0.1 \
  /tmp/cover-frame.mp4

# 3. 拼接到主视频前面
echo "file '/tmp/cover-frame.mp4'
file '<output_path>'" > /tmp/cover-concat.txt

ffmpeg -y -f concat -safe 0 -i /tmp/cover-concat.txt -c copy <final_output_path>
```

---

### Step 7: 完成报告

```
✅ 视频已生成！

输入：[文件路径或URL]
幻灯片：N 页（含结尾页）
插图：[已有插图 / 新生成N张]
语音：阿里云TTS（音色：xxx，1.2倍速）
输出：[视频路径]
总时长：约 X 秒
封面：[封面图路径]
```

---

## 关键技术说明

### slides.json必须用Python写入
narration中经常包含中文引号`""`，直接用Write工具写JSON会导致解析失败。**必须用Python的json.dump()写入**。

### DashScope时间戳去重
DashScope WebSocket TTS返回的是累积句子，同一个`begin_index`会出现多次。generate.js中`buildSubtitleSegments`函数会自动按`begin_index`去重，保留最后一次（最准确）。时间戳单位是毫秒，是相对整段音频的绝对时间，generate.js内部除以`speedRatio=1.2`换算为加速后时间。

### 字幕同步逻辑
- 每段字幕只显示到`endMs`（不延续到下一段开始）
- `endMs`到下一段`startMs`之间插入空白帧
- 确保字幕不重叠、不错位

### 图片路径
slides.json中`image`字段必须使用绝对路径，否则generate.js找不到图片。

### 视频标题
- `--title`参数传给generate.js，显示在每页图片上方
- 同一个标题也用于封面图文字叠加
- 封面标题要求：≤16字，不含标点

---

## 依赖

| 工具 | 用途 |
|------|------|
| bun | 运行脚本（内置WebSocket，不能用node） |
| ffmpeg | 合成视频、音频加速 |
| @napi-rs/canvas | 生成带字幕/标题的帧图片 |
| 阿里云DashScope | TTS语音合成（WebSocket API） |
| baoyu-article-illustrator | 文章无插图时自动生成 |
| baoyu-url-to-markdown | 抓取公众号等URL内容 |
