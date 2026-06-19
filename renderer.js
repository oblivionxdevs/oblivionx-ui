/* ============================================================
   RENDERER — OblivionX
   All UI logic, Monaco integration, tab management
   ============================================================ */

'use strict';

const bridge = window.oblivionBridge;

console.log('Bridge mode:', bridge?.environmentLabel || 'Unavailable');

// ─── Monaco Loader ─────────────────────────────────────────
const MONACO_VERSION = '0.44.0';
const isFileProtocol = window.location.protocol === 'file:';
const monacoBase = isFileProtocol
  ? new URL('../node_modules/monaco-editor/min', window.location.href).href.replace(/\/$/, '')
  : `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`;
const monacoPath = `${monacoBase}/vs`;

window.MonacoEnvironment = {
  getWorkerUrl: function (moduleId, label) {
    const workerScript = `
      self.MonacoEnvironment = { baseUrl: '${monacoBase}/' };
      importScripts('${monacoBase}/vs/base/worker/workerMain.js');
    `;
    return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(workerScript);
  }
};

window.require = { paths: { vs: monacoPath } };

// We load monaco via a dynamic script
(function loadMonaco() {
  const script = document.createElement('script');
  script.src = `${monacoPath}/loader.js`;
  script.onload = () => {
    window.require(['vs/editor/editor.main'], () => {
      initMonaco();
    });
  };
  document.head.appendChild(script);
})();

// ─── State ─────────────────────────────────────────────────
let editor = null;
let tabCounter = 1;
let activeTabId = null;
let isAttached = false;
let isConsoleOpen = false;
let currentPid = null;
let loadingOverlayStart = performance.now();
const LOADING_MIN_DURATION_MS = 900;

const tabs = new Map(); // id → { name, model }

const SCRIPT_STORAGE_KEY = 'oblivionx:scripts:v1';
const DEFAULT_SCRIPT = '-- Welcome to OblivionX\n-- Start scripting below\n\n';
let scriptSaveTimer = null;
let isRestoringScripts = false;

const backendSettingIds = {
  discordRpc: 'setting-discord-rpc',
  autoAttach: 'setting-auto-attach',
  autoExecute: 'setting-auto-execute',
  alwaysOnTop: 'setting-always-on-top',
};

const actionMessages = {
  attach: {
    start: 'Attaching to Roblox...',
    pending: 'Attaching to Roblox...',
    success: 'Roblox Attached Successfully',
    failure: 'Failed to Attach to Roblox',
  },
  execute: {
    start: 'Executing Script...',
    pending: 'Executing Script...',
    success: 'Script Executed Successfully',
    failure: 'Script Execution Failed',
  },
  kill: {
    start: 'Killing Roblox...',
    pending: 'Killing Roblox...',
    success: 'Roblox Killed Successfully',
    failure: 'Failed to Kill Roblox',
  },
};

const THEMES = {
  'nova-dark':   { monaco: 'nova-dark',   body: '' },
  'midnight':    { monaco: 'midnight',    body: 'midnight' },
  'dracula':     { monaco: 'dracula',     body: 'dracula' },
  'one-dark':    { monaco: 'one-dark',    body: 'one-dark' },
  'github-dark': { monaco: 'github-dark', body: 'github-dark' },
  'synthwave':   { monaco: 'synthwave',   body: 'synthwave' },
  'pro-gold':    { monaco: 'pro-gold',    body: 'pro-gold' },
  'cyberpunk':   { monaco: 'cyberpunk',   body: 'cyberpunk' },
  'neon':        { monaco: 'neon',        body: 'neon' },
  'rose-gold':   { monaco: 'rose-gold',   body: 'rose-gold' },
};

let isPro = localStorage.getItem('oblivionx:pro:status') === 'true';

