document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('clearBtn').addEventListener('click', clearHistory);
  loadHistory();
});

function sendMessage(type, payload) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage({ type: type, payload: payload }, function (response) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('空响应'));
        return;
      }
      if (!response.success) {
        reject(new Error(response.error || '请求失败'));
        return;
      }
      resolve(response);
    });
  });
}

async function loadHistory() {
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const countText = document.getElementById('countText');

  try {
    const response = await sendMessage('XBLS_GET_HISTORY');
    const items = response.items || [];

    countText.textContent = '已保存 ' + items.length + ' 条';
    listEl.innerHTML = '';

    if (items.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    const fragment = document.createDocumentFragment();

    items.forEach(function (item) {
      const card = document.createElement('div');
      card.className = 'item';

      const top = document.createElement('div');
      top.className = 'item-top';

      const author = document.createElement('span');
      author.className = 'author';
      author.textContent = item.author || 'Unknown';

      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = formatTime(item.timestamp);

      top.appendChild(author);
      top.appendChild(time);

      const preview = document.createElement('div');
      preview.className = 'preview';
      preview.textContent = item.preview || '(无预览)';

      const actions = document.createElement('div');
      actions.className = 'actions';

      if (item.tweetUrl) {
        const link = document.createElement('a');
        link.className = 'link';
        link.href = item.tweetUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '查看原帖 ↗';
        actions.appendChild(link);
      }

      const path = document.createElement('span');
      path.className = 'path';
      path.textContent = item.filePath || '';
      actions.appendChild(path);

      card.appendChild(top);
      card.appendChild(preview);
      card.appendChild(actions);
      fragment.appendChild(card);
    });

    listEl.appendChild(fragment);
  } catch (error) {
    countText.textContent = '读取失败';
    emptyEl.style.display = 'block';
    emptyEl.textContent = error.message;
  }
}

async function clearHistory() {
  if (!confirm('确认清空插件内的保存记录吗？（不会删除已下载的 Markdown 文件）')) return;
  try {
    await sendMessage('XBLS_CLEAR_HISTORY');
    loadHistory();
  } catch (error) {
    alert(error.message);
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return y + '-' + m + '-' + day + ' ' + hh + ':' + mm;
}
