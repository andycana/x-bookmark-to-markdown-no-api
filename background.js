const HISTORY_KEY = 'xbls_saved_items';
const HISTORY_LIMIT = 300;
const DOWNLOAD_DIR_KEY = 'xbls_download_dir';
const DEFAULT_DOWNLOAD_DIR = 'x-bookmark-local';
const NATIVE_FOLDER_KEY = 'xbls_native_folder_path';
const NATIVE_HOST_NAME = 'com.xbookmark.local';
const ALLOWED_FETCH_HOSTS = ['x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'];
const MAX_IMAGE_DOWNLOADS = 20;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return;

  if (message.type === 'XBLS_SAVE_MARKDOWN') {
    handleSaveMarkdown(message.payload)
      .then(function (result) { sendResponse({ success: true, path: result.path }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || 'save failed' }); });
    return true;
  }

  if (message.type === 'XBLS_GET_HISTORY') {
    getHistory()
      .then(function (items) { sendResponse({ success: true, items: items }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || 'read history failed' }); });
    return true;
  }

  if (message.type === 'XBLS_FETCH_PAGE_TEXT') {
    fetchPageText(message.payload && message.payload.url)
      .then(function (text) { sendResponse({ success: true, text: text }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || 'fetch page failed' }); });
    return true;
  }

  if (message.type === 'XBLS_GET_NATIVE_STATUS') {
    getNativeStatus()
      .then(function (status) { sendResponse({ success: true, status: status }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || 'native status failed' }); });
    return true;
  }

  if (message.type === 'XBLS_PICK_NATIVE_FOLDER') {
    pickNativeFolder()
      .then(function (result) { sendResponse({ success: true, path: result.path }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || 'pick folder failed' }); });
    return true;
  }

  if (message.type === 'XBLS_CLEAR_NATIVE_FOLDER') {
    clearNativeFolder()
      .then(function () { sendResponse({ success: true }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || 'clear folder failed' }); });
    return true;
  }

  if (message.type === 'XBLS_CLEAR_HISTORY') {
    chrome.storage.local.set({ [HISTORY_KEY]: [] })
      .then(function () { sendResponse({ success: true }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || 'clear history failed' }); });
    return true;
  }
});

async function handleSaveMarkdown(payload) {
  if (!payload || !payload.tweetData) {
    throw new Error('invalid content');
  }

  const tweetData = payload.tweetData;
  const fileName = buildFileName(tweetData);
  const nativeFolderPath = await getNativeFolderPath();

  if (nativeFolderPath) {
    const nativeReady = await isNativeHostReady();
    if (!nativeReady) {
      throw new Error('Native helper is not ready. Please install helper from popup first.');
    }

    const imageDownloads = await downloadImagesForTweet(tweetData, fileName, {
      mode: 'native',
      folderPath: nativeFolderPath,
    });
    const markdown = buildMarkdown(tweetData, imageDownloads);
    const savedPath = await saveViaNative(markdown, fileName, nativeFolderPath);
    await pushHistory(tweetData, savedPath, imageDownloads);
    return { path: savedPath };
  }

  const downloadDir = await getDownloadDir();
  const imageDownloads = await downloadImagesForTweet(tweetData, fileName, {
    mode: 'downloads',
    downloadDir: downloadDir,
  });
  const markdown = buildMarkdown(tweetData, imageDownloads);
  const fullPath = downloadDir + '/' + fileName;

  await saveViaDownloads(markdown, fullPath);
  await pushHistory(tweetData, fullPath, imageDownloads);
  return { path: 'Downloads/' + fullPath };
}

async function getHistory() {
  const data = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  return data[HISTORY_KEY];
}

async function pushHistory(tweetData, filePath, imageDownloads) {
  const list = await getHistory();
  const imageCount = imageDownloads && Array.isArray(imageDownloads.downloaded)
    ? imageDownloads.downloaded.length
    : 0;
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    author: tweetData.author || 'Unknown',
    tweetUrl: tweetData.tweetUrl || '',
    preview: (tweetData.text || '').slice(0, 180),
    filePath: filePath,
    imageCount: imageCount,
  };

  list.unshift(entry);
  const trimmed = list.slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: trimmed });
}