// ─── Monaco Init ────────────────────────────────────────────
function initMonaco() {
  // Define custom Monaco themes
  monaco.editor.defineTheme('nova-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',   foreground: '9d8fff', fontStyle: 'bold' },
      { token: 'string',    foreground: 'a3e6a3' },
      { token: 'number',    foreground: 'f5a623' },
      { token: 'comment',   foreground: '555568', fontStyle: 'italic' },
      { token: 'type',      foreground: '7ec8e3' },
      { token: 'function',  foreground: 'c4a0ff' },
      { token: 'variable',  foreground: 'e4e4e8' },
      { token: 'delimiter', foreground: '666680' },
    ],
    colors: {
      'editor.background':           '#0d0d0f',
      'editor.foreground':           '#e4e4e8',
      'editorLineNumber.foreground': '#333348',
      'editorLineNumber.activeForeground': '#7c6af7',
      'editor.lineHighlightBackground': '#111116',
      'editorCursor.foreground':     '#7c6af7',
      'editor.selectionBackground':  '#7c6af726',
      'editor.findMatchBackground':  '#7c6af740',
      'editorIndentGuide.background':'#1a1a22',
      'editorIndentGuide.activeBackground': '#2e2e40',
      'scrollbar.shadow':            '#00000000',
      'scrollbarSlider.background':  '#ffffff10',
      'scrollbarSlider.hoverBackground': '#ffffff1a',
      'scrollbarSlider.activeBackground': '#ffffff25',
      'minimap.background':          '#0a0a0c',
      'editor.selectionHighlightBackground': '#7c6af715',
    }
  });

  monaco.editor.defineTheme('midnight', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword', foreground: '7ca5ff', fontStyle: 'bold' },
      { token: 'string',  foreground: '90c4a8' },
      { token: 'comment', foreground: '3a3a5a', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#070710',
      'editor.foreground': '#d4d4ee',
      'editorLineNumber.foreground': '#22223a',
      'editorLineNumber.activeForeground': '#5b8af7',
      'editorCursor.foreground': '#5b8af7',
      'editor.selectionBackground': '#5b8af726',
      'editor.lineHighlightBackground': '#0c0c1a',
      'minimap.background': '#050510',
    }
  });

  monaco.editor.defineTheme('dracula', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword',  foreground: 'ff79c6', fontStyle: 'bold' },
      { token: 'string',   foreground: 'f1fa8c' },
      { token: 'comment',  foreground: '6272a4', fontStyle: 'italic' },
      { token: 'function', foreground: '50fa7b' },
      { token: 'number',   foreground: 'bd93f9' },
    ],
    colors: {
      'editor.background': '#13141a',
      'editor.foreground': '#f8f8f2',
      'editorLineNumber.foreground': '#44475a',
      'editorLineNumber.activeForeground': '#bd93f9',
      'editorCursor.foreground': '#bd93f9',
      'editor.selectionBackground': '#44475a60',
      'editor.lineHighlightBackground': '#1c1d26',
      'minimap.background': '#0f1015',
    }
  });

  monaco.editor.defineTheme('one-dark', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword',  foreground: 'c678dd', fontStyle: 'bold' },
      { token: 'string',   foreground: '98c379' },
      { token: 'comment',  foreground: '5c6370', fontStyle: 'italic' },
      { token: 'function', foreground: '61afef' },
      { token: 'number',   foreground: 'd19a66' },
    ],
    colors: {
      'editor.background': '#21252b',
      'editor.foreground': '#abb2bf',
      'editorLineNumber.foreground': '#4b5263',
      'editorLineNumber.activeForeground': '#61afef',
      'editorCursor.foreground': '#61afef',
      'editor.selectionBackground': '#3e4451',
      'editor.lineHighlightBackground': '#2c313a',
      'minimap.background': '#1d2026',
    }
  });

  monaco.editor.defineTheme('github-dark', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword',  foreground: 'ff7b72', fontStyle: 'bold' },
      { token: 'string',   foreground: 'a5d6ff' },
      { token: 'comment',  foreground: '8b949e', fontStyle: 'italic' },
      { token: 'function', foreground: 'd2a8ff' },
      { token: 'number',   foreground: '79c0ff' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editorLineNumber.foreground': '#30363d',
      'editorLineNumber.activeForeground': '#58a6ff',
      'editorCursor.foreground': '#58a6ff',
      'editor.selectionBackground': '#264f7840',
      'editor.lineHighlightBackground': '#161b22',
      'minimap.background': '#090e15',
    }
  });

  monaco.editor.defineTheme('synthwave', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword',  foreground: 'f72585', fontStyle: 'bold' },
      { token: 'string',   foreground: '7209b7' },
      { token: 'comment',  foreground: '3a0060', fontStyle: 'italic' },
      { token: 'function', foreground: '4cc9f0' },
      { token: 'number',   foreground: 'f9c74f' },
      { token: 'type',     foreground: '90e0ef' },
    ],
    colors: {
      'editor.background': '#0a0015',
      'editor.foreground': '#e8d5ff',
      'editorLineNumber.foreground': '#2a0050',
      'editorLineNumber.activeForeground': '#f72585',
      'editorCursor.foreground': '#f72585',
      'editor.selectionBackground': '#f7258530',
      'editor.lineHighlightBackground': '#100020',
      'minimap.background': '#07000e',
    }
  });

  monaco.editor.defineTheme('pro-gold', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword',  foreground: 'ffd700', fontStyle: 'bold' },
      { token: 'string',   foreground: 'ffea70' },
      { token: 'comment',  foreground: '5c5c4a', fontStyle: 'italic' },
      { token: 'function', foreground: 'd4af37' },
      { token: 'number',   foreground: 'fbfbf8' },
    ],
    colors: {
      'editor.background': '#0f0f0c',
      'editor.foreground': '#fbfbf8',
      'editorLineNumber.foreground': '#333328',
      'editorLineNumber.activeForeground': '#ffd700',
      'editorCursor.foreground': '#ffd700',
      'editor.selectionBackground': '#ffd70030',
      'editor.lineHighlightBackground': '#141410',
      'minimap.background': '#0b0b09',
    }
  });

  monaco.editor.defineTheme('cyberpunk', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword',  foreground: '00ff9f', fontStyle: 'bold' },
      { token: 'string',   foreground: 'ff003c' },
      { token: 'comment',  foreground: '3d3d4a', fontStyle: 'italic' },
      { token: 'function', foreground: '00b8ff' },
      { token: 'number',   foreground: 'fce205' },
    ],
    colors: {
      'editor.background': '#09090b',
      'editor.foreground': '#e0e0e0',
      'editorLineNumber.foreground': '#1e1e28',
      'editorLineNumber.activeForeground': '#00ff9f',
      'editorCursor.foreground': '#00ff9f',
      'editor.selectionBackground': '#00ff9f30',
      'editor.lineHighlightBackground': '#0e0e12',
      'minimap.background': '#050507',
    }
  });

  monaco.editor.defineTheme('neon', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword',  foreground: 'ff00ff', fontStyle: 'bold' },
      { token: 'string',   foreground: '00ffff' },
      { token: 'comment',  foreground: '4a4a4a', fontStyle: 'italic' },
      { token: 'function', foreground: '8a2be2' },
      { token: 'number',   foreground: 'ff66ff' },
    ],
    colors: {
      'editor.background': '#050505',
      'editor.foreground': '#ffffff',
      'editorLineNumber.foreground': '#1a1a1a',
      'editorLineNumber.activeForeground': '#ff00ff',
      'editorCursor.foreground': '#ff00ff',
      'editor.selectionBackground': '#ff00ff30',
      'editor.lineHighlightBackground': '#0a0a0a',
      'minimap.background': '#020202',
    }
  });

  monaco.editor.defineTheme('rose-gold', {
    base: 'vs-dark', inherit: true, rules: [
      { token: 'keyword',  foreground: 'b76e79', fontStyle: 'bold' },
      { token: 'string',   foreground: 'e0bfb8' },
      { token: 'comment',  foreground: '4f3d41', fontStyle: 'italic' },
      { token: 'function', foreground: 'd18d97' },
      { token: 'number',   foreground: 'ffffff' },
    ],
    colors: {
      'editor.background': '#141012',
      'editor.foreground': '#e8dada',
      'editorLineNumber.foreground': '#2b2327',
      'editorLineNumber.activeForeground': '#b76e79',
      'editorCursor.foreground': '#b76e79',
      'editor.selectionBackground': '#b76e7930',
      'editor.lineHighlightBackground': '#1a1518',
      'minimap.background': '#0c0a0b',
    }
  });

  // Create the editor
  editor = monaco.editor.create(document.getElementById('monaco-editor'), {
    theme: 'nova-dark',
    language: 'lua',
    fontSize: 14,
    fontFamily: '"JetBrains Mono", "Consolas", monospace',
    fontLigatures: true,
    lineNumbers: 'on',
    minimap: { enabled: true },
    wordWrap: 'off',
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    renderLineHighlight: 'line',
    scrollBeyondLastLine: false,
    roundedSelection: true,
    padding: { top: 10, bottom: 10 },
    folding: true,
    bracketPairColorization: { enabled: true },
    suggest: { showKeywords: true },
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    tabSize: 2,
    insertSpaces: true,
    formatOnPaste: true,
    renderWhitespace: 'none',
    occurrencesHighlight: true,
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    glyphMargin: false,
    lineDecorationsWidth: 0,
    scrollbar: {
      verticalScrollbarSize: 5,
      horizontalScrollbarSize: 5,
    },
  });

  bridge?.setEditorGetter(() => editor ? editor.getValue() : '');

  // Track cursor position
  editor.onDidChangeCursorPosition(e => {
    document.getElementById('status-cursor').textContent =
      `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });

  // Restore saved scripts or create first tab.
  if (!restoreSavedScripts()) {
    createTab('untitled1.lua', DEFAULT_SCRIPT);
  }

  // Resize observer
  const resizeObserver = new ResizeObserver(() => editor.layout());
  resizeObserver.observe(document.getElementById('monaco-editor'));

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); handleOpen(); }
    if (e.key === 'F5') { e.preventDefault(); handleExecute(); }
  });

  window.addEventListener('beforeunload', saveScriptsNow);
  hideLoadingOverlay();
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;

  const elapsed = performance.now() - loadingOverlayStart;
  const wait = Math.max(0, LOADING_MIN_DURATION_MS - elapsed);

  window.setTimeout(() => {
    overlay.classList.add('hidden');
    window.setTimeout(() => overlay.remove(), 320);
  }, wait);
}

// ─── Tab Management ─────────────────────────────────────────
function createTab(name, initialContent = '') {
  const id = `tab-${++tabCounter}`;
  const model = monaco.editor.createModel(initialContent, 'lua');
  const contentListener = model.onDidChangeContent(scheduleScriptSave);
  tabs.set(id, { name, model, contentListener });

  const tabEl = document.createElement('div');
  tabEl.className = 'tab entering';
  tabEl.dataset.tabId = id;
  tabEl.innerHTML = `
    <svg class="tab-icon" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="2" y="2" width="12" height="12" rx="2"/>
    </svg>
    <span class="tab-name">${name}</span>
    <button class="tab-close" title="Close Tab">
      <svg viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
      </svg>
    </button>
  `;

  tabEl.addEventListener('click', (e) => {
    if (!e.target.closest('.tab-close')) switchTab(id);
  });
  tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(id);
  });

  document.getElementById('tabs-container').appendChild(tabEl);
  setTimeout(() => tabEl.classList.remove('entering'), 200);

  switchTab(id);
  scheduleScriptSave();
  return id;
}

function switchTab(id) {
  if (!tabs.has(id)) return;
  activeTabId = id;
  const { name, model } = tabs.get(id);

  // Update tab active state
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tabId === id);
  });

  // Set editor model
  if (editor) editor.setModel(model);

  // Update status bar
  document.getElementById('status-tab-name').textContent = name;
  scheduleScriptSave();
}

function closeTab(id) {
  if (tabs.size === 1) return; // keep at least one tab
  const tabEl = document.querySelector(`.tab[data-tab-id="${id}"]`);
  if (tabEl) tabEl.remove();
  tabs.get(id)?.contentListener?.dispose();
  tabs.get(id)?.model.dispose();
  tabs.delete(id);

  if (activeTabId === id) {
    const remaining = [...tabs.keys()];
    if (remaining.length) switchTab(remaining[remaining.length - 1]);
  }

  scheduleScriptSave();
}

function scheduleScriptSave() {
  if (isRestoringScripts) return;
  window.clearTimeout(scriptSaveTimer);
  scriptSaveTimer = window.setTimeout(saveScriptsNow, 250);
}

function saveScriptsNow() {
  if (!tabs.size) return;

  try {
    const tabEntries = [...tabs.entries()];
    const activeIndex = Math.max(0, tabEntries.findIndex(([id]) => id === activeTabId));
    const payload = {
      activeIndex,
      savedAt: new Date().toISOString(),
      tabs: tabEntries.map(([, tab]) => ({
        name: tab.name,
        content: tab.model.getValue(),
      })),
    };

    localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to save scripts:', error);
  }
}

function restoreSavedScripts() {
  try {
    const raw = localStorage.getItem(SCRIPT_STORAGE_KEY);
    if (!raw) return false;

    const payload = JSON.parse(raw);
    if (!Array.isArray(payload.tabs) || payload.tabs.length === 0) return false;

    isRestoringScripts = true;
    const restoredIds = payload.tabs.map((tab, index) => createTab(
      tab.name || `untitled${index + 1}.lua`,
      typeof tab.content === 'string' ? tab.content : ''
    ));
    isRestoringScripts = false;

    const activeIndex = Number.isInteger(payload.activeIndex) ? payload.activeIndex : 0;
    const activeId = restoredIds[Math.min(Math.max(activeIndex, 0), restoredIds.length - 1)];
    if (activeId) switchTab(activeId);
    saveScriptsNow();
    return true;
  } catch (error) {
    isRestoringScripts = false;
    console.warn('Failed to restore scripts:', error);
    return false;
  }
}

// ─── Toolbar Actions ─────────────────────────────────────────
async function handleExecute() {
  const btn = document.getElementById('btn-execute');
  btn.classList.add('executing');
  setTimeout(() => btn.classList.remove('executing'), 700);

  if (!bridge) {
    addConsoleLine('error', 'Bridge unavailable. Reload the UI.');
    return;
  }

  const code = editor ? editor.getValue() : '';
  if (!isAttached) {
    addConsoleLine('warn', 'Not attached; the backend will validate the request.');
  }

  addConsoleLine('info', actionMessages.execute.start);
  try {
    const result = await bridge.execute(code);
    if (result?.success && !result.pending) {
      addConsoleLine('ok', result.message || actionMessages.execute.success);
    } else if (result?.pending) {
      addConsoleLine('info', result.message || actionMessages.execute.pending);
    } else {
      addConsoleLine('error', result?.message || actionMessages.execute.failure);
    }
  } catch (err) {
    addConsoleLine('error', `Execution error: ${err.message || err}`);
  }
}

function handleClear() {
  if (editor) editor.setValue('');
  addConsoleLine('info', 'Editor cleared.');
}

async function handleOpen() {
  if (!bridge) return;
  const result = await bridge.openFile();
  if (result) {
    createTab(result.name, result.content);
    addConsoleLine('ok', `Opened: ${result.name}`);
  }
}

async function handleSave() {
  if (!bridge || !editor) return;
  const content = editor.getValue();
  const currentTab = tabs.get(activeTabId);
  const result = await bridge.saveFile({
    content,
    defaultName: currentTab?.name || 'script.lua',
  });
  if (result) {
    addConsoleLine('ok', `Saved: ${result}`);
    if (currentTab) {
      currentTab.name = result;
      const tabEl = document.querySelector(`.tab[data-tab-id="${activeTabId}"] .tab-name`);
      if (tabEl) tabEl.textContent = result;
      document.getElementById('status-tab-name').textContent = result;
      scheduleScriptSave();
    }
  }
}

async function handleAttach() {
  const btn = document.getElementById('btn-attach');
  btn.classList.add('pinging');
  setTimeout(() => btn.classList.remove('pinging'), 500);

  if (!bridge) {
    addConsoleLine('error', 'Bridge unavailable. Reload the UI.');
    return;
  }

  addConsoleLine('info', actionMessages.attach.start);
  try {
    const result = await bridge.attach();
    if (result?.success && !result.pending) {
      setAttachState(true, result.pid || currentPid);
      addConsoleLine('ok', result.message || actionMessages.attach.success);
    } else if (result?.pending) {
      addConsoleLine('info', result.message || actionMessages.attach.pending);
    } else {
      addConsoleLine('error', result?.message || actionMessages.attach.failure);
    }
  } catch (err) {
    addConsoleLine('error', `Attach error: ${err.message || err}`);
  }
}

function setAttachState(attached, pid = null) {
  const statusbar = document.getElementById('statusbar');
  const dot = document.querySelector('.status-dot');
  const label = document.getElementById('status-label');
  const attachBtn = document.getElementById('btn-attach');
  const attachLabel = attachBtn?.querySelector('.btn-label');
  const pidItem = document.getElementById('status-pid');
  const pidSep = document.getElementById('status-pid-sep');

  isAttached = attached;
  currentPid = attached ? pid : null;

  if (attached) {
    statusbar.classList.add('attached');
    statusbar.classList.remove('detached');
    dot.className = 'status-dot attached';
    label.textContent = pid ? `Attached to PID ${pid}` : 'Attached';
    attachBtn.classList.add('attached');
    if (attachLabel) attachLabel.textContent = 'Attached';
    if (pidItem && pidSep) {
      pidItem.textContent = pid ? `PID ${pid}` : 'PID linked';
      pidItem.hidden = false;
      pidSep.hidden = false;
    }
  } else {
    statusbar.classList.remove('attached');
    statusbar.classList.add('detached');
    dot.className = 'status-dot detached';
    label.textContent = 'Not Attached';
    attachBtn.classList.remove('attached');
    if (attachLabel) attachLabel.textContent = 'Attach';
    if (pidItem && pidSep) {
      pidItem.hidden = true;
      pidSep.hidden = true;
    }
  }
}

function toggleConsole() {
  isConsoleOpen = !isConsoleOpen;
  const panel = document.getElementById('console-panel');
  panel.classList.toggle('open', isConsoleOpen);
  const btn = document.getElementById('btn-console');
  btn.classList.toggle('active', isConsoleOpen);
  if (editor) setTimeout(() => editor.layout(), 240);
}

// ─── Console Output ─────────────────────────────────────────
function addConsoleLine(type, message, reveal = true) {
  const output = document.getElementById('console-output');
  const now = new Date();
  const ts = `[${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}]`;
  const badgeMap = { info: 'INFO', ok: 'OK', warn: 'WARN', error: 'ERROR' };
  const line = document.createElement('div');
  line.className = `console-line console-${type} new`;
  line.innerHTML = `<span class="console-ts">${ts}</span><span class="console-badge badge-${type}">${badgeMap[type]||'LOG'}</span> ${escapeHtml(message)}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
  setTimeout(() => line.classList.remove('new'), 200);

  if (reveal && !isConsoleOpen) toggleConsole();
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Theme Switcher ─────────────────────────────────────────
function applyTheme(name) {
  const themeCard = document.querySelector(`.theme-card[data-theme="${name}"]`);
  if (themeCard && themeCard.classList.contains('locked') && !isPro) {
    document.getElementById('pro-modal').classList.add('open');
    return;
  }

  const theme = THEMES[name] || THEMES['nova-dark'];
  if (editor) monaco.editor.setTheme(name);
  document.body.dataset.theme = theme.body;
  document.documentElement.dataset.theme = theme.body;
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === name);
  });
  bridge?.applyTheme(name);
}

