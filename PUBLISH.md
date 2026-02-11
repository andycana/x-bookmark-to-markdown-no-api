# Publish Guide

Use this quick flow to publish on GitHub.

## 1) Create repository

Recommended repo name:

- `x-bookmark-to-markdown-no-api`

## 2) Push files

From `extensions/x-bookmark-local`:

```bash
git init
git add .
git commit -m "feat: release x bookmark to markdown no-api extension"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## 3) Suggested GitHub description

Chrome extension that saves X/Twitter bookmarks to local Markdown instantly — no API, no key, no model cost.

## 4) Suggested topics

- `chrome-extension`
- `x-twitter`
- `markdown`
- `bookmark`
- `productivity`
- `no-api`

## 5) First release tag

```bash
git tag v1.0.0
git push origin v1.0.0
```
