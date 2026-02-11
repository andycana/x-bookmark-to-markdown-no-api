(function () {
  'use strict';

  const BOOKMARK_LABEL_RE = /(bookmark|书签|收藏|ブックマーク|북마크)/i;
  const REMOVE_BOOKMARK_LABEL_RE = /(remove\s*bookmark|移除书签|取消收藏|取消書籤|ブックマークを削除|북마크\s*삭제)/i;
  const UI_NOISE_RE = /^(show more|show this thread|show replies|translate post|view|views|reply|repost|like|bookmark|share|follow|more|显示更多|查看帖子分析|回复|转发|点赞|分享|关注|更多)$/i;
  const TOAST_CONTAINER_ID = 'xbls-toast-container';
  const RECENT_SAVE_COOLDOWN_MS = 3500;
  const recentSavedMap = new Map();

  document.addEventListener('click', function (event) {
    const bookmarkAction = findBookmarkActionElement(event.target);
    if (!bookmarkAction) return;
    if (isRemoveBookmarkAction(bookmarkAction)) return;

    processBookmarkAction(bookmarkAction);
  }, true);

  async function processBookmarkAction(bookmarkAction) {
    try {
      const tweetArticle = findAncestorTweetArticle(bookmarkAction);
      if (!tweetArticle) return;

      await expandShowMore(tweetArticle);
      const tweetData = await extractTweetData(tweetArticle);
      if (!tweetData.text && !tweetData.sourceUrl) return;

      if (!tweetData.text) {
        showToast('未提取到正文，请打开帖子详情页后重试', 'error');
        return;
      }

      const dedupeKey = buildDedupeKey(tweetData);
      if (isRecentlySaved(dedupeKey)) return;
      rememberSaved(dedupeKey);
      saveBookmarkNow(tweetData, dedupeKey);
    } catch (error) {
      showToast('提取失败：' + (error && error.message ? error.message : '未知错误'), 'error');
    }
  }

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
    if (tweetData.sourceUrl) return tweetData.sourceUrl;
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

  async function extractTweetData(article) {
    let text = extractTweetText(article);
    const cardText = extractCardText(article);
    if (!text && cardText) text = cardText;

    const userNameRoot = article.querySelector('[data-testid="User-Name"]');
    const author = userNameRoot ? ((userNameRoot.innerText || '').split('\n')[0] || '').trim() : '';

    const tweetUrl = findTweetUrl(article);
    const articleUrl = findArticleUrl(article);
    const sourceUrl = articleUrl || tweetUrl || '';

    if (!text && sourceUrl) {
      showToast('检测到文章链接，正在抓取正文...', 'info');
      const fetchedText = await fetchTextFromPage(sourceUrl);
      if (fetchedText) {
        text = fetchedText;
      } else if (tweetUrl && articleUrl) {
        const tweetPageText = await fetchTextFromPage(tweetUrl);
        if (tweetPageText) text = tweetPageText;
      }
    }

    return {
      text: text,
      author: author || 'Unknown',
      tweetUrl: tweetUrl || '',
      articleUrl: articleUrl || '',
      sourceUrl: sourceUrl,
      timestamp: Date.now(),
    };
  }

  function extractTweetText(article) {
    const exactBlocks = article.querySelectorAll('[data-testid="tweetText"]');
    const exactText = mergeTextNodes(exactBlocks);
    if (exactText) return exactText;

    const langBlocks = article.querySelectorAll('div[lang], span[lang]');
    const langText = mergeTextNodes(langBlocks);
    if (langText) return langText;

    return fallbackExtractText(article);
  }

  function mergeTextNodes(nodes) {
    const chunks = [];
    const seen = new Set();

    for (const node of nodes) {
      const text = normalizeText(node.innerText || node.textContent || '');
      if (!text) continue;
      if (UI_NOISE_RE.test(text)) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      chunks.push(text);
    }

    return chunks.join('\n').trim();
  }

  function fallbackExtractText(article) {
    const raw = normalizeText(article.innerText || article.textContent || '');
    if (!raw) return '';

    const lines = raw.split('\n').map(function (line) { return normalizeText(line); }).filter(Boolean);
    const filtered = lines.filter(function (line) {
      if (UI_NOISE_RE.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^\d+[KMB]?$/i.test(line)) return false;
      return true;
    });

    return filtered.join('\n').trim();
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function expandShowMore(article) {
    const links = article.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
    if (!links.length) return;

    links.forEach(function (link) { link.click(); });

    await new Promise(function (resolve) {
      const observer = new MutationObserver(function () {
        if (!article.querySelector('[data-testid="tweet-text-show-more-link"]')) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(article, { childList: true, subtree: true });
      setTimeout(function () {
        observer.disconnect();
        resolve();
      }, 1500);
    });
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

  function findArticleUrl(article) {
    const links = article.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      if (!href) continue;
      if (!/\/i\/articles\/|\/articles\//i.test(href)) continue;
      const url = normalizeUrl(href);
      if (url) return url;
    }
    return '';
  }

  function extractCardText(article) {
    const selectors = [
      '[data-testid="card.wrapper"] div[lang]',
      '[data-testid="card.wrapper"] span[lang]',
      '[data-testid="card.wrapper"] div[dir="auto"]',
      '[data-testid="card.wrapper"] div[dir="ltr"]',
      '[data-testid="card.wrapper"] span',
      '[data-testid="card.wrapper"] p',
    ];

    const chunks = [];
    const seen = new Set();
    selectors.forEach(function (selector) {
      const nodes = article.querySelectorAll(selector);
      nodes.forEach(function (node) {
        const text = normalizeText(node.innerText || node.textContent || '');
        if (!text) return;
        if (UI_NOISE_RE.test(text)) return;
        if (seen.has(text)) return;
        seen.add(text);
        chunks.push(text);
      });
    });

    return chunks.join('\n').trim();
  }

  function normalizeUrl(urlLike) {
    const raw = String(urlLike || '').trim();
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return 'https://x.com' + raw;
    return 'https://x.com/' + raw;
  }

  async function fetchTextFromPage(url) {
    return await new Promise(function (resolve) {
      chrome.runtime.sendMessage(
        {
          type: 'XBLS_FETCH_PAGE_TEXT',
          payload: { url: url },
        },
        function (response) {
          if (chrome.runtime.lastError) {
            resolve('');
            return;
          }
          if (!response || !response.success) {
            resolve('');
            return;
          }
          resolve(normalizeText(response.text || ''));
        }
      );
    });
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
