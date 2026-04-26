#!/usr/bin/env python3
"""
Build a static HTML site from an Obsidian vault.
Usage: python3 build_site.py

============================================================================
THIS IS A TEMPLATE. Copy this file to your project as build_<人名>.py and
edit the CONFIG section below + the homepage builder at the bottom.

Changes needed for a new project (search for "TODO" to find them all):
  1. CONFIG section: VAULT, OUT, SITE_TITLE, SITE_LOGO
  2. CATEGORY_DIRS / CATEGORY_LABELS — only the categories your project uses
  3. order list in build_sidebar_html() — sidebar item order
  4. type-XX CSS classes in CSS — colors for each category badge
  5. type_label_map in main() — Chinese labels for type badges
  6. The whole build_homepage() function — hero text, stats, nav cards
  7. assets-<人名>/ directory referenced in main()

Examples already done:
- Bezos: 24 shareholder letters (single category)
- Musk: 3 master-plans + 11 interviews + 8 earnings-calls + methods category
============================================================================
"""

import os
import re
import shutil
import yaml
import markdown
from pathlib import Path

# ── CONFIG (TODO: edit these for your project) ───────────────────────────────

# TODO 1: vault path (the inner vault, not the outer wrapper)
VAULT = Path("/Users/hongxing/Documents/Obsidian Vault/<中文名>/<中文名>")

# TODO 2: output directory for generated HTML
OUT = Path("/Users/hongxing/project/webchat/<人名拼音>-site")

# TODO 3: site title (shown in <title> tag and topbar)
SITE_TITLE = "<人名>知识库"

# TODO 4: single uppercase letter for the logo mark (e.g., "B" for Bezos, "M" for Musk)
SITE_LOGO = "X"

# TODO 5: which category subdirectories does your vault have?
# Pick the ones that apply. Comment out unused categories.
CATEGORY_DIRS = {
    # Source material categories — pick as needed:
    "letters":       "letters",        # for shareholder letters projects (Bezos style)
    "master-plans":  "master-plans",   # for Master Plan / declaration style
    "interviews":    "interviews",     # for long interview projects (Musk style)
    "earnings-calls": "earnings-calls", # for earnings call projects
    # Always present:
    "concepts":      "concepts",
    "companies":     "companies",
    "people":        "people",
    "index-pages":   "index-pages",
    # Optional fifth category (unique to people with clear methodology, like Musk):
    "methods":       "methods",
}

# TODO 6: Chinese labels for each category (shown in sidebar group headers)
CATEGORY_LABELS = {
    "letters":       "股东信",
    "master-plans":  "总体规划",
    "interviews":    "访谈",
    "earnings-calls": "财报会议",
    "concepts":      "概念",
    "methods":       "方法",
    "companies":     "产品",     # or "公司" if appropriate
    "people":        "人物",
    "index-pages":   "索引",
}

# TODO 8: Google Analytics 4 Measurement ID (optional)
# Leave empty string "" to disable GA tracking.
#
# Cross-site tracking note:
# If you have multiple knowledge graph sites under the same parent domain
# (e.g. bezos.feima.ai, musk.feima.ai), use the SAME Measurement ID on all
# of them. GA4 will then treat the same visitor as ONE user across sites
# (the _ga cookie is shared at the parent domain level).
# In GA4 reports, add "hostname" as a secondary dimension to split per-site.
#
# Do NOT use separate Measurement IDs per site if you want cross-site user
# tracking — separate streams are treated as separate users by default.
GA_MEASUREMENT_ID = ""  # e.g. "G-WLE88B2LL3"

# ── Step 1: Collect all markdown files ────────────────────────────────────────

def collect_files():
    """Return list of dicts: {path, stem, category, frontmatter, body}"""
    files = []

    # Welcome page (homepage)
    welcome = VAULT / "欢迎.md"
    if welcome.exists():
        fm, body = parse_md(welcome)
        files.append({"path": welcome, "stem": "欢迎", "category": "home", "fm": fm, "body": body})

    for cat, dirname in CATEGORY_DIRS.items():
        d = VAULT / dirname
        if not d.is_dir():
            continue
        for f in sorted(d.glob("*.md")):
            fm, body = parse_md(f)
            files.append({"path": f, "stem": f.stem, "category": cat, "fm": fm, "body": body})

    return files


def parse_md(filepath):
    text = filepath.read_text(encoding="utf-8")
    fm = {}
    body = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            try:
                fm = yaml.safe_load(parts[1]) or {}
            except yaml.YAMLError:
                pass
            body = parts[2]
    return fm, body

# ── Step 2: Build name→URL mapping ───────────────────────────────────────────

def build_link_map(files):
    """Map note stem (and aliases) → relative URL path."""
    lmap = {}
    for f in files:
        stem = f["stem"]
        cat  = f["category"]
        if cat == "home":
            url = "/index.html"
        else:
            url = f"/{cat}/{stem}.html"
        lmap[stem] = url
        # Also register aliases from frontmatter
        for alias in f["fm"].get("aliases", []):
            if alias not in lmap:
                lmap[alias] = url
    return lmap


# ── Step 3: Convert wikilinks ─────────────────────────────────────────────────

def convert_wikilinks(text, link_map):
    """Replace [[target|display]] and [[target]] with <a> tags."""
    def replacer(m):
        inner = m.group(1)
        if "|" in inner:
            target, display = inner.split("|", 1)
        else:
            target = display = inner
        target = target.strip()
        display = display.strip()
        url = link_map.get(target)
        if url:
            return f'<a href="{url}">{display}</a>'
        else:
            return display  # plain text if target not found

    return re.sub(r'\[\[([^\]]+)\]\]', replacer, text)


# ── Step 4: Markdown → HTML ──────────────────────────────────────────────────

def md_to_html(md_text):
    extensions = ['tables', 'fenced_code', 'toc', 'nl2br']
    return markdown.markdown(md_text, extensions=extensions)


# ── Step 5: Count backlinks (references) ─────────────────────────────────────

def count_references(files):
    """Count how many times each stem is referenced via [[...]] across all files."""
    counts = {}
    for f in files:
        raw = f["body"]
        for m in re.finditer(r'\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]', raw):
            target = m.group(1).strip()
            counts[target] = counts.get(target, 0) + 1
    return counts


