(function () {
  'use strict';

  const BOOKMARK_LABEL_RE = /(bookmark|书签|收藏|ブックマーク|북마크)/i;
  const REMOVE_BOOKMARK_LABEL_RE = /(remove\s*bookmark|移除书签|取消收藏|取消書籤|ブックマークを削除|북마크\s*삭제)/i;
  const TOAST_CONTAINER_ID = 'xbls-toast-container';
  const RECENT_SAVE_COOLDOWN_MS = 3500;
  const recentSavedMap = new Map();

  document.addEventListener('click', function (event) {
    const bookmarkAction = findBookmarkActionElement(event.target);
    if (!bookmarkAction) return;
    if (isRemoveBookmarkAction(bookmarkAction)) return;

    const tweetArticle = findAncestorTweetArticle(bookmarkAction);
    if (!tweetArticle) return;

    const tweetData = extractTweetData(tweetArticle);
    if (!tweetData.text && !tweetData.tweetUrl) return;
    const dedupeKey = buildDedupeKey(tweetData);
    if (isRecentlySaved(dedupeKey)) return;
    rememberSaved(dedupeKey);
    saveBookmarkNow(tweetData, dedupeKey);
  }, true);

  function saveBookmarkNow(tweetData, dedupeKey) {
    showToast('正在保存 Markdown...', 'info');

    chrome.runtime.sendMessage(
      {
        type: 'XBLS_SAVE_MARKDOWN',
        payload: { tweetData: tweetData },
      },
      function (response) {
        if (chrome.runtime.lastError) {
          rollbackSaved(dedupeKey);
          showToast('保存失败：' + chrome.runtime.lastError.message, 'error');
          return;
        }
        if (response && response.success) {
          showToast('已保存到 Downloads/x-bookmark-local', 'success');
        } else {
          rollbackSaved(dedupeKey);
          showToast((response && response.error) ? response.error : '保存失败', 'error');
        }
      }
    );
  }

  function buildDedupeKey(tweetData) {
    if (tweetData.tweetUrl) return tweetData.tweetUrl;
    const shortText = (tweetData.text || '').slice(0, 120);
    return (tweetData.author || 'unknown') + '|' + shortText;
  }

  function isRecentlySaved(key) {
    const last = recentSavedMap.get(key);
    return !!(last && (Date.now() - last) < RECENT_SAVE_COOLDOWN_MS);
  }

  function rememberSaved(key) {
    recentSavedMap.set(key, Date.now());
  }

  function rollbackSaved(key) {
    recentSavedMap.delete(key);
  }

  function findBookmarkActionElement(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      const testId = cur.getAttribute && cur.getAttribute('data-testid');
      if (testId === 'bookmark' || testId === 'removeBookmark') return cur;

      const aria = (cur.getAttribute && cur.getAttribute('aria-label')) || '';
      const role = (cur.getAttribute && cur.getAttribute('role')) || '';
      const isButtonLike = cur.tagName === 'BUTTON' || role === 'button';
      if (isButtonLike && aria && BOOKMARK_LABEL_RE.test(aria)) return cur;

      cur = cur.parentElement;
    }
    return null;
  }

  function isRemoveBookmarkAction(el) {
    if (!el) return false;
    const testId = (el.getAttribute && el.getAttribute('data-testid')) || '';
    if (testId === 'removeBookmark') return true;
    const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
    return REMOVE_BOOKMARK_LABEL_RE.test(aria);
  }

  function findAncestorTweetArticle(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.tagName === 'ARTICLE') return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function extractTweetData(article) {
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textEl ? (textEl.innerText || '').trim() : '';

    const userNameRoot = article.querySelector('[data-testid="User-Name"]');
    const author = userNameRoot ? ((userNameRoot.innerText || '').split('\n')[0] || '').trim() : '';

    const tweetUrl = findTweetUrl(article);

    return {
      text: text,
      author: author || 'Unknown',
      tweetUrl: tweetUrl || '',
      timestamp: Date.now(),
    };
  }

  function findTweetUrl(article) {
    const links = article.querySelectorAll('a[href*="/status/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      if (!href.includes('/status/')) continue;
      if (href.includes('/analytics') || href.includes('/photo')) continue;
      if (href.startsWith('http://') || href.startsWith('https://')) return href;
      if (href.startsWith('/')) return 'https://x.com' + href;
      return 'https://x.com/' + href;
    }
    return '';
  }

  function showToast(message, type) {
    const container = getOrCreateToastContainer();
    const toast = document.createElement('div');
    toast.className = 'xbls-toast xbls-' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('xbls-toast-hide');
      setTimeout(function () {
        if (toast.parentNode) toast.remove();
      }, 220);
    }, 2200);
  }

  function getOrCreateToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) return container;
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    document.body.appendChild(container);
    return container;
  }
})();
