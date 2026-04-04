#!/usr/bin/env bun
/**
 * post-to-channels — Upload and publish video to WeChat Channels (视频号)
 *
 * Architecture note:
 * channels.weixin.qq.com uses the wujie micro-frontend framework.
 * The actual rendered DOM lives inside the shadow root of <WUJIE-APP class="wujie_iframe">.
 * CDP DOM.setFileInputFiles uses pierce=true nodeId (3181-range) to reach the shadow DOM input.
 * JavaScript DOM queries must go via: getShadow().querySelector(...)
 *
 * Key selectors (confirmed via DOM inspection):
 *   File input:          input[type="file"][accept*="video"]        (in shadow DOM)
 *   Description editor:  div.input-editor[contenteditable]          (in shadow DOM)
 *   Topic button:        div.finder-tag-wrap.btn text="#话题"       (in shadow DOM)
 *   Title input:         input[placeholder*="概括视频主要内容"]      (in shadow DOM)
 *   Collection trigger:  div.post-album-display                     (in shadow DOM)
 *   Collection items:    div.option-item > div.item > div.name      (in shadow DOM)
 *   Originality label:   label.ant-checkbox-wrapper                 (in shadow DOM)
 *   Originality dialog:  div.declare-original-dialog                (in shadow DOM)
 *   Publish btn:         button with text "发表"                    (in shadow DOM)
 *   Draft btn:           button with text "保存草稿"                (in shadow DOM)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNELS_CREATE_URL = 'https://channels.weixin.qq.com/platform/post/create';
const CHANNELS_HOST = 'channels.weixin.qq.com';

// JS snippet to get the wujie shadow root (works from the parent page context)
const GET_SHADOW = `Array.from(document.querySelectorAll('*')).find(el => el.shadowRoot)?.shadowRoot`;

// ─── CDP utilities ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Cannot allocate port')));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function findChrome(): string {
  const override = process.env.CHANNELS_CHROME_PATH?.trim();
  if (override && fs.existsSync(override)) return override;

  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'];

  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error('Chrome not found. Set CHANNELS_CHROME_PATH env var.');
}

function getDefaultProfileDir(): string {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'wechat-channels-profile');
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

class Cdp {
  private ws: WebSocket;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout> | null;
    }
  >();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      try {
        const data =
          typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
        const msg = JSON.parse(data) as {
          id?: number;
          result?: unknown;
          error?: { message?: string };
        };
        if (msg.id) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (p.timer) clearTimeout(p.timer);
            msg.error?.message ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
          }
        }
      } catch {}
    });
    ws.addEventListener('close', () => {
      for (const [id, p] of this.pending) {
        this.pending.delete(id);
        if (p.timer) clearTimeout(p.timer);
        p.reject(new Error('CDP connection closed'));
      }
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('CDP connect timeout')), 30_000);
      ws.addEventListener('open', () => {
        clearTimeout(t);
        resolve();
      });
      ws.addEventListener('error', () => {
        clearTimeout(t);
        reject(new Error('CDP connect failed'));
      });
    });
    return new Cdp(ws);
  }

  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { sessionId?: string; timeoutMs?: number },
  ): Promise<T> {
    const id = ++this.nextId;
    const msg: Record<string, unknown> = { id, method };
    if (params) msg.params = params;
    if (opts?.sessionId) msg.sessionId = opts.sessionId;
    const timeoutMs = opts?.timeoutMs ?? 60_000;
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              reject(new Error(`CDP timeout: ${method}`));
            }, timeoutMs)
          : null;
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(msg));
    });
    return result as T;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {}
  }
}

// ─── DOM tree traversal to find file input ───────────────────────────────────

interface DomNode {
  nodeId: number;
  localName?: string;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
  contentDocument?: DomNode;
}

function findNodeId(node: DomNode, predicate: (attrs: Record<string, string>, node: DomNode) => boolean): number {
  const attrs: Record<string, string> = {};
  const a = node.attributes || [];
  for (let i = 0; i < a.length; i += 2) attrs[a[i]!] = a[i + 1]!;

  if (predicate(attrs, node)) return node.nodeId;

  for (const c of node.children || []) { const r = findNodeId(c, predicate); if (r) return r; }
  for (const s of node.shadowRoots || []) { const r = findNodeId(s, predicate); if (r) return r; }
  if (node.contentDocument) { const r = findNodeId(node.contentDocument, predicate); if (r) return r; }
  return 0;
}

// ─── Main upload logic ───────────────────────────────────────────────────────

interface UploadOptions {
  videoPath: string;
  title: string;
  description?: string;
  topic?: string;        // hashtag topic to add (e.g. "AI" → adds #AI tag)
  collection?: string;   // collection name to select (e.g. "AI")
  original?: boolean;    // whether to declare originality (声明原创)
  publish?: boolean;
  draft?: boolean;
  profileDir?: string;
}

async function uploadToChannels(opts: UploadOptions): Promise<void> {
  const { title, description = '', topic = '', collection = '', original = false, publish = false, draft = false } = opts;
  const videoPath = path.isAbsolute(opts.videoPath)
    ? opts.videoPath
    : path.resolve(process.cwd(), opts.videoPath);
  const profileDir = opts.profileDir ?? getDefaultProfileDir();

  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  await mkdir(profileDir, { recursive: true });

  // Try connecting to an existing Chrome instance at channels.weixin.qq.com first
  let cdp: Cdp | null = null;
  let sessionId = '';
  let launchedChrome = false;

  const tryConnectExisting = async (): Promise<boolean> => {
    try {
      // Try common debug ports used by our own previous launches
      for (const port of [62945, 9222, 9223, 9224]) {
        try {
          const v = await fetchJson<{ webSocketDebuggerUrl?: string }>(
            `http://127.0.0.1:${port}/json/version`,
          ).catch(() => ({ webSocketDebuggerUrl: undefined }));
          if (!v.webSocketDebuggerUrl) continue;
          const testCdp = await Cdp.connect(v.webSocketDebuggerUrl);
          const targets = await testCdp.send<{
            targetInfos: Array<{ targetId: string; url: string; type: string }>;
          }>('Target.getTargets');
          if (targets.targetInfos.some((t) => t.url.includes(CHANNELS_HOST))) {
            cdp = testCdp;
            return true;
          }
          testCdp.close();
        } catch {}
      }
    } catch {}
    return false;
  };

  const connected = await tryConnectExisting();

  if (!connected) {
    // Launch new Chrome
    const chromePath = findChrome();
    const port = await getFreePort();
    console.log(`[channels] Launching Chrome (profile: ${profileDir})`);
    spawn(
      chromePath,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
        CHANNELS_CREATE_URL,
      ],
      { stdio: 'ignore' },
    );
    launchedChrome = true;

    const bootStart = Date.now();
    while (Date.now() - bootStart < 30_000) {
      try {
        const v = await fetchJson<{ webSocketDebuggerUrl?: string }>(
          `http://127.0.0.1:${port}/json/version`,
        );
        if (v.webSocketDebuggerUrl) {
          cdp = await Cdp.connect(v.webSocketDebuggerUrl);
          break;
        }
      } catch {}
      await sleep(300);
    }
    if (!cdp) throw new Error('Chrome debug port not ready');
  }

  try {
    // Get the channels page target
    const getChannelsTarget = async () => {
      const targets = await cdp!.send<{
        targetInfos: Array<{ targetId: string; url: string; type: string }>;
      }>('Target.getTargets');
      return targets.targetInfos.find(
        (t) => t.type === 'page' && t.url.includes(CHANNELS_HOST),
      );
    };

    await sleep(2000);
    let pageTarget = await getChannelsTarget();
    if (!pageTarget) {
      await cdp!.send('Target.createTarget', { url: CHANNELS_CREATE_URL });
      await sleep(2000);
      pageTarget = await getChannelsTarget();
      if (!pageTarget) throw new Error('Cannot open WeChat Channels page');
    }

    const attachResult = await cdp!.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId: pageTarget.targetId,
      flatten: true,
    });
    sessionId = attachResult.sessionId;

    await cdp!.send('Runtime.enable', {}, { sessionId });
    await cdp!.send('DOM.enable', {}, { sessionId });
    await cdp!.send('Page.enable', {}, { sessionId });

    // Helper: evaluate JS returning a string value
    const evalStr = async (expr: string): Promise<string> => {
      try {
        const r = await cdp!.send<{ result: { value: unknown } }>(
          'Runtime.evaluate',
          { expression: expr, returnByValue: true },
          { sessionId },
        );
        return String(r.result.value ?? '');
      } catch {
        return '';
      }
    };

    // Helper: evaluate JS in the shadow DOM context
    // All content queries must go through the wujie shadow root
    const shadow = (expr: string) =>
      `(function() { const shadow = ${GET_SHADOW}; if (!shadow) return null; ${expr} })()`;

    const evalShadow = (expr: string) => evalStr(shadow(expr));

    const getUrl = () => evalStr('location.href');

    // ── Wait for login ──────────────────────────────────────────────────────
    const isLoggedIn = async () => {
      const url = await getUrl();
      return (
        url.includes(CHANNELS_HOST) &&
        !url.includes('login') &&
        !url.includes('passport') &&
        !url.includes('auth')
      );
    };

    if (!(await isLoggedIn())) {
      console.log('[channels] Not logged in. Please scan QR code in Chrome...');
      const loginStart = Date.now();
      while (Date.now() - loginStart < 180_000) {
        await sleep(2000);
        if (await isLoggedIn()) break;
      }
      if (!(await isLoggedIn())) throw new Error('Login timeout. Please log in first.');
    }
    console.log('[channels] Logged in.');

    // Always navigate to a fresh create page to ensure clean form state
    console.log('[channels] Navigating to create page...');
    await cdp!.send('Page.navigate', { url: CHANNELS_CREATE_URL }, { sessionId });
    await sleep(3000);

    // Wait for wujie shadow DOM + file input to be ready
    console.log('[channels] Waiting for page to fully initialize...');
    let fileNodeId = 0;
    const initStart = Date.now();
    while (Date.now() - initStart < 30_000) {
      await sleep(1500);

      // Check shadow DOM exists and has a file input
      const shadowReady = await evalStr(`
        (function() {
          const shadow = ${GET_SHADOW};
          if (!shadow) return 'no-shadow';
          const inp = shadow.querySelector('input[type="file"]');
          return inp ? 'ready' : 'no-input';
        })()
      `);

      if (shadowReady === 'ready') {
        // Get nodeId via pierce
        const { root } = await cdp!.send<{ root: DomNode }>(
          'DOM.getDocument',
          { depth: -1, pierce: true },
          { sessionId },
        );
        fileNodeId = findNodeId(root, (attrs) => attrs.type === 'file');
        if (fileNodeId) break;
      }
      console.log(`[channels] Page init status: ${shadowReady}`);
    }

    if (!fileNodeId) throw new Error('Video file input not found in shadow DOM after 30s');
    console.log(`[channels] File input nodeId: ${fileNodeId}`);

    // ── Upload video ──────────────────────────────────────────────────────────
    console.log(`[channels] Uploading: ${videoPath}`);
    await cdp!.send('DOM.setFileInputFiles', { nodeId: fileNodeId, files: [videoPath] }, { sessionId });
    console.log('[channels] File handed to browser. Waiting for upload to complete...');

    // Dispatch change event in shadow DOM context
    await evalShadow(`
      const inp = shadow.querySelector('input[type="file"]');
      if (inp) {
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return 'dispatched';
    `);

    // ── Wait for upload completion ────────────────────────────────────────────
    // True completion signal: the "发表" button loses its `weui-desktop-btn_disabled` class.
    // Note: cover-found is a false positive — the thumbnail appears while upload is still in progress.
    const uploadTimeout = 15 * 60 * 1000; // 15 minutes
    const uploadStart = Date.now();

    while (Date.now() - uploadStart < uploadTimeout) {
      await sleep(5000);

      const status = await evalShadow(`
        const publishBtn = Array.from(shadow.querySelectorAll('button'))
          .find(b => b.textContent?.trim() === '发表');

        if (!publishBtn) return 'waiting:no-publish-btn';

        const cls = publishBtn.className || '';
        const isDisabled = cls.includes('disabled');

        // Also read progress bar for informational display
        const progressBg = shadow.querySelector('.ant-progress-bg');
        let pct = '';
        if (progressBg) {
          const style = progressBg.getAttribute('style') || '';
          const m = style.match(/width:\\s*([\\d.]+)/);
          if (m) pct = m[1] + '%';
        }

        // Check for upload error message
        const errEl = shadow.querySelector('[class*=upload-error],[class*=uploadError]');
        if (errEl) {
          const t = errEl.textContent?.trim();
          if (t && t.length < 100) return 'error:' + t;
        }

        if (!isDisabled) return 'done:publish-btn-enabled';
        return 'uploading' + (pct ? ':' + pct : '') + ':btn-still-disabled';
      `);

      console.log(`[channels] Upload status: ${status}`);

      if (status.startsWith('done:')) {
        console.log('[channels] Upload complete — publish button is now enabled!');
        break;
      }
      if (status.startsWith('error:')) {
        throw new Error(`Upload failed: ${status}`);
      }
    }

    await sleep(2000);

    // ── Fill title via CDP keyboard simulation ────────────────────────────────
    // Direct value assignment doesn't reliably trigger Vue/React state updates.
    // Use real mouse click + Input.insertText via CDP instead.
    console.log(`[channels] Filling title: "${title}"`);

    const titlePos = await evalShadow(`
      const selectors = [
        'input[placeholder*="概括视频主要内容"]',
        'input[placeholder*="6-16"]',
        'input[placeholder*="标题"]',
      ];
      for (const sel of selectors) {
        const inp = shadow.querySelector(sel);
        if (!inp) continue;
        inp.scrollIntoView({ block: 'center' });
        const rect = inp.getBoundingClientRect();
        return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, sel });
      }
      return 'null';
    `);

    if (titlePos && titlePos !== 'null' && titlePos !== '') {
      const pos = JSON.parse(titlePos) as { x: number; y: number; sel: string };
      console.log(`[channels] Title input found at (${Math.round(pos.x)}, ${Math.round(pos.y)}): ${pos.sel}`);

      // Click to focus
      await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId });
      await sleep(50);
      await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId });
      await sleep(200);

      // Select all existing text and delete
      const mod = process.platform === 'darwin' ? 4 : 2;
      await cdp!.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: mod, windowsVirtualKeyCode: 65 }, { sessionId });
      await cdp!.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: mod, windowsVirtualKeyCode: 65 }, { sessionId });
      await sleep(50);
      await cdp!.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId });
      await cdp!.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId });
      await sleep(50);

      // Insert title text
      await cdp!.send('Input.insertText', { text: title }, { sessionId });
      await sleep(500);

      const titleVal = await evalShadow(`
        const inp = shadow.querySelector('input[placeholder*="概括视频主要内容"]') ||
                    shadow.querySelector('input[placeholder*="6-16"]');
        return inp ? '"' + inp.value + '"' : 'not found';
      `);
      console.log('[channels] Title input value:', titleVal);
    } else {
      console.warn('[channels] Title input not found in shadow DOM — skipping');
    }
    await sleep(500);

    // ── Fill description + topic tag ─────────────────────────────────────────
    // The description uses a contenteditable div (.input-editor).
    // Input.insertText works when the element is focused via JS + click.
    // Topic tags are created by clicking "#话题" button (inserts "#") then typing the name.
    if (description || topic) {
      // Focus the editor via JS and scroll it into view
      const editorPos = await evalShadow(`
        const el = shadow.querySelector('.input-editor');
        if (!el) return 'null';
        el.scrollIntoView({ block: 'center' });
        const rect = el.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) });
      `);

      if (editorPos && editorPos !== 'null') {
        const ePos = JSON.parse(editorPos) as { x: number; y: number };

        // Click to focus
        await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ePos.x, y: ePos.y, button: 'left', clickCount: 1 }, { sessionId });
        await sleep(50);
        await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ePos.x, y: ePos.y, button: 'left', clickCount: 1 }, { sessionId });
        await sleep(200);

        if (description) {
          console.log(`[channels] Filling description: "${description}"`);
          await cdp!.send('Input.insertText', { text: description }, { sessionId });
          await sleep(300);
        }

        if (topic) {
          // Add a space before the topic tag (if there's already text)
          if (description) {
            await cdp!.send('Input.insertText', { text: ' ' }, { sessionId });
            await sleep(100);
          }

          // Click "#话题" button: it focuses the editor and inserts "#" at the cursor
          const topicBtnPos = await evalShadow(`
            const btn = Array.from(shadow.querySelectorAll('.finder-tag-wrap.btn'))
              .find(el => el.textContent?.trim() === '#话题');
            if (!btn) return 'null';
            const rect = btn.getBoundingClientRect();
            return JSON.stringify({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) });
          `);

          if (topicBtnPos && topicBtnPos !== 'null') {
            const tPos = JSON.parse(topicBtnPos) as { x: number; y: number };
            await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tPos.x, y: tPos.y, button: 'left', clickCount: 1 }, { sessionId });
            await sleep(50);
            await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tPos.x, y: tPos.y, button: 'left', clickCount: 1 }, { sessionId });
            await sleep(300);

            // Type topic name — "#" was just inserted, now add the name to complete the tag
            await cdp!.send('Input.insertText', { text: topic }, { sessionId });
            await sleep(500);
            console.log(`[channels] Topic tag added: #${topic}`);
          } else {
            console.warn('[channels] #话题 button not found — topic not added');
          }
        }

        const descContent = await evalShadow(`
          const el = shadow.querySelector('.input-editor');
          return el ? el.textContent?.trim() : 'not found';
        `);
        console.log('[channels] Description content:', descContent);
      } else {
        console.warn('[channels] Description editor not found — skipping');
      }
      await sleep(300);
    }

    // ── Select collection ─────────────────────────────────────────────────────
    if (collection) {
      console.log(`[channels] Selecting collection: "${collection}"`);

      // Click the collection trigger to open the dropdown
      const collTriggerPos = await evalShadow(`
        const el = shadow.querySelector('.post-album-display');
        if (!el) return 'null';
        el.scrollIntoView({ block: 'center' });
        const rect = el.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) });
      `);

      if (collTriggerPos && collTriggerPos !== 'null') {
        const ctPos = JSON.parse(collTriggerPos) as { x: number; y: number };
        await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ctPos.x, y: ctPos.y, button: 'left', clickCount: 1 }, { sessionId });
        await sleep(50);
        await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ctPos.x, y: ctPos.y, button: 'left', clickCount: 1 }, { sessionId });
        await sleep(800);

        // Find and click the matching collection option
        const collItemPos = await evalShadow(`
          const collName = ${JSON.stringify(collection)};
          const items = Array.from(shadow.querySelectorAll('.option-item'));
          const match = items.find(el => el.querySelector('.name')?.textContent?.trim() === collName);
          if (!match) {
            // Log available collections for debugging
            const names = items.map(el => el.querySelector('.name')?.textContent?.trim()).filter(Boolean);
            return 'not-found:' + names.join(',');
          }
          match.scrollIntoView({ block: 'nearest' });
          const rect = match.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            // Dropdown not visible yet — try clicking via JS
            match.click();
            return 'clicked-via-js';
          }
          return JSON.stringify({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) });
        `);

        if (collItemPos && !collItemPos.startsWith('not-found:')) {
          if (collItemPos !== 'clicked-via-js') {
            const ciPos = JSON.parse(collItemPos) as { x: number; y: number };
            await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ciPos.x, y: ciPos.y, button: 'left', clickCount: 1 }, { sessionId });
            await sleep(50);
            await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ciPos.x, y: ciPos.y, button: 'left', clickCount: 1 }, { sessionId });
          }
          await sleep(500);
          // Verify selection
          const selectedColl = await evalShadow(`
            return shadow.querySelector('.post-album-display .display-text')?.textContent?.trim() || 'unknown';
          `);
          console.log(`[channels] Collection selected: "${selectedColl}"`);
        } else {
          console.warn(`[channels] Collection "${collection}" ${collItemPos} — skipping`);
        }
      } else {
        console.warn('[channels] Collection trigger not found — skipping');
      }
      await sleep(300);
    }

    // ── Declare originality (声明原创) ────────────────────────────────────────
    // Flow:
    //   1. Click outer .declare-original-checkbox label → opens dialog
    //   2. In dialog, click .original-proto-wrapper .ant-checkbox-wrapper (agree to terms)
    //   3. Wait for "声明原创" button to lose `disabled` class
    //   4. Click "声明原创"
    if (original) {
      console.log('[channels] Declaring originality...');

      // Step 1: Click the outer originality label to open the dialog
      const origLabelPos = await evalShadow(`
        const wrap = shadow.querySelector('.declare-original-checkbox');
        if (!wrap) return 'null';
        const label = wrap.querySelector('label.ant-checkbox-wrapper');
        if (!label) return 'null';
        label.scrollIntoView({ block: 'center' });
        const rect = label.getBoundingClientRect();
        if (rect.width === 0) return 'null';
        return JSON.stringify({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) });
      `);

      if (origLabelPos && origLabelPos !== 'null') {
        const olPos = JSON.parse(origLabelPos) as { x: number; y: number };
        await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: olPos.x, y: olPos.y, button: 'left', clickCount: 1 }, { sessionId });
        await sleep(50);
        await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: olPos.x, y: olPos.y, button: 'left', clickCount: 1 }, { sessionId });
        await sleep(1000);

        // Check if dialog appeared
        const dialogState = await evalShadow(`
          const wrap = shadow.querySelector('.declare-original-dialog .weui-desktop-dialog__wrp');
          if (!wrap) return 'no-dialog';
          const style = wrap.getAttribute('style') || '';
          return style.includes('display: none') ? 'hidden' : 'visible';
        `);

        if (dialogState === 'visible') {
          // Step 2: Click the agreement checkbox inside the dialog (.original-proto-wrapper)
          const agreeLabelPos = await evalShadow(`
            const wrapper = shadow.querySelector('.original-proto-wrapper .ant-checkbox-wrapper');
            if (!wrapper) return 'null';
            const rect = wrapper.getBoundingClientRect();
            if (rect.width === 0) return 'null';
            return JSON.stringify({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) });
          `);

          if (agreeLabelPos && agreeLabelPos !== 'null') {
            const agPos = JSON.parse(agreeLabelPos) as { x: number; y: number };
            await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: agPos.x, y: agPos.y, button: 'left', clickCount: 1 }, { sessionId });
            await sleep(50);
            await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: agPos.x, y: agPos.y, button: 'left', clickCount: 1 }, { sessionId });
            await sleep(500);

            // Step 3: Wait for "声明原创" button to become enabled
            const confirmBtnPos = await evalShadow(`
              const dialog = shadow.querySelector('.declare-original-dialog');
              if (!dialog) return 'null';
              const btn = Array.from(dialog.querySelectorAll('button'))
                .find(b => b.textContent?.trim() === '声明原创');
              if (!btn) return 'null';
              if (btn.className.includes('disabled')) return 'disabled';
              const rect = btn.getBoundingClientRect();
              if (rect.width === 0) return 'null';
              return JSON.stringify({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) });
            `);

            // Step 4: Click "声明原创" confirm button
            if (confirmBtnPos && confirmBtnPos !== 'null' && confirmBtnPos !== 'disabled') {
              const cbPos = JSON.parse(confirmBtnPos) as { x: number; y: number };
              await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cbPos.x, y: cbPos.y, button: 'left', clickCount: 1 }, { sessionId });
              await sleep(50);
              await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cbPos.x, y: cbPos.y, button: 'left', clickCount: 1 }, { sessionId });
              await sleep(500);
              console.log('[channels] Originality declared.');
            } else {
              console.warn(`[channels] 声明原创 confirm button state: ${confirmBtnPos} — skipping`);
            }
          } else {
            console.warn('[channels] Agreement checkbox not found in originality dialog');
          }
        } else {
          console.warn(`[channels] Originality dialog state: ${dialogState} — skipping`);
        }
      } else {
        console.warn('[channels] Originality label not found — skipping');
      }
      await sleep(300);
    }

    // ── Publish or save draft ─────────────────────────────────────────────────
    if (publish || draft) {
      const targetText = publish ? '发表' : '保存草稿';
      console.log(`[channels] Clicking "${targetText}"...`);
      const btnResult = await evalShadow(`
        const btns = Array.from(shadow.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent?.trim() === ${JSON.stringify(targetText)});
        if (!btn) {
          const available = btns.map(b => '"' + b.textContent?.trim() + '"').filter(t => t.length < 15).join(', ');
          return 'not-found. buttons: ' + available;
        }
        if (btn.className.includes('disabled')) return 'disabled: title might be missing';
        btn.click();
        return 'clicked:' + ${JSON.stringify(targetText)};
      `);
      console.log(`[channels] ${targetText} result:`, btnResult);

      if (btnResult.startsWith('clicked:')) {
        await sleep(5000);

        // Check result
        const outcome = await evalShadow(`
          const toasts = Array.from(shadow.querySelectorAll('[class*=toast],[class*=message],[class*=success],[class*=tip]'));
          const msgs = toasts.map(el => el.textContent?.trim()).filter(t => t && t.length < 80);
          return msgs.join(' | ') || location.href;
        `);
        console.log('[channels] Outcome:', outcome);

        if (publish) {
          console.log('[channels] Video published!');
        } else {
          console.log('[channels] Saved as draft.');
        }
      }
    } else {
      console.log('[channels] Form filled. Browser left open for review.');
      console.log('[channels] Use --publish to auto-publish, or --draft to save as draft.');
    }
  } finally {
    cdp?.close();
    console.log('[channels] Done. Chrome window remains open.');
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printUsage(): never {
  console.log(`Upload video to WeChat Channels (视频号)

Usage:
  bun upload.ts --video <path> --title <title> [options]
  bun upload.ts <video-path> --title <title> [options]

Options:
  --video, -v <path>     Video file path (MP4)
  --title, -t <text>     Video title (required, 6-16 chars recommended)
  --desc, -d <text>      Video description
  --topic <name>         Hashtag topic to add (e.g. "AI" adds #AI tag)
  --collection <name>    Collection name to add video to (e.g. "AI")
  --original             Declare originality (声明原创)
  --publish              Auto-click 发表 (publish)
  --draft                Auto-click 保存草稿 (save draft)
  --profile <dir>        Chrome profile directory
  --help                 Show this help

Environment:
  CHANNELS_CHROME_PATH   Override Chrome executable path

Examples:
  bun upload.ts --video ~/Desktop/video.mp4 --title "我的视频"
  bun upload.ts --video ~/Desktop/video.mp4 --title "AI危机" \\
    --desc "关于AI替代白领的推演" --topic AI --collection AI --original --publish
`);
  process.exit(0);
}

function loadExtendConfig(): Record<string, string> {
  const candidates = [
    path.join(process.cwd(), '.baoyu-skills/post-to-channels/EXTEND.md'),
    path.join(os.homedir(), '.baoyu-skills/post-to-channels/EXTEND.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const cfg: Record<string, string> = {};
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (m) cfg[m[1]!] = m[2]!.trim();
      }
      return cfg;
    }
  }
  return {};
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) printUsage();

  const extendCfg = loadExtendConfig();

  let videoPath = '';
  let title = '';
  let description = '';
  let topic = '';
  let collection = '';
  let original = extendCfg.auto_original === true || extendCfg.auto_original === 'true';
  let publish = extendCfg.auto_publish === true || extendCfg.auto_publish === 'true';
  let draft = false;
  let profileDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if ((a === '--video' || a === '-v') && args[i + 1]) videoPath = args[++i]!;
    else if ((a === '--title' || a === '-t') && args[i + 1]) title = args[++i]!;
    else if ((a === '--desc' || a === '-d') && args[i + 1]) description = args[++i]!;
    else if (a === '--topic' && args[i + 1]) topic = args[++i]!;
    else if (a === '--collection' && args[i + 1]) collection = args[++i]!;
    else if (a === '--original') original = true;
    else if (a === '--publish') publish = true;
    else if (a === '--draft') draft = true;
    else if (a === '--profile' && args[i + 1]) profileDir = args[++i];
    else if (!a.startsWith('-') && !videoPath) videoPath = a;
  }

  if (!videoPath) { console.error('Error: --video is required'); process.exit(1); }
  if (!title) { console.error('Error: --title is required'); process.exit(1); }

  await uploadToChannels({ videoPath, title, description, topic, collection, original, publish, draft, profileDir });
}

await main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