function updateProUI() {
  if (isPro) {
    document.getElementById('btn-upgrade-pro')?.classList.add('hidden');
    document.getElementById('pro-badge-about')?.classList.remove('hidden');
    document.querySelectorAll('.theme-card.locked').forEach(card => {
      card.classList.remove('locked');
    });
  }
}

async function validateProKey() {
  const input = document.getElementById('pro-key-input');
  const errorMsg = document.getElementById('pro-error-msg');
  const btn = document.getElementById('btn-validate-key');
  const key = input.value.trim();

  errorMsg.textContent = '';
  
  if (!/^OBX-(1MNTH|3MNTH|LIFETIME)-[A-Z0-9]{8,}$/i.test(key)) {
    errorMsg.textContent = 'Invalid key format. Example: OBX-1MNTH-ABC123XYZ';
    return;
  }

  btn.textContent = 'Validating...';
  btn.style.opacity = '0.7';
  btn.style.pointerEvents = 'none';

  try {
    const result = await bridge.validateKey(key);
    if (result && result.success) {
      isPro = true;
      localStorage.setItem('oblivionx:pro:status', 'true');
      updateProUI();
      document.getElementById('pro-modal').classList.remove('open');
      addConsoleLine('ok', 'OblivionX PRO activated successfully!');
      applyTheme('pro-gold'); // auto apply pro theme
    } else {
      errorMsg.textContent = result?.message || 'Invalid key or HWID mismatch.';
    }
  } catch (err) {
    errorMsg.textContent = 'Validation error occurred.';
  } finally {
    btn.textContent = 'Validate Key';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  }
}

