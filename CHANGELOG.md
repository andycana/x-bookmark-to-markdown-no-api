# Changelog

All notable changes to this project are documented in this file.

## [1.1.0] - 2026-02-11

### Added

- Download extractable images when a post is bookmarked.
- Save images into `Downloads/x-bookmark-local/media/`.
- Add `## Images` section in Markdown with local image references.

### Changed

- Allow image-only posts to be saved (even when no text is extracted).
- Include thread image metadata in markdown output/history.

## [1.0.0] - 2026-02-11

### Added

- Initial public release of `X Bookmark → Markdown (No API)`.
- Auto-save Markdown when user bookmarks a post on X/Twitter.
- Local history panel in popup.
- Success/error toast feedback on save.
- No-API, no-key architecture for zero inference cost.

### Changed

- Switched flow to pure bookmark-to-markdown (removed summary generation).
- Markdown output keeps original content only.
