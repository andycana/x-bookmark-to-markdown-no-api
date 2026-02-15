const AUTO_SAVE_KEY = 'xbls_auto_save_enabled';
const DOWNLOAD_IMAGES_KEY = 'xbls_download_images_enabled';
const DEFAULT_DOWNLOAD_IMAGES_ENABLED = false;
const DOWNLOAD_DIR_KEY = 'xbls_download_dir';
const DEFAULT_DOWNLOAD_DIR = 'x-bookmark-local';
const MEDIA_LAYOUT_KEY = 'xbls_media_layout';
const DEFAULT_MEDIA_LAYOUT = 'subfolder';
const NATIVE_FOLDER_KEY = 'xbls_native_folder_path';
const NATIVE_HOST_NAME = 'com.xbookmark.local';

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('clearBtn').addEventListener('click', clearHistory);
  document.getElementById('autoSaveToggle').addEventListener('change', onAutoSaveToggleChange);
  document.getElementById('downloadImagesToggle').addEventListener('change', onDownloadImagesToggleChange);
  document.getElementById('saveDirBtn').addEventListener('click', saveDownloadDir);
  document.getElementById('resetDirBtn').addEventListener('click', resetDownloadDir);
  document.getElementById('downloadDirInput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveDownloadDir();
    }
  });
  document.getElementById('mediaLayoutSelect').addEventListener('change', onMediaLayoutChange);

  document.getElementById('pickNativeFolderBtn').addEventListener('click', pickNativeFolder);
  document.getElementById('clearNativeFolderBtn').addEventListener('click', clearNativeFolder);
  document.getElementById('installNativeBtn').addEventListener('click', downloadNativeInstaller);

  loadAutoSaveSetting();
  loadDownloadImagesSetting();
  loadDownloadDirSetting();
  loadMediaLayoutSetting();
  loadNativeStatus();
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
        reject(new Error('Empty response from extension background.'));
        return;
      }
      if (!response.success) {
        reject(new Error(response.error || 'Request failed.'));
        return;
      }
      resolve(response);
    });
  });
}

async function loadAutoSaveSetting() {
  const toggleEl = document.getElementById('autoSaveToggle');
  const statusEl = document.getElementById('autoSaveStatus');
  if (!toggleEl || !statusEl) return;

  try {
    const data = await chrome.storage.local.get({ [AUTO_SAVE_KEY]: true });
    const enabled = data[AUTO_SAVE_KEY] !== false;
    toggleEl.checked = enabled;
    statusEl.textContent = enabled ? 'Current: ON' : 'Current: OFF (bookmark only)';
  } catch (_) {
    toggleEl.checked = true;
    statusEl.textContent = 'Current: ON';
  }
}

async function onAutoSaveToggleChange(event) {
  const enabled = !!(event && event.target && event.target.checked);
  const statusEl = document.getElementById('autoSaveStatus');
  if (statusEl) {
    statusEl.textContent = enabled ? 'Current: ON' : 'Current: OFF (bookmark only)';
  }
  await chrome.storage.local.set({ [AUTO_SAVE_KEY]: enabled });
}

async function loadDownloadImagesSetting() {
  const toggleEl = document.getElementById('downloadImagesToggle');
  const statusEl = document.getElementById('downloadImagesStatus');
  if (!toggleEl || !statusEl) return;

  try {
    const data = await chrome.storage.local.get({ [DOWNLOAD_IMAGES_KEY]: DEFAULT_DOWNLOAD_IMAGES_ENABLED });
    const enabled = data[DOWNLOAD_IMAGES_KEY] === true;
    toggleEl.checked = enabled;
    statusEl.textContent = enabled ? 'Current: ON' : 'Current: OFF (Markdown only)';
    syncMediaLayoutEnabled(enabled);
  } catch (_) {
    toggleEl.checked = DEFAULT_DOWNLOAD_IMAGES_ENABLED;
    statusEl.textContent = 'Current: OFF (Markdown only)';
    syncMediaLayoutEnabled(DEFAULT_DOWNLOAD_IMAGES_ENABLED);
  }
}

async function onDownloadImagesToggleChange(event) {
  const enabled = !!(event && event.target && event.target.checked);
  const statusEl = document.getElementById('downloadImagesStatus');
  if (statusEl) {
    statusEl.textContent = enabled ? 'Current: ON' : 'Current: OFF (Markdown only)';
  }
  await chrome.storage.local.set({ [DOWNLOAD_IMAGES_KEY]: enabled });
  syncMediaLayoutEnabled(enabled);
}