function getBackendSettings() {
  return Object.fromEntries(
    Object.entries(backendSettingIds).map(([key, id]) => {
      const control = document.getElementById(id);
      return [key, Boolean(control?.checked)];
    })
  );
}

function applyBackendSettings(settings = {}) {
  Object.entries(backendSettingIds).forEach(([key, id]) => {
    const control = document.getElementById(id);
    if (control && key in settings) control.checked = Boolean(settings[key]);
  });
}

function pushBackendSettings() {
  bridge?.updateConfig(getBackendSettings());
}

function pushRpcDetails() {
  const details = document.getElementById('setting-rpc-details')?.value || 'OblivionX Executor';
  const state = document.getElementById('setting-rpc-state')?.value || 'Idle';
  bridge?.updateRpcDetails(details, state);
}

function wireBridgeEvents() {
  const bridgeStatus = document.getElementById('status-bridge');
  if (bridgeStatus) bridgeStatus.textContent = bridge?.environmentLabel || 'No Bridge';

  if (!bridge) {
    addConsoleLine('error', 'Bridge unavailable.');
    return;
  }

  bridge.on('console', ({ type, message }) => addConsoleLine(type || 'info', message || ''));
  bridge.on('attach-state', ({ attached, pid }) => setAttachState(Boolean(attached), pid || null));
  bridge.on('settings', applyBackendSettings);

  addConsoleLine('info', `UI ready in ${bridge.environmentLabel} mode.`, false);
  bridge.requestSettings();
}

