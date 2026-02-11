const HISTORY_KEY = 'xbls_saved_items';
const HISTORY_LIMIT = 300;

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
  const text = (tweetData.text || '').trim() || '(无可提取文本，可能是图片/视频内容)';
  const author = tweetData.author || 'Unknown';
  const source = tweetData.tweetUrl || '';
  const time = formatDateTime(new Date(tweetData.timestamp || Date.now()));

  return [
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
  ].join('\n');
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
