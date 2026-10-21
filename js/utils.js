/* 课序 · shared utilities */
(function () {
  'use strict';

  const KX = (window.KX = window.KX || {});

  const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const WEEKDAYS_SHORT = ['一', '二', '三', '四', '五', '六', '日'];

  const COLORS = [
    { id: 'blue', name: '海洋蓝', value: '#0a84ff' },
    { id: 'indigo', name: '靛青', value: '#5e5ce6' },
    { id: 'purple', name: '紫罗兰', value: '#af52de' },
    { id: 'pink', name: '樱花粉', value: '#ff375f' },
    { id: 'orange', name: '暖橙', value: '#ff9f0a' },
    { id: 'yellow', name: '银杏', value: '#e5a300' },
    { id: 'green', name: '青柠', value: '#30b158' },
    { id: 'teal', name: '湖水', value: '#00a6a6' },
    { id: 'slate', name: '石墨', value: '#6e7480' },
  ];

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    calendar:
      '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.7-3.7"/>',
    settings:
      '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
    sliders:
      '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronsLeft: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
    chevronsRight: '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    download: '<path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    upload: '<path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mapPin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 15a1 1 0 0 1-1 .9H7A1 1 0 0 1 6 21L5 6M10 11v6M14 11v6"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M9 9v11"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8Z"/>',
    laptop: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M2 20h20M9 20h6"/>',
    sparkles:
      '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    note: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
    command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrowRight: '<path d="M5 12h14m0 0-6-6m6 6-6 6"/>',
    alert: '<path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L12 3Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    external: '<path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
    file: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>',
    arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
    cornerDown: '<path d="M4 5v6a3 3 0 0 0 3 3h12m0 0-5-5m5 5-5 5"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  };

  function icon(name, cls) {
    const body = ICONS[name] || ICONS.info;
    return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function uid(prefix) {
    const bytes = new Uint8Array(8);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < 8; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${prefix || 'id'}_${Date.now().toString(36)}_${rand.slice(0, 8)}`;
  }

  function hashString(str) {
    let h = 2166136261;
    const value = String(str || '');
    for (let i = 0; i < value.length; i += 1) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function parseDate(value) {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d, 12);
    }
    const date = value ? new Date(value) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  }

  function isoDate(value) {
    const d = parseDate(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function addDays(value, amount) {
    const d = parseDate(value);
    d.setDate(d.getDate() + Number(amount || 0));
    return isoDate(d);
  }

  function addMonths(value, amount) {
    const d = parseDate(value);
    d.setMonth(d.getMonth() + Number(amount || 0));
    return isoDate(d);
  }

  function startOfWeek(value) {
    const d = parseDate(value);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return isoDate(d);
  }

  function daysBetween(from, to) {
    const a = parseDate(from);
    const b = parseDate(to);
    const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((utcB - utcA) / 86400000);
  }

  function weekDate(startDate, index, day) {
    return addDays(startDate, index * 7 + day);
  }

  function weekDates(startDate, index) {
    return Array.from({ length: 7 }, (_, day) => weekDate(startDate, index, day));
  }

  function isToday(value) {
    return isoDate(value) === isoDate(new Date());
  }

  function formatMonthDay(value) {
    const d = parseDate(value);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatShortDate(value) {
    const d = parseDate(value);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function formatWeekRange(startDate, index) {
    const dates = weekDates(startDate, index);
    const a = parseDate(dates[0]);
    const b = parseDate(dates[6]);
    if (a.getMonth() === b.getMonth()) {
      return `${a.getMonth() + 1}月${a.getDate()}日 – ${b.getDate()}日`;
    }
    if (a.getFullYear() !== b.getFullYear()) {
      return `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日 – ${b.getFullYear()}年${b.getMonth() + 1}月${b.getDate()}日`;
    }
    return `${a.getMonth() + 1}月${a.getDate()}日 – ${b.getMonth() + 1}月${b.getDate()}日`;
  }

  function formatFullDate(value) {
    const d = parseDate(value);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatNumericDate(value) {
    const d = parseDate(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function timeToMinutes(time) {
    if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return null;
    const [h, m] = time.split(':').map(Number);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  function minutesToTime(minutes) {
    const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  function durationMinutes(start, end) {
    const a = timeToMinutes(start);
    const b = timeToMinutes(end);
    if (a == null || b == null) return 0;
    return b >= a ? b - a : b + 1440 - a;
  }

  function durationLabel(start, end) {
    const mins = durationMinutes(start, end);
    if (!mins) return '';
    if (mins < 60) return `${mins} 分钟`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  }

  function addMinutes(time, amount) {
    const mins = timeToMinutes(time);
    if (mins == null) return time;
    return minutesToTime(mins + Number(amount || 0));
  }

  function clampTimeRange(start, end) {
    let a = timeToMinutes(start);
    let b = timeToMinutes(end);
    if (a == null) a = 8 * 60;
    if (b == null) b = a + 45;
    if (b <= a) b = a + 45;
    return { start: minutesToTime(a), end: minutesToTime(b) };
  }

  function sortByTime(a, b) {
    return (timeToMinutes(a.start) || 0) - (timeToMinutes(b.start) || 0);
  }

  function colorById(id) {
    return COLORS.find((c) => c.id === id) || COLORS[0];
  }

  function colorForText(text) {
    return COLORS[hashString(text) % COLORS.length].id;
  }

  function clip(text, max) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }

  function stripHtml(html) {
    return String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function formatSavedTime(date) {
    const d = date || new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function isMac() {
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  }

  function modKey() {
    return isMac() ? '⌘' : 'Ctrl';
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      /* fall through to legacy copy */
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (error) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  function downloadBlob(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function escapeICS(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function debounce(fn, wait) {
    let timer = 0;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  KX.utils = {
    WEEKDAYS,
    WEEKDAYS_SHORT,
    COLORS,
    icon,
    esc,
    pad,
    uid,
    hashString,
    parseDate,
    isoDate,
    addDays,
    addMonths,
    startOfWeek,
    daysBetween,
    weekDate,
    weekDates,
    isToday,
    formatMonthDay,
    formatShortDate,
    formatWeekRange,
    formatFullDate,
    formatNumericDate,
    timeToMinutes,
    minutesToTime,
    durationMinutes,
    durationLabel,
    addMinutes,
    clampTimeRange,
    sortByTime,
    colorById,
    colorForText,
    clip,
    stripHtml,
    formatSavedTime,
    isEditableTarget,
    isMac,
    modKey,
    copyText,
    downloadBlob,
    escapeICS,
    debounce,
  };
})();