// ─── Event Listeners ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Window controls
  document.getElementById('btn-close').addEventListener('click', () => bridge?.close());
  document.getElementById('btn-minimize').addEventListener('click', () => bridge?.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => bridge?.maximize());

  // Toolbar
  document.getElementById('btn-execute').addEventListener('click', handleExecute);
  document.getElementById('btn-clear').addEventListener('click', handleClear);
  document.getElementById('btn-open').addEventListener('click', handleOpen);
  document.getElementById('btn-save').addEventListener('click', handleSave);
  document.getElementById('btn-console').addEventListener('click', toggleConsole);
  document.getElementById('btn-attach').addEventListener('click', handleAttach);
  document.getElementById('btn-kill').addEventListener('click', async () => {
    if (!bridge) {
      addConsoleLine('error', 'Bridge unavailable. Reload the UI.');
      return;
    }
    addConsoleLine('warn', actionMessages.kill.start);
    try {
      const result = await bridge.killRoblox();
      if (result?.success && !result.pending) {
        addConsoleLine('ok', result.message || actionMessages.kill.success);
        if (isAttached) {
          setAttachState(false);
        }
      } else if (result?.pending) {
        addConsoleLine('warn', result.message || actionMessages.kill.pending);
      } else {
        addConsoleLine('error', result?.message || actionMessages.kill.failure);
      }
    } catch (err) {
      addConsoleLine('error', `Kill error: ${err.message || err}`);
    }
  });

  // New Tab
  document.getElementById('btn-add-tab').addEventListener('click', () => {
    const num = tabs.size + 1;
    createTab(`untitled${num}.lua`, '');
  });

  // Theme modal
  document.getElementById('btn-theme').addEventListener('click', () => {
    document.getElementById('theme-modal').classList.add('open');
  });
  document.getElementById('theme-modal-close').addEventListener('click', () => {
    document.getElementById('theme-modal').classList.remove('open');
  });
  document.getElementById('theme-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => applyTheme(card.dataset.theme));
  });

  // Settings modal
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('open');
  });
  document.getElementById('settings-modal-close').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('open');
  });
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  // Settings controls
  const fontSizeSlider = document.getElementById('setting-font-size');
  const fontSizeVal    = document.getElementById('setting-font-size-val');
  fontSizeSlider.addEventListener('input', () => {
    const v = fontSizeSlider.value;
    fontSizeVal.textContent = `${v}px`;
    if (editor) editor.updateOptions({ fontSize: parseInt(v) });
  });

  const opacitySlider = document.getElementById('setting-opacity');
  const opacityVal    = document.getElementById('setting-opacity-val');
  opacitySlider.addEventListener('input', () => {
    const v = opacitySlider.value;
    opacityVal.textContent = `${v}%`;
    document.body.style.opacity = v / 100;
  });

  document.getElementById('setting-font').addEventListener('change', (e) => {
    if (editor) editor.updateOptions({ fontFamily: `"${e.target.value}", monospace` });
  });

  document.getElementById('setting-wordwrap').addEventListener('change', (e) => {
    if (editor) editor.updateOptions({ wordWrap: e.target.checked ? 'on' : 'off' });
  });

  document.getElementById('setting-minimap').addEventListener('change', (e) => {
    if (editor) editor.updateOptions({ minimap: { enabled: e.target.checked } });
  });

  document.getElementById('setting-linenums').addEventListener('change', (e) => {
    if (editor) editor.updateOptions({ lineNumbers: e.target.checked ? 'on' : 'off' });
  });

  document.getElementById('setting-statusbar').addEventListener('change', (e) => {
    document.getElementById('statusbar').style.display = e.target.checked ? '' : 'none';
    if (editor) editor.layout();
  });

  Object.values(backendSettingIds).forEach((id) => {
    document.getElementById(id)?.addEventListener('change', pushBackendSettings);
  });

  document.getElementById('setting-rpc-details')?.addEventListener('input', pushRpcDetails);
  document.getElementById('setting-rpc-state')?.addEventListener('input', pushRpcDetails);

  // Console close/clear
  document.getElementById('btn-close-console').addEventListener('click', toggleConsole);
  document.getElementById('btn-clear-console').addEventListener('click', () => {
    document.getElementById('console-output').innerHTML = '';
  });

  // Status bar initial state
  document.getElementById('statusbar').classList.add('detached');
  wireBridgeEvents();
  updateProUI();

  // Pro features
  document.getElementById('btn-upgrade-pro')?.addEventListener('click', () => {
    document.getElementById('pro-modal').classList.add('open');
  });
  document.getElementById('pro-modal-close')?.addEventListener('click', () => {
    document.getElementById('pro-modal').classList.remove('open');
  });
  document.getElementById('pro-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
  document.getElementById('btn-validate-key')?.addEventListener('click', validateProKey);
  document.getElementById('pro-key-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') validateProKey();
  });
});