def build_backlinks(files, link_map):
    """Build a map: target_stem → list of {stem, category, title, excerpt} that link to it.

    Also resolves aliases so that e.g. [[Flywheel Effect]] linking to 飞轮效应.md
    shows up as a backlink on the 飞轮效应 page.
    """
    # Build alias→canonical stem map
    alias_to_stem = {}
    for f in files:
        stem = f["stem"]
        alias_to_stem[stem] = stem
        for alias in f["fm"].get("aliases", []):
            alias_to_stem[alias] = stem

    backlinks = {}  # target_stem → list of source info
    for f in files:
        src_stem = f["stem"]
        src_cat = f["category"]
        src_title = f["fm"].get("title", src_stem)
        raw = f["body"]

        # Find all unique targets this file links to
        seen_targets = set()
        for m in re.finditer(r'\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]', raw):
            target_raw = m.group(1).strip()
            target_stem = alias_to_stem.get(target_raw, target_raw)
            if target_stem == src_stem:
                continue  # skip self-links
            if target_stem in seen_targets:
                continue
            seen_targets.add(target_stem)

            # Extract a short excerpt around the link
            start = max(0, m.start() - 60)
            end = min(len(raw), m.end() + 60)
            excerpt = raw[start:end].replace("\n", " ").strip()
            # Clean up markdown formatting in excerpt
            excerpt = re.sub(r'\*\*([^*]+)\*\*', r'\1', excerpt)
            excerpt = re.sub(r'\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]', lambda x: x.group(2) or x.group(1), excerpt)
            if start > 0:
                excerpt = "…" + excerpt
            if end < len(raw):
                excerpt = excerpt + "…"

            if target_stem not in backlinks:
                backlinks[target_stem] = []
            backlinks[target_stem].append({
                "stem": src_stem,
                "category": src_cat,
                "title": src_title,
                "excerpt": excerpt,
            })

    return backlinks


# ── Step 6: HTML Template ────────────────────────────────────────────────────