function buildMarkdown(tweetData, imageDownloads) {
  const threadItems = normalizeThreadItems(tweetData.threadItems);
  const firstThreadText = threadItems.length > 0 ? threadItems[0].text : '';
  const text = (tweetData.text || '').trim() || firstThreadText || '(鏃犲彲鎻愬彇鏂囨湰锛屽彲鑳芥槸鍥剧墖/瑙嗛鍐呭)';
  const author = tweetData.author || 'Unknown';
  const source = tweetData.sourceUrl || tweetData.articleUrl || tweetData.tweetUrl || '';
  const time = formatDateTime(new Date(tweetData.timestamp || Date.now()));
  const downloadedImages = imageDownloads && Array.isArray(imageDownloads.downloaded) ? imageDownloads.downloaded : [];
  const failedImages = imageDownloads && Array.isArray(imageDownloads.failed) ? imageDownloads.failed : [];
  const lines = [
    '# X Bookmarked Post',
    '',
    '> **Author**: ' + author,
    '> **Source**: ' + source,
    '> **Date**: ' + time,
    '',
    '---',
    '',
    '## Original Content',
    '',
    text,
    '',
  ];

  if (downloadedImages.length > 0 || failedImages.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Images');
    lines.push('');

    downloadedImages.forEach(function (item, index) {
      lines.push('### Image ' + (index + 1));
      lines.push('![' + (item.alt || ('image-' + (index + 1))) + '](' + item.localPath + ')');
      lines.push('- Source: ' + item.url);
      if (item.fromThread && item.threadIndex) {
        lines.push('- From Thread Post: #' + item.threadIndex);
      }
      lines.push('');
    });

    if (failedImages.length > 0) {
      lines.push('### Failed Downloads');
      failedImages.forEach(function (item) {
        lines.push('- ' + item.url + ' (' + (item.error || 'download_failed') + ')');
      });
      lines.push('');
    }
  }

  if (threadItems.length > 1) {
    lines.push('---');
    lines.push('');
    lines.push('## Thread Posts');
    lines.push('');

    threadItems.forEach(function (item, index) {
      lines.push('### ' + (index + 1) + '. ' + (item.author || author));
      if (item.tweetUrl) lines.push('> Source: ' + item.tweetUrl);
      lines.push('');
      lines.push(item.text || '(image-only post)');
      if (Array.isArray(item.imageUrls) && item.imageUrls.length > 0) {
        lines.push('');
        lines.push('> Images: ' + item.imageUrls.length);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

function normalizeThreadItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  const result = [];
  const seen = new Set();

  rawItems.forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    const text = String(item.text || '').trim();
    const imageUrls = normalizeImageUrls(item.imageUrls);
    if (!text && imageUrls.length === 0) return;
    const author = String(item.author || 'Unknown').trim() || 'Unknown';
    const tweetUrl = String(item.tweetUrl || '').trim();
    const key = (item.statusId ? String(item.statusId) : '') || tweetUrl || text.slice(0, 120) || imageUrls[0];
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({
      text: text,
      author: author,
      tweetUrl: tweetUrl,
      imageUrls: imageUrls,
    });
  });

  return result.slice(0, 20);
}

async function downloadImagesForTweet(tweetData, markdownFileName, saveTarget) {
  const targets = collectImageTargets(tweetData);
  if (targets.length === 0) {
    return { downloaded: [], failed: [] };
  }

  const baseName = sanitizeFilePart(String(markdownFileName || '').replace(/\.md$/i, ''));
  const runTag = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const downloaded = [];
  const failed = [];

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const ext = detectImageExtension(target.url);
    const mediaName = baseName + '_' + runTag + '_' + pad(index + 1) + ext;
    const relativePath = 'media/' + mediaName;

    try {
      if (saveTarget && saveTarget.mode === 'native') {
        await downloadImageViaNative(target.url, relativePath, saveTarget.folderPath);
      } else {
        const mediaPath = saveTarget.downloadDir + '/' + relativePath;
        await chrome.downloads.download({
          url: target.url,
          filename: mediaPath,
          saveAs: false,
          conflictAction: 'uniquify',
        });
      }
      downloaded.push({
        url: target.url,
        localPath: relativePath,
        alt: target.alt || ('image-' + (index + 1)),
        fromThread: !!target.fromThread,
        threadIndex: target.threadIndex || 0,
      });
    } catch (error) {
      failed.push({
        url: target.url,
        error: error && error.message ? error.message : 'download_failed',
      });
    }
  }

  return { downloaded: downloaded, failed: failed };
}

function collectImageTargets(tweetData) {
  const targets = [];
  const seen = new Set();

  function pushTarget(url, meta) {
    const normalized = normalizeImageUrl(url);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    targets.push({
      url: normalized,
      alt: meta && meta.alt ? meta.alt : '',
      fromThread: !!(meta && meta.fromThread),
      threadIndex: meta && meta.threadIndex ? meta.threadIndex : 0,
    });
  }

  const primaryImages = normalizeImageUrls(tweetData && tweetData.imageUrls);
  primaryImages.forEach(function (url, index) {
    pushTarget(url, { alt: 'post-image-' + (index + 1), fromThread: false, threadIndex: 0 });
  });

  const threadItems = normalizeThreadItems(tweetData && tweetData.threadItems);
  threadItems.forEach(function (item, threadIndex) {
    const imageUrls = normalizeImageUrls(item.imageUrls);
    imageUrls.forEach(function (url, imageIndex) {
      pushTarget(url, {
        alt: 'thread-' + (threadIndex + 1) + '-image-' + (imageIndex + 1),
        fromThread: true,
        threadIndex: threadIndex + 1,
      });
    });
  });

  return targets.slice(0, MAX_IMAGE_DOWNLOADS);
}

function normalizeImageUrls(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const result = [];
  const seen = new Set();

  raw.forEach(function (item) {
    const normalized = normalizeImageUrl(item);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

function normalizeImageUrl(urlLike) {
  const raw = String(urlLike || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw, 'https://x.com');
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';

    if (parsed.hostname.includes('twimg.com')) {
      if (parsed.searchParams.has('name')) {
        parsed.searchParams.set('name', 'orig');
      } else if (parsed.pathname.includes('/media/')) {
        parsed.searchParams.set('name', 'orig');
      }
    }

    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function detectImageExtension(urlLike) {
  const fallbackExt = '.jpg';
  const allowExtSet = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

  try {
    const parsed = new URL(String(urlLike || ''));
    const format = (parsed.searchParams.get('format') || '').toLowerCase();
    if (allowExtSet.has(format)) {
      return '.' + (format === 'jpeg' ? 'jpg' : format);
    }

    const pathMatch = parsed.pathname.match(/\.([a-zA-Z0-9]{3,4})(?:$|\?)/);
    if (pathMatch) {
      const ext = pathMatch[1].toLowerCase();
      if (allowExtSet.has(ext)) {
        return '.' + (ext === 'jpeg' ? 'jpg' : ext);
      }
    }
  } catch (_) {
    return fallbackExt;
  }

  return fallbackExt;
}


async function getDownloadDir() {
  try {
    const data = await chrome.storage.local.get({ [DOWNLOAD_DIR_KEY]: DEFAULT_DOWNLOAD_DIR });
    return normalizeDownloadDir(data[DOWNLOAD_DIR_KEY]);
  } catch (_) {
    return DEFAULT_DOWNLOAD_DIR;
  }
}

async function getNativeFolderPath() {
  try {
    const data = await chrome.storage.local.get({ [NATIVE_FOLDER_KEY]: '' });
    return normalizeNativeFolderPath(data[NATIVE_FOLDER_KEY]);
  } catch (_) {
    return '';
  }
}

function normalizeNativeFolderPath(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  if (raw.indexOf('\u0000') !== -1) return '';
  return raw;
}

async function getNativeStatus() {
  const folderPath = await getNativeFolderPath();
  const helperReady = await isNativeHostReady();
  return {
    helperReady: helperReady,
    folderPath: folderPath,
    hostName: NATIVE_HOST_NAME,
  };
}

async function pickNativeFolder() {
  const response = await sendNativeHostMessage({ action: 'pick_folder' });
  if (!response || !response.success || !response.path) {
    throw new Error((response && response.error) || 'Folder selection cancelled.');
  }

  const folderPath = normalizeNativeFolderPath(response.path);
  if (!folderPath) {
    throw new Error('Invalid folder path from native helper.');
  }

  await chrome.storage.local.set({ [NATIVE_FOLDER_KEY]: folderPath });
  return { path: folderPath };
}

async function clearNativeFolder() {
  await chrome.storage.local.set({ [NATIVE_FOLDER_KEY]: '' });
}

async function isNativeHostReady() {
  try {
    const response = await sendNativeHostMessage({ action: 'ping' });
    return !!(response && response.success);
  } catch (_) {
    return false;
  }
}

function sendNativeHostMessage(message) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, function (response) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || null);
    });
  });
}

