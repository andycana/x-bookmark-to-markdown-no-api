const HISTORY_KEY = 'xbls_saved_items';
const HISTORY_LIMIT = 300;
const ALLOWED_FETCH_HOSTS = ['x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'];

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return;

  if (message.type === 'XBLS_SAVE_MARKDOWN') {
    handleSaveMarkdown(message.payload)
      .then(function (result) { sendResponse({ success: true, path: result.path }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || '保存失败' }); });
    return true;
  }

  if (message.type === 'XBLS_GET_HISTORY') {
    getHistory()
      .then(function (items) { sendResponse({ success: true, items: items }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || '读取失败' }); });
    return true;
  }

  if (message.type === 'XBLS_FETCH_PAGE_TEXT') {
    fetchPageText(message.payload && message.payload.url)
      .then(function (text) { sendResponse({ success: true, text: text }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || '抓取失败' }); });
    return true;
  }

  if (message.type === 'XBLS_CLEAR_HISTORY') {
    chrome.storage.local.set({ [HISTORY_KEY]: [] })
      .then(function () { sendResponse({ success: true }); })
      .catch(function (error) { sendResponse({ success: false, error: error.message || '清空失败' }); });
    return true;
  }
});

async function handleSaveMarkdown(payload) {
  if (!payload || !payload.tweetData) {
    throw new Error('无效内容');
  }

  const tweetData = payload.tweetData;
  const markdown = buildMarkdown(tweetData);
  const fileName = buildFileName(tweetData);
  const fullPath = 'x-bookmark-local/' + fileName;

  await saveViaDownloads(markdown, fullPath);
  await pushHistory(tweetData, fullPath);
  return { path: 'Downloads/' + fullPath };
}

async function getHistory() {
  const data = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  return data[HISTORY_KEY];
}

async function pushHistory(tweetData, filePath) {
  const list = await getHistory();
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    author: tweetData.author || 'Unknown',
    tweetUrl: tweetData.tweetUrl || '',
    preview: (tweetData.text || '').slice(0, 180),
    filePath: filePath,
  };

  list.unshift(entry);
  const trimmed = list.slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: trimmed });
}

function buildMarkdown(tweetData) {
  const threadItems = normalizeThreadItems(tweetData.threadItems);
  const firstThreadText = threadItems.length > 0 ? threadItems[0].text : '';
  const text = (tweetData.text || '').trim() || firstThreadText || '(无可提取文本，可能是图片/视频内容)';
  const author = tweetData.author || 'Unknown';
  const source = tweetData.sourceUrl || tweetData.articleUrl || tweetData.tweetUrl || '';
  const time = formatDateTime(new Date(tweetData.timestamp || Date.now()));
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

  if (threadItems.length > 1) {
    lines.push('---');
    lines.push('');
    lines.push('## Thread Posts');
    lines.push('');

    threadItems.forEach(function (item, index) {
      lines.push('### ' + (index + 1) + '. ' + (item.author || author));
      if (item.tweetUrl) lines.push('> Source: ' + item.tweetUrl);
      lines.push('');
      lines.push(item.text);
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
    if (!text) return;
    const author = String(item.author || 'Unknown').trim() || 'Unknown';
    const tweetUrl = String(item.tweetUrl || '').trim();
    const key = (item.statusId ? String(item.statusId) : '') || tweetUrl || text.slice(0, 120);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({
      text: text,
      author: author,
      tweetUrl: tweetUrl,
    });
  });

  return result.slice(0, 20);
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

async function fetchPageText(url) {
  const target = String(url || '').trim();
  if (!target) throw new Error('URL 为空');

  let parsed;
  try {
    parsed = new URL(target);
  } catch (_) {
    throw new Error('URL 无效');
  }
  if (!ALLOWED_FETCH_HOSTS.includes(parsed.hostname)) {
    throw new Error('不支持的域名');
  }

  const res = await fetch(parsed.toString(), {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('页面抓取失败: ' + res.status);
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