CSS = r"""
*{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#FAF7F2;
  --bg2:#F3EDE4;
  --text:#1B1B18;
  --text2:#6B6560;
  --gold:#B8860B;
  --gold-light:#D4A843;
  --gold-glow:rgba(184,134,11,.12);
  --navy:#1A2332;
  --navy-light:#2C3E50;
  --cream:#FFF8EE;
  --border:#E0D6C8;
  --card:#FFFFFF;
  --link:#8B5E0B;
  --serif:'Noto Serif SC','Crimson Pro',Georgia,'Times New Roman',serif;
  --sans:'DM Sans',-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;
  --sidebar-w:260px;
}

html{font-size:15px;scroll-behavior:smooth}
body{
  font-family:var(--sans);
  color:var(--text);
  background:var(--bg);
  display:flex;
  min-height:100vh;
  line-height:1.8;
  -webkit-font-smoothing:antialiased;
}

/* ===== SIDEBAR ===== */
.sidebar{
  width:var(--sidebar-w);
  background:var(--navy);
  position:fixed;top:0;left:0;bottom:0;
  overflow-y:auto;
  z-index:100;
  display:flex;
  flex-direction:column;
}
.sidebar-header{padding:20px 16px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.logo{
  color:#fff;
  font-size:17px;
  font-weight:700;
  text-decoration:none;
  letter-spacing:.5px;
  font-family:var(--serif);
  display:block;
}
.logo:hover{color:var(--gold-light)}

.sidebar-nav{flex:1;padding:8px 0;overflow-y:auto}
.sidebar-nav::-webkit-scrollbar{width:4px}
.sidebar-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px}

.nav-link{
  display:block;
  padding:6px 16px;
  color:#cbd5e1;
  text-decoration:none;
  font-size:13px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  border-left:3px solid transparent;
  transition:all .15s;
}
.nav-link:hover{background:rgba(255,255,255,.06);color:#fff}
.nav-link.active{
  color:#fff;
  background:rgba(184,134,11,.15);
  border-left-color:var(--gold);
  font-weight:600;
}
.nav-home{font-size:14px;padding:10px 16px;font-weight:500;margin-bottom:4px}
.nav-changelog{
  margin-top:auto;
  padding:14px 16px;
  font-size:12px;
  color:rgba(255,255,255,.4);
  border-top:1px solid rgba(255,255,255,.08);
}
.nav-changelog:hover{color:rgba(255,255,255,.7)}
.nav-changelog.active{color:var(--gold-light)}
.sidebar-nav{display:flex;flex-direction:column;height:100%}

.nav-group{margin-bottom:2px}
.nav-group-title{
  padding:8px 16px;
  color:#cbd5e1;
  font-size:12px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:.5px;
  cursor:pointer;
  display:flex;
  align-items:center;
  gap:6px;
  user-select:none;
  transition:color .15s;
}
.nav-group-title:hover{color:#fff}
.caret{
  display:inline-block;
  width:0;height:0;
  border-left:5px solid #cbd5e1;
  border-top:4px solid transparent;
  border-bottom:4px solid transparent;
  transition:transform .2s;
}
.nav-group.open .nav-group-title .caret{transform:rotate(90deg);border-left-color:#fff}
.nav-group-title .badge{
  margin-left:auto;
  background:rgba(255,255,255,.1);
  color:#cbd5e1;
  font-size:11px;
  padding:1px 6px;
  border-radius:8px;
  font-weight:400;
}
.nav-group-items{display:none;padding-left:8px}
.nav-group.open .nav-group-items{display:block}

.hamburger{
  display:none;
  position:fixed;
  top:12px;left:12px;
  z-index:200;
  background:var(--navy);
  color:#fff;
  border:none;
  font-size:20px;
  padding:6px 10px;
  border-radius:6px;
  cursor:pointer;
}

/* ===== MAIN ===== */
.main{
  margin-left:max(var(--sidebar-w), calc((100vw - 1160px) / 2));
  flex:1;
  position:relative;
  max-width:1160px;
  padding:0;
}

/* grain overlay */
.main::after{
  content:'';
  position:fixed;
  top:0;left:var(--sidebar-w);right:0;bottom:0;
  pointer-events:none;
  opacity:.03;
  z-index:999;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ===== FAV / BOOKMARK BUTTON ===== */
.fav-wrap{
  position:absolute;
  top:24px;right:48px;
  z-index:50;
}
.fav-btn{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:8px 18px;
  background:var(--card);
  border:1px solid var(--border);
  border-radius:24px;
  color:var(--gold);
  font-size:16px;
  cursor:pointer;
  transition:all .25s;
  font-family:var(--sans);
  box-shadow:0 2px 8px rgba(0,0,0,.04);
}
.fav-btn:hover{
  border-color:var(--gold);
  box-shadow:0 4px 16px var(--gold-glow);
  transform:translateY(-1px);
}
.fav-label{
  font-size:13px;
  color:var(--text2);
  font-weight:500;
}
.fav-btn:hover .fav-label{color:var(--gold)}
.fav-pop{
  display:none;
  position:absolute;
  right:0;top:48px;
  background:var(--card);
  border:1px solid var(--border);
  border-radius:10px;
  padding:14px 16px;
  box-shadow:0 8px 32px rgba(0,0,0,.12);
  font-size:13px;
  min-width:240px;
  z-index:51;
  color:var(--text);
  line-height:1.6;
}
.fav-pop.show{display:block}
.fav-pop kbd{
  background:var(--bg2);
  padding:2px 7px;
  border-radius:4px;
  font-size:12px;
  border:1px solid var(--border);
  font-family:var(--sans);
  color:var(--navy);
  font-weight:600;
}
.fav-pop-copy{
  display:block;
  width:100%;
  margin-top:10px;
  padding:8px 0;
  background:var(--bg);
  border:1px solid var(--border);
  border-radius:6px;
  color:var(--text2);
  font-size:12px;
  cursor:pointer;
  text-align:center;
  transition:all .15s;
  font-family:var(--sans);
}
.fav-pop-copy:hover{
  border-color:var(--gold);
  color:var(--gold);
}
.fav-pop-copy.copied{
  background:#ecfdf5;
  border-color:#6ee7b7;
  color:#059669;
}

@media(max-width:768px){
  .fav-wrap{right:16px;top:12px}
  .fav-btn{padding:6px 14px}
  .fav-label{font-size:12px}
}

/* ===== CHANGELOG ===== */
.article.changelog h2{
  border-bottom-color:var(--gold);
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
.version{
  display:inline-flex;
  align-items:center;
  background:var(--gold);
  color:#fff;
  font-size:13px;
  font-weight:700;
  padding:3px 11px;
  border-radius:6px;
  font-family:var(--sans);
  letter-spacing:.3px;
}
.changelog-date{
  font-size:14px;
  color:var(--text2);
  font-weight:500;
  font-family:var(--sans);
}
.change-list{list-style:none;padding:0;margin:16px 0}
.change-list li{
  padding:10px 0 10px 18px;
  position:relative;
  border-bottom:1px solid var(--border);
  font-size:14px;
  line-height:1.75;
}
.change-list li:last-child{border-bottom:none}
.change-list li::before{
  content:"";
  position:absolute;
  left:0;
  top:20px;
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--gold);
}
.change-type{
  display:inline-block;
  font-size:11px;
  padding:2px 8px;
  border-radius:4px;
  color:#fff;
  font-weight:600;
  margin-right:8px;
  font-family:var(--sans);
  vertical-align:1px;
  letter-spacing:.2px;
}
.change-type.feat{background:#059669}
.change-type.fix{background:#dc2626}
.change-type.plan{background:#3b82f6}
.change-list li strong{color:var(--navy);font-weight:700}

/* ===== ARTICLE (content pages) ===== */
.article{max-width:820px;padding:48px 48px 80px}
.meta{
  font-size:13px;
  color:var(--text2);
  margin-bottom:16px;
  display:flex;
  align-items:center;
  gap:8px;
}
.type-badge{
  font-size:11px;
  padding:2px 8px;
  border-radius:4px;
  color:#fff;
  font-weight:600;
}
.type-概念{background:#7C5E2A}
.type-方法{background:#5E4A8B}
.type-产品{background:#1A6B7C}
.type-人物{background:#8B2F2F}
.type-总体规划{background:#2A6B4F}
.type-访谈{background:#3A5E8B}
.type-财报会议{background:#4A6E2A}
.type-索引{background:#6B6560}

.article h1{
  font-family:var(--serif);
  font-size:28px;
  line-height:1.3;
  margin-bottom:24px;
  font-weight:900;
  color:var(--navy);
  letter-spacing:-.5px;
}
.article h2{
  font-family:var(--serif);
  font-size:21px;
  margin:36px 0 14px;
  padding-bottom:8px;
  border-bottom:2px solid var(--border);
  font-weight:700;
  color:var(--navy);
}
.article h3{
  font-family:var(--serif);
  font-size:17px;
  margin:24px 0 10px;
  font-weight:600;
  color:var(--navy-light);
}
.article p{margin:10px 0}
.article ul,.article ol{padding-left:24px;margin:10px 0}
.article li{margin:4px 0}

.article a{
  color:var(--link);
  text-decoration:none;
  background:linear-gradient(to bottom,transparent 60%,var(--gold-glow) 60%);
  transition:background .2s;
}
.article a:hover{background:linear-gradient(to bottom,transparent 40%,rgba(184,134,11,.2) 40%)}

.article blockquote{
  background:var(--cream);
  border-left:4px solid var(--gold);
  padding:14px 20px;
  margin:16px 0;
  border-radius:0 8px 8px 0;
  font-style:italic;
  color:#5C4813;
  font-family:var(--serif);
}
.article blockquote p{margin:0}
.article blockquote a{background:none;color:var(--gold)}
.article blockquote a:hover{text-decoration:underline}

.article table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14px}
.article th,.article td{border:1px solid var(--border);padding:8px 12px;text-align:left}
.article th{background:var(--bg2);font-weight:600;color:var(--navy)}
.article strong{font-weight:700}
.article hr{border:none;border-top:1px solid var(--border);margin:32px 0}
.article code{
  background:var(--bg2);
  padding:2px 6px;
  border-radius:3px;
  font-size:13px;
  font-family:'SF Mono',Menlo,Consolas,monospace;
  color:#5C4813;
}

/* ===== BACKLINKS PANEL (right sidebar) ===== */
.main.has-backlinks{
  display:grid;
  grid-template-columns:minmax(0,820px) 280px;
  gap:0 24px;
  max-width:1160px;
}
.main-content{min-width:0}

.backlinks-panel{
  grid-column:2;
  grid-row:1/-1;
  position:sticky;
  top:24px;
  max-height:calc(100vh - 48px);
  overflow-y:auto;
  padding:24px 0 24px 20px;
  border-left:1px solid var(--border);
  font-size:13px;
  align-self:start;
}
.backlinks-panel::-webkit-scrollbar{width:3px}
.backlinks-panel::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}

.bl-panel-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:12px;
}
.bl-panel-title{
  font-family:var(--serif);
  font-size:14px;
  font-weight:700;
  color:var(--navy);
  display:flex;
  align-items:center;
  gap:8px;
}
.bl-count{
  font-size:11px;
  background:var(--bg2);
  padding:1px 7px;
  border-radius:10px;
  color:var(--text2);
  font-weight:600;
}
.bl-panel-actions{display:flex;gap:4px}
.bl-action{
  background:none;
  border:1px solid var(--border);
  border-radius:4px;
  padding:2px 8px;
  font-size:11px;
  color:var(--text2);
  cursor:pointer;
  font-family:var(--sans);
  transition:all .15s;
}
.bl-action:hover{border-color:var(--gold);color:var(--gold)}

.bl-group{margin-bottom:4px}
.bl-group-header{
  display:flex;
  align-items:center;
  gap:6px;
  background:none;
  border:none;
  cursor:pointer;
  padding:5px 0;
  width:100%;
  text-align:left;
  font-size:13px;
  font-family:var(--sans);
}
.bl-group-header:hover{background:rgba(0,0,0,.02);border-radius:4px}

.bl-caret{
  display:inline-block;
  width:0;height:0;
  border:4px solid transparent;
  border-left:5px solid var(--text2);
  transition:transform .15s;
  flex-shrink:0;
}
.bl-group.open .bl-caret{transform:rotate(90deg)}

.bl-source-name{
  color:var(--navy);
  font-weight:600;
  flex:1;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.bl-mention-cat{
  font-size:10px;
  color:var(--text2);
  background:var(--bg2);
  padding:0 5px;
  border-radius:8px;
  flex-shrink:0;
  margin-left:4px;
}

.bl-snippets{display:none;padding:4px 0 4px 14px}
.bl-group.open .bl-snippets{display:block}

.bl-snippet{
  padding:6px 0;
  border-bottom:1px solid var(--border);
  line-height:1.6;
  color:var(--text2);
  font-size:12px;
}
.bl-snippet:last-child{border-bottom:none}
.bl-go-link{
  display:inline-block;
  font-size:11px;
  color:var(--link);
  text-decoration:none;
  padding:4px 0 2px;
  font-weight:600;
  transition:color .15s;
}
.bl-go-link:hover{color:var(--gold);text-decoration:underline}

/* ===== HOMEPAGE ===== */
.hero-section{
  position:relative;
  padding:72px 48px 56px;
  max-width:900px;
  margin:0 auto;
}
.hero-eyebrow{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:12px;
  font-weight:600;
  letter-spacing:2px;
  text-transform:uppercase;
  color:var(--gold);
  margin-bottom:20px;
  opacity:0;
  animation:fadeUp .6s ease forwards;
}
.hero-eyebrow::before{content:'';width:24px;height:1px;background:var(--gold)}
.hero-title{
  font-family:var(--serif);
  font-size:clamp(32px,5vw,48px);
  font-weight:900;
  line-height:1.25;
  letter-spacing:-1px;
  color:var(--navy);
  margin-bottom:6px;
  opacity:0;
  animation:fadeUp .6s ease .1s forwards;
}
.hero-title .gold{color:var(--gold)}
.hero-sub{
  font-size:17px;
  color:var(--text2);
  line-height:1.8;
  margin-top:16px;
  max-width:640px;
  font-family:var(--serif);
  font-weight:400;
  opacity:0;
  animation:fadeUp .6s ease .2s forwards;
}
.hero-sub b{color:var(--navy);font-weight:700}

.stats-row{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:0;
  max-width:900px;
  margin:0 auto 48px;
  padding:0 48px;
  border-top:1px solid var(--border);
  border-bottom:1px solid var(--border);
  opacity:0;
  animation:fadeUp .6s ease .3s forwards;
}
.stat-item{
  text-align:center;
  padding:28px 12px;
  position:relative;
  transition:background .3s;
  text-decoration:none;
  color:inherit;
}
.stat-item:not(:last-child)::after{
  content:'';
  position:absolute;
  right:0;top:20%;
  height:60%;
  width:1px;
  background:var(--border);
}
.stat-item:hover{background:var(--gold-glow)}
.stat-num{
  font-family:var(--serif);
  font-size:42px;
  font-weight:900;
  color:var(--navy);
  line-height:1;
  margin-bottom:6px;
  letter-spacing:-2px;
}
.stat-label{
  font-size:13px;
  color:var(--text2);
  font-weight:500;
  letter-spacing:.5px;
}

.main-inner{max-width:900px;padding:0 48px 80px;margin:0 auto}

.nav-cards{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:16px;
  margin-bottom:56px;
  opacity:0;
  animation:fadeUp .6s ease .4s forwards;
}
.nav-card{
  position:relative;
  padding:28px 20px 24px;
  background:var(--card);
  border:1px solid var(--border);
  border-radius:14px;
  text-decoration:none;
  transition:all .3s cubic-bezier(.4,0,.2,1);
  overflow:hidden;
  display:block;
  color:inherit;
}
.nav-card::before{
  content:'';
  position:absolute;
  top:0;left:0;right:0;
  height:3px;
  background:var(--gold);
  opacity:0;
  transition:opacity .3s;
}
.nav-card:hover{
  transform:translateY(-4px);
  box-shadow:0 12px 32px rgba(0,0,0,.08);
  border-color:var(--gold-light);
}
.nav-card:hover::before{opacity:1}
.nav-card-icon{font-size:32px;margin-bottom:14px;display:block;line-height:1}
.nav-card-title{
  font-family:var(--serif);
  font-size:16px;
  font-weight:700;
  color:var(--navy);
  margin-bottom:4px;
}
.nav-card-sub{font-size:13px;color:var(--text2)}
.nav-card-arrow{
  position:absolute;
  bottom:20px;right:20px;
  font-size:18px;
  color:var(--border);
  transition:all .3s;
}
.nav-card:hover .nav-card-arrow{color:var(--gold);transform:translateX(4px)}

.section{margin-bottom:48px}
.section-header{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.section-line{flex:1;height:1px;background:var(--border)}
.section-title{
  font-family:var(--serif);
  font-size:22px;
  font-weight:700;
  color:var(--navy);
  white-space:nowrap;
}
.section-count{
  font-size:12px;
  color:var(--gold);
  font-weight:600;
  background:var(--gold-glow);
  padding:3px 10px;
  border-radius:12px;
  white-space:nowrap;
}

.tag-cloud{display:flex;flex-wrap:wrap;gap:10px}
.tag{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:8px 18px;
  background:var(--card);
  border:1px solid var(--border);
  border-radius:24px;
  font-size:14px;
  color:var(--text);
  text-decoration:none;
  transition:all .25s cubic-bezier(.4,0,.2,1);
  font-weight:500;
}
.tag:hover{
  border-color:var(--gold);
  color:var(--navy);
  box-shadow:0 4px 16px var(--gold-glow);
  transform:translateY(-2px);
}
.tag-n{
  font-size:11px;
  font-weight:700;
  color:#fff;
  background:var(--gold);
  padding:2px 8px;
  border-radius:10px;
  min-width:20px;
  text-align:center;
}
.tag.tier-1{
  font-size:16px;
  padding:10px 22px;
  font-weight:700;
  border-color:var(--gold-light);
  background:linear-gradient(135deg,#FFFDF5,#FFF8E7);
}
.tag.tier-1 .tag-n{font-size:12px;padding:3px 10px;background:var(--gold)}
.tag.tier-2{font-size:15px;padding:9px 20px;font-weight:600}

.people-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
  gap:14px;
}
.person-card{
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:24px 16px 20px;
  background:var(--card);
  border:1px solid var(--border);
  border-radius:14px;
  text-decoration:none;
  transition:all .3s;
  text-align:center;
  color:inherit;
}
.person-card:hover{
  transform:translateY(-3px);
  box-shadow:0 8px 24px rgba(0,0,0,.06);
  border-color:var(--gold-light);
}
.person-avatar{
  width:56px;height:56px;
  border-radius:50%;
  background:linear-gradient(135deg,var(--navy),var(--navy-light));
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:22px;
  margin-bottom:12px;
  color:var(--gold-light);
  font-family:var(--serif);
  font-weight:700;
  box-shadow:0 4px 12px rgba(26,35,50,.15);
}
.person-name{
  font-family:var(--serif);
  font-size:15px;
  font-weight:700;
  color:var(--navy);
  margin-bottom:4px;
}
.person-refs{font-size:12px;color:var(--text2)}

.gold-divider{display:flex;align-items:center;gap:16px;margin:56px 0}
.gold-divider::before,.gold-divider::after{
  content:'';
  flex:1;
  height:1px;
  background:linear-gradient(to right,transparent,var(--border),transparent);
}
.gold-divider-diamond{
  width:8px;height:8px;
  background:var(--gold);
  transform:rotate(45deg);
  flex-shrink:0;
}

.footer-promo{
  position:relative;
  overflow:hidden;
  padding:40px;
  background:var(--navy);
  border-radius:20px;
  color:#fff;
  display:flex;
  gap:40px;
  align-items:center;
}
.footer-promo::before{
  content:'';
  position:absolute;
  top:-50%;right:-20%;
  width:400px;height:400px;
  border-radius:50%;
  background:radial-gradient(circle,rgba(184,134,11,.15),transparent 70%);
}
.promo-story{flex:1;position:relative;z-index:1;min-width:0}
.promo-story h3{
  font-family:var(--serif);
  font-size:20px;
  font-weight:700;
  margin-bottom:12px;
  color:var(--gold-light);
}
.promo-story p{font-size:14px;color:rgba(255,255,255,.75);line-height:1.8;margin:8px 0}
.promo-credit{
  margin-top:16px !important;
  padding-top:14px;
  border-top:1px solid rgba(255,255,255,.12);
  font-size:13px !important;
}
.promo-credit strong{color:var(--gold-light);font-weight:700}

.promo-qr{
  flex-shrink:0;
  position:relative;
  z-index:1;
  text-align:center;
}
.qr-img{
  display:block;
  width:140px;
  height:140px;
  border-radius:12px;
  border:3px solid rgba(255,255,255,.15);
  box-shadow:0 8px 24px rgba(0,0,0,.25);
  background:#fff;
  padding:6px;
}
.qr-text{
  font-size:12px;
  color:rgba(255,255,255,.6);
  margin-top:10px;
  letter-spacing:.5px;
}

/* ===== ANIMATIONS ===== */
@keyframes fadeUp{
  from{opacity:0;transform:translateY(16px)}
  to{opacity:1;transform:translateY(0)}
}
.section{opacity:0;animation:fadeUp .5s ease forwards}
.section:nth-child(1){animation-delay:.45s}
.section:nth-child(2){animation-delay:.55s}
.section:nth-child(3){animation-delay:.65s}
.section:nth-child(4){animation-delay:.75s}

/* ===== RESPONSIVE ===== */
@media(max-width:1024px){
  .main.has-backlinks{display:block}
  .backlinks-panel{
    position:static;
    max-height:none;
    overflow-y:visible;
    border-left:none;
    border-top:1px solid var(--border);
    padding:24px 16px;
    margin-top:24px;
    max-width:820px;
  }
}

@media(max-width:768px){
  .sidebar{transform:translateX(-100%);transition:transform .3s}
  .sidebar.open{transform:translateX(0)}
  .hamburger{display:block}
  .main{margin-left:0;max-width:100%}
  .main::after{left:0}
  .main.has-backlinks{display:block}
  .article{padding:48px 16px 60px}
  .backlinks-panel{padding:16px 12px;margin-top:16px}
  .hero-section{padding:44px 20px 20px}
  .hero-eyebrow{font-size:10px;margin-bottom:12px}
  .hero-title{font-size:26px}
  .hero-sub{font-size:14px;line-height:1.6;margin-top:10px}
  .stats-row{padding:0 16px;margin:0 0 20px}
  .stat-item{padding:16px 4px}
  .stat-num{font-size:28px;letter-spacing:-1px}
  .stat-label{font-size:11px}
  .main-inner{padding:0 20px 60px}
  .nav-cards{grid-template-columns:1fr 1fr;gap:10px;margin-bottom:36px}
  .nav-card{padding:20px 14px 18px}
  .nav-card-icon{font-size:24px;margin-bottom:8px}
  .nav-card-title{font-size:14px}
  .nav-card-sub{font-size:12px}
  .footer-promo{flex-direction:column;text-align:center;padding:28px 20px;gap:24px}
  .people-grid{grid-template-columns:repeat(2,1fr)}
}
"""