function normalizeDownloadDir(rawValue) {
  const raw = String(rawValue || '').trim().replace(/\\/g, '/');
  if (!raw) return DEFAULT_DOWNLOAD_DIR;

  const parts = raw
    .split('/')
    .map(function (part) { return sanitizeDirectoryPart(part); })
    .filter(function (part) { return part && part !== '.' && part !== '..'; });

  if (parts.length === 0) return DEFAULT_DOWNLOAD_DIR;
  return parts.slice(0, 6).join('/');
}

function sanitizeDirectoryPart(value) {
  return String(value || '')
    .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^\.+$/, '')
    .slice(0, 40);
}
function buildFileName(tweetData) {
  const date = new Date(tweetData.timestamp || Date.now());
  const datePart = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');

  const timePart = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
  const authorPart = sanitizeFilePart(tweetData.author || 'unknown');
  return datePart + '_' + timePart + '_' + authorPart + '.md';
}

function sanitizeFilePart(input) {
  return String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'item';
}

function formatDateTime(date) {
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
  ].join('');
}

function pad(num) {
  return String(num).padStart(2, '0');
}

async function saveViaDownloads(markdown, filename) {
  const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown);
  await chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false,
    conflictAction: 'uniquify',
  });
}

async function saveViaNative(markdown, relativePath, folderPath) {
  const response = await sendNativeHostMessage({
    action: 'write_text_file',
    folder_path: folderPath,
    relative_path: relativePath,
    content: markdown,
  });
  if (!response || !response.success) {
    throw new Error((response && response.error) || 'native write failed');
  }
  return response.path || (folderPath + '/' + relativePath);
}

