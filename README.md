# X Bookmark → Markdown (No API)

Turn X/Twitter bookmarks into local Markdown instantly.

[中文](#中文说明) | [English](#english)

![Project Logo](assets/logo-square-512.png)

---

## 中文说明

这是一个完全本地运行的 Chrome 插件：

- 不调用任何 LLM API
- 不需要 API Key
- 没有模型调用费用
- 点收藏后自动保存 Markdown
- 自动下载帖子图片到本地 `media/` 目录
- 在线程页会合并同作者连续跟帖
- 只保留原文，不做摘要改写

### 安装

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本仓库根目录（包含 `manifest.json`）

### 使用

1. 打开 `https://x.com`（或 `https://twitter.com`）
2. 点任意帖子的收藏按钮
3. 插件自动保存 Markdown，并下载该帖可提取的图片

默认保存路径：

- `Downloads/x-bookmark-local/`
- `Downloads/x-bookmark-local/media/`（图片）

### 隐私

- 不请求外部 AI 服务
- 不上传收藏内容到第三方
- 仅使用浏览器本地能力生成并保存文件

---

## English

A fully local Chrome extension that saves bookmarked posts from X/Twitter to Markdown instantly.

### Features

- No LLM API calls
- No API key required
- Zero model/token cost
- Bookmark → save Markdown immediately
- Auto-download post images to local `media/` folder
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
3. The extension auto-saves a Markdown file and downloads extractable images

Default output directory:

- `Downloads/x-bookmark-local/`
- `Downloads/x-bookmark-local/media/` (downloaded images)

### Privacy

- No external AI request
- No third-party upload of your bookmarked content
- Markdown generation and file saving are local-only browser actions

---

## License

MIT — see `LICENSE`.