JS = """
document.addEventListener('DOMContentLoaded', function() {
  // Toggle sidebar nav groups
  document.querySelectorAll('.nav-group-title').forEach(function(el) {
    el.addEventListener('click', function() {
      this.parentElement.classList.toggle('open');
    });
  });

  // Backlinks: toggle individual groups
  document.querySelectorAll('.bl-group-header').forEach(function(header) {
    header.addEventListener('click', function() {
      this.closest('.bl-group').classList.toggle('open');
    });
  });

  // Favorite / bookmark popup
  var favBtn = document.getElementById('fav-btn');
  var favPop = document.getElementById('fav-pop');
  if (favBtn && favPop) {
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    var key = isMac ? '\u2318 + D' : 'Ctrl + D';
    favPop.innerHTML =
      '\u6309 <kbd>' + key + '</kbd> \u6536\u85cf\u672c\u9875\u5230\u6d4f\u89c8\u5668\u4e66\u7b7e' +
      '<button class="fav-pop-copy" id="fav-pop-copy">\u590d\u5236\u672c\u9875\u94fe\u63a5</button>';

    favBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      favPop.classList.toggle('show');
    });
    document.addEventListener('click', function(e) {
      if (!favPop.contains(e.target) && e.target !== favBtn) {
        favPop.classList.remove('show');
      }
    });

    var copyBtn = document.getElementById('fav-pop-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        navigator.clipboard.writeText(window.location.href).then(function() {
          copyBtn.textContent = '\u2713 \u5df2\u590d\u5236';
          copyBtn.classList.add('copied');
          setTimeout(function() {
            copyBtn.textContent = '\u590d\u5236\u672c\u9875\u94fe\u63a5';
            copyBtn.classList.remove('copied');
          }, 1500);
        });
      });
    }
  }

  // Backlinks: expand/collapse all
  document.querySelectorAll('.bl-expand-all').forEach(function(btn) {
    btn.addEventListener('click', function() {
      this.closest('.backlinks-panel').querySelectorAll('.bl-group').forEach(function(g) {
        g.classList.add('open');
      });
    });
  });
  document.querySelectorAll('.bl-collapse-all').forEach(function(btn) {
    btn.addEventListener('click', function() {
      this.closest('.backlinks-panel').querySelectorAll('.bl-group').forEach(function(g) {
        g.classList.remove('open');
      });
    });
  });
});
"""


