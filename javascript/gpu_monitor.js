(function () {
  'use strict';

  const STORAGE_KEY = 'sd-webui-gpu-monitor';
  const ENDPOINT = '/gpu_monitor/stats';
  const LOCALES_ENDPOINT = '/gpu_monitor/locales';
  const CONFIG_ENDPOINT = '/gpu_monitor/config';
  const MODAL_ID = 'gpu-monitor-modal';
  const CONTROLS_ID = 'gpu-monitor-controls';
  const QUICKSETTINGS_ID = 'quicksettings';
  const DEFAULT_OPACITY = 0.5;
  const VERSION = 'v1.0.0';
  const FALLBACK_LANGUAGE = 'en';
  const EDGE = 2;
  const DEFAULT_OFFSET = 16;
  const DEFAULT_POLL = 2000;
  const DEFAULT_RETRY = 10000;
  const PLACEHOLDER = '--';
  const HIDDEN_CLASS = 'gpu-monitor-metric-hidden';
  const METRIC_KEYS = {
    usage: 'show_usage',
    vram: 'show_vram',
    vramBar: 'show_vram_bar',
    temp: 'show_temp',
    power: 'show_power',
  };

  const state = {
    right: DEFAULT_OFFSET,
    bottom: DEFAULT_OFFSET,
    isMinimized: false,
    isClosed: false,
    clickThrough: false,
  };
  const timing = { poll: DEFAULT_POLL, retry: DEFAULT_RETRY };
  const i18n = {
    loaded: false,
    loading: false,
    locales: {},
    configured: 'auto',
    active: '',
  };
  const settings = { loaded: false, loading: false };
  const metrics = { usage: true, vram: true, vramBar: true, temp: true, power: true };
  const appearance = { opacity: DEFAULT_OPACITY };
  const controls = { container: null, toggle: null, settings: null };
  const view = { mode: 'loading', key: '', seconds: 0, name: '' };
  const els = {};

  let pollTimer = null;
  let countdownTimer = null;
  let deadline = 0;
  let lastSeconds = -1;
  let runId = 0;
  let drag = null;
  let booted = false;
  let controlsQueued = false;
  let settingsModal = null;

  function hasLocale(code) {
    return Object.prototype.hasOwnProperty.call(i18n.locales, code);
  }

  function t(key) {
    const active = i18n.locales[i18n.active];
    if (active && typeof active[key] === 'string') return active[key];
    const fallback = i18n.locales[FALLBACK_LANGUAGE];
    if (fallback && typeof fallback[key] === 'string') return fallback[key];
    return key;
  }

  function normalizeCode(value) {
    if (typeof value !== 'string') return '';
    const code = value.trim().toLowerCase().replace(/_/g, '-');
    if (!code || code === 'none' || code === 'auto') return '';
    return code;
  }

  function matchLocale(value) {
    const parts = normalizeCode(value).split('-').filter(Boolean);
    while (parts.length > 0) {
      const candidate = parts.join('-');
      if (hasLocale(candidate)) return candidate;
      parts.pop();
    }
    return '';
  }

  function resolveLanguage() {
    return (
      matchLocale(i18n.configured) ||
      matchLocale(document.documentElement.lang) ||
      FALLBACK_LANGUAGE
    );
  }

  function applyStaticText() {
    const roots = [els.win];
    if (controls.container) roots.push(controls.container);
    roots.forEach(function (root) {
      root.querySelectorAll('[data-i18n]').forEach(function (node) {
        node.textContent = t(node.getAttribute('data-i18n'));
      });
      root.querySelectorAll('[data-i18n-title]').forEach(function (node) {
        const text = t(node.getAttribute('data-i18n-title'));
        node.title = text;
        node.setAttribute('aria-label', text);
      });
    });
  }

  function paintName() {
    if (view.mode === 'error') {
      els.name.textContent = t(view.key) + ' 🔄 ' + view.seconds + 's...';
    } else if (view.mode === 'data') {
      els.name.textContent = view.name || t('unknown_gpu');
    } else {
      els.name.textContent = i18n.loaded ? t('loading') : '';
    }
  }

  function refreshLanguage() {
    if (!i18n.loaded) return;
    const next = resolveLanguage();
    if (next === i18n.active) return;
    i18n.active = next;
    applyStaticText();
    paintName();
  }

  async function loadLocales() {
    if (i18n.loaded || i18n.loading) return;
    i18n.loading = true;
    try {
      const response = await fetch(LOCALES_ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error('http');
      const payload = await response.json();
      if (payload && payload.locales && typeof payload.locales === 'object') {
        i18n.locales = payload.locales;
        i18n.loaded = true;
      }
    } catch (error) {
      console.error('Failed to load locales:', error);
    }
    i18n.loading = false;
    refreshLanguage();
    if (i18n.loaded) queueControls();
  }

  async function loadConfig() {
    if (settings.loaded || settings.loading) return;
    settings.loading = true;
    try {
      const response = await fetch(CONFIG_ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error('http');
      const config = await response.json();
      if (config && typeof config === 'object') {
        applyConfigValues(config);
        settings.loaded = true;
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    settings.loading = false;
    refreshLanguage();
  }

  function bootstrap() {
    return Promise.all([loadConfig(), loadLocales()]);
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      if (Number.isFinite(saved.right)) state.right = saved.right;
      if (Number.isFinite(saved.bottom)) state.bottom = saved.bottom;
      state.isMinimized = saved.isMinimized === true;
      state.isClosed = saved.isClosed === true;
      state.clickThrough = saved.clickThrough === true;
      if (state.clickThrough) state.isMinimized = false;
    } catch (error) {
      console.error('Failed to load saved state:', error);
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          right: state.right,
          bottom: state.bottom,
          isMinimized: state.isMinimized,
          isClosed: state.isClosed,
          clickThrough: state.clickThrough,
        })
      );
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  function buildWindow() {
    const win = document.createElement('div');
    win.id = 'gpu-monitor-window';
    win.innerHTML = [
      '<div class="gpu-monitor-header">',
      '<span class="gpu-monitor-title" data-i18n="title"></span>',
      '<span class="gpu-monitor-controls">',
      '<button type="button" class="gpu-monitor-btn gpu-monitor-btn-min" data-i18n-title="minimize">➖</button>',
      '<button type="button" class="gpu-monitor-btn gpu-monitor-btn-restore" data-i18n-title="restore">↗️</button>',
      '<button type="button" class="gpu-monitor-btn gpu-monitor-btn-close" data-i18n-title="close">❌</button>',
      '</span>',
      '</div>',
      '<div class="gpu-monitor-body">',
      '<div class="gpu-monitor-name"></div>',
      '<div class="gpu-monitor-row" data-row="usage"><span class="gpu-monitor-label" data-i18n="usage"></span><span class="gpu-monitor-value" data-field="usage">--</span></div>',
      '<div class="gpu-monitor-row" data-row="vram"><span class="gpu-monitor-label" data-i18n="vram"></span><span class="gpu-monitor-value" data-field="vram">--</span></div>',
      '<div class="gpu-monitor-bar" data-row="bar"><div class="gpu-monitor-bar-fill"></div></div>',
      '<div class="gpu-monitor-row" data-row="temp"><span class="gpu-monitor-label" data-i18n="temp"></span><span class="gpu-monitor-value" data-field="temp">--</span></div>',
      '<div class="gpu-monitor-row" data-row="power"><span class="gpu-monitor-label" data-i18n="power"></span><span class="gpu-monitor-value" data-field="power">--</span></div>',
      '</div>',
    ].join('');
    document.body.appendChild(win);

    els.win = win;
    els.header = win.querySelector('.gpu-monitor-header');
    els.name = win.querySelector('.gpu-monitor-name');
    els.usage = win.querySelector('[data-field="usage"]');
    els.vram = win.querySelector('[data-field="vram"]');
    els.temp = win.querySelector('[data-field="temp"]');
    els.power = win.querySelector('[data-field="power"]');
    els.fill = win.querySelector('.gpu-monitor-bar-fill');
    els.btnMin = win.querySelector('.gpu-monitor-btn-min');
    els.btnRestore = win.querySelector('.gpu-monitor-btn-restore');
    els.btnClose = win.querySelector('.gpu-monitor-btn-close');
    els.rows = {
      usage: win.querySelector('[data-row="usage"]'),
      vram: win.querySelector('[data-row="vram"]'),
      bar: win.querySelector('[data-row="bar"]'),
      temp: win.querySelector('[data-row="temp"]'),
      power: win.querySelector('[data-row="power"]'),
    };
  }

  function viewport() {
    const root = document.documentElement;
    return {
      w: root.clientWidth || window.innerWidth,
      h: root.clientHeight || window.innerHeight,
    };
  }

  function clamp(value, max) {
    return Math.min(Math.max(value, EDGE), Math.max(EDGE, max));
  }

  function clampedPosition(right, bottom) {
    const vp = viewport();
    const rect = els.win.getBoundingClientRect();
    return {
      right: clamp(right, vp.w - rect.width - EDGE),
      bottom: clamp(bottom, vp.h - rect.height - EDGE),
    };
  }

  function applyPosition() {
    const pos = clampedPosition(state.right, state.bottom);
    els.win.style.right = pos.right + 'px';
    els.win.style.bottom = pos.bottom + 'px';
    return pos;
  }

  function applyVisibility() {
    els.win.classList.toggle('gpu-monitor-hidden', state.isClosed);
    els.win.classList.toggle('gpu-monitor-minimized', state.isMinimized);
    els.win.classList.toggle('gpu-monitor-clickthrough', state.clickThrough);
    els.win.style.setProperty('--gpu-monitor-ct-opacity', String(appearance.opacity));
    updateToggleIcon();
    applyPosition();
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('.gpu-monitor-btn')) return;
    const pos = applyPosition();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      right: pos.right,
      bottom: pos.bottom,
    };
    try {
      els.header.setPointerCapture(event.pointerId);
    } catch (error) {
      console.error('Failed to set pointer capture:', error);
    }
    els.win.classList.add('gpu-monitor-dragging');
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const next = clampedPosition(
      drag.right - (event.clientX - drag.x),
      drag.bottom - (event.clientY - drag.y)
    );
    state.right = next.right;
    state.bottom = next.bottom;
    applyPosition();
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    try {
      els.header.releasePointerCapture(event.pointerId);
    } catch (error) {
      console.error('Failed to release pointer capture:', error);
    }
    els.win.classList.remove('gpu-monitor-dragging');
    saveState();
  }

  function clearTimers() {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function applyConfigValues(config) {
    if (!config || typeof config !== 'object') return;
    i18n.configured = typeof config.language === 'string' ? config.language : 'auto';
    if (Number.isFinite(config.polling_rate) && config.polling_rate > 0) {
      timing.poll = config.polling_rate;
    }
    if (Number.isFinite(config.retry_rate) && config.retry_rate > 0) {
      timing.retry = config.retry_rate;
    }
    Object.keys(METRIC_KEYS).forEach(function (key) {
      if (typeof config[METRIC_KEYS[key]] === 'boolean') {
        metrics[key] = config[METRIC_KEYS[key]];
      }
    });
    if (Number.isFinite(config.click_through_opacity)) {
      appearance.opacity = config.click_through_opacity;
    }
    applyMetricVisibility();
    if (els.win) applyVisibility();
  }

  function applyMetricVisibility() {
    if (!els.rows) return;
    els.rows.usage.classList.toggle(HIDDEN_CLASS, !metrics.usage);
    els.rows.vram.classList.toggle(HIDDEN_CLASS, !metrics.vram);
    els.rows.bar.classList.toggle(HIDDEN_CLASS, !(metrics.vram && metrics.vramBar));
    els.rows.temp.classList.toggle(HIDDEN_CLASS, !metrics.temp);
    els.rows.power.classList.toggle(HIDDEN_CLASS, !metrics.power);
  }

  function render(data) {
    const used = Number(data.vu);
    const total = Number(data.vt);
    const percent = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
    view.mode = 'data';
    view.name = typeof data.n === 'string' ? data.n : '';
    els.name.classList.remove('gpu-monitor-error');
    paintName();
    els.usage.textContent = data.u + ' %';
    els.vram.textContent = used.toFixed(1) + ' / ' + total.toFixed(1) + ' GB';
    els.fill.style.width = percent + '%';
    els.temp.textContent = data.t + ' ℃';
    els.power.textContent = data.pd + ' / ' + data.pl + ' W';
  }

  function showError(key) {
    view.mode = 'error';
    view.key = key;
    els.name.classList.add('gpu-monitor-error');
    els.usage.textContent = PLACEHOLDER;
    els.vram.textContent = PLACEHOLDER;
    els.fill.style.width = '0%';
    els.temp.textContent = PLACEHOLDER;
    els.power.textContent = PLACEHOLDER;
  }

  function paintCountdown(seconds) {
    if (seconds === lastSeconds) return;
    lastSeconds = seconds;
    view.seconds = seconds;
    paintName();
  }

  function startCountdown() {
    deadline = Date.now() + timing.retry;
    lastSeconds = -1;
    paintCountdown(Math.ceil(timing.retry / 1000));
    countdownTimer = setInterval(function () {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        paintCountdown(0);
        tick();
        return;
      }
      paintCountdown(Math.ceil(remaining / 1000));
    }, 250);
  }

  async function tick() {
    clearTimers();
    const id = ++runId;
    bootstrap();
    refreshLanguage();
    let ok = false;
    let failure = 'backend_offline';
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error('http');
      const payload = await response.json();
      if (id !== runId) return;
      if (payload && payload.e === false && payload.d && typeof payload.d === 'object') {
        render(payload.d);
        ok = true;
      } else {
        failure = 'backend_error';
      }
    } catch (error) {
      if (id !== runId) return;
      failure = 'backend_offline';
      console.error('Failed to fetch GPU data:', error);
    }
    if (id !== runId) return;
    refreshLanguage();
    if (ok) {
      pollTimer = setTimeout(tick, timing.poll);
      return;
    }
    showError(failure);
    startCountdown();
  }

  function startPolling() {
    tick();
  }

  function resetDisplay() {
    view.mode = 'loading';
    els.name.classList.remove('gpu-monitor-error');
    els.usage.textContent = PLACEHOLDER;
    els.vram.textContent = PLACEHOLDER;
    els.fill.style.width = '0%';
    els.temp.textContent = PLACEHOLDER;
    els.power.textContent = PLACEHOLDER;
    paintName();
  }

  function resumePolling() {
    resetDisplay();
    startPolling();
  }

  function stopPolling() {
    runId++;
    clearTimers();
  }

  function setMinimized(value) {
    if (value && state.clickThrough) return;
    state.isMinimized = value;
    applyVisibility();
    saveState();
    if (value) {
      stopPolling();
    } else if (!state.isClosed) {
      resumePolling();
    }
  }

  function closeWindow() {
    state.isClosed = true;
    applyVisibility();
    saveState();
    stopPolling();
  }

  function openWindow() {
    state.isClosed = false;
    applyVisibility();
    saveState();
    if (!state.isMinimized) resumePolling();
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createField(labelText, control) {
    const label = createElement('label', 'gpu-monitor-field');
    label.append(createElement('span', 'gpu-monitor-field-label', labelText), control);
    return label;
  }

  function createNumberInput() {
    const input = createElement('input', 'gpu-monitor-input');
    input.type = 'number';
    input.step = '100';
    input.inputMode = 'numeric';
    return input;
  }

  function createActionButton(text, primary) {
    const button = createElement(
      'button',
      primary ? 'gpu-monitor-action gpu-monitor-action-primary' : 'gpu-monitor-action',
      text
    );
    button.type = 'button';
    return button;
  }

  function createCheck(text, sub) {
    const label = createElement(
      'label',
      sub ? 'gpu-monitor-check gpu-monitor-check-sub' : 'gpu-monitor-check'
    );
    const input = createElement('input');
    input.type = 'checkbox';
    label.append(input, createElement('span', '', text));
    return { label: label, input: input };
  }

  function buildModal() {
    const backdrop = createElement('div');
    backdrop.id = MODAL_ID;
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const dialog = createElement('div', 'gpu-monitor-dialog');

    const header = createElement('div', 'gpu-monitor-dialog-header');
    const title = createElement('span', 'gpu-monitor-dialog-title', t('settings_title'));
    const closeButton = createElement('button', 'gpu-monitor-btn', '❌');
    closeButton.type = 'button';
    closeButton.title = t('close');
    closeButton.setAttribute('aria-label', t('close'));
    header.append(title, closeButton);

    const languageSelect = createElement('select', 'gpu-monitor-input');
    const pollingInput = createNumberInput();
    const retryInput = createNumberInput();
    const opacityRange = createElement('input', 'gpu-monitor-range');
    opacityRange.type = 'range';
    const opacityNumber = createElement('input', 'gpu-monitor-input');
    opacityNumber.type = 'number';
    opacityNumber.inputMode = 'decimal';
    const opacityRow = createElement('div', 'gpu-monitor-opacity-row');
    opacityRow.append(opacityRange, opacityNumber);
    const opacityField = createElement('div', 'gpu-monitor-field');
    opacityField.append(
      createElement('span', 'gpu-monitor-field-label', t('click_through_opacity')),
      opacityRow
    );
    const error = createElement('div', 'gpu-monitor-dialog-error');

    const checks = {
      usage: createCheck(t('usage'), false),
      vram: createCheck(t('vram'), false),
      vramBar: createCheck(t('vram_bar'), true),
      temp: createCheck(t('temp'), false),
      power: createCheck(t('power'), false),
    };
    const checkList = createElement('div', 'gpu-monitor-check-list');
    Object.keys(checks).forEach(function (key) {
      checkList.appendChild(checks[key].label);
    });
    const metricsField = createElement('div', 'gpu-monitor-field');
    metricsField.append(createElement('span', 'gpu-monitor-field-label', t('metrics')), checkList);

    const body = createElement('div', 'gpu-monitor-dialog-body');
    body.append(
      createField(t('language'), languageSelect),
      createField(t('polling_rate'), pollingInput),
      createField(t('retry_rate'), retryInput),
      opacityField,
      metricsField,
      error
    );

    const actions = createElement('div', 'gpu-monitor-dialog-actions');
    const cancel = createActionButton(t('cancel'), false);
    const save = createActionButton(t('save'), true);
    const version = createElement('span', 'gpu-monitor-version', VERSION);
    actions.append(version, cancel, save);

    dialog.append(header, body, actions);
    backdrop.appendChild(dialog);

    return {
      backdrop: backdrop,
      closeButton: closeButton,
      languageSelect: languageSelect,
      pollingInput: pollingInput,
      retryInput: retryInput,
      opacityRange: opacityRange,
      opacityNumber: opacityNumber,
      checks: checks,
      error: error,
      cancel: cancel,
      save: save,
    };
  }

  function validSettings(config) {
    return (
      config &&
      typeof config === 'object' &&
      config.min &&
      config.max &&
      Number.isFinite(config.polling_rate) &&
      Number.isFinite(config.retry_rate) &&
      Number.isFinite(config.min.polling_rate) &&
      Number.isFinite(config.min.retry_rate) &&
      Number.isFinite(config.max.polling_rate) &&
      Number.isFinite(config.max.retry_rate) &&
      Number.isFinite(config.click_through_opacity) &&
      config.opacity &&
      Number.isFinite(config.opacity.min) &&
      Number.isFinite(config.opacity.max) &&
      Number.isFinite(config.opacity.step) &&
      Object.keys(METRIC_KEYS).every(function (key) {
        return typeof config[METRIC_KEYS[key]] === 'boolean';
      })
    );
  }

  function populateModal(ui, config) {
    const codes = Object.keys(i18n.locales).sort();
    const options = [['auto', t('language_auto')]].concat(
      codes.map(function (code) {
        const strings = i18n.locales[code];
        const name =
          strings && typeof strings.language_name === 'string' ? strings.language_name : code;
        return [code, name];
      })
    );
    ui.languageSelect.replaceChildren();
    options.forEach(function (entry) {
      const option = createElement('option', '', entry[1]);
      option.value = entry[0];
      ui.languageSelect.appendChild(option);
    });
    ui.languageSelect.value = matchLocale(config.language) || 'auto';

    ui.pollingInput.min = String(config.min.polling_rate);
    ui.pollingInput.max = String(config.max.polling_rate);
    ui.pollingInput.value = String(config.polling_rate);
    ui.retryInput.min = String(config.min.retry_rate);
    ui.retryInput.max = String(config.max.retry_rate);
    ui.retryInput.value = String(config.retry_rate);
    [ui.opacityRange, ui.opacityNumber].forEach(function (input) {
      input.min = String(config.opacity.min);
      input.max = String(config.opacity.max);
      input.step = String(config.opacity.step);
      input.value = String(config.click_through_opacity);
    });
    Object.keys(METRIC_KEYS).forEach(function (key) {
      ui.checks[key].input.checked = config[METRIC_KEYS[key]];
    });
  }

  function syncBarToggle(ui) {
    const enabled = ui.checks.vram.input.checked;
    ui.checks.vramBar.input.disabled = !enabled;
    ui.checks.vramBar.label.classList.toggle('gpu-monitor-check-disabled', !enabled);
  }

  function setModalDisabled(ui, disabled) {
    ui.languageSelect.disabled = disabled;
    ui.pollingInput.disabled = disabled;
    ui.retryInput.disabled = disabled;
    ui.opacityRange.disabled = disabled;
    ui.opacityNumber.disabled = disabled;
    ui.save.disabled = disabled;
    Object.keys(ui.checks).forEach(function (key) {
      ui.checks[key].input.disabled = disabled;
    });
    if (!disabled) syncBarToggle(ui);
  }

  function buildPayload(ui) {
    const payload = {
      language: ui.languageSelect.value,
      polling_rate: Number(ui.pollingInput.value),
      retry_rate: Number(ui.retryInput.value),
      click_through_opacity: Number(ui.opacityNumber.value),
    };
    Object.keys(METRIC_KEYS).forEach(function (key) {
      payload[METRIC_KEYS[key]] = ui.checks[key].input.checked;
    });
    return payload;
  }

  function rangeMessage(input) {
    return t('invalid_number').replace('{min}', input.min).replace('{max}', input.max);
  }

  function inRange(input) {
    const text = input.value.trim();
    if (text === '') return false;
    const value = Number(text);
    return Number.isInteger(value) && value >= Number(input.min) && value <= Number(input.max);
  }

  function opacityValid(input) {
    const text = input.value.trim();
    if (text === '') return false;
    const value = Number(text);
    const min = Number(input.min);
    const max = Number(input.max);
    const step = Number(input.step);
    if (!Number.isFinite(value) || value < min - 1e-9 || value > max + 1e-9) return false;
    const steps = (value - min) / step;
    return Math.abs(steps - Math.round(steps)) < 1e-6;
  }

  function opacityMessage(input) {
    return t('invalid_opacity')
      .replace('{min}', input.min)
      .replace('{max}', input.max)
      .replace('{step}', input.step);
  }

  function applySettings(config) {
    applyConfigValues(config);
    refreshLanguage();
    if (!state.isClosed && !state.isMinimized) startPolling();
  }

  function closeSettings() {
    if (!settingsModal) return;
    document.removeEventListener('keydown', onModalKeydown, true);
    settingsModal.backdrop.remove();
    settingsModal = null;
  }

  function onModalKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeSettings();
    }
  }

  async function saveSettings(ui) {
    if (ui.save.disabled) return;
    if (!inRange(ui.pollingInput)) {
      ui.error.textContent = rangeMessage(ui.pollingInput);
      ui.pollingInput.focus();
      return;
    }
    if (!inRange(ui.retryInput)) {
      ui.error.textContent = rangeMessage(ui.retryInput);
      ui.retryInput.focus();
      return;
    }
    if (!opacityValid(ui.opacityNumber)) {
      ui.error.textContent = opacityMessage(ui.opacityNumber);
      ui.opacityNumber.focus();
      return;
    }
    ui.error.textContent = '';
    ui.save.disabled = true;
    try {
      const response = await fetch(CONFIG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(ui)),
      });
      if (!response.ok) throw new Error('http');
      const saved = await response.json();
      if (!saved || saved.error === true) throw new Error('save');
      applySettings(saved);
      closeSettings();
    } catch (error) {
      if (settingsModal !== ui) return;
      ui.error.textContent = t('save_failed');
      ui.save.disabled = false;
      console.error('Failed to save settings:', error);
    }
  }

  async function openSettings() {
    if (settingsModal || !i18n.loaded) return;
    const ui = buildModal();
    settingsModal = ui;
    document.body.appendChild(ui.backdrop);
    document.addEventListener('keydown', onModalKeydown, true);

    ui.closeButton.addEventListener('click', closeSettings);
    ui.checks.vram.input.addEventListener('change', function () {
      syncBarToggle(ui);
    });
    ui.opacityRange.addEventListener('input', function () {
      ui.opacityNumber.value = ui.opacityRange.value;
    });
    ui.opacityNumber.addEventListener('input', function () {
      if (opacityValid(ui.opacityNumber)) ui.opacityRange.value = ui.opacityNumber.value;
    });
    ui.cancel.addEventListener('click', closeSettings);
    ui.save.addEventListener('click', function () {
      saveSettings(ui);
    });
    ui.backdrop.addEventListener('mousedown', function (event) {
      if (event.target === ui.backdrop) closeSettings();
    });
    [ui.pollingInput, ui.retryInput, ui.opacityNumber].forEach(function (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') saveSettings(ui);
      });
    });

    setModalDisabled(ui, true);
    let config = null;
    try {
      const response = await fetch(CONFIG_ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error('http');
      config = await response.json();
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    if (settingsModal !== ui) return;
    if (!validSettings(config)) {
      ui.error.textContent = t('backend_offline');
      return;
    }
    populateModal(ui, config);
    setModalDisabled(ui, false);
    ui.pollingInput.focus();
  }

  function updateToggleIcon() {
    if (!controls.toggle) return;
    controls.toggle.textContent = state.clickThrough && !state.isClosed ? '🖱️' : '📈';
  }

  function toggleWindow() {
    if (state.isClosed) {
      openWindow();
    } else {
      closeWindow();
    }
  }

  function toggleClickThrough() {
    const enabling = !state.clickThrough;
    const expanding = enabling && state.isMinimized;
    state.clickThrough = enabling;
    if (expanding) state.isMinimized = false;
    applyVisibility();
    saveState();
    if (expanding && !state.isClosed) resumePolling();
  }

  function createQuickButton(icon, titleKey) {
    const button = createElement('button', 'gpu-monitor-qs-btn', icon);
    button.type = 'button';
    button.setAttribute('data-i18n-title', titleKey);
    button.title = t(titleKey);
    button.setAttribute('aria-label', t(titleKey));
    return button;
  }

  function buildControls() {
    const container = createElement('span');
    container.id = CONTROLS_ID;
    const toggle = createQuickButton('📈', 'tip_toggle');
    const settingsButton = createQuickButton('⚙️', 'tip_settings');
    toggle.addEventListener('click', toggleWindow);
    toggle.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      toggleClickThrough();
    });
    settingsButton.addEventListener('click', function () {
      openSettings();
    });
    container.append(toggle, settingsButton);
    controls.container = container;
    controls.toggle = toggle;
    controls.settings = settingsButton;
    updateToggleIcon();
  }

  function injectControls() {
    if (!i18n.loaded) return;
    const host = document.getElementById(QUICKSETTINGS_ID);
    if (!host) return;
    if (!controls.container) buildControls();
    if (!host.contains(controls.container)) host.appendChild(controls.container);
  }

  function queueControls() {
    if (controlsQueued) return;
    controlsQueued = true;
    requestAnimationFrame(function () {
      controlsQueued = false;
      injectControls();
    });
  }

  function boot() {
    if (booted) return;
    booted = true;

    loadState();
    buildWindow();

    els.btnMin.addEventListener('click', function () {
      setMinimized(true);
    });
    els.btnRestore.addEventListener('click', function () {
      setMinimized(false);
    });
    els.btnClose.addEventListener('click', closeWindow);

    els.header.addEventListener('pointerdown', onPointerDown);
    els.header.addEventListener('pointermove', onPointerMove);
    els.header.addEventListener('pointerup', onPointerUp);
    els.header.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('resize', applyPosition);
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(applyPosition).observe(els.win);
    }

    applyVisibility();
    bootstrap().then(function () {
      if (!state.isClosed && !state.isMinimized && runId === 0) startPolling();
    });

    new MutationObserver(queueControls).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    queueControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
