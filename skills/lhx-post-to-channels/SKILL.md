---
name: post-to-channels
description: |
  自动上传并发布视频到微信视频号（WeChat Channels / 视频号）后台，支持标题、简介、话题标签、合集、声明原创、自动发表。
  Use when user wants to: "上传视频号"、"发布视频号"、"发视频号"、"发到视频号"、"自动发布视频"、"post to channels"、"post to 视频号"、"/post-to-channels"。
---

# post-to-channels

自动打开视频号（WeChat Channels）后台，上传并发布视频。

## Usage

```
/post-to-channels path/to/video.mp4
/post-to-channels path/to/video.mp4 --title "视频标题"
/post-to-channels path/to/video.mp4 --title "视频标题" --desc "视频简介"
/post-to-channels path/to/video.mp4 --title "视频标题" --publish
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--video <path>` | 视频文件路径（第一个位置参数也可以） | 必填 |
| `--title <text>` | 视频标题（**硬性上限 16 字符，超出会导致发布失败**） | 必填 |
| `--desc <text>` | 视频简介/描述（**必填**，不填会影响视频分发效果） | 必填 |
| `--topic <name>` | 话题标签（如 `AI` → 添加 #AI 标签） | — |
| `--collection <name>` | 添加到合集（如 `AI`） | — |
| `--original` | 声明原创 | 否 |
| `--publish` | 自动点击"发表"按钮发布 | 否（仅填写表单，留浏览器供预览） |

## Workflow

```
输入（视频路径 + 标题）
       ↓
Step 1: 加载偏好设置
       ↓
Step 2: 验证文件存在
       ↓
Step 3: 调用 upload.ts → 打开 Chrome → 自动操作
       ↓
Step 4: 完成报告
```

---

### Step 1: 加载偏好

读取 EXTEND.md（若存在），存储以下变量供后续步骤使用。

---

### Step 2: 验证输入

- 确认视频文件存在
- 若未传入 `--title`，询问用户标题（**必填**）
- **⚠️ 标题字符数检查**：中文每字算 1，英文字母/数字每个算 1，总长度必须 ≤ 16，否则发布失败。超出时必须缩短后再继续
- **⚠️ 描述必填检查**：若未传入 `--desc`，必须向用户索取或自动生成描述，不可跳过
- 若 `--title` 已从其他 skill（如 slides-video）生成封面文字，可以直接复用，但仍需检查字符数

---

### Step 3: 上传视频

```bash
SKILL_DIR="/Users/hongxing/.claude/skills/post-to-channels"
~/.bun/bin/bun "${SKILL_DIR}/scripts/upload.ts" \
  --video <video_path> \
  --title <title> \
  [--desc <description>] \
  [--topic <topic>] \
  [--collection <collection>] \
  [--original] \
  [--publish]
```

脚本执行流程：
1. 检测是否已有 Chrome 在运行（复用现有实例），否则启动新 Chrome
2. 导航到 `https://channels.weixin.qq.com/platform/post/create`（新建表单）
3. 若未登录，等待用户扫码（最多 3 分钟）
4. 通过 CDP `DOM.setFileInputFiles` 上传视频文件
5. 等待上传完成（最多 15 分钟，适配大文件）
6. 自动填入标题
7. 若传入 `--desc`，填写简介；若传入 `--topic`，添加话题标签（如 #AI）
8. 若传入 `--collection`，选择合集
9. 若传入 `--original`，声明原创（自动勾选协议并确认）
10. 若传入 `--publish`，自动点击"发表"按钮；完成后 Chrome 窗口保持打开

环境变量（非标准安装时使用）：
```bash
CHANNELS_CHROME_PATH="/path/to/chrome" ~/.bun/bin/bun "${SKILL_DIR}/scripts/upload.ts" ...
```

---

### Step 4: 完成报告