def build_sidebar_html(files, current_stem=""):
    """Build navy sidebar matching the Buffett site structure."""
    groups = {
        "index-pages":   [],
        "master-plans":  [],
        "interviews":    [],
        "earnings-calls": [],
        "concepts":      [],
        "methods":       [],
        "companies":     [],
        "people":        [],
    }
    for f in files:
        cat = f["category"]
        if cat in groups:
            groups[cat].append(f)

    # Sort time-based docs ascending; alphabetical for the rest
    groups["master-plans"].sort(key=lambda x: x["stem"])
    groups["interviews"].sort(key=lambda x: x["stem"])
    groups["earnings-calls"].sort(key=lambda x: x["stem"])
    for cat in ["concepts", "methods", "companies", "people", "index-pages"]:
        groups[cat].sort(key=lambda x: x["stem"])

    # Home link at top
    home_active = " active" if current_stem == "欢迎" else ""
    html = f'<a href="/index.html" class="nav-link nav-home{home_active}">🏛 首页</a>\n'

    order = [
        ("index-pages",   "索引"),
        ("master-plans",  "总体规划"),
        ("interviews",    "访谈"),
        ("earnings-calls", "财报会议"),
        ("methods",       "方法"),
        ("concepts",      "概念"),
        ("companies",     "产品"),
        ("people",        "人物"),
    ]
    for cat, label in order:
        # Open the group containing the current page
        contains_current = any(item["stem"] == current_stem for item in groups[cat])
        is_open = " open" if (cat == "index-pages" or contains_current) else ""
        # Skip 更新日志 from index-pages group since it has its own footer link
        group_items = [f for f in groups[cat] if not (cat == "index-pages" and f["stem"] == "更新日志")]
        html += f'<div class="nav-group{is_open}">\n'
        html += f'  <div class="nav-group-title"><span class="caret"></span>{label}<span class="badge">{len(group_items)}</span></div>\n'
        html += f'  <div class="nav-group-items">\n'
        for f in group_items:
            url = f"/{cat}/{f['stem']}.html"
            active = " active" if f["stem"] == current_stem else ""
            display = f["stem"]
            html += f'    <a href="{url}" class="nav-link{active}" title="{display}">{display}</a>\n'
        html += '  </div>\n</div>\n'

    # Footer: changelog link (if 更新日志.md exists in index-pages/)
    has_changelog = any(f["stem"] == "更新日志" and f["category"] == "index-pages" for f in files)
    if has_changelog:
        changelog_active = " active" if current_stem == "更新日志" else ""
        html += f'<a href="/index-pages/更新日志.html" class="nav-link nav-changelog{changelog_active}">📋 更新日志</a>\n'

    return html


