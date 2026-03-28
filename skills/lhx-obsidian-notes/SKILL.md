---
name: obsidian-notes
description: Manage Obsidian notes with simple commands - create, read, edit, delete, list, and search notes in your Obsidian vault. Use when user wants to create a note, add to Obsidian, write down thoughts, save ideas, search notes, edit notes, or manage Obsidian vault. Supports Chinese characters and nested folders.
homepage: https://obsidian.md
metadata: {"clawdbot":{"emoji":"📝","requires":{"bins":["obsidian-notes"]},"install":[{"id":"manual","kind":"manual","label":"obsidian-notes is already installed at /Users/lihongxing/project/SiyuClaw/obsidian-notes"}]}}
---

# Obsidian Notes

A simple CLI tool to manage your Obsidian vault notes directly from OpenClaw.

## Vault Location

Your Obsidian vault is stored at: `~/Documents/Obsidian Vault`

## Available Commands

### Create a Note
```bash
obsidian-notes create "Note Title" "Note content" [folder]
```
Example:
```bash
obsidian-notes create "今日感悟" "今天是周六，起得很早，感觉时间比往常多了一点点。"
```

### Read a Note
```bash
obsidian-notes read "Note Title" [folder]
```
Example:
```bash
obsidian-notes read "今日感悟"
```

### Edit a Note
```bash
obsidian-notes edit "Note Title" "New content" [folder]
```
Example:
```bash
obsidian-notes edit "今日感悟" "Updated content"
```

### List All Notes
```bash
obsidian-notes list [folder]
```
Example:
```bash
obsidian-notes list
```

### Delete a Note
```bash
obsidian-notes delete "Note Title" [folder]
```
Example:
```bash
obsidian-notes delete "今日感悟"
```

### Search Notes
```bash
obsidian-notes search "keyword" [folder]
```
Example:
```bash
obsidian-notes search "周六"
```

## Usage Tips

- **Folder parameter**: Optional. If not specified, notes are created/read from the root of your vault.
- **Note titles**: Don't include the `.md` extension; it's added automatically.
- **Chinese support**: Full support for Chinese characters in note titles and content.
- **Recursive search**: The search command looks through all subfolders.

## Examples

Create a note with Chinese content:
```bash
obsidian-notes create "项目计划" "这是我的项目计划内容"
```

Create a note in a subfolder:
```bash
obsidian-notes create "我的想法" "内容" "2026"
```

Search for notes containing a keyword:
```bash
obsidian-notes search "项目"
```

List notes in a specific folder:
```bash
obsidian-notes list "2026"
```