```
✅ 视频已上传到视频号！

视频：[文件路径]
标题：[标题]
简介：[简介]
操作：[已发布 / 已填写表单（未发布）]
Chrome 窗口已保持打开供查看。
```

---

## 首次使用

首次运行时需要在 Chrome 窗口扫码登录视频号。登录后 session 会保存在专属 Chrome profile：

```
~/.local/share/wechat-channels-profile/
```

后续运行直接复用，无需重新登录。

---

## Preferences (EXTEND.md)

```bash
test -f .baoyu-skills/post-to-channels/EXTEND.md && echo "project"
test -f "$HOME/.baoyu-skills/post-to-channels/EXTEND.md" && echo "user"
```

支持的配置项：

```yaml
default_title:          # 默认标题（可选）
default_desc:           # 默认简介（可选）
auto_publish: false     # 是否自动发布（默认 false，仅填写表单）
chrome_path:            # Chrome 路径（非标准安装时填写）
```

---

## 依赖

| 工具 | 路径 | 用途 |
|------|------|------|
| Bun | `bun` | 运行 TypeScript 脚本 |
| Google Chrome | 自动检测 | CDP 自动化，保留登录态 |

---

## 技术踩坑记录

视频号后台（channels.weixin.qq.com）有几处非常规实现，调试时需注意：

### 1. wujie 微前端 / Shadow DOM
页面使用 [wujie（无界）](https://github.com/Tencent/wujie) 微前端框架，整个表单运行在 `<WUJIE-APP>` 自定义元素的 Shadow Root 里。

- 普通 `document.querySelector(...)` 返回 null，必须先拿到 Shadow Root：
  ```javascript
  const shadow = Array.from(document.querySelectorAll('*'))
    .find(el => el.shadowRoot)?.shadowRoot;
  ```
- 文件上传框的 nodeId 需要用 `DOM.getDocument({ pierce: true })` 穿透 Shadow DOM 获取，再用 `DOM.setFileInputFiles` 设置文件。

### 2. 上传完成信号：封面缩略图是假信号
视频封面缩略图在上传**进行中**就会先渲染出来，不能作为完成判断依据。

**正确信号**：轮询"发表"按钮的 CSS 类名——上传完成后 `weui-desktop-btn_disabled` 类消失，按钮变为可点击。

### 3. Vue 响应式：直接赋值 `.value` 无效
标题输入框是 Vue 管理的 `<input>`，直接 `input.value = title` + `dispatchEvent('input')` 不会触发 Vue 状态更新，"发表"按钮依然灰色。

**解决方案**：用 CDP 模拟真实键盘操作：
1. `Input.dispatchMouseEvent` 点击聚焦
2. `Input.dispatchKeyEvent` 全选（Cmd+A）
3. `Input.insertText` 插入文字

### 4. 描述框是 contenteditable，不是 input
描述框是 `div.input-editor[contenteditable]`，不能用 `.value =` 赋值。同样需要点击聚焦后再用 `Input.insertText`。

话题标签的做法：点击页面上的 `#话题` 按钮（自动在编辑器光标处插入 `#`），然后 `Input.insertText` 输入话题名，Vue 自动将 `#AI` 转换为话题标签节点。

### 5. 声明原创：嵌套三步确认流程
点击"声明原创"不是直接勾选，而是弹出对话框，对话框内还有第二个复选框：

```
Step 1: 点击 .declare-original-checkbox label   → 打开对话框
Step 2: 点击对话框内 .original-proto-wrapper label → 勾选协议（此步不能跳过）
Step 3: 等待"声明原创"按钮 disabled 类消失 → 点击确认
```

第 2 步缺失会导致第 3 步的确认按钮始终为灰色无法点击。

---

## 与 slides-video 联动

生成视频后直接上传：

```
/slides-video article.md --output ~/Desktop/video.mp4
/post-to-channels ~/Desktop/video.mp4 --title "AI替代浪潮的隐患" --publish
```