def wrap_page(title, body_html, files, current_stem="", right_html="", wide=False, page_type=""):
    sidebar = build_sidebar_html(files, current_stem)

    extra_class = f" {page_type}" if page_type else ""
    if wide:
        # Homepage layout
        main_class = "main"
        main_inner = body_html
    elif right_html:
        # Article + backlinks panel layout
        main_class = "main has-backlinks"
        main_inner = f'<div class="main-content article{extra_class}">{body_html}</div>{right_html}'
    else:
        # Article without backlinks
        main_class = "main"
        main_inner = f'<div class="article{extra_class}">{body_html}</div>'

    # Google Analytics snippet (empty string if not configured)
    ga_snippet = ""
    if GA_MEASUREMENT_ID:
        ga_snippet = f'''<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id={GA_MEASUREMENT_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', '{GA_MEASUREMENT_ID}');
</script>'''

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} - 马斯克知识库</title>
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png">
<link rel="shortcut icon" href="/assets/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700;900&family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
{ga_snippet}
<style>{CSS}</style>
</head>
<body>
<button class="hamburger" aria-label="菜单" onclick="document.querySelector('.sidebar').classList.toggle('open')">☰</button>
<aside class="sidebar">
  <div class="sidebar-header"><a href="/index.html" class="logo">马斯克知识库</a></div>
  <div class="sidebar-nav">
    {sidebar}
  </div>