async function loadDownloadDirSetting() {
  const inputEl = document.getElementById('downloadDirInput');
  if (!inputEl) return;

  try {
    const data = await chrome.storage.local.get({ [DOWNLOAD_DIR_KEY]: DEFAULT_DOWNLOAD_DIR });
    const normalized = normalizeDownloadDir(data[DOWNLOAD_DIR_KEY]);
    inputEl.value = normalized;
    updateDownloadDirStatus(normalized, 'Current');

    if (normalized !== data[DOWNLOAD_DIR_KEY]) {
      await chrome.storage.local.set({ [DOWNLOAD_DIR_KEY]: normalized });
    }
  } catch (_) {
    inputEl.value = DEFAULT_DOWNLOAD_DIR;
    updateDownloadDirStatus(DEFAULT_DOWNLOAD_DIR, 'Current');
  }
}

async function saveDownloadDir() {
  const inputEl = document.getElementById('downloadDirInput');
  if (!inputEl) return;

  const normalized = normalizeDownloadDir(inputEl.value);
  await chrome.storage.local.set({ [DOWNLOAD_DIR_KEY]: normalized });
  inputEl.value = normalized;
  updateDownloadDirStatus(normalized, 'Saved');
}

async function resetDownloadDir() {
  const inputEl = document.getElementById('downloadDirInput');
  if (!inputEl) return;

  await chrome.storage.local.set({ [DOWNLOAD_DIR_KEY]: DEFAULT_DOWNLOAD_DIR });
  inputEl.value = DEFAULT_DOWNLOAD_DIR;
  updateDownloadDirStatus(DEFAULT_DOWNLOAD_DIR, 'Reset');
}

function updateDownloadDirStatus(dir, prefix) {
  const statusEl = document.getElementById('downloadDirStatus');
  if (!statusEl) return;

  const safeDir = normalizeDownloadDir(dir);
  statusEl.textContent = (prefix || 'Current') + ': Downloads/' + safeDir;
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
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^\.+$/, '')
    .slice(0, 40);
}

async function loadMediaLayoutSetting() {
  const selectEl = document.getElementById('mediaLayoutSelect');
  if (!selectEl) return;

  try {
    const data = await chrome.storage.local.get({ [MEDIA_LAYOUT_KEY]: DEFAULT_MEDIA_LAYOUT });
    const normalized = normalizeMediaLayout(data[MEDIA_LAYOUT_KEY]);
    selectEl.value = normalized;
    updateMediaLayoutStatus(normalized, 'Current');

    if (normalized !== data[MEDIA_LAYOUT_KEY]) {
      await chrome.storage.local.set({ [MEDIA_LAYOUT_KEY]: normalized });
    }
    syncMediaLayoutEnabled(isDownloadImagesEnabled());
  } catch (_) {
    selectEl.value = DEFAULT_MEDIA_LAYOUT;
    updateMediaLayoutStatus(DEFAULT_MEDIA_LAYOUT, 'Current');
    syncMediaLayoutEnabled(isDownloadImagesEnabled());
  }
}

async function onMediaLayoutChange(event) {
  const selected = normalizeMediaLayout(event && event.target ? event.target.value : DEFAULT_MEDIA_LAYOUT);
  await chrome.storage.local.set({ [MEDIA_LAYOUT_KEY]: selected });

  const selectEl = document.getElementById('mediaLayoutSelect');
  if (selectEl) {
    selectEl.value = selected;
  }
  updateMediaLayoutStatus(selected, 'Saved');
}

function normalizeMediaLayout(rawValue) {
  const raw = String(rawValue || '').trim().toLowerCase();
  if (raw === 'same-folder') return 'same-folder';
  return DEFAULT_MEDIA_LAYOUT;
}

function updateMediaLayoutStatus(layout, prefix) {
  const statusEl = document.getElementById('mediaLayoutStatus');
  if (!statusEl) return;

  const normalized = normalizeMediaLayout(layout);
  const target = normalized === 'same-folder'
    ? 'single folder (same as markdown)'
    : 'media/ subfolder';
  statusEl.textContent = (prefix || 'Current') + ': ' + target;
}

function isDownloadImagesEnabled() {
  const toggleEl = document.getElementById('downloadImagesToggle');
  if (!toggleEl) return DEFAULT_DOWNLOAD_IMAGES_ENABLED;
  return !!toggleEl.checked;
}

