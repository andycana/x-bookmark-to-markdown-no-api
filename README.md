# X Bookmark → Markdown (No API)

Turn X/Twitter bookmarks into local Markdown instantly.

[中文](#中文说明) | [English](#english)

![Project Logo](assets/logo-square-512.png)

---

## 中文说明

一个完全本地运行的 Chrome 扩展：

- 不调用任何 LLM API
- 不需要 API Key
- 不会产生模型调用费用
- 在 X 点收藏后立即保存 Markdown
- 线程（Thread）页面会自动合并同作者连续跟帖
- 只保留原文，不做摘要、不改写内容

### 安装

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本仓库根目录（解压后包含 `manifest.json` 的目录）

### 使用

1. 打开 `https://x.com`（或 `https://twitter.com`）
2. 点击任意帖子下方的收藏按钮
3. 扩展自动保存 `.md` 到本地下载目录，并弹出成功提示

默认保存路径：

- `Downloads/x-bookmark-local/`

### Markdown 格式

每条收藏会保存为一个独立文件，结构如下：

```md
# X Bookmarked Post

> **Author**: @someone
> **Source**: https://x.com/.../status/...
> **Date**: 2026-02-11 18:00:00

---

## Original Content

帖子原文...
```

### 隐私与数据

- 不请求外部 AI 服务
- 不上传你的收藏内容到第三方
- 仅使用浏览器本地能力保存 Markdown 文件

### 注意事项

- X 页面结构若发生变化，收藏按钮识别逻辑可能需要更新
- 本扩展仅用于个人信息管理，请遵守平台规则与当地法律

---

## English

A fully local Chrome extension that saves bookmarked posts from X/Twitter to Markdown instantly.

### Features

- No LLM API calls
- No API key required
- Zero model/token cost
- Bookmark → save Markdown immediately
- On thread pages, merges consecutive same-author posts
- Original content only (no summary, no rewriting)

### Install

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repository root (the folder containing `manifest.json`)

### Usage

1. Open `https://x.com` (or `https://twitter.com`)
2. Click bookmark on any post
3. The extension auto-saves a Markdown file locally

Default output directory:

- `Downloads/x-bookmark-local/`

### Privacy

- No external AI request
- No third-party upload of your bookmarked content
- Markdown generation and saving are local-only browser actions

---

## License

MIT — see `LICENSE`.