</aside>
<main class="{main_class}">
{main_inner}
</main>
<script>{JS}</script>
</body>
</html>"""


def build_backlinks_html(stem, backlinks_map, link_map):
    """Build the right-sidebar backlinks panel matching Buffett style."""
    bl = backlinks_map.get(stem, [])
    if not bl:
        return ""

    cat_labels = {
        "letters": "信",
        "concepts": "概念",
        "companies": "产品",
        "people": "人物",
        "index-pages": "索引",
    }

    items_html = ""
    for item in bl:
        url = link_map.get(item["stem"], "#")
        cat_label = cat_labels.get(item["category"], "")
        excerpt_safe = item["excerpt"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        items_html += f'''<div class="bl-group">
  <button class="bl-group-header">
    <span class="bl-caret"></span>
    <span class="bl-source-name">{item["title"]}</span>
    <span class="bl-mention-cat">{cat_label}</span>
  </button>
  <div class="bl-snippets">
    <div class="bl-snippet">{excerpt_safe}</div>
    <a href="{url}" class="bl-go-link">查看原文 \u2192</a>
  </div>
</div>
'''

    return f'''<aside class="backlinks-panel">
  <div class="bl-panel-header">
    <h3 class="bl-panel-title">链接到本页 <span class="bl-count">{len(bl)}</span></h3>
    <div class="bl-panel-actions">
      <button class="bl-action bl-expand-all">展开</button>
      <button class="bl-action bl-collapse-all">折叠</button>
    </div>
  </div>
  {items_html}
</aside>
'''


# ── Step 7: Build homepage ───────────────────────────────────────────────────

def build_homepage(files, link_map, ref_counts):
    concept_files = [f for f in files if f["category"] == "concepts"]
    concept_ranked = sorted(concept_files, key=lambda f: ref_counts.get(f["stem"], 0), reverse=True)[:15]

    method_files = [f for f in files if f["category"] == "methods"]
    method_ranked = sorted(method_files, key=lambda f: ref_counts.get(f["stem"], 0), reverse=True)[:10]

    company_files = [f for f in files if f["category"] == "companies"]
    company_ranked = sorted(company_files, key=lambda f: ref_counts.get(f["stem"], 0), reverse=True)[:12]

    people_files = [f for f in files if f["category"] == "people"]

    sources_total = (
        len([f for f in files if f["category"] == "master-plans"])
        + len([f for f in files if f["category"] == "interviews"])
        + len([f for f in files if f["category"] == "earnings-calls"])
    )

    # Person initials and role
    people_data = {
        "Elon Musk":         ("E", "Tesla / SpaceX / Neuralink / X / xAI 创始人"),
        "Gwynne Shotwell":   ("G", "SpaceX 总裁兼 COO"),
        "JB Straubel":       ("J", "Tesla 联合创始人、前 CTO"),
        "Sam Altman":        ("S", "OpenAI CEO，从合作到对立"),
        "Larry Page":        ("L", "Google 联创，曾是密友"),
        "Walter Isaacson":   ("W", "马斯克 2023 传记作者"),
        "Sandy Munro":       ("M", "汽车拆解工程师，朋友"),
        "Noland Arbaugh":    ("N", "首位 Neuralink 患者"),
    }

    total_links = sum(ref_counts.values())

    arrow = "\u2192"

    # Hero (with bookmark button)
    html = f'''
<div class="fav-wrap">
  <button class="fav-btn" id="fav-btn" aria-label="收藏本站">☆<span class="fav-label">收藏</span></button>
  <div class="fav-pop" id="fav-pop"></div>
</div>

<section class="hero-section">
  <div class="hero-eyebrow">Elon Musk · Mind & Method</div>
  <h1 class="hero-title">马斯克<span class="gold">知识库</span></h1>
  <p class="hero-sub"><b>{sources_total} 份</b>一手素材，<b>{len(concept_files)} 个</b>核心思想，<b>{len(method_files)} 个</b>工作方法<br>
  从 Tesla Master Plan 到 Lex Fridman 长访谈——追踪马斯克思想的演变轨迹</p>
</section>

<div class="stats-row">
  <a href="/index-pages/素材总览.html" class="stat-item"><div class="stat-num">{sources_total}</div><div class="stat-label">份一手素材</div></a>
  <a href="/index-pages/核心思想索引.html" class="stat-item"><div class="stat-num">{len(concept_files)}</div><div class="stat-label">核心思想</div></a>
  <a href="/index-pages/工作方法索引.html" class="stat-item"><div class="stat-num">{len(method_files)}</div><div class="stat-label">工作方法</div></a>
  <a href="/index-pages/公司与产品索引.html" class="stat-item"><div class="stat-num">{len(company_files)}</div><div class="stat-label">公司/产品</div></a>
  <a href="/index-pages/人物索引.html" class="stat-item"><div class="stat-num">{len(people_files)}</div><div class="stat-label">关键人物</div></a>
</div>

<div class="main-inner">
<div class="nav-cards nav-cards-5">
  <a href="/index-pages/素材总览.html" class="nav-card">
    <span class="nav-card-icon">📜</span>
    <div class="nav-card-title">素材总览</div>
    <div class="nav-card-sub">Master Plan + 长访谈 + 财报</div>
    <span class="nav-card-arrow">{arrow}</span>
  </a>
  <a href="/index-pages/核心思想索引.html" class="nav-card">
    <span class="nav-card-icon">💡</span>
    <div class="nav-card-title">核心思想</div>
    <div class="nav-card-sub">{len(concept_files)} 个概念，含 4 个立场演变</div>
    <span class="nav-card-arrow">{arrow}</span>
  </a>
  <a href="/index-pages/工作方法索引.html" class="nav-card">
    <span class="nav-card-icon">⚡</span>
    <div class="nav-card-title">工作方法</div>
    <div class="nav-card-sub">{len(method_files)} 个可操作的实践</div>
    <span class="nav-card-arrow">{arrow}</span>
  </a>
  <a href="/index-pages/公司与产品索引.html" class="nav-card">
    <span class="nav-card-icon">🚀</span>
    <div class="nav-card-title">公司与产品</div>
    <div class="nav-card-sub">{len(company_files)} 家公司与重要产品</div>
    <span class="nav-card-arrow">{arrow}</span>
  </a>
  <a href="/index-pages/人物索引.html" class="nav-card">
    <span class="nav-card-icon">👤</span>
    <div class="nav-card-title">关键人物</div>
    <div class="nav-card-sub">{len(people_files)} 位关键人物</div>
    <span class="nav-card-arrow">{arrow}</span>
  </a>
</div>

<div class="section">
  <div class="section-header">
    <h2 class="section-title">核心概念</h2>
    <div class="section-line"></div>
    <span class="section-count">TOP {len(concept_ranked)}</span>
  </div>
  <div class="tag-cloud">
'''
    # Tag tiering: top 3 = tier-1, next 3 = tier-2, rest = default
    for i, f in enumerate(concept_ranked):
        url = link_map.get(f["stem"], "#")
        count = ref_counts.get(f["stem"], 0)
        tier = " tier-1" if i < 3 else (" tier-2" if i < 6 else "")
        html += f'    <a href="{url}" class="tag{tier}">{f["stem"]}<span class="tag-n">{count}</span></a>\n'

    html += '''  </div>
</div>

<div class="section">
  <div class="section-header">
    <h2 class="section-title">工作方法</h2>
    <div class="section-line"></div>
    <span class="section-count">''' + str(len(method_ranked)) + ''' 个</span>
  </div>
  <p style="font-size:14px;color:var(--text2);margin:-8px 0 16px;font-family:var(--serif)">这是马斯克知识库相对其他知识库独有的维度——可操作的工作方法卡片，每张都附带"你能用上吗？"的实操建议。</p>
  <div class="tag-cloud">
'''
    for i, f in enumerate(method_ranked):
        url = link_map.get(f["stem"], "#")
        count = ref_counts.get(f["stem"], 0)
        tier = " tier-1" if i < 3 else (" tier-2" if i < 6 else "")
        html += f'    <a href="{url}" class="tag{tier}">{f["stem"]}<span class="tag-n">{count}</span></a>\n'

    html += '''  </div>
</div>

<div class="section">
  <div class="section-header">
    <h2 class="section-title">公司与产品</h2>
    <div class="section-line"></div>
    <span class="section-count">TOP ''' + str(len(company_ranked)) + '''</span>
  </div>
  <div class="tag-cloud">
'''
    for i, f in enumerate(company_ranked):
        url = link_map.get(f["stem"], "#")
        count = ref_counts.get(f["stem"], 0)
        tier = " tier-1" if i < 3 else (" tier-2" if i < 6 else "")
        html += f'    <a href="{url}" class="tag{tier}">{f["stem"]}<span class="tag-n">{count}</span></a>\n'

    html += '''  </div>
</div>

<div class="section">
  <div class="section-header">
    <h2 class="section-title">关键人物</h2>
    <div class="section-line"></div>
    <span class="section-count">''' + str(len(people_files)) + ''' 位</span>
  </div>
  <div class="people-grid">
'''
    for f in people_files:
        url = link_map.get(f["stem"], "#")
        avatar, role = people_data.get(f["stem"], ("·", ""))
        count = ref_counts.get(f["stem"], 0)
        html += f'''    <a href="{url}" class="person-card">
      <div class="person-avatar">{avatar}</div>
      <div class="person-name">{f["stem"]}</div>
      <div class="person-refs">被引用 {count} 次</div>
    </a>
'''

    html += '''  </div>
</div>

<div class="gold-divider"><span class="gold-divider-diamond"></span></div>

<div class="footer-promo">
  <div class="promo-story">
    <h3>关于本站</h3>
    <p>把马斯克散落在 Tesla Master Plan、Lex Fridman 长访谈、TED 演讲、Joe Rogan 节目、财报会议中的思想，整理成一张可以漫游的知识图谱。从 2006 年第一份 Master Plan 到 2024 年的 Neuralink 团队访谈，跨越近 20 年。</p>
    <p>独有视角：<strong>立场演变追踪</strong>（AI 安全 / OpenAI / FSD / 言论自由）和 <strong>10 个工作方法</strong>——每张方法卡都附带"你能用上吗？"的实操建议。</p>
    <p class="promo-credit">本站是由作者与 <strong>Claude Code</strong> 共同完成的。想了解和交流更多 AI 机会的话，欢迎扫码关注公众号。</p>
  </div>
  <div class="promo-qr">
    <img src="/assets/qrcode.jpg" alt="公众号二维码" class="qr-img">
    <p class="qr-text">扫码关注公众号</p>
  </div>
</div>

</div>
'''
    return html


# ── Step 8: Main build ───────────────────────────────────────────────────────

def main():
    # Clean output
    if OUT.exists():
        shutil.rmtree(OUT)

    # Copy static assets (e.g. QR code, favicon)
    # TODO 7: change "assets-<人名拼音>" to your project's assets directory
    assets_src = Path(__file__).parent / "assets-<人名拼音>"
    if assets_src.is_dir():
        shutil.copytree(assets_src, OUT / "assets")
        print(f"Copied assets/ ({len(list(assets_src.iterdir()))} files)")

    # Collect
    print("Collecting files...")
    files = collect_files()
    print(f"  Found {len(files)} files")

    # Build link map
    link_map = build_link_map(files)
    print(f"  Built link map with {len(link_map)} entries")

    # Count references
    ref_counts = count_references(files)

    # Build backlinks
    backlinks_map = build_backlinks(files, link_map)
    total_backlinks = sum(len(v) for v in backlinks_map.values())
    print(f"  Built backlinks: {total_backlinks} links across {len(backlinks_map)} pages")

    # Build pages
    page_count = 0

    for f in files:
        stem = f["stem"]
        cat  = f["category"]

        if cat == "home":
            # Homepage
            body_html = build_homepage(files, link_map, ref_counts)
            html = wrap_page("首页", body_html, files, current_stem=stem, wide=True)
            out_path = OUT / "index.html"
        else:
            # Convert wikilinks then markdown
            body_md = convert_wikilinks(f["body"], link_map)
            body_html = md_to_html(body_md)
            # Add type badge meta above content
            type_label_map = {
                "master-plans":  "总体规划",
                "interviews":    "访谈",
                "earnings-calls": "财报会议",
                "concepts":      "概念",
                "methods":       "方法",
                "companies":     "产品",
                "people":        "人物",
                "index-pages":   "索引",
            }
            type_label = type_label_map.get(cat, "")
            # Skip type badge on changelog page
            if type_label and stem != "更新日志":
                body_html = f'<div class="meta"><span class="type-badge type-{type_label}">{type_label}</span></div>\n' + body_html
            # Build backlinks as right sidebar — skip for index pages (they list everything)
            if cat == "index-pages":
                bl_html = ""
            else:
                bl_html = build_backlinks_html(stem, backlinks_map, link_map)
            title = f["fm"].get("title", stem)
            # Apply changelog styling for 更新日志.md
            page_type = "changelog" if stem == "更新日志" else ""
            html = wrap_page(title, body_html, files, current_stem=stem, right_html=bl_html, page_type=page_type)
            out_path = OUT / cat / f"{stem}.html"

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html, encoding="utf-8")
        page_count += 1

    print(f"\nGenerated {page_count} HTML pages in {OUT}")

    # Stats
    total_size = sum(p.stat().st_size for p in OUT.rglob("*.html"))
    print(f"Total size: {total_size / 1024:.0f} KB")
    for d in sorted(OUT.iterdir()):
        if d.is_dir():
            count = len(list(d.glob("*.html")))
            print(f"  {d.name}/: {count} files")
        else:
            print(f"  {d.name}: {d.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