async function downloadImageViaNative(url, relativePath, folderPath) {
  const response = await sendNativeHostMessage({
    action: 'download_url_to_file',
    folder_path: folderPath,
    relative_path: relativePath,
    url: url,
  });
  if (!response || !response.success) {
    throw new Error((response && response.error) || 'native image download failed');
  }
}

async function fetchPageText(url) {
  const target = String(url || '').trim();
  if (!target) throw new Error('URL is empty');

  let parsed;
  try {
    parsed = new URL(target);
  } catch (_) {
    throw new Error('URL is invalid');
  }
  if (!ALLOWED_FETCH_HOSTS.includes(parsed.hostname)) {
    throw new Error('Unsupported host');
  }

  const res = await fetch(parsed.toString(), {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Page fetch failed: ' + res.status);
  }

  const html = await res.text();
  return extractMeaningfulTextFromHtml(html);
}

function extractMeaningfulTextFromHtml(html) {
  const source = String(html || '');
  if (!source) return '';

  const candidates = [];

  pushMatch(candidates, source, /"article_body"\s*:\s*"((?:\\.|[^"\\])*)"/gi, true);
  pushMatch(candidates, source, /"full_text"\s*:\s*"((?:\\.|[^"\\])*)"/gi, true);
  pushMatch(candidates, source, /"tweet_text"\s*:\s*"((?:\\.|[^"\\])*)"/gi, true);
  pushMatch(candidates, source, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/gi, false);
  pushMatch(candidates, source, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/gi, false);

  const articleBlock = firstGroup(source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i));
  if (articleBlock) candidates.push(cleanHtmlText(articleBlock));

  const bodyBlock = firstGroup(source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i));
  if (bodyBlock) candidates.push(cleanHtmlText(bodyBlock));

  const filtered = [];
  const seen = new Set();
  candidates.forEach(function (entry) {
    const normalized = normalizeExtractedText(entry);
    if (!normalized) return;
    if (normalized.length < 20) return;
    if (/^log in|^sign up|cookies|terms|privacy/i.test(normalized)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    filtered.push(normalized);
  });

  if (filtered.length === 0) return '';

  filtered.sort(function (a, b) { return b.length - a.length; });
  return filtered[0].slice(0, 20000);
}

function pushMatch(target, source, regex, isJsonEscaped) {
  let match;
  while ((match = regex.exec(source)) !== null) {
    const value = (match[1] || '').trim();
    if (!value) continue;
    target.push(isJsonEscaped ? decodeJsonEscapes(value) : decodeHtmlEntities(value));
  }
}

function firstGroup(match) {
  if (!match || !match[1]) return '';
  return match[1];
}

function decodeJsonEscapes(text) {
  const value = String(text || '');
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\u([0-9a-fA-F]{4})/g, function (_, hex) {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (_) {
        return '';
      }
    });
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanHtmlText(fragment) {
  return decodeHtmlEntities(
    String(fragment || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
