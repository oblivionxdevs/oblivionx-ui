/* ============================================================
   RENDERER — OblivionX
   All UI logic, Monaco integration, tab management
   ============================================================ */

'use strict';

// ─── Monaco Loader ─────────────────────────────────────────
const monacoPath = '../node_modules/monaco-editor/min/vs';

window.MonacoEnvironment = {
  getWorkerUrl: function (moduleId, label) {
    const workerPath = `${monacoPath}/base/worker/workerMain.js`;
    const blob = new Blob([
      `self.MonacoEnvironment = { baseUrl: '${monacoPath}/' };\nimportScripts('${workerPath}');`
    ], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
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

const tabs = new Map(); // id → { name, model }

const THEMES = {
  'nova-dark':   { monaco: 'nova-dark',   body: '' },
  'midnight':    { monaco: 'midnight',    body: 'midnight' },
  'dracula':     { monaco: 'dracula',     body: 'dracula' },
  'one-dark':    { monaco: 'one-dark',    body: 'one-dark' },
  'github-dark': { monaco: 'github-dark', body: 'github-dark' },
  'synthwave':   { monaco: 'synthwave',   body: 'synthwave' },
};

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

  // Track cursor position
  editor.onDidChangeCursorPosition(e => {
    document.getElementById('status-cursor').textContent =
      `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });

  // Create first tab
  createTab('untitled1.lua', '-- Welcome to OblivionX\n-- Start scripting below\n\n');

  // Resize observer
  const resizeObserver = new ResizeObserver(() => editor.layout());
  resizeObserver.observe(document.getElementById('monaco-editor'));

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); handleOpen(); }
    if (e.key === 'F5') { e.preventDefault(); handleExecute(); }
  });
}

// ─── Tab Management ─────────────────────────────────────────
function createTab(name, initialContent = '') {
  const id = `tab-${++tabCounter}`;
  const model = monaco.editor.createModel(initialContent, 'lua');
  tabs.set(id, { name, model });

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
}

function closeTab(id) {
  if (tabs.size === 1) return; // keep at least one tab
  const tabEl = document.querySelector(`.tab[data-tab-id="${id}"]`);
  if (tabEl) tabEl.remove();
  tabs.get(id)?.model.dispose();
  tabs.delete(id);

  if (activeTabId === id) {
    const remaining = [...tabs.keys()];
    if (remaining.length) switchTab(remaining[remaining.length - 1]);
  }
}

// ─── Toolbar Actions ─────────────────────────────────────────
async function handleExecute() {
  const btn = document.getElementById('btn-execute');
  btn.classList.add('executing');
  setTimeout(() => btn.classList.remove('executing'), 700);

  const code = editor ? editor.getValue() : '';
  if (!isAttached) {
    addConsoleLine('warn', 'Not attached — attach to Roblox first.');
    return;
  }

  addConsoleLine('info', 'Sending script to executor...');
  try {
    const result = await window.electronAPI.executeScript(code);
    if (result?.success) {
      addConsoleLine('ok', result.message || `Script executed (${code.split('\n').length} lines).`);
    } else {
      addConsoleLine('error', result?.message || 'Execution failed.');
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
  if (!window.electronAPI) return;
  const result = await window.electronAPI.openFile();
  if (result) {
    createTab(result.name, result.content);
    addConsoleLine('ok', `Opened: ${result.name}`);
  }
}

async function handleSave() {
  if (!window.electronAPI || !editor) return;
  const content = editor.getValue();
  const currentTab = tabs.get(activeTabId);
  const result = await window.electronAPI.saveFile({
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
    }
  }
}

async function handleAttach() {
  const btn = document.getElementById('btn-attach');
  btn.classList.add('pinging');
  setTimeout(() => btn.classList.remove('pinging'), 500);

  if (isAttached) {
    const result = await window.electronAPI.detach();
    if (result?.success) {
      isAttached = false;
      btn.classList.remove('attached');
      setAttachState(false);
      addConsoleLine('warn', 'Detached from Roblox.');
    } else {
      addConsoleLine('error', result?.message || 'Failed to detach.');
    }
  } else {
    addConsoleLine('info', 'Attaching to Roblox...');
    try {
      const result = await window.electronAPI.attach();
      if (result?.success) {
        isAttached = true;
        btn.classList.add('attached');
        setAttachState(true);
        addConsoleLine('ok', 'Successfully attached to Roblox.');
      } else {
        addConsoleLine('error', result?.message || 'Failed to attach.');
      }
    } catch (err) {
      addConsoleLine('error', `Attach error: ${err.message || err}`);
    }
  }
}

function setAttachState(attached) {
  const statusbar = document.getElementById('statusbar');
  const dot = document.querySelector('.status-dot');
  const indicator = document.getElementById('status-indicator');
  const attachBtn = document.getElementById('btn-attach');

  if (attached) {
    statusbar.classList.add('attached');
    statusbar.classList.remove('detached');
    dot.className = 'status-dot attached';
    indicator.childNodes[1].textContent = ' Attached';
    attachBtn.querySelector('.tab-name, span') // update text node
    // update text
    const textNodes = [...attachBtn.childNodes].filter(n => n.nodeType === 3);
    textNodes.forEach(n => { if (n.textContent.trim()) n.textContent = 'Detach'; });
  } else {
    statusbar.classList.remove('attached');
    statusbar.classList.add('detached');
    dot.className = 'status-dot detached';
    indicator.childNodes[1].textContent = ' Not Attached';
    const textNodes = [...attachBtn.childNodes].filter(n => n.nodeType === 3);
    textNodes.forEach(n => { if (n.textContent.trim()) n.textContent = 'Attach'; });
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
function addConsoleLine(type, message) {
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

  if (!isConsoleOpen) toggleConsole();
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Theme Switcher ─────────────────────────────────────────
function applyTheme(name) {
  const theme = THEMES[name] || THEMES['nova-dark'];
  if (editor) monaco.editor.setTheme(name);
  document.body.dataset.theme = theme.body;
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === name);
  });
}

// ─── Event Listeners ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Window controls
  const api = window.electronAPI;
  if (api) {
    document.getElementById('btn-close').addEventListener('click', () => api.close());
    document.getElementById('btn-minimize').addEventListener('click', () => api.minimize());
    document.getElementById('btn-maximize').addEventListener('click', () => api.maximize());
  } else {
    // Fallback for non-electron dev
    document.getElementById('btn-close').addEventListener('click', () => window.close());
  }

  // Toolbar
  document.getElementById('btn-execute').addEventListener('click', handleExecute);
  document.getElementById('btn-clear').addEventListener('click', handleClear);
  document.getElementById('btn-open').addEventListener('click', handleOpen);
  document.getElementById('btn-save').addEventListener('click', handleSave);
  document.getElementById('btn-console').addEventListener('click', toggleConsole);
  document.getElementById('btn-attach').addEventListener('click', handleAttach);
  document.getElementById('btn-kill').addEventListener('click', async () => {
    addConsoleLine('warn', 'Sending kill request to executor...');
    try {
      const result = await window.electronAPI.killRoblox();
      if (result?.success) {
        addConsoleLine('warn', result.message || 'Roblox process terminated.');
        if (isAttached) {
          isAttached = false;
          setAttachState(false);
          document.getElementById('btn-attach').classList.remove('attached');
        }
      } else {
        addConsoleLine('error', result?.message || 'Failed to kill Roblox.');
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

  // Console close/clear
  document.getElementById('btn-close-console').addEventListener('click', toggleConsole);
  document.getElementById('btn-clear-console').addEventListener('click', () => {
    document.getElementById('console-output').innerHTML = '';
  });

  // Status bar initial state
  document.getElementById('statusbar').classList.add('detached');
});