function syncMediaLayoutEnabled(enabled) {
  const selectEl = document.getElementById('mediaLayoutSelect');
  const statusEl = document.getElementById('mediaLayoutStatus');
  if (!selectEl || !statusEl) return;

  selectEl.disabled = !enabled;
  if (!enabled) {
    statusEl.textContent = 'Current: disabled (images OFF)';
    return;
  }
  updateMediaLayoutStatus(selectEl.value, 'Current');
}

async function loadNativeStatus() {
  const statusEl = document.getElementById('nativeStatus');
  const folderEl = document.getElementById('nativeFolderStatus');
  if (!statusEl || !folderEl) return;

  try {
    const response = await sendMessage('XBLS_GET_NATIVE_STATUS');
    const status = response.status || {};
    statusEl.textContent = status.helperReady
      ? ('Helper: Ready (' + (status.hostName || NATIVE_HOST_NAME) + ')')
      : ('Helper: Not connected (' + (status.hostName || NATIVE_HOST_NAME) + ')');

    if (status.folderPath) {
      folderEl.textContent = 'Folder: ' + status.folderPath;
      folderEl.title = status.folderPath;
    } else {
      folderEl.textContent = 'Folder: Not selected';
      folderEl.title = '';
    }
  } catch (error) {
    statusEl.textContent = 'Helper: Not connected (' + NATIVE_HOST_NAME + ')';
    folderEl.textContent = 'Folder: Not selected';
    folderEl.title = '';
  }
}

async function pickNativeFolder() {
  try {
    await sendMessage('XBLS_PICK_NATIVE_FOLDER');
    await loadNativeStatus();
  } catch (error) {
    alert('Choose folder failed: ' + error.message);
  }
}

async function clearNativeFolder() {
  try {
    await sendMessage('XBLS_CLEAR_NATIVE_FOLDER');
    await loadNativeStatus();
  } catch (error) {
    alert('Clear folder failed: ' + error.message);
  }
}

async function downloadNativeInstaller() {
  try {
    const [templateText, pythonText] = await Promise.all([
      fetch(chrome.runtime.getURL('native-host/install-native-host-windows.ps1.template')).then(function (res) {
        if (!res.ok) throw new Error('Failed to load PowerShell template');
        return res.text();
      }),
      fetch(chrome.runtime.getURL('native-host/xbls_native_host.py')).then(function (res) {
        if (!res.ok) throw new Error('Failed to load native host script');
        return res.text();
      }),
    ]);

    const pyBase64 = textToBase64(pythonText);
    const script = templateText
      .replace(/__HOST_NAME__/g, NATIVE_HOST_NAME)
      .replace(/__EXTENSION_ID__/g, chrome.runtime.id)
      .replace(/__PY_BASE64__/g, pyBase64);

    const scriptBlob = new Blob([script], { type: 'application/octet-stream' });
    const scriptUrl = URL.createObjectURL(scriptBlob);
    try {
      await chrome.downloads.download({
        url: scriptUrl,
        filename: 'install-xbls-native-host.ps1',
        saveAs: false,
        conflictAction: 'overwrite',
      });
    } finally {
      setTimeout(function () {
        URL.revokeObjectURL(scriptUrl);
      }, 1500);
    }

    const hintEl = document.getElementById('nativeHint');
    if (hintEl) {
      hintEl.textContent = 'Installer downloaded to Downloads/install-xbls-native-host.ps1. Run it in PowerShell, restart browser, then click Choose Folder.';
    }
  } catch (error) {
    alert('Download installer failed: ' + error.message);
  }
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}

async function loadHistory() {
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const countText = document.getElementById('countText');

  try {
    const response = await sendMessage('XBLS_GET_HISTORY');
    const items = response.items || [];

    countText.textContent = 'Saved ' + items.length + ' items';
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
      preview.textContent = item.preview || '(no preview)';

      const actions = document.createElement('div');
      actions.className = 'actions';

      if (item.tweetUrl) {
        const link = document.createElement('a');
        link.className = 'link';
        link.href = item.tweetUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Open post ->';
        actions.appendChild(link);
      }

      const path = document.createElement('span');
      path.className = 'path';
      path.textContent = item.filePath || '';
      path.title = item.filePath || '';
      actions.appendChild(path);

      card.appendChild(top);
      card.appendChild(preview);
      card.appendChild(actions);
      fragment.appendChild(card);
    });

    listEl.appendChild(fragment);
  } catch (error) {
    countText.textContent = 'Load failed';
    emptyEl.style.display = 'block';
    emptyEl.textContent = error.message;
  }
}

async function clearHistory() {
  if (!confirm('Clear extension history? (Downloaded files will stay on disk)')) return;
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
