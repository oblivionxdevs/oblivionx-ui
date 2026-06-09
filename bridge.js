(function () {
  'use strict';

  const webview = window.chrome && window.chrome.webview ? window.chrome.webview : null;
  const electron = window.electronAPI || null;
  const listeners = new Map();

  let editorGetter = () => '';
  let settingsCache = {
    discordRpc: true,
    autoAttach: false,
    alwaysOnTop: false,
    autoExecute: false,
  };

  const environment = webview ? 'webview2' : electron ? 'electron' : 'browser';
  const environmentLabel = {
    webview2: 'C# Bridge',
    electron: 'Electron',
    browser: 'Pages Preview',
  }[environment];

  const pendingMessages = {
    execute: 'Executing Script...',
    inject: 'Attaching to Roblox...',
    kill_roblox: 'Killing Roblox...',
    exit: 'Closing OblivionX...',
    request_settings: 'Loading Settings...',
    theme: 'Applying Theme...',
    update_config: 'Saving Settings...',
    update_rpc_details: 'Updating Discord RPC...',
  };

  function emit(type, payload) {
    const callbacks = listeners.get(type);
    if (!callbacks) return;
    callbacks.forEach((callback) => {
      try {
        callback(payload);
      } catch (error) {
        console.error(`Bridge listener failed for ${type}:`, error);
      }
    });
  }

  function on(type, callback) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
    return () => listeners.get(type)?.delete(callback);
  }

  function normalizeConsoleType(type) {
    if (type === 'success') return 'ok';
    if (type === 'warning') return 'warn';
    if (type === 'log') return 'info';
    return type || 'info';
  }

  function parseHostPayload(event) {
    let payload = event && 'data' in event ? event.data : event;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = { action: 'console', type: 'info', message: payload };
      }
    }
    return payload && typeof payload === 'object' ? payload : null;
  }

  function handleHostMessage(event) {
    const payload = parseHostPayload(event);
    if (!payload || !payload.action) return;

    switch (payload.action) {
      case 'console':
        emit('console', {
          type: normalizeConsoleType(payload.type),
          message: payload.message || '',
        });
        break;
      case 'pid_update':
        emit('attach-state', { attached: true, pid: payload.pid || null });
        break;
      case 'clear_pid':
      case 'injection_failed':
        emit('attach-state', { attached: false, pid: null });
        break;
      case 'settings':
        settingsCache = { ...settingsCache, ...(payload.settings || payload) };
        emit('settings', settingsCache);
        break;
      default:
        emit('host-message', payload);
        break;
    }
  }

  function postToWebView(payload) {
    if (!webview) {
      return {
        success: false,
        message: 'Open this UI inside the C# WebView2 host to use backend actions.',
      };
    }

    try {
      webview.postMessage(payload);
      return {
        success: true,
        pending: true,
        message: pendingMessages[payload.action] || 'Working...',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to send request to the C# backend.',
      };
    }
  }

  async function callElectron(method, ...args) {
    if (!electron || typeof electron[method] !== 'function') {
      return {
        success: false,
        message: 'This action is only available inside the desktop host.',
      };
    }

    try {
      return await electron[method](...args);
    } catch (error) {
      return {
        success: false,
        message: error.message || `${method} failed.`,
      };
    }
  }

  function saveWithBrowserDownload({ content, defaultName }) {
    const blob = new Blob([content || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName || 'script.lua';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return link.download;
  }

  function openWithBrowserPicker() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.lua,.txt,text/plain';
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, content: String(reader.result || '') });
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  if (webview) {
    webview.addEventListener('message', handleHostMessage);
  }

  window.loadExecutorSettings = function loadExecutorSettings(settings) {
    settingsCache = { ...settingsCache, ...(settings || {}) };
    emit('settings', settingsCache);
  };

  window.getEditorBuffer = function getEditorBuffer() {
    const code = editorGetter();
    postToWebView({ action: 'execute', code });
    return code;
  };

  window.oblivionBridge = {
    environment,
    environmentLabel,
    isWebView: Boolean(webview),
    isElectron: Boolean(electron),
    on,
    setEditorGetter(getter) {
      editorGetter = typeof getter === 'function' ? getter : () => '';
    },
    async minimize() {
      return callElectron('minimize');
    },
    async maximize() {
      return callElectron('maximize');
    },
    async close() {
      if (webview) return postToWebView({ action: 'exit' });
      if (electron) return callElectron('close');
      window.close();
      return { success: true };
    },
    async openFile() {
      if (electron && typeof electron.openFile === 'function') return callElectron('openFile');
      return openWithBrowserPicker();
    },
    async saveFile(data) {
      if (electron && typeof electron.saveFile === 'function') return callElectron('saveFile', data);
      return saveWithBrowserDownload(data || {});
    },
    async attach() {
      if (webview) return postToWebView({ action: 'inject' });
      if (electron && typeof electron.attach === 'function') return callElectron('attach');
      return {
        success: false,
        message: 'Attach requires the C# WebView2 host.',
      };
    },
    async detach() {
      if (electron && typeof electron.detach === 'function') return callElectron('detach');
      return {
        success: false,
        message: 'Detach is not exposed by the current C# backend.',
      };
    },
    async execute(code) {
      if (webview) return postToWebView({ action: 'execute', code });
      if (electron && typeof electron.executeScript === 'function') return callElectron('executeScript', code);
      return {
        success: false,
        message: 'Execution requires the C# WebView2 host.',
      };
    },
    async killRoblox() {
      if (webview) return postToWebView({ action: 'kill_roblox' });
      if (electron && typeof electron.killRoblox === 'function') return callElectron('killRoblox');
      return {
        success: false,
        message: 'Kill is not exposed by the current C# backend.',
      };
    },
    async updateConfig(settings) {
      settingsCache = { ...settingsCache, ...(settings || {}) };
      if (webview) return postToWebView({ action: 'update_config', settings: settingsCache });
      emit('settings', settingsCache);
      return { success: true, message: 'Settings updated locally.' };
    },
    async updateRpcDetails(details, state) {
      if (webview) return postToWebView({ action: 'update_rpc_details', details, state });
      return { success: true, message: 'RPC details updated locally.' };
    },
    async applyTheme(value) {
      if (webview) return postToWebView({ action: 'theme', value });
      return { success: true };
    },
    async requestSettings() {
      if (webview) return postToWebView({ action: 'request_settings' });
      emit('settings', settingsCache);
      return { success: true };
    },
  };
})();
