/* 课序 · application shell and interactions */
(function () {
  'use strict';

  const KX = window.KX;
  const U = KX.utils;
  const store = KX.store;
  const ical = KX.ical;
  const icon = U.icon;
  const esc = U.esc;

  const el = {};
  const ui = {
    weekIndex: 0,
    view: 'week',
    scrollReset: false,
    sidebarOpen: false,
  };
  const overlays = [];
  let popover = null;
  let themeMedia = null;
  let searchState = null;

  console.info('%c课序 · Kexu Timetable', 'color:#0a84ff;font-weight:700;font-size:13px');

  async function init() {
    cacheElements();
    renderBoot();
    try {
      await store.init();
    } catch (error) {
      store.mode = 'browser';
      store.storageAvailable = false;
      store.loadError = error;
      if (!store.state && typeof store.createBlankState === 'function') {
        store.state = store.createBlankState();
      }
    }
    store.applySavedTime();
    ui.weekIndex = store.currentWeekIndex();
    ui.scrollReset = true;
    applyTheme();
    bindEvents();
    renderAll();
    setTimeout(() => {
      if (store.mode === 'browser') {
        toast('临时模式：课程尚未写入本目录。运行 ./start.sh 可启用文件存储。', 'warn', 6200);
      } else if (store.mode === 'file-error') {
        toast('无法读取 data/timetable.json，请检查文件或使用备份恢复。', 'error', 7200);
      } else if (store.migratedFromBrowser) {
        toast('已将浏览器中的旧课表迁移到 data/timetable.json', 'success', 4800);
      }
    }, 650);
  }

  function renderBoot() {
    if (!el.sidebarContent || !el.viewHost) return;
    el.sidebarContent.innerHTML = `
      <div class="boot-brand">
        <div class="app-mark">${icon('calendar')}</div>
        <div class="brand-text"><h1>课序</h1><p>Kexu · Timetable</p></div>
      </div>`;
    el.viewHost.innerHTML = `
      <div class="boot-screen">
        <div class="boot-spinner" aria-hidden="true"></div>
        <span>正在连接本地文件存储…</span>
      </div>`;
  }

  function cacheElements() {
    el.appWindow = document.getElementById('appWindow');
    el.sidebar = document.getElementById('sidebar');
    el.sidebarContent = document.getElementById('sidebarContent');
    el.sidebarScrim = document.getElementById('sidebarScrim');
    el.topbar = document.getElementById('topbar');
    el.viewHost = document.getElementById('viewHost');
    el.statusbar = document.getElementById('statusbar');
    el.overlayRoot = document.getElementById('overlayRoot');
    el.toastRoot = document.getElementById('toastRoot');
    el.jsonInput = document.getElementById('jsonFileInput');
  }

  /* ------------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------------ */

  function resolvedTheme() {
    const pref = store.state.preferences.theme || 'auto';
    if (pref === 'auto') {
      return themeMedia && themeMedia.matches ? 'dark' : 'light';
    }
    return pref;
  }

  function applyTheme() {
    if (themeMedia) {
      themeMedia.onchange = null;
    } else if (window.matchMedia) {
      themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    }
    const resolved = resolvedTheme();
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#10141d' : '#eef2f8');
    if (themeMedia) {
      themeMedia.onchange = () => {
        if ((store.state.preferences.theme || 'auto') === 'auto') {
          applyTheme();
        }
      };
    }
  }

  function setTheme(pref) {
    store.state.preferences.theme = pref;
    applyTheme();
    commit(null, { render: false });
    renderSidebar();
    renderTopbar();
    const active = document.querySelector('.theme-option input:checked');
    if (active) active.checked = true;
  }

  function cycleTheme() {
    const current = store.state.preferences.theme || 'auto';
    const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
    setTheme(next);
    const labels = { auto: '跟随系统外观', light: '浅色外观', dark: '深色外观' };
    toast(`已切换为${labels[next]}`, 'info', 1800);
  }

  /* ------------------------------------------------------------------------
     Persistence + rendering
     ------------------------------------------------------------------------ */

  function commit(message, options) {
    const opts = { render: true, toast: true, ...(options || {}) };
    const wasAvailable = store.storageAvailable;
    const savePromise = store.save();
    if (message && opts.toast) toast(message, 'success', 2300);
    if (opts.render) renderAll();
    if (savePromise && typeof savePromise.then === 'function') {
      savePromise.then((ok) => {
        if (!ok) {
          toast(
            store.mode === 'file'
              ? '写入 data/timetable.json 失败，请检查本地服务和目录权限。'
              : '浏览器临时存储写入失败，请立即导出备份。',
            'error',
            6500
          );
        }
        renderStatus();
        if (wasAvailable !== store.storageAvailable || !ok) {
          renderTopbar();
          renderSidebar();
        }
      });
    }
    return savePromise;
  }

  function renderAll() {
    const oldScrollEl = el.viewHost.querySelector('.timetable-card, .overview-card');
    const oldScroll = oldScrollEl ? oldScrollEl.scrollTop : 0;
    renderSidebar();
    revealActiveWeek();
    renderTopbar();
    renderView();
    renderStatus();
    const newScrollEl = el.viewHost.querySelector('.timetable-card, .overview-card');
    if (newScrollEl) {
      newScrollEl.scrollTop = ui.scrollReset ? 0 : oldScroll;
    }
    if (ui.scrollReset && window.innerWidth <= 860) {
      requestAnimationFrame(() => {
        const card = el.viewHost.querySelector('.timetable-card');
        const todayHead = card && card.querySelector('.day-head.today');
        if (card && todayHead) {
          card.scrollLeft = Math.max(0, todayHead.offsetLeft - card.clientWidth / 2 + todayHead.offsetWidth / 2);
        } else if (card) {
          card.scrollLeft = 0;
        }
      });
    }
    ui.scrollReset = false;
  }

  function revealActiveWeek() {
    const list = el.sidebarContent.querySelector('.week-list');
    const active = list && list.querySelector('.week-item.active');
    if (!list || !active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < listRect.top + 3) {
      list.scrollTop -= listRect.top - activeRect.top + 4;
    } else if (activeRect.bottom > listRect.bottom - 3) {
      list.scrollTop += activeRect.bottom - listRect.bottom + 4;
    }
  }

  function sideWeekItem(weekIndex, currentIndex) {
    const week = store.getWeek(weekIndex);
    const start = store.weekStart(weekIndex);
    const end = U.addDays(start, 6);
    const count = week.events.length;
    const active = weekIndex === ui.weekIndex && ui.view === 'week';
    return `
      <button class="week-item ${active ? 'active' : ''}" type="button"
        data-action="goto-week" data-week="${weekIndex}"
        aria-current="${active ? 'page' : 'false'}"
        title="第 ${weekIndex + 1} 周 · ${U.formatWeekRange(store.state.semester.startDate, weekIndex)}">
        <span class="week-number">${String(weekIndex + 1).padStart(2, '0')}</span>
        <span class="week-item-body">
          <span class="week-item-title">
            第 ${weekIndex + 1} 周
            ${weekIndex === currentIndex ? '<span class="now-tag">本周</span>' : ''}
          </span>
          <span class="week-item-dates">${U.formatShortDate(start)} – ${U.formatShortDate(end)}</span>
        </span>
        ${count ? `<span class="week-item-count" title="${count} 个课程块">${count}</span>` : ''}
      </button>`;
  }

  function renderSidebar() {
    const currentIndex = store.currentWeekIndex();
    const progress = Math.round(((ui.weekIndex + 1) / store.weekCount) * 100);
    const themePref = store.state.preferences.theme || 'auto';
    const themeLabel = { auto: '跟随系统', light: '浅色', dark: '深色' }[themePref];
    const themeIcon = themePref === 'dark' ? 'moon' : themePref === 'light' ? 'sun' : 'laptop';
    let storageText = '临时模式 · 未写入目录';
    let storageClass = 'offline';
    let storageTitle = '请运行 ./start.sh 启用本地文件存储';
    if (store.mode === 'file') {
      storageTitle = `课程数据写入 ${store.filePath}`;
      if (store.saving) {
        storageText = '正在写入文件';
        storageClass = 'saving';
      } else if (store.storageAvailable) {
        storageText = '文件自动保存';
        storageClass = '';
      } else {
        storageText = '文件保存失败';
        storageClass = 'offline';
      }
    } else if (store.mode === 'file-error') {
      storageText = '数据文件读取失败';
      storageClass = 'offline';
      storageTitle = '请检查 data/timetable.json 或从备份恢复';
    }
    el.sidebarContent.innerHTML = `
      <div class="brand">
        <div class="app-mark" aria-hidden="true">${icon('calendar')}</div>
        <div class="brand-text">
          <h1>课序</h1>
          <p>Kexu · Timetable</p>
        </div>
      </div>

      <button class="btn btn-primary btn-block btn-lg" type="button" data-action="add-event">
        ${icon('plus')}<span>新建课程</span>
      </button>

      <nav class="side-nav" aria-label="视图">
        <button class="nav-item ${ui.view === 'week' ? 'active' : ''}" type="button" data-action="view-week">
          ${icon('layout')}<span>周课表</span>
          <span class="nav-count">第 ${ui.weekIndex + 1} 周</span>
        </button>
        <button class="nav-item ${ui.view === 'overview' ? 'active' : ''}" type="button" data-action="view-overview">
          ${icon('grid')}<span>学期总览</span>
          <span class="nav-count">${store.weekCount} 周</span>
        </button>
      </nav>

      <div class="side-section">
        <div class="side-section-head">
          <span>教学周</span>
          <span class="side-head-actions">
            <button class="side-mini-btn" type="button" data-action="open-copy-week" title="复制本周课表">${icon('copy')}</button>
            <button class="side-mini-btn" type="button" data-action="open-period-settings" title="节次与时间">${icon('sliders')}</button>
          </span>
        </div>
        <div class="week-list" id="weekList">
          ${Array.from({ length: store.weekCount }, (_, index) => sideWeekItem(index, currentIndex)).join('')}
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="semester-card">
          <div class="semester-card-top">
            <strong>${esc(store.state.semester.name)}</strong>
            <span>${ui.weekIndex + 1} / ${store.weekCount}</span>
          </div>
          <div class="progress-track" title="学期进度 ${progress}%">
            <div class="progress-fill" style="width:${progress}%"></div>
          </div>
        </div>
        <div class="sidebar-footer-row">
          <span class="storage-note ${storageClass}" title="${esc(storageTitle)}">
            <span class="status-dot"></span>
            ${storageText}
          </span>
          <button class="icon-btn" type="button" data-action="toggle-theme" title="${themeLabel}外观 · 点击切换">
            ${icon(themeIcon)}
          </button>
          <button class="icon-btn" type="button" data-action="open-settings" title="设置">${icon('settings')}</button>
        </div>
      </div>`;
  }

  function renderTopbar() {
    const isWeek = ui.view === 'week';
    const start = isWeek ? store.weekStart(ui.weekIndex) : store.state.semester.startDate;
    const end = isWeek ? U.addDays(start, 6) : U.addDays(store.state.semester.startDate, store.weekCount * 7 - 1);
    const currentIndex = store.currentWeekIndex();
    const stats = isWeek ? store.weekStats(ui.weekIndex) : store.stats();
    const semester = store.state.semester;

    const heading = isWeek
      ? `<div class="eyebrow"><span class="eyebrow-dot"></span>${esc(semester.name)} · 第 ${ui.weekIndex + 1} 教学周${ui.weekIndex === currentIndex ? ' · 本周' : ''}</div>
         <h1>第 ${ui.weekIndex + 1} 周 <span class="heading-sub">${U.formatWeekRange(semester.startDate, ui.weekIndex)}</span></h1>`
      : `<div class="eyebrow"><span class="eyebrow-dot"></span>${esc(semester.name)} · Semester Overview</div>
         <h1>学期总览 <span class="heading-sub">${U.formatFullDate(start)} – ${U.formatFullDate(end)} · 共 ${store.weekCount} 周</span></h1>`;

    const weekNav = isWeek
      ? `<div class="week-nav" role="group" aria-label="切换教学周">
           <button class="icon-btn" type="button" data-action="prev-week" title="上一周 (←)" ${ui.weekIndex <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
           <button class="today-btn ${ui.weekIndex === currentIndex ? 'active' : ''}" type="button" data-action="today" title="回到本周 (T)">本周</button>
           <button class="icon-btn" type="button" data-action="next-week" title="下一周 (→)" ${ui.weekIndex >= store.weekCount - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
         </div>`
      : `<button class="btn btn-sm btn-secondary" type="button" data-action="view-week">${icon('arrowRight')}回到第 ${ui.weekIndex + 1} 周</button>`;

    const statMarkup = isWeek
      ? `<span><strong>${stats.sessions}</strong> 个课程块</span>
         <span class="stat-divider"></span>
         <span class="stat-optional"><strong>${stats.courses}</strong> 门课程</span>
         <span class="stat-divider stat-optional"></span>
         <span class="stat-optional"><strong>${stats.periods}</strong> 个节次</span>`
      : `<span><strong>${store.weekCount}</strong> 周</span>
         <span class="stat-divider"></span>
         <span><strong>${stats.sessions}</strong> 个课程块</span>
         <span class="stat-divider"></span>
         <span class="stat-optional"><strong>${stats.courses}</strong> 门课程</span>`;

    el.topbar.innerHTML = `
      <div class="topbar-main">
        <button class="icon-btn bordered mobile-only" type="button" data-action="toggle-sidebar" title="打开导航">${icon('sidebar')}</button>
        <div class="page-heading">${heading}</div>
        <div class="topbar-actions">
          <button class="search-trigger" type="button" data-action="open-search" title="搜索课程 (${modKey()}K)">
            ${icon('search')}<span>搜索课程…</span><span class="kbd">${modKey()}K</span>
          </button>
          <button class="btn btn-primary" type="button" data-action="add-event">
            ${icon('plus')}<span class="btn-text">新建课程</span>
          </button>
          <button class="icon-btn bordered" type="button" data-action="open-more" title="更多操作">${icon('more')}</button>
        </div>
      </div>
      <div class="actionbar">
        ${weekNav}
        <div class="actionbar-stats">${statMarkup}</div>
        <div class="actionbar-spacer"></div>
        <div class="actionbar-actions">
          <button class="btn btn-sm btn-secondary" type="button" data-action="batch-menu" title="批量设置">
            ${icon('sliders')}<span>批量设置</span>
          </button>
          <button class="btn btn-sm btn-secondary" type="button" data-action="open-import" title="从 iCal 文件导入">
            ${icon('download')}<span>导入 iCal</span>
          </button>
        </div>
      </div>
      ${renderStorageBanner()}`;
  }

  function renderStorageBanner() {
    if (store.mode === 'file' && store.storageAvailable) return '';
    if (store.mode === 'file' || store.mode === 'file-error') {
      return `
        <div class="storage-mode-banner error">
          ${icon('alert')}
          <span><strong>文件保存不可用</strong> · 无法写入 <code>${esc(store.filePath)}</code>，当前修改仅保留在页面内存中。</span>
          <button type="button" class="link-btn" data-action="${store.mode === 'file' ? 'retry-file-save' : 'show-file-setup'}">${store.mode === 'file' ? '重试写入' : '查看解决方法'}</button>
        </div>`;
    }
    return `
      <div class="storage-mode-banner temp">
        ${icon('alert')}
        <span><strong>临时模式</strong> · 课程数据尚未写入本目录。运行 <code>./start.sh</code> 启用本地文件存储。</span>
        <button type="button" class="link-btn" data-action="show-file-setup">启动方法</button>
      </div>`;
  }

  function spanInfoFor(week, event) {
    const startIndex = week.periods.findIndex((period) => period.id === event.periodId);
    if (startIndex < 0) return { startIndex: 0, span: 1, endIndex: 0 };
    if (!event.customTime) return { startIndex, span: 1, endIndex: startIndex };
    const times = store.timesFor(week, event);
    const endMinute = U.timeToMinutes(times.end);
    if (endMinute == null) return { startIndex, span: 1, endIndex: startIndex };
    let span = 1;
    for (let index = startIndex + 1; index < week.periods.length; index += 1) {
      const nextStart = U.timeToMinutes(week.periods[index].start);
      if (nextStart != null && nextStart < endMinute) span += 1;
      else break;
    }
    return { startIndex, span, endIndex: startIndex + span - 1 };
  }

  function computeWeekLayout(week) {
    const layout = new Map();
    for (let day = 0; day < 7; day += 1) {
      const entries = week.events
        .filter((event) => event.day === day)
        .map((event) => ({ event, ...spanInfoFor(week, event) }))
        .sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex || a.event.name.localeCompare(b.event.name));
      if (!entries.length) continue;
      const clusters = [];
      let cluster = [];
      let clusterEnd = -1;
      const flush = () => {
        if (!cluster.length) return;
        clusters.push(cluster);
        cluster = [];
        clusterEnd = -1;
      };
      entries.forEach((entry) => {
        if (cluster.length && entry.startIndex > clusterEnd) flush();
        cluster.push(entry);
        clusterEnd = Math.max(clusterEnd, entry.endIndex);
      });
      flush();
      clusters.forEach((items) => {
        const laneEnds = [];
        items.forEach((entry) => {
          let lane = laneEnds.findIndex((end) => end < entry.startIndex);
          if (lane < 0) {
            lane = laneEnds.length;
            laneEnds.push(entry.endIndex);
          } else {
            laneEnds[lane] = entry.endIndex;
          }
          entry.lane = lane;
        });
        const lanes = Math.max(1, laneEnds.length);
        items.forEach((entry) => {
          layout.set(entry.event.id, { ...entry, lanes });
        });
      });
    }
    return layout;
  }

  function eventCardMarkup(event, week, weekIndex, layout) {
    const color = U.colorById(event.color);
    const times = store.timesFor(week, event);
    const placement = (layout && layout.get(event.id)) || { ...spanInfoFor(week, event), lane: 0, lanes: 1 };
    const span = placement.span;
    const laneWidth = 100 / placement.lanes;
    const laneOffset = laneWidth * placement.lane;
    const noteTitle = event.note ? ` · 有批注` : '';
    const spanTitle = span > 1 ? ` · 连续 ${span} 节` : '';
    const hasLocation = event.location || event.teacher;
    const locationText = event.location || event.teacher;
    const notePreview = span > 1 && event.note
      ? `<div class="event-note-preview">${esc(U.clip(event.note, 96))}</div>`
      : '';
    const spanFoot = span > 1
      ? `<div class="event-span-foot">${icon('list')}<span>第 ${placement.startIndex + 1}–${placement.startIndex + span} 节</span></div>`
      : '';
    return `
      <article class="event-card ${event.customTime ? 'custom-time' : ''} ${span > 1 ? 'span-multi' : ''}" draggable="true"
        style="--course:${color.value};--lane-width:${laneWidth.toFixed(4)}%;--lane-offset:${laneOffset.toFixed(4)}%;grid-row:${placement.startIndex + 2} / span ${span};grid-column:${event.day + 2}"
        data-action="edit-event" data-event-id="${esc(event.id)}"
        role="button" tabindex="0" aria-label="${esc(event.name)}，${U.WEEKDAYS[event.day]} ${times.start} 至 ${times.end}${span > 1 ? `，连续 ${span} 节` : ''}"
        title="${esc(event.name)} · ${times.start}–${times.end}${spanTitle}${noteTitle}">
        <div class="event-card-top">
          <span class="event-heading">
            ${event.code ? `<span class="event-code">${esc(event.code)}</span>` : ''}
            ${span > 1 ? `<span class="event-span-pill">${span} 节</span>` : ''}
          </span>
          <span class="event-flags">
            ${event.customTime ? icon('clock') : ''}
            ${event.note ? '<span class="note-dot" title="有批注"></span>' : ''}
            <button class="event-menu-btn" type="button" data-action="event-menu" data-event-id="${esc(event.id)}"
              aria-label="课程操作" title="课程操作">${icon('more')}</button>
          </span>
        </div>
        <div class="event-name">${esc(event.name)}</div>
        <div class="event-meta event-time">${icon('clock')}<span>${times.start} – ${times.end}</span></div>
        ${hasLocation ? `<div class="event-meta">${icon(event.location ? 'mapPin' : 'user')}<span>${esc(locationText)}</span></div>` : ''}
        ${notePreview}
        ${spanFoot}
      </article>`;
  }

  function renderDemoStrip() {
    const week = store.getWeek(ui.weekIndex);
    if (!week.events.some((event) => event.demo) || store.state.meta.demoNoticeDismissed) return '';
    const where = store.mode === 'file' && store.storageAvailable
      ? '所有修改会自动写入 data/timetable.json'
      : '临时模式：修改只保存在当前浏览器';
    return `
      <div class="demo-strip">
        ${icon('sparkles')}
        <span class="demo-copy"><strong>示例课表已载入</strong> · ${where}，你可以放心试用。</span>
        <span class="demo-actions">
          <button class="link-btn" type="button" data-action="clear-demo">清除示例</button>
          <button class="demo-dismiss" type="button" data-action="dismiss-demo" title="收起提示" aria-label="收起提示">${icon('x')}</button>
        </span>
      </div>`;
  }

  function renderEmptyBanner() {
    return `
      <div class="empty-banner">
        <div class="empty-banner-icon">${icon('calendar')}</div>
        <div class="empty-banner-text">
          <strong>这一周还没有安排</strong>
          <span>点击任意空白格添加课程，或把其他周的课表复制过来。</span>
        </div>
        <div class="empty-banner-actions">
          <button class="btn btn-sm btn-primary" type="button" data-action="add-event">${icon('plus')}添加课程</button>
          <button class="btn btn-sm btn-secondary" type="button" data-action="open-copy-week">${icon('copy')}复制课表</button>
        </div>
      </div>`;
  }

  function renderWeekView() {
    const week = store.getWeek(ui.weekIndex);
    const dates = U.weekDates(store.state.semester.startDate, ui.weekIndex);
    const today = U.isoDate(new Date());
    const layout = computeWeekLayout(week);
    const events = week.events.slice().sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      const ta = store.timesFor(week, a);
      const tb = store.timesFor(week, b);
      return (U.timeToMinutes(ta.start) || 0) - (U.timeToMinutes(tb.start) || 0);
    });
    const byCell = new Map();
    events.forEach((event) => {
      const key = `${event.day}:${event.periodId}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(event);
    });

    const headerCells = dates.map((date, day) => {
      const d = U.parseDate(date);
      const isWeekend = day >= 5;
      const isToday = date === today;
      return `
        <div class="day-head ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
          style="grid-row:1;grid-column:${day + 2}"
          data-action="add-day" data-day="${day}" title="在${U.WEEKDAYS[day]}添加课程">
          <span class="weekday-label">${U.WEEKDAYS[day]}</span>
          <span class="date-number">${d.getDate()}</span>
          <span class="day-month">${d.getMonth() + 1}月</span>
          <button class="day-add" type="button" tabindex="-1" aria-label="添加课程">${icon('plus')}</button>
        </div>`;
    }).join('');

    const bodyCells = week.periods.map((period, periodIndex) => {
      const duration = U.durationLabel(period.start, period.end);
      const timeCell = `
        <div class="time-cell" style="grid-row:${periodIndex + 2};grid-column:1">
          <span class="period-label">${esc(period.label)}</span>
          <span class="period-time">${period.start}–${period.end}</span>
          <span class="period-duration">${duration}</span>
        </div>`;
      const dayCells = dates.map((date, day) => {
        const cellEvents = byCell.get(`${day}:${period.id}`) || [];
        const isWeekend = day >= 5;
        const isToday = date === today;
        return `
          <div class="day-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''} ${cellEvents.length ? 'has-events' : ''}"
            style="grid-row:${periodIndex + 2};grid-column:${day + 2}"
            data-action="add-cell" data-day="${day}" data-period="${esc(period.id)}"
            aria-label="${U.WEEKDAYS[day]} ${esc(period.label)}，${cellEvents.length ? `${cellEvents.length} 个课程块` : '空白'}">
            <button class="cell-add" type="button" tabindex="-1" title="添加课程" aria-label="添加课程">${icon('plus')}</button>
          </div>`;
      }).join('');
      return timeCell + dayCells;
    }).join('');

    const cards = events.map((event) => eventCardMarkup(event, week, ui.weekIndex, layout)).join('');
    const noEvents = week.events.length === 0;
    return `
      <section class="week-view" aria-label="第 ${ui.weekIndex + 1} 周课表">
        ${renderDemoStrip()}
        ${noEvents ? renderEmptyBanner() : ''}
        <div class="timetable-card">
          <div class="timetable" style="--period-count:${week.periods.length}" role="grid" aria-label="${U.formatWeekRange(store.state.semester.startDate, ui.weekIndex)}">
            <div class="timetable-corner" style="grid-row:1;grid-column:1">Time</div>
            ${headerCells}
            ${bodyCells}
            ${cards}
          </div>
        </div>
      </section>`;
  }

  function overviewDayCell(week, weekIndex, dayIndex, date) {
    const today = U.isoDate(new Date());
    const isToday = date === today;
    const isWeekend = dayIndex >= 5;
    const events = week.events
      .filter((event) => event.day === dayIndex)
      .sort((a, b) => {
        const ta = store.timesFor(week, a);
        const tb = store.timesFor(week, b);
        return (U.timeToMinutes(ta.start) || 0) - (U.timeToMinutes(tb.start) || 0);
      });
    const visible = events.slice(0, 2);
    const pills = visible.map((event) => {
      const color = U.colorById(event.color);
      return `<div class="overview-pill" style="--course:${color.value}" title="${esc(event.name)}"><span>${esc(event.name)}</span></div>`;
    }).join('');
    return `
      <div class="overview-day ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
        data-action="open-week" data-week="${weekIndex}" title="${U.WEEKDAYS[dayIndex]} · ${events.length} 个课程块">
        ${pills || '<span class="overview-empty">—</span>'}
        ${events.length > 2 ? `<div class="overview-more">+${events.length - 2} 个课程块</div>` : ''}
      </div>`;
  }

  function renderOverviewView() {
    const currentIndex = store.currentWeekIndex();
    const stats = store.stats();
    const hours = Math.round((stats.totalMinutes / 60) * 10) / 10;
    const head = `
      <div class="overview-head">教学周</div>
      ${U.WEEKDAYS_SHORT.map((label) => `<div class="overview-head">周${label}</div>`).join('')}`;
    const rows = Array.from({ length: store.weekCount }, (_, weekIndex) => {
      const week = store.getWeek(weekIndex);
      const start = store.weekStart(weekIndex);
      const dates = U.weekDates(store.state.semester.startDate, weekIndex);
      return `
        <div class="overview-row ${weekIndex === currentIndex ? 'current' : ''}">
          <div class="overview-week-label" data-action="open-week" data-week="${weekIndex}" title="打开第 ${weekIndex + 1} 周">
            <span class="overview-week-num">第 ${weekIndex + 1} 周${weekIndex === currentIndex ? ' · 本周' : ''}</span>
            <span class="overview-week-date">${U.formatShortDate(start)}</span>
          </div>
          ${dates.map((date, day) => overviewDayCell(week, weekIndex, day, date)).join('')}
        </div>`;
    }).join('');

    return `
      <section class="overview-view" aria-label="学期总览">
        <div class="overview-summary">
          <div class="overview-summary-text">
            <strong>${esc(store.state.semester.name)}</strong>
            <span>${U.formatFullDate(store.state.semester.startDate)} 开学 · 当前进行至第 ${currentIndex + 1} 周</span>
          </div>
          <div class="overview-kpis">
            <div class="overview-kpi"><strong>${stats.courses}</strong><span>门课程</span></div>
            <div class="overview-kpi"><strong>${stats.sessions}</strong><span>个课程块</span></div>
            <div class="overview-kpi"><strong>${hours}</strong><span>总课时</span></div>
          </div>
        </div>
        <div class="overview-card">
          <div class="overview-grid">
            ${head}${rows}
          </div>
        </div>
      </section>`;
  }

  function renderView() {
    if (ui.view === 'overview') {
      el.viewHost.innerHTML = renderOverviewView();
    } else {
      el.viewHost.innerHTML = renderWeekView();
    }
  }

  function renderStatus() {
    const fileMode = store.mode === 'file';
    let saved;
    let warn = false;
    if (fileMode && store.saving) {
      saved = `正在写入 ${store.filePath}…`;
    } else if (fileMode && store.storageAvailable) {
      saved = store.lastSavedAt
        ? `已保存到 ${store.filePath} · ${U.formatSavedTime(store.lastSavedAt)}`
        : `已连接 ${store.filePath}`;
    } else if (fileMode || store.mode === 'file-error') {
      saved = store.mode === 'file-error' ? '数据文件读取失败' : '文件写入失败';
      warn = true;
    } else {
      saved = store.storageAvailable ? '临时模式 · 数据未写入本目录' : '临时存储不可用';
      warn = true;
    }
    const mod = modKey();
    el.statusbar.innerHTML = `
      <span class="status-left">
        <span class="status-dot ${warn ? 'warn' : ''}"></span>
        ${esc(saved)}
        <span class="status-sep"></span>
        <span>${esc(store.state.semester.name)}</span>
        <span class="status-sep"></span>
        <span>${store.weekCount} 个教学周</span>
      </span>
      <span class="status-right">
        <span><span class="kbd">←</span><span class="kbd">→</span> 切换周</span>
        <span><span class="kbd">${mod}</span><span class="kbd">K</span> 搜索</span>
        <span><span class="kbd">N</span> 新建</span>
        <span><span class="kbd">?</span> 快捷键</span>
      </span>`;
  }

  /* ------------------------------------------------------------------------
     Navigation & common actions
     ------------------------------------------------------------------------ */

  function setWeek(index, options) {
    const opts = { closeSidebar: true, ...(options || {}) };
    const next = Math.max(0, Math.min(store.weekCount - 1, Number(index)));
    const changed = next !== ui.weekIndex || ui.view !== 'week';
    ui.weekIndex = next;
    ui.view = 'week';
    ui.scrollReset = changed;
    if (opts.closeSidebar) closeSidebar();
    renderAll();
  }

  function setView(view) {
    if (view === ui.view) return;
    ui.view = view;
    ui.scrollReset = true;
    closeSidebar();
    renderAll();
  }

  function goToday() {
    setWeek(store.currentWeekIndex());
  }

  function changeWeek(delta) {
    const next = Math.max(0, Math.min(store.weekCount - 1, ui.weekIndex + delta));
    if (next !== ui.weekIndex) setWeek(next);
  }

  function toggleSidebar() {
    ui.sidebarOpen = !ui.sidebarOpen;
    el.sidebar.classList.toggle('open', ui.sidebarOpen);
    el.sidebarScrim.classList.toggle('visible', ui.sidebarOpen);
  }

  function closeSidebar() {
    if (!ui.sidebarOpen) return;
    ui.sidebarOpen = false;
    el.sidebar.classList.remove('open');
    el.sidebarScrim.classList.remove('visible');
  }

  function modKey() {
    return U.modKey();
  }

  /* ------------------------------------------------------------------------
     Toast & overlays
     ------------------------------------------------------------------------ */

  function toast(message, type, duration) {
    const kind = type || 'info';
    const icons = { success: 'check', error: 'alert', warn: 'alert', info: 'info' };
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.innerHTML = `<span class="toast-icon">${icon(icons[kind] || 'info')}</span><span>${esc(message)}</span>`;
    el.toastRoot.appendChild(node);
    const timeout = Math.max(1200, duration || 2800);
    setTimeout(() => {
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 220);
    }, timeout);
  }

  function openOverlay(markup, options) {
    const opts = { className: '', onClose: null, focus: null, ...(options || {}) };
    const node = document.createElement('div');
    node.className = `overlay ${opts.className}`.trim();
    node.innerHTML = markup;
    el.overlayRoot.appendChild(node);
    const entry = {
      el: node,
      onClose: opts.onClose,
      previousFocus: document.activeElement,
      closed: false,
    };
    overlays.push(entry);
    requestAnimationFrame(() => node.classList.add('is-open'));
    node.addEventListener('mousedown', (event) => {
      if (event.target === node && !node.classList.contains('inspector-overlay')) {
        closeOverlay(entry);
      }
    });
    node.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) {
        closeOverlay(entry);
      }
    });
    const focusTarget = () => {
      if (entry.closed) return;
      const selector = opts.focus || 'input:not([type="hidden"]), textarea, select, button';
      const target = node.querySelector(selector);
      if (target) {
        try {
          target.focus({ preventScroll: true });
          if (opts.selectText && target.select && target.tagName === 'INPUT' && target.type === 'text') target.select();
        } catch (error) {
          /* ignore focus errors */
        }
      }
    };
    setTimeout(focusTarget, 70);
    return entry;
  }

  function closeOverlay(entry) {
    if (!entry || entry.closed) return;
    entry.closed = true;
    const index = overlays.indexOf(entry);
    if (index >= 0) overlays.splice(index, 1);
    entry.el.classList.remove('is-open');
    try {
      if (entry.onClose) entry.onClose();
    } catch (error) {
      console.error(error);
    }
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    setTimeout(() => {
      entry.el.remove();
      if (!overlays.length && entry.previousFocus && entry.previousFocus.focus) {
        try {
          entry.previousFocus.focus({ preventScroll: true });
        } catch (error) {
          /* ignore */
        }
      }
    }, delay);
  }

  function closeTopOverlay() {
    if (!overlays.length) return false;
    closeOverlay(overlays[overlays.length - 1]);
    return true;
  }

  function closeAllOverlays() {
    overlays.slice().reverse().forEach((entry) => closeOverlay(entry));
  }

  function sheetMarkup(options) {
    const opts = {
      title: '',
      subtitle: '',
      iconName: 'info',
      body: '',
      footer: '',
      wide: false,
      narrow: false,
      className: '',
      id: `sheet_${U.uid('s')}`,
      ...options,
    };
    return `
      <div class="sheet ${opts.wide ? 'wide' : ''} ${opts.narrow ? 'narrow' : ''} ${opts.className}"
        role="dialog" aria-modal="true" aria-labelledby="${opts.id}">
        <div class="sheet-header">
          <div class="sheet-header-icon">${icon(opts.iconName)}</div>
          <div class="sheet-header-text">
            <h2 id="${opts.id}">${esc(opts.title)}</h2>
            ${opts.subtitle ? `<p>${esc(opts.subtitle)}</p>` : ''}
          </div>
          <button class="sheet-close" type="button" data-close aria-label="关闭">${icon('x')}</button>
        </div>
        <div class="sheet-body">${opts.body}</div>
        <div class="sheet-footer">${opts.footer}</div>
      </div>`;
  }

  function openSheet(options) {
    const node = openOverlay(sheetMarkup(options), {
      className: options.className || '',
      focus: options.focus,
      onClose: options.onClose,
    });
    return node;
  }

  function confirmDialog(options) {
    const opts = {
      title: '确认操作',
      message: '',
      confirmLabel: '确认',
      cancelLabel: '取消',
      danger: true,
      iconName: 'alert',
      ...options,
    };
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        closeOverlay(entry);
      };
      const entry = openOverlay(
        `<div class="sheet narrow" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
          <div class="sheet-header">
            <div class="sheet-header-icon" style="color:${opts.danger ? 'var(--red)' : 'var(--blue)'};background:${opts.danger ? 'rgba(255,69,58,.1)' : 'var(--blue-soft)'}">${icon(opts.iconName)}</div>
            <div class="sheet-header-text">
              <h2 id="confirmTitle">${esc(opts.title)}</h2>
            </div>
            <button class="sheet-close" type="button" data-confirm-cancel aria-label="关闭">${icon('x')}</button>
          </div>
          <div class="sheet-body"><p class="confirm-copy">${opts.message}</p></div>
          <div class="sheet-footer">
            <div class="footer-actions">
              <button class="btn btn-secondary" type="button" data-confirm-cancel>${esc(opts.cancelLabel)}</button>
              <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm-ok>${esc(opts.confirmLabel)}</button>
            </div>
          </div>
        </div>`,
        {
          focus: '[data-confirm-ok]',
          onClose: () => {
            if (!settled) {
              settled = true;
              resolve(false);
            }
          },
        }
      );
      entry.el.querySelectorAll('[data-confirm-cancel]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          finish(false);
        });
      });
      entry.el.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
    });
  }

  /* ------------------------------------------------------------------------
     Popover menus
     ------------------------------------------------------------------------ */

  function closePopover() {
    if (!popover) return;
    const node = popover.el;
    popover = null;
    node.remove();
  }

  function openPopover(anchor, markup, options) {
    const opts = { align: 'left', width: null, ...(options || {}) };
    closePopover();
    const node = document.createElement('div');
    node.className = 'popover';
    node.innerHTML = markup;
    if (opts.width) node.style.width = `${opts.width}px`;
    document.body.appendChild(node);
    popover = { el: node, anchorEl: anchor, align: opts.align };
    const rect = anchor.getBoundingClientRect();
    const menuRect = node.getBoundingClientRect();
    let left = opts.align === 'right' ? rect.right - menuRect.width : rect.left;
    let top = rect.bottom + 5;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuRect.height - 5);
    }
    left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, left));
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }

  function eventMenu(eventId, anchor) {
    const found = store.findEvent(eventId);
    if (!found) return;
    const { event } = found;
    openPopover(
      anchor,
      `<div class="popover-header"><strong>${esc(event.name)}</strong><span>${esc(event.code || '未填写课程编号')}</span></div>
       <button class="popover-item" type="button" data-action="edit-event" data-event-id="${esc(event.id)}">${icon('pencil')}编辑课程<span class="pop-shortcut">↵</span></button>
       <button class="popover-item" type="button" data-action="duplicate-event" data-event-id="${esc(event.id)}">${icon('copy')}创建副本</button>
       <button class="popover-item" type="button" data-action="copy-markdown" data-event-id="${esc(event.id)}">${icon('note')}复制 Obsidian 卡片</button>
       <div class="popover-sep"></div>
       <button class="popover-item danger" type="button" data-action="delete-event" data-event-id="${esc(event.id)}">${icon('trash')}删除课程</button>`,
      { align: 'right' }
    );
  }

  function openMoreMenu(anchor) {
    const demo = store.hasDemoCourses();
    openPopover(
      anchor,
      `<div class="popover-label">学期</div>
       <button class="popover-item" type="button" data-action="open-settings">${icon('settings')}学期与偏好设置</button>
       <button class="popover-item" type="button" data-action="open-period-settings">${icon('sliders')}节次与时间</button>
       <div class="popover-sep"></div>
       <div class="popover-label">数据</div>
       <button class="popover-item" type="button" data-action="export-ical">${icon('download')}导出 iCal 日历</button>
       <button class="popover-item" type="button" data-action="export-json">${icon('file')}导出 JSON 备份</button>
       <button class="popover-item" type="button" data-action="import-json">${icon('upload')}从备份恢复…</button>
       <div class="popover-sep"></div>
       <button class="popover-item" type="button" data-action="show-shortcuts">${icon('command')}键盘快捷键</button>
       ${demo ? `<button class="popover-item danger" type="button" data-action="clear-demo">${icon('trash')}清除示例课程</button>` : ''}`,
      { align: 'right', width: 224 }
    );
  }

  function openBatchMenu(anchor) {
    openPopover(
      anchor,
      `<div class="popover-header"><strong>批量设置</strong><span>让重复工作快一点</span></div>
       <button class="popover-item" type="button" data-action="open-period-settings">${icon('clock')}节次时间与批量应用…</button>
       <button class="popover-item" type="button" data-action="open-copy-week">${icon('copy')}复制本周到其他周…</button>
       <button class="popover-item" type="button" data-action="add-event-sync">${icon('plus')}新建并同步到多周…</button>
       <div class="popover-sep"></div>
       <button class="popover-item danger" type="button" data-action="clear-week">${icon('trash')}清空本周课程…</button>`,
      { align: 'right', width: 224 }
    );
  }

  /* ------------------------------------------------------------------------
     Event actions
     ------------------------------------------------------------------------ */

  function copyMarkdownFor(eventId) {
    const found = store.findEvent(eventId);
    if (!found) return;
    const { event, week, weekIndex } = found;
    const markdown = eventMarkdown(event, week, weekIndex);
    U.copyText(markdown).then((ok) => {
      toast(ok ? 'Obsidian 卡片已复制到剪贴板' : '复制失败，请手动选择批注内容', ok ? 'success' : 'error', 2600);
    });
  }

  function eventMarkdown(event, week, weekIndex) {
    const times = store.timesFor(week, event);
    const date = store.eventDate(weekIndex, event);
    const span = spanInfoFor(week, event).span;
    const frontmatter = [
      '---',
      `course: ${JSON.stringify(event.name)}`,
      `code: ${JSON.stringify(event.code || '')}`,
      `week: ${weekIndex + 1}`,
      `date: ${date}`,
      `time: ${JSON.stringify(`${times.start}-${times.end}`)}`,
      `span: ${span}`,
      `location: ${JSON.stringify(event.location || '')}`,
      `teacher: ${JSON.stringify(event.teacher || '')}`,
      'tags:',
      '  - course',
      '---',
    ].join('\n');
    return `${frontmatter}\n\n# ${event.name}\n\n- 课程编号：${event.code || '—'}\n- 时间：第 ${weekIndex + 1} 周 ${U.WEEKDAYS[event.day]} ${times.start}–${times.end}\n- 连续节次：${span} 节\n- 地点：${event.location || '—'}\n- 教师：${event.teacher || '—'}\n\n${event.note || ''}\n`;
  }

  async function deleteEvent(eventId) {
    const found = store.findEvent(eventId);
    if (!found) return;
    const ok = await confirmDialog({
      title: '删除这节课程？',
      message: `将从第 ${found.weekIndex + 1} 周删除 <strong>${esc(found.event.name)}</strong>。此操作无法撤销。`,
      confirmLabel: '删除课程',
    });
    if (!ok) return;
    const week = store.getWeek(found.weekIndex);
    week.events = week.events.filter((event) => event.id !== eventId);
    commit('课程已删除');
  }

  /* ------------------------------------------------------------------------
     Event handling
     ------------------------------------------------------------------------ */

  function cellFromPointer(event) {
    const direct = event.target && event.target.closest && event.target.closest('.day-cell');
    if (direct) return direct;
    if (typeof document.elementsFromPoint !== 'function' || !event.clientX) return null;
    const stack = document.elementsFromPoint(event.clientX, event.clientY);
    return stack.find((item) => item.classList && item.classList.contains('day-cell')) || null;
  }

  function bindEvents() {
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', closePopover);
    document.addEventListener('scroll', closePopover, true);
    el.sidebarScrim.addEventListener('click', closeSidebar);

    el.viewHost.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.event-card');
      if (!card) return;
      event.dataTransfer.setData('text/plain', card.dataset.eventId);
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    el.viewHost.addEventListener('dragend', (event) => {
      const card = event.target.closest('.event-card');
      if (card) card.classList.remove('dragging');
      el.viewHost.querySelectorAll('.day-cell.drag-over').forEach((cell) => cell.classList.remove('drag-over'));
    });
    el.viewHost.addEventListener('dragover', (event) => {
      if (!event.target.closest('.timetable')) return;
      const cell = cellFromPointer(event);
      if (!cell) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      el.viewHost.querySelectorAll('.day-cell.drag-over').forEach((item) => {
        if (item !== cell) item.classList.remove('drag-over');
      });
      cell.classList.add('drag-over');
    });
    el.viewHost.addEventListener('dragleave', (event) => {
      if (!event.relatedTarget || !el.viewHost.contains(event.relatedTarget)) {
        el.viewHost.querySelectorAll('.day-cell.drag-over').forEach((cell) => cell.classList.remove('drag-over'));
      }
    });
    el.viewHost.addEventListener('drop', (event) => {
      const cell = cellFromPointer(event);
      if (!cell) return;
      event.preventDefault();
      el.viewHost.querySelectorAll('.day-cell.drag-over').forEach((item) => item.classList.remove('drag-over'));
      const eventId = event.dataTransfer.getData('text/plain');
      const found = store.findEvent(eventId);
      if (!found) return;
      const day = Number(cell.dataset.day);
      const periodId = cell.dataset.period;
      if (found.event.day === day && found.event.periodId === periodId) return;
      found.event.day = day;
      found.event.periodId = periodId;
      store.touchEvent(found.event);
      commit(`已将「${found.event.name}」移到${U.WEEKDAYS[day]}`);
    });

    el.jsonInput.addEventListener('change', async () => {
      const file = el.jsonInput.files && el.jsonInput.files[0];
      el.jsonInput.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const ok = await confirmDialog({
          title: '从备份恢复？',
          message: `将用 <strong>${esc(file.name)}</strong> 中的数据替换当前全部课表。建议先导出一份当前备份。`,
          confirmLabel: '替换并恢复',
        });
        if (!ok) return;
        store.importJSON(text);
        const saved = await store.save();
        closeAllOverlays();
        ui.weekIndex = store.currentWeekIndex();
        ui.view = 'week';
        applyTheme();
        renderAll();
        toast(
          saved
            ? `已从备份恢复 · ${store.stats().sessions} 个课程块`
            : '备份已载入，但写入数据文件失败，请检查本地服务。',
          saved ? 'success' : 'error',
          4200
        );
      } catch (error) {
        toast(error.message || '恢复失败，请检查备份文件', 'error', 4500);
      }
    });
  }

  function handleClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (popover) {
      if (actionEl && popover.anchorEl === actionEl) {
        event.preventDefault();
        closePopover();
        return;
      }
      if (!event.target.closest('.popover')) {
        closePopover();
      }
    }
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action !== 'event-menu' && action !== 'open-more' && action !== 'batch-menu') {
      closePopover();
    }
    dispatchAction(action, actionEl, event);
  }

  function dispatchAction(action, target, event) {
    switch (action) {
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'close-sidebar':
        closeSidebar();
        break;
      case 'view-week':
        setView('week');
        break;
      case 'view-overview':
        setView('overview');
        break;
      case 'goto-week':
        setWeek(Number(target.dataset.week));
        break;
      case 'open-week':
        setWeek(Number(target.dataset.week));
        break;
      case 'prev-week':
        changeWeek(-1);
        break;
      case 'next-week':
        changeWeek(1);
        break;
      case 'today':
        goToday();
        break;
      case 'add-event':
        openInspector(null, { weekIndex: ui.weekIndex });
        break;
      case 'add-event-sync':
        openInspector(null, { weekIndex: ui.weekIndex, openSync: true });
        break;
      case 'add-day':
        openInspector(null, {
          weekIndex: ui.weekIndex,
          day: Number(target.dataset.day),
          periodId: store.getWeek(ui.weekIndex).periods[0].id,
        });
        break;
      case 'add-cell':
        openInspector(null, {
          weekIndex: ui.weekIndex,
          day: Number(target.dataset.day),
          periodId: target.dataset.period,
        });
        break;
      case 'edit-event':
        openInspector(target.dataset.eventId);
        break;
      case 'duplicate-event':
        duplicateEvent(target.dataset.eventId);
        break;
      case 'event-menu':
        eventMenu(target.dataset.eventId, target);
        break;
      case 'copy-markdown':
        copyMarkdownFor(target.dataset.eventId);
        break;
      case 'delete-event':
        deleteEvent(target.dataset.eventId);
        break;
      case 'open-search':
        openSearch();
        break;
      case 'open-settings':
        openSettings();
        break;
      case 'open-more':
        openMoreMenu(target);
        break;
      case 'batch-menu':
        openBatchMenu(target);
        break;
      case 'open-period-settings':
        openPeriodSettings();
        break;
      case 'open-copy-week':
        openCopyWeek();
        break;
      case 'open-import':
        openImport();
        break;
      case 'clear-week':
        clearWeek();
        break;
      case 'toggle-theme':
        cycleTheme();
        break;
      case 'clear-demo':
        clearDemo();
        break;
      case 'dismiss-demo':
        store.state.meta.demoNoticeDismissed = true;
        commit(null, { toast: false });
        break;
      case 'export-ical':
        exportICAL();
        break;
      case 'export-json':
        exportJSON();
        break;
      case 'import-json':
        el.jsonInput.click();
        break;
      case 'show-shortcuts':
        showShortcuts();
        break;
      case 'show-file-setup':
        showFileSetup();
        break;
      case 'retry-file-mode':
        retryFileMode();
        break;
      case 'retry-file-save':
        retryFileSave();
        break;
      case 'search-open':
        openSearchResult(target.dataset.week, target.dataset.eventId);
        break;
      default:
        break;
    }
  }

  function handleKeydown(event) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (!overlays.length) openSearch();
      return;
    }
    if (event.key === 'Escape') {
      if (popover) {
        closePopover();
        event.preventDefault();
        return;
      }
      if (overlays.length) {
        closeTopOverlay();
        event.preventDefault();
        return;
      }
      if (ui.sidebarOpen) {
        closeSidebar();
        event.preventDefault();
      }
      return;
    }
    if (overlays.length) {
      if (mod && event.key === 'Enter') {
        const inspector = overlays[overlays.length - 1].el.querySelector('.inspector');
        if (inspector) {
          const save = inspector.querySelector('[data-save-event]');
          if (save) {
            event.preventDefault();
            save.click();
          }
        }
      }
      return;
    }
    if (U.isEditableTarget(event.target)) return;
    const focusedCard = event.target.closest && event.target.closest('.event-card');
    if (focusedCard && (event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
      event.preventDefault();
      openInspector(focusedCard.dataset.eventId);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      changeWeek(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      changeWeek(1);
    } else if (event.key.toLowerCase() === 't') {
      event.preventDefault();
      goToday();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      openInspector(null, { weekIndex: ui.weekIndex });
    } else if (event.key === '/') {
      event.preventDefault();
      openSearch();
    } else if (event.key === '?') {
      event.preventDefault();
      showShortcuts();
    }
  }

  function duplicateEvent(eventId) {
    const found = store.findEvent(eventId);
    if (!found) return;
    openInspector(null, {
      weekIndex: found.weekIndex,
      day: found.event.day,
      periodId: found.event.periodId,
      prefill: found.event,
      duplicate: true,
    });
  }

  async function clearDemo() {
    const count = store.allEvents().filter(({ event }) => event.demo).length;
    if (!count) {
      toast('没有需要清除的示例课程', 'info');
      return;
    }
    const ok = await confirmDialog({
      title: '清除示例课程？',
      message: `将移除 <strong>${count}</strong> 个示例课程块，你自己添加的课程不会被删除。`,
      confirmLabel: '清除示例',
    });
    if (!ok) return;
    const removed = store.removeDemoCourses();
    commit(`已清除 ${removed} 个示例课程块`);
  }

  async function clearWeek() {
    const week = store.getWeek(ui.weekIndex);
    if (!week.events.length) {
      toast('本周已经是空的', 'info');
      return;
    }
    const ok = await confirmDialog({
      title: `清空第 ${ui.weekIndex + 1} 周？`,
      message: `将移除本周的 <strong>${week.events.length}</strong> 个课程块，节次时间设置会保留。`,
      confirmLabel: '清空本周',
    });
    if (!ok) return;
    week.events = [];
    commit('本周课程已清空');
  }

  function exportICAL() {
    if (!store.stats().sessions) {
      toast('课表还是空的，暂时没有可导出的日程', 'warn');
      return;
    }
    const text = ical.exportICS(store.state);
    const name = `${store.state.semester.name.replace(/[\\/:*?"<>|]/g, '')}-课表.ics`;
    U.downloadBlob(name, text, 'text/calendar;charset=utf-8');
    toast('iCal 日历已导出', 'success');
  }

  function exportJSON() {
    const name = `课序备份-${U.formatNumericDate(new Date())}.json`;
    U.downloadBlob(name, store.exportJSON(), 'application/json;charset=utf-8');
    toast('JSON 备份已导出', 'success');
  }

  function showFileSetup() {
    const tempCount = store.stats().sessions;
    const root = `
      <div class="setup-intro">
        <div class="setup-icon">${icon('file')}</div>
        <div>
          <strong>让课表真正保存到本目录</strong>
          <span>浏览器不能直接写文件夹，所以课序附带了一个只监听本机的轻量服务。它会把课程写入 <code>data/timetable.json</code>，不会经过 cookie，也不会上传网络。</span>
        </div>
      </div>
      <div class="setup-steps">
        <div class="setup-step">
          <span class="setup-step-num">1</span>
          <div><strong>关闭当前临时页面</strong><span>当前${tempCount ? `的 ${tempCount} 个课程块还在临时缓存中，建议先导出备份` : '页面还没有课程数据'}。</span></div>
        </div>
        <div class="setup-step">
          <span class="setup-step-num">2</span>
          <div><strong>运行启动脚本</strong><span>在课序目录执行下面的命令，脚本会启动本地服务并自动打开浏览器。</span></div>
        </div>
        <div class="setup-step">
          <span class="setup-step-num">3</span>
          <div><strong>使用本地地址</strong><span>之后固定访问 <code>http://127.0.0.1:8765</code>，每次修改都会自动写入文件。</span></div>
        </div>
      </div>
      <div class="command-box">
        <code id="startCommand">./start.sh</code>
        <button class="btn btn-sm btn-secondary" type="button" id="copyStartCommand">${icon('copy')}复制</button>
      </div>
      <div class="setup-file-row">
        <div>${icon('file')}<span>数据文件</span><code>data/timetable.json</code></div>
        <div>${icon('copy')}<span>上一版备份</span><code>data/timetable.backup.json</code></div>
      </div>
      <div class="import-note">${icon('info')}<span>${window.location.protocol === 'file:'
        ? '当前页面通过 file:// 打开，临时数据不会自动跨到本地地址。请先点「导出临时备份」，打开本地地址后再用「设置 → 数据 → 从备份恢复」导入。'
        : '如果目录里还没有数据文件，重试连接时会把当前临时课表迁移进去；如果已经有文件，则以目录里的文件为准。'} Windows 可双击 <code>start.bat</code>。</span></div>`;
    const isFileProtocol = window.location.protocol === 'file:';
    const primaryAction = isFileProtocol
      ? `<a class="btn btn-primary" href="http://127.0.0.1:8765" target="_blank" rel="noopener">${icon('external')}打开本地地址</a>`
      : `<button class="btn btn-primary" type="button" data-action="retry-file-mode">${icon('refresh')}重试连接</button>`;
    const entry = openSheet({
      title: '启用本地文件存储',
      subtitle: '一次设置，之后课表就保存在本目录。',
      iconName: 'file',
      wide: true,
      body: root,
      footer: `<div class="footer-note">${icon('info')} 请通过 start.sh 打开课序</div>
        <div class="footer-actions">
          <button class="btn btn-secondary" type="button" data-action="export-json">导出临时备份</button>
          ${primaryAction}
        </div>`,
      focus: '#copyStartCommand',
    });
    const copyButton = entry.el.querySelector('#copyStartCommand');
    copyButton.addEventListener('click', () => {
      U.copyText('./start.sh').then((ok) => {
        toast(ok ? '启动命令已复制' : '复制失败，请手动选择命令', ok ? 'success' : 'error');
      });
    });
  }

  async function retryFileMode() {
    const result = await store.connectFileMode();
    if (!result.ok) {
      toast(result.reason || '仍无法连接本地文件服务', 'error', 5600);
      return;
    }
    closeAllOverlays();
    store.applySavedTime();
    ui.weekIndex = Math.max(0, Math.min(store.weekCount - 1, ui.weekIndex));
    applyTheme();
    renderAll();
    toast(
      result.migrated
        ? '已把临时课表写入 data/timetable.json'
        : '已连接本地文件 data/timetable.json',
      'success',
      4400
    );
  }

  async function retryFileSave() {
    const ok = await store.save();
    renderAll();
    toast(
      ok ? '已重新写入 data/timetable.json' : '写入仍然失败，请检查本地服务与目录权限',
      ok ? 'success' : 'error',
      4200
    );
  }

  function showShortcuts() {
    const mod = modKey();
    openSheet({
      title: '键盘快捷键',
      subtitle: '少动鼠标，多留时间给正事。',
      iconName: 'command',
      narrow: true,
      footer: `<div class="footer-note">快捷键在输入框外生效</div><div class="footer-actions"><button class="btn btn-primary" type="button" data-close>知道了</button></div>`,
      body: `<div class="shortcut-list">
        <div class="shortcut-row"><span>搜索全部课程</span><span class="keys"><span class="kbd">${mod}</span><span class="kbd">K</span></span></div>
        <div class="shortcut-row"><span>新建课程</span><span class="keys"><span class="kbd">N</span></span></div>
        <div class="shortcut-row"><span>上一周 / 下一周</span><span class="keys"><span class="kbd">←</span><span class="kbd">→</span></span></div>
        <div class="shortcut-row"><span>回到本周</span><span class="keys"><span class="kbd">T</span></span></div>
        <div class="shortcut-row"><span>打开搜索</span><span class="keys"><span class="kbd">/</span></span></div>
        <div class="shortcut-row"><span>显示快捷键</span><span class="keys"><span class="kbd">?</span></span></div>
        <div class="shortcut-row"><span>保存正在编辑的课程</span><span class="keys"><span class="kbd">${mod}</span><span class="kbd">↵</span></span></div>
        <div class="shortcut-row"><span>关闭弹窗 / 菜单</span><span class="keys"><span class="kbd">Esc</span></span></div>
      </div>`,
    });
  }

  /* ------------------------------------------------------------------------
     Event inspector
     ------------------------------------------------------------------------ */

  function bestPeriodForTime(periods, start) {
    if (!periods.length) return null;
    const target = U.timeToMinutes(start);
    let best = periods[0];
    let bestScore = Infinity;
    periods.forEach((period) => {
      const a = U.timeToMinutes(period.start);
      const b = U.timeToMinutes(period.end);
      if (target >= a && target <= b) {
        best = period;
        bestScore = 0;
        return;
      }
      const distance = target < a ? a - target : target - b;
      if (distance < bestScore) {
        bestScore = distance;
        best = period;
      }
    });
    return best;
  }

  function openInspector(eventId, options) {
    const opts = { weekIndex: ui.weekIndex, day: null, periodId: null, prefill: null, duplicate: false, openSync: false, ...(options || {}) };
    const found = eventId ? store.findEvent(eventId) : null;
    const weekIndex = found ? found.weekIndex : Math.max(0, Math.min(store.weekCount - 1, Number(opts.weekIndex)));
    const week = store.getWeek(weekIndex);
    if (!week.periods.length) {
      toast('请先设置至少一个节次时间', 'warn');
      return;
    }
    const isEditing = Boolean(found) && !opts.duplicate;
    const source = found ? found.event : opts.prefill;
    const copy = source ? JSON.parse(JSON.stringify(source)) : null;

    let day = found ? found.event.day : opts.day;
    if (day == null) {
      if (weekIndex === store.currentWeekIndex()) {
        const today = new Date();
        day = (today.getDay() + 6) % 7;
      } else {
        day = 0;
      }
    }
    day = Math.max(0, Math.min(6, Number(day)));
    let periodId = found ? found.event.periodId : opts.periodId;
    if (!week.periods.some((period) => period.id === periodId)) periodId = week.periods[0].id;
    const period = store.getPeriod(week, periodId);

    let initialCustom = copy ? Boolean(copy.customTime) : false;
    let initialStart = copy && copy.customTime ? copy.start : period.start;
    let initialEnd = copy && copy.customTime ? copy.end : period.end;
    if (U.timeToMinutes(initialEnd) <= U.timeToMinutes(initialStart)) {
      initialEnd = U.addMinutes(initialStart, 45);
    }
    const selectedColor = copy && copy.color ? copy.color : 'blue';
    const title = opts.duplicate ? '创建课程副本' : isEditing ? '编辑课程' : '新建课程';
    const subtitle = `第 ${weekIndex + 1} 周 · ${U.WEEKDAYS[day]} · ${U.formatMonthDay(store.weekDate(weekIndex, day))}`;

    const dayOptions = U.WEEKDAYS.map((label, index) => `<option value="${index}" ${index === day ? 'selected' : ''}>${label}</option>`).join('');
    const periodOptions = week.periods.map((item) => `<option value="${esc(item.id)}" ${item.id === periodId ? 'selected' : ''}>${esc(item.label)} · ${item.start}–${item.end}</option>`).join('');
    const colorSwatches = U.COLORS.map((color) => `
      <button class="color-swatch ${color.id === selectedColor ? 'selected' : ''}" type="button"
        style="--swatch:${color.value}" data-color="${color.id}" aria-label="${color.name}" title="${color.name}"></button>`).join('');
    const otherWeeks = Array.from({ length: store.weekCount }, (_, index) => index).filter((index) => index !== weekIndex);
    const syncWeeks = otherWeeks.length
      ? `<details class="advanced" id="syncWeeksDetails" ${opts.openSync ? 'open' : ''}>
           <summary>${icon('copy')}保存时同步到其他周<span class="summary-chevron">${icon('chevronDown')}</span></summary>
           <div class="details-body">
             <div class="sync-week-grid">
               ${otherWeeks.map((index) => `
                 <label class="week-toggle">
                   <input type="checkbox" name="syncWeek" value="${index}">
                   <span title="第 ${index + 1} 周">${index + 1}</span>
                 </label>`).join('')}
             </div>
             <div class="hint" style="margin-top:7px">勾选后，保存时会把这份课程复制到所选周。适合一周多次的课程。</div>
           </div>
         </details>`
      : '';

    const markup = `
      <div class="inspector-scrim" data-close></div>
      <aside class="inspector" role="dialog" aria-modal="true" aria-labelledby="inspectorTitle">
        <div class="inspector-head">
          <div class="sheet-header-icon">${icon(isEditing ? 'pencil' : 'plus')}</div>
          <div class="inspector-head-text">
            <h2 id="inspectorTitle">${title}</h2>
            <p id="inspectorSubtitle">${esc(subtitle)}</p>
          </div>
          <button class="sheet-close" type="button" data-close aria-label="关闭">${icon('x')}</button>
        </div>
        <div class="inspector-body">
          <div class="inspector-preview" id="inspectorPreview" style="--course:${U.colorById(selectedColor).value}">
            <span class="preview-code" id="previewCode">${esc(copy && copy.code ? copy.code : 'COURSE-CODE')}</span>
            <span class="preview-name" id="previewName">${esc(copy && copy.name ? copy.name : '未命名课程')}</span>
            <div class="preview-meta" id="previewMeta"></div>
          </div>

          <form class="inspector-form" id="eventForm" autocomplete="off">
            <div class="field">
              <label for="evName">课程名称 <span class="optional">必填</span></label>
              <input class="input" id="evName" type="text" maxlength="120" placeholder="例如：高等数学" value="${esc(copy ? copy.name : '')}">
            </div>
            <div class="field">
              <label for="evCode">课程编号</label>
              <input class="input mono" id="evCode" type="text" maxlength="40" placeholder="例如：MATH-201" value="${esc(copy ? copy.code : '')}">
            </div>
            <div class="field-row">
              <div class="field">
                <label for="evDay">星期</label>
                <select class="select" id="evDay">${dayOptions}</select>
              </div>
              <div class="field">
                <label for="evPeriod">节次</label>
                <select class="select" id="evPeriod">${periodOptions}</select>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="evLocation">地点 <span class="optional">可选</span></label>
                <input class="input" id="evLocation" type="text" maxlength="120" placeholder="教学楼 / 教室" value="${esc(copy ? copy.location : '')}">
              </div>
              <div class="field">
                <label for="evTeacher">教师 <span class="optional">可选</span></label>
                <input class="input" id="evTeacher" type="text" maxlength="80" placeholder="教师姓名" value="${esc(copy ? copy.teacher : '')}">
              </div>
            </div>
            <div class="field">
              <span class="field-label">课程颜色</span>
              <div class="color-picker" id="colorPicker">${colorSwatches}</div>
            </div>

            <div class="custom-time-box">
              <div class="switch-row">
                <div class="switch-row-text">
                  <strong>自定义上课时间</strong>
                  <span>默认跟随所选节次，打开后可单独指定起止时间</span>
                </div>
                <label class="switch">
                  <input type="checkbox" id="evCustomTime" ${initialCustom ? 'checked' : ''}>
                  <span class="switch-track"></span>
                </label>
              </div>
              <div class="time-fields" id="evTimeFields" style="margin-top:9px" ${initialCustom ? '' : 'hidden'}>
                <input class="input" id="evStart" type="time" value="${initialStart}">
                <span class="time-dash">—</span>
                <input class="input" id="evEnd" type="time" value="${initialEnd}">
                <span class="duration-badge" id="evDuration"></span>
              </div>
              <div class="field-hint" id="evTimeHint" style="margin-top:6px" ${initialCustom ? '' : 'hidden'}>开始时间决定所在节次，结束时间自动决定连续占几节</div>
              <div class="span-quick-row">
                <span class="span-quick-label">连堂</span>
                <div class="span-quick" id="evSpanQuick" role="group" aria-label="连续节次">
                  ${[1, 2, 3, 4].map((count) => `<button type="button" data-span-count="${count}">${count} 节</button>`).join('')}
                </div>
                <span class="span-hint" id="evSpanHint">1 个节次</span>
              </div>
            </div>

            <div class="field">
              <label for="evNote">批注 <span class="optional">支持 Markdown / Obsidian 双链</span></label>
              <textarea class="textarea" id="evNote" rows="5" maxlength="12000" placeholder="这节课要带什么、做什么？&#10;例如：完成实验二 · [[操作系统-实验笔记]]">${esc(copy ? copy.note : '')}</textarea>
              <div class="note-tools">
                <span class="hint">批注会随 JSON 备份保存，也可一键复制为 Obsidian 卡片。</span>
                <span class="note-count" id="noteCount">0</span>
                <button class="link-btn" type="button" id="copyDraftMarkdown">复制为卡片</button>
              </div>
            </div>

            ${syncWeeks}
          </form>
        </div>
        <div class="inspector-footer">
          ${isEditing ? `<button class="icon-btn btn-danger-soft" type="button" id="deleteEventBtn" title="删除课程">${icon('trash')}</button>` : ''}
          <div class="footer-actions">
            <button class="btn btn-secondary" type="button" data-close>取消</button>
            <button class="btn btn-primary" type="button" data-save-event>${icon('check')}${isEditing ? '保存' : '添加课程'}</button>
          </div>
        </div>
      </aside>`;

    const entry = openOverlay(markup, {
      className: 'inspector-overlay',
      focus: '#evName',
    });
    const root = entry.el;
    const nameInput = root.querySelector('#evName');
    const codeInput = root.querySelector('#evCode');
    const daySelect = root.querySelector('#evDay');
    const periodSelect = root.querySelector('#evPeriod');
    const locationInput = root.querySelector('#evLocation');
    const teacherInput = root.querySelector('#evTeacher');
    const noteInput = root.querySelector('#evNote');
    const customToggle = root.querySelector('#evCustomTime');
    const startInput = root.querySelector('#evStart');
    const endInput = root.querySelector('#evEnd');
    const timeFields = root.querySelector('#evTimeFields');
    const durationBadge = root.querySelector('#evDuration');
    const spanQuick = root.querySelector('#evSpanQuick');
    const spanHint = root.querySelector('#evSpanHint');
    const spanButtons = Array.from(root.querySelectorAll('[data-span-count]'));
    const noteCount = root.querySelector('#noteCount');
    const preview = root.querySelector('#inspectorPreview');
    const previewName = root.querySelector('#previewName');
    const previewCode = root.querySelector('#previewCode');
    const previewMeta = root.querySelector('#previewMeta');
    const subtitleEl = root.querySelector('#inspectorSubtitle');
    let color = selectedColor;

    function currentPeriod() {
      return week.periods.find((item) => item.id === periodSelect.value) || week.periods[0];
    }

    function effectiveTimes() {
      if (customToggle.checked) {
        return { start: startInput.value || currentPeriod().start, end: endInput.value || currentPeriod().end };
      }
      const item = currentPeriod();
      return { start: item.start, end: item.end };
    }

    function updateDuration() {
      const times = effectiveTimes();
      durationBadge.textContent = U.durationLabel(times.start, times.end);
      const invalid = customToggle.checked && U.timeToMinutes(times.end) <= U.timeToMinutes(times.start);
      durationBadge.style.color = invalid ? 'var(--red)' : '';
      return !invalid;
    }

    function draftSpan() {
      const index = week.periods.findIndex((item) => item.id === periodSelect.value);
      if (index < 0 || !customToggle.checked) return 1;
      const endMinute = U.timeToMinutes(endInput.value || currentPeriod().end);
      if (endMinute == null) return 1;
      let count = 1;
      for (let next = index + 1; next < week.periods.length; next += 1) {
        const nextStart = U.timeToMinutes(week.periods[next].start);
        if (nextStart != null && nextStart < endMinute) count += 1;
        else break;
      }
      return count;
    }

    function updateSpanControls() {
      const index = week.periods.findIndex((item) => item.id === periodSelect.value);
      const available = index >= 0 ? week.periods.length - index : 1;
      const span = draftSpan();
      spanHint.textContent = span > 1 ? `连续 ${span} 节` : '1 个节次';
      spanHint.classList.toggle('multi', span > 1);
      spanButtons.forEach((button) => {
        const count = Number(button.dataset.spanCount);
        button.disabled = count > available;
        button.classList.toggle('active', count === span);
      });
    }

    function updatePreview() {
      const times = effectiveTimes();
      const name = nameInput.value.trim() || '未命名课程';
      const code = codeInput.value.trim();
      const location = locationInput.value.trim();
      const teacher = teacherInput.value.trim();
      const span = draftSpan();
      preview.style.setProperty('--course', U.colorById(color).value);
      previewName.textContent = name;
      previewCode.textContent = code || 'COURSE-CODE';
      previewMeta.innerHTML = `
        <span>${icon('clock')}${times.start}–${times.end}</span>
        ${span > 1 ? `<span>${icon('grid')}连续 ${span} 节</span>` : ''}
        ${location ? `<span>${icon('mapPin')}${esc(location)}</span>` : ''}
        ${teacher ? `<span>${icon('user')}${esc(teacher)}</span>` : ''}`;
      noteCount.textContent = String(noteInput.value.length);
      updateDuration();
      updateSpanControls();
      const day = Number(daySelect.value);
      subtitleEl.textContent = `第 ${weekIndex + 1} 周 · ${U.WEEKDAYS[day]} · ${U.formatMonthDay(store.weekDate(weekIndex, day))}`;
    }

    root.querySelectorAll('[data-color]').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        color = swatch.dataset.color;
        root.querySelectorAll('[data-color]').forEach((item) => item.classList.toggle('selected', item === swatch));
        updatePreview();
      });
    });

    customToggle.addEventListener('change', () => {
      if (customToggle.checked) {
        const item = currentPeriod();
        if (!startInput.value) startInput.value = item.start;
        if (!endInput.value) endInput.value = item.end;
        if (U.timeToMinutes(endInput.value) <= U.timeToMinutes(startInput.value)) {
          endInput.value = U.addMinutes(startInput.value, 45);
        }
        timeFields.hidden = false;
        root.querySelector('#evTimeHint').hidden = false;
      } else {
        timeFields.hidden = true;
        root.querySelector('#evTimeHint').hidden = true;
      }
      updatePreview();
    });

    spanQuick.addEventListener('click', (event) => {
      const button = event.target.closest('[data-span-count]');
      if (!button || button.disabled) return;
      const count = Number(button.dataset.spanCount);
      const index = week.periods.findIndex((item) => item.id === periodSelect.value);
      if (index < 0 || index + count > week.periods.length) return;
      const wasCustom = customToggle.checked;
      if (!wasCustom) {
        customToggle.checked = true;
        timeFields.hidden = false;
        root.querySelector('#evTimeHint').hidden = false;
        startInput.value = week.periods[index].start;
      }
      if (!startInput.value) startInput.value = week.periods[index].start;
      endInput.value = week.periods[index + count - 1].end;
      updatePreview();
    });

    daySelect.addEventListener('change', updatePreview);
    periodSelect.addEventListener('change', () => {
      if (!customToggle.checked) {
        const item = currentPeriod();
        startInput.value = item.start;
        endInput.value = item.end;
      }
      updatePreview();
    });

    [nameInput, codeInput, locationInput, teacherInput, noteInput, startInput, endInput].forEach((input) => {
      input.addEventListener('input', () => {
        if (input === startInput && customToggle.checked && startInput.value) {
          const best = bestPeriodForTime(week.periods, startInput.value);
          if (best) periodSelect.value = best.id;
        }
        updatePreview();
      });
    });

    root.querySelector('#copyDraftMarkdown').addEventListener('click', () => {
      const times = effectiveTimes();
      let draftPeriodId = periodSelect.value;
      if (customToggle.checked) {
        const best = bestPeriodForTime(week.periods, times.start);
        if (best) draftPeriodId = best.id;
      }
      const draftEvent = {
        ...(copy || {}),
        id: copy ? copy.id : 'draft',
        name: nameInput.value.trim() || '未命名课程',
        code: codeInput.value.trim(),
        day: Number(daySelect.value),
        periodId: draftPeriodId,
        color,
        location: locationInput.value.trim(),
        teacher: teacherInput.value.trim(),
        note: noteInput.value,
        customTime: customToggle.checked,
        start: times.start,
        end: times.end,
      };
      U.copyText(eventMarkdown(draftEvent, week, weekIndex)).then((ok) => {
        toast(ok ? 'Obsidian 卡片已复制' : '复制失败', ok ? 'success' : 'error');
      });
    });

    function save() {
      const name = nameInput.value.trim();
      if (!name) {
        toast('请先填写课程名称', 'warn');
        nameInput.focus();
        return;
      }
      const custom = customToggle.checked;
      let start;
      let end;
      if (custom) {
        if (!startInput.value || !endInput.value) {
          toast('请填写自定义的开始和结束时间', 'warn');
          return;
        }
        if (U.timeToMinutes(endInput.value) <= U.timeToMinutes(startInput.value)) {
          toast('结束时间需要晚于开始时间', 'warn');
          endInput.focus();
          return;
        }
        start = startInput.value;
        end = endInput.value;
      } else {
        const item = currentPeriod();
        start = item.start;
        end = item.end;
      }
      let resolvedPeriodId = periodSelect.value;
      if (custom) {
        const best = bestPeriodForTime(week.periods, start);
        if (best) resolvedPeriodId = best.id;
      }
      const now = new Date().toISOString();
      const existing = isEditing ? found.event : null;
      const eventData = {
        id: existing ? existing.id : U.uid('ev'),
        uid: existing ? existing.uid : `${U.uid('uid')}@kexu.local`,
        sourceUid: existing ? existing.sourceUid || '' : '',
        name,
        code: codeInput.value.trim(),
        day: Number(daySelect.value),
        periodId: resolvedPeriodId,
        color,
        location: locationInput.value.trim(),
        teacher: teacherInput.value.trim(),
        note: noteInput.value,
        customTime: custom,
        start,
        end,
        demo: false,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };

      if (existing) {
        Object.assign(existing, eventData);
      } else {
        week.events.push(eventData);
      }

      const syncTargets = Array.from(root.querySelectorAll('input[name="syncWeek"]:checked'))
        .map((input) => Number(input.value))
        .filter((index) => index >= 0 && index < store.weekCount && index !== weekIndex);
      syncTargets.forEach((targetIndex) => {
        const targetWeek = store.getWeek(targetIndex);
        const copyEvent = JSON.parse(JSON.stringify(eventData));
        copyEvent.id = U.uid('ev');
        copyEvent.uid = `${U.uid('uid')}@kexu.local`;
        copyEvent.sourceUid = '';
        copyEvent.demo = false;
        copyEvent.createdAt = now;
        copyEvent.updatedAt = now;
        if (!targetWeek.periods.some((item) => item.id === copyEvent.periodId)) {
          const index = week.periods.findIndex((item) => item.id === eventData.periodId);
          const targetPeriod = targetWeek.periods[Math.min(Math.max(index, 0), targetWeek.periods.length - 1)];
          copyEvent.periodId = targetPeriod ? targetPeriod.id : targetWeek.periods[0].id;
        }
        targetWeek.events.push(copyEvent);
      });

      const message = syncTargets.length
        ? `已保存并同步到 ${syncTargets.length + 1} 周`
        : existing
          ? '课程已保存'
          : '课程已添加';
      closeOverlay(entry);
      commit(message);
    }

    root.querySelector('[data-save-event]').addEventListener('click', save);
    root.querySelector('#eventForm').addEventListener('submit', (event) => {
      event.preventDefault();
      save();
    });

    const deleteBtn = root.querySelector('#deleteEventBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: '删除这节课程？',
          message: `将从第 ${weekIndex + 1} 周删除 <strong>${esc(nameInput.value.trim() || (copy && copy.name) || '这节课程')}</strong>。`,
          confirmLabel: '删除课程',
        });
        if (!ok) return;
        closeOverlay(entry);
        week.events = week.events.filter((item) => item.id !== found.event.id);
        commit('课程已删除');
      });
    }

    updatePreview();
    if (opts.duplicate) nameInput.focus();
  }

  /* ------------------------------------------------------------------------
     Search palette
     ------------------------------------------------------------------------ */

  function searchAll(query) {
    const normalized = query.trim().toLowerCase();
    const currentIndex = ui.weekIndex;
    if (!normalized) {
      return store
        .getWeek(currentIndex)
        .events.map((event) => ({ event, weekIndex: currentIndex }))
        .sort((a, b) => {
          if (a.event.day !== b.event.day) return a.event.day - b.event.day;
          return (U.timeToMinutes(a.event.start) || 0) - (U.timeToMinutes(b.event.start) || 0);
        });
    }
    return store
      .allEvents()
      .filter(({ event, weekIndex }) => {
        const week = store.getWeek(weekIndex);
        const times = store.timesFor(week, event);
        const haystack = [
          event.name,
          event.code,
          event.note,
          event.location,
          event.teacher,
          `${weekIndex + 1}`,
          U.WEEKDAYS[event.day],
          times.start,
          times.end,
        ].join(' ').toLowerCase();
        return haystack.includes(normalized);
      })
      .sort((a, b) => a.weekIndex - b.weekIndex || a.event.day - b.event.day)
      .map(({ event, weekIndex }) => ({ event, weekIndex }));
  }

  function openSearch() {
    if (overlays.length) return;
    searchState = { query: '', selected: 0, results: [] };
    const entry = openOverlay(
      `<div class="palette" role="dialog" aria-modal="true" aria-label="搜索课程">
        <div class="palette-input-row">
          ${icon('search')}
          <input class="palette-input" id="paletteInput" type="text" placeholder="搜索课程、编号、地点或批注…" spellcheck="false" autocomplete="off">
          <span class="kbd">Esc</span>
        </div>
        <div class="palette-results" id="paletteResults"></div>
        <div class="palette-footer">
          <span><span class="kbd">↑</span><span class="kbd">↓</span>选择</span>
          <span><span class="kbd">↵</span>打开</span>
          <span><span class="kbd">Esc</span>关闭</span>
          <span style="margin-left:auto" id="paletteCount"></span>
        </div>
      </div>`,
      {
        className: 'palette-overlay',
        focus: '#paletteInput',
        onClose: () => {
          searchState = null;
        },
      }
    );
    const input = entry.el.querySelector('#paletteInput');
    const resultsEl = entry.el.querySelector('#paletteResults');
    const countEl = entry.el.querySelector('#paletteCount');

    function renderResults() {
      if (!searchState) return;
      const results = searchAll(searchState.query).slice(0, 60);
      searchState.results = results;
      if (searchState.selected >= results.length) searchState.selected = Math.max(0, results.length - 1);
      countEl.textContent = results.length ? `${results.length} 个结果` : '';
      if (!results.length) {
        resultsEl.innerHTML = `
          <div class="palette-empty">
            ${icon('search')}
            <strong>${searchState.query ? '没有找到匹配的课程' : '这一周还没有课程'}</strong>
            <span>${searchState.query ? '试试课程编号、地点或批注里的关键词' : '换个关键词搜索整个学期，或先新建一节课'}</span>
          </div>`;
        return;
      }
      resultsEl.innerHTML = `
        <div class="palette-group-label">${searchState.query ? '搜索结果' : '本周课程'}</div>
        ${results.map(({ event, weekIndex }, index) => {
          const week = store.getWeek(weekIndex);
          const times = store.timesFor(week, event);
          const color = U.colorById(event.color);
          return `<button class="palette-item ${index === searchState.selected ? 'selected' : ''}" type="button"
            data-action="search-open" data-week="${weekIndex}" data-event-id="${esc(event.id)}">
            <span class="palette-color" style="--course:${color.value}"></span>
            <span class="palette-item-body">
              <span class="palette-item-title"><span>${esc(event.name)}</span>${event.code ? `<em>${esc(event.code)}</em>` : ''}</span>
              <span class="palette-item-meta">${U.WEEKDAYS[event.day]} · ${times.start}–${times.end}${event.location ? ` · ${esc(event.location)}` : ''}${event.note ? ' · 有批注' : ''}</span>
            </span>
            <span class="palette-item-week">第 ${weekIndex + 1} 周</span>
          </button>`;
        }).join('')}`;
      const selected = resultsEl.querySelector('.palette-item.selected');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', () => {
      searchState.query = input.value;
      searchState.selected = 0;
      renderResults();
    });
    input.addEventListener('keydown', (event) => {
      if (!searchState) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        searchState.selected = Math.min(searchState.results.length - 1, searchState.selected + 1);
        renderResults();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        searchState.selected = Math.max(0, searchState.selected - 1);
        renderResults();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const item = searchState.results[searchState.selected];
        if (item) openSearchResult(item.weekIndex, item.event.id);
      }
    });
    renderResults();
  }

  function openSearchResult(weekIndex, eventId) {
    if (!eventId) return;
    if (overlays.length) closeTopOverlay();
    setWeek(weekIndex, { closeSidebar: true });
    setTimeout(() => openInspector(eventId), 70);
  }


  /* ------------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------------ */

  function openSettings(initialTab) {
    const tabs = [
      { id: 'semester', label: '学期' },
      { id: 'appearance', label: '外观' },
      { id: 'data', label: '数据' },
      { id: 'shortcuts', label: '快捷键' },
    ];
    const activeTab = tabs.some((tab) => tab.id === initialTab) ? initialTab : 'semester';
    const theme = store.state.preferences.theme || 'auto';
    const bytes = new Blob([JSON.stringify(store.state)]).size;
    const sizeLabel = bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const mod = modKey();
    const stats = store.stats();
    const demoCount = store.allEvents().filter(({ event }) => event.demo).length;
    const fileMode = store.mode === 'file';
    const storageLabel = fileMode
      ? store.storageAvailable ? '本地文件' : '写入失败'
      : store.mode === 'file-error' ? '读取失败' : '临时模式';
    const storageDetail = fileMode
      ? `${store.filePath} · 每次修改自动写入`
      : '尚未写入本目录 · 请运行 ./start.sh 启用文件存储';
    const shortcutRows = [
      ['搜索全部课程', [mod, 'K']],
      ['新建课程', ['N']],
      ['上一周 / 下一周', ['←', '→']],
      ['回到本周', ['T']],
      ['打开搜索', ['/']],
      ['保存正在编辑的课程', [mod, '↵']],
      ['关闭弹窗 / 菜单', ['Esc']],
      ['显示快捷键', ['?']],
    ];

    const body = `
      <div class="settings-tabs" role="tablist">
        ${tabs.map((tab) => `<button class="settings-tab ${tab.id === activeTab ? 'active' : ''}" type="button" role="tab" data-settings-tab="${tab.id}">${tab.label}</button>`).join('')}
      </div>

      <div class="settings-pane ${activeTab === 'semester' ? 'active' : ''}" data-settings-pane="semester">
        <div class="sheet-section">
          <div class="field">
            <label for="setSemesterName">学期名称</label>
            <input class="input" id="setSemesterName" type="text" maxlength="60" value="${esc(store.state.semester.name)}">
          </div>
          <div class="field-row" style="margin-top:10px">
            <div class="field">
              <label for="setSemesterStart">开学日期（周一）</label>
              <input class="input" id="setSemesterStart" type="date" value="${store.state.semester.startDate}">
              <span class="field-hint">第 1 教学周的周一，调整后会移动所有课程日期。</span>
            </div>
            <div class="field">
              <label for="setSemesterWeeks">教学周数</label>
              <input class="input" id="setSemesterWeeks" type="number" min="1" max="40" value="${store.weekCount}">
              <span class="field-hint">支持 1–40 周，增减周不会影响已有课程的周内数据。</span>
            </div>
          </div>
          <div class="preset-row">
            <button class="preset-chip" type="button" id="startThisMonday">把本周设为第 1 周</button>
            <button class="preset-chip" type="button" id="startFourWeeksAgo">从 4 周前开始（当前为第 5 周）</button>
          </div>
          <div class="period-tools" style="margin-top:12px">
            <button class="btn btn-primary btn-sm" type="button" id="saveSemester">${icon('check')}保存学期设置</button>
            <span class="hint">修改会自动写入本机，无需额外确认。</span>
          </div>
        </div>
      </div>

      <div class="settings-pane ${activeTab === 'appearance' ? 'active' : ''}" data-settings-pane="appearance">
        <div class="sheet-section">
          <div class="sheet-section-title">${icon('sun')}外观主题</div>
          <div class="theme-options">
            <label class="theme-option">
              <input type="radio" name="themeChoice" value="auto" ${theme === 'auto' ? 'checked' : ''}>
              <span class="theme-option-inner">
                <span class="theme-swatch"><i class="auto-a"></i><i class="auto-b"></i></span>
                <strong>跟随系统</strong>
              </span>
            </label>
            <label class="theme-option">
              <input type="radio" name="themeChoice" value="light" ${theme === 'light' ? 'checked' : ''}>
              <span class="theme-option-inner">
                <span class="theme-swatch"><i class="light-a"></i><i class="light-b"></i></span>
                <strong>浅色</strong>
              </span>
            </label>
            <label class="theme-option">
              <input type="radio" name="themeChoice" value="dark" ${theme === 'dark' ? 'checked' : ''}>
              <span class="theme-option-inner">
                <span class="theme-swatch"><i class="dark-a"></i><i class="dark-b"></i></span>
                <strong>深色</strong>
              </span>
            </label>
          </div>
          <div class="scope-note" style="margin-top:12px">${icon('info')}外观偏好会保存在本机。跟随系统时，会随 macOS 的浅色 / 深色模式自动切换。</div>
        </div>
      </div>

      <div class="settings-pane ${activeTab === 'data' ? 'active' : ''}" data-settings-pane="data">
        <div class="sheet-section">
          <div class="sheet-section-title">${icon('file')}本地数据 <span class="sheet-section-sub">${sizeLabel} · ${stats.sessions} 个课程块</span></div>
          <div class="storage-location ${fileMode && store.storageAvailable ? 'ok' : 'warn'}" title="${esc(store.absolutePath || storageDetail)}">
            <div class="storage-location-icon">${icon(fileMode ? 'file' : 'alert')}</div>
            <div class="storage-location-text"><strong>${storageLabel}</strong><span>${esc(storageDetail)}</span></div>
            <span class="chip ${fileMode && store.storageAvailable ? 'blue' : 'warm'}">${fileMode && store.storageAvailable ? '文件模式' : '未写入目录'}</span>
          </div>
          <div class="data-actions">
            <button class="data-action" type="button" data-action="export-json">
              ${icon('download')}<span><strong>导出 JSON 备份</strong><span>包含全部周、节次与批注</span></span>
            </button>
            <button class="data-action" type="button" data-action="import-json">
              ${icon('upload')}<span><strong>从备份恢复</strong><span>替换当前全部数据</span></span>
            </button>
            <button class="data-action" type="button" data-action="export-ical">
              ${icon('calendar')}<span><strong>导出 iCal</strong><span>导入日历或其他课表应用</span></span>
            </button>
            <button class="data-action" type="button" data-action="open-import">
              ${icon('download')}<span><strong>导入 iCal</strong><span>从 .ics 文件批量建立课表</span></span>
            </button>
            ${!fileMode ? `<button class="data-action" type="button" data-action="show-file-setup">
              ${icon('settings')}<span><strong>启用本地文件存储</strong><span>把课程写入本目录的 data/ 文件夹</span></span>
            </button>` : ''}
          </div>
          <div class="scope-note" style="margin-top:11px">${icon('info')}${fileMode ? '课程数据直接写入本目录的 data/timetable.json，并保留上一版 data/timetable.backup.json；不会上传到网络。' : '当前是临时模式，课程数据尚未写入目录。运行 ./start.sh 启动本地文件服务后，即可自动保存到 data/timetable.json。'}</div>
        </div>
        <div class="divider"></div>
        <div class="sheet-section">
          <div class="sheet-section-title">${icon('alert')}清理数据</div>
          <div class="danger-zone">
            <div class="danger-zone-text"><strong>清空所有课程</strong><span>保留学期与节次设置，移除全部 ${stats.sessions} 个课程块</span></div>
            <button class="btn btn-sm btn-danger-soft" type="button" id="clearAllCourses">清空课程</button>
          </div>
          ${demoCount ? `<div class="danger-zone" style="margin-top:7px;border-color:var(--line);background:var(--surface)">
            <div class="danger-zone-text"><strong style="color:var(--text-2)">清除示例课程</strong><span>仅移除 ${demoCount} 个载入时附带的示例</span></div>
            <button class="btn btn-sm btn-secondary" type="button" data-action="clear-demo">清除示例</button>
          </div>` : ''}
        </div>
      </div>

      <div class="settings-pane ${activeTab === 'shortcuts' ? 'active' : ''}" data-settings-pane="shortcuts">
        <div class="sheet-section">
          <div class="sheet-section-title">${icon('command')}键盘快捷键</div>
          <div class="shortcut-list">
            ${shortcutRows.map(([label, keys]) => `<div class="shortcut-row"><span>${label}</span><span class="keys">${keys.map((key) => `<span class="kbd">${esc(key)}</span>`).join('')}</span></div>`).join('')}
          </div>
          <p class="hint" style="margin-top:10px">在输入框中输入时，方向键等快捷键会自动让位给文本编辑。</p>
        </div>
      </div>`;

    const entry = openSheet({
      title: '设置',
      subtitle: '让课序更贴合你的学期节奏。',
      iconName: 'settings',
      wide: true,
      body,
      footer: `<div class="footer-note">${icon('info')} 所有修改自动保存在本机</div>
        <div class="footer-actions"><button class="btn btn-primary" type="button" data-close>完成</button></div>`,
      focus: '#setSemesterName',
    });

    const root = entry.el;
    root.querySelectorAll('[data-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        root.querySelectorAll('[data-settings-tab]').forEach((item) => item.classList.toggle('active', item === button));
        root.querySelectorAll('[data-settings-pane]').forEach((pane) => {
          pane.classList.toggle('active', pane.dataset.settingsPane === button.dataset.settingsTab);
        });
      });
    });

    root.querySelectorAll('input[name="themeChoice"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) setTheme(input.value);
      });
    });

    const startInput = root.querySelector('#setSemesterStart');
    const weekInput = root.querySelector('#setSemesterWeeks');
    root.querySelector('#startThisMonday').addEventListener('click', () => {
      startInput.value = U.startOfWeek(new Date());
    });
    root.querySelector('#startFourWeeksAgo').addEventListener('click', () => {
      startInput.value = U.addDays(U.startOfWeek(new Date()), -28);
    });

    root.querySelector('#saveSemester').addEventListener('click', async () => {
      const name = root.querySelector('#setSemesterName').value.trim();
      if (!name) {
        toast('学期名称不能为空', 'warn');
        return;
      }
      if (!startInput.value) {
        toast('请选择开学日期', 'warn');
        return;
      }
      let startDate = startInput.value;
      const normalized = U.startOfWeek(startDate);
      if (normalized !== startDate) {
        startDate = normalized;
        startInput.value = normalized;
        toast('开学日期已自动对齐到当周周一', 'info', 2300);
      }
      let weekCount = Math.max(1, Math.min(40, Number(weekInput.value) || 18));
      weekInput.value = weekCount;
      if (weekCount < store.weekCount) {
        const removedEvents = store.state.weeks.slice(weekCount).reduce((sum, week) => sum + week.events.length, 0);
        if (removedEvents) {
          const ok = await confirmDialog({
            title: '减少教学周？',
            message: `第 ${weekCount + 1}–${store.weekCount} 周里还有 <strong>${removedEvents}</strong> 个课程块，减少周数会把它们一并删除。`,
            confirmLabel: '仍然减少',
          });
          if (!ok) return;
        }
      }
      store.state.semester.name = name;
      store.state.semester.startDate = startDate;
      store.resizeWeeks(weekCount);
      ui.weekIndex = Math.max(0, Math.min(store.weekCount - 1, ui.weekIndex));
      const saved = await store.save();
      renderAll();
      toast(
        saved ? '学期设置已保存' : '学期设置已更新，但写入数据文件失败',
        saved ? 'success' : 'error',
        3800
      );
    });

    const clearAll = root.querySelector('#clearAllCourses');
    clearAll.addEventListener('click', async () => {
      if (!store.stats().sessions) {
        toast('当前没有课程可清空', 'info');
        return;
      }
      const ok = await confirmDialog({
        title: '清空所有课程？',
        message: `将删除全部 <strong>${store.stats().sessions}</strong> 个课程块，并保留学期与节次设置。建议先导出 JSON 备份。`,
        confirmLabel: '清空全部课程',
      });
      if (!ok) return;
      store.clearAllCourses();
      commit('所有课程已清空');
    });
  }

  /* ------------------------------------------------------------------------
     Period settings
     ------------------------------------------------------------------------ */

  function periodBodyMarkup(state) {
    const scopeIsCurrent = state.scope === 'current';
    const selectedCount = state.selected.size;
    const targetCount = scopeIsCurrent ? 1 : selectedCount;
    return `
      <div class="sheet-section">
        <div class="sheet-section-title">${icon('calendar')}应用范围 <span class="sheet-section-sub">当前在第 ${ui.weekIndex + 1} 周</span></div>
        <div class="scope-switch">
          <button type="button" class="${scopeIsCurrent ? 'active' : ''}" data-p-scope="current">仅当前周</button>
          <button type="button" class="${scopeIsCurrent ? '' : 'active'}" data-p-scope="selected">选定多个周</button>
        </div>
        ${scopeIsCurrent
          ? `<div class="scope-note">${icon('info')}只调整第 ${ui.weekIndex + 1} 周的节次时间，其他教学周保持原样。</div>`
          : `<div class="week-picker">
              ${Array.from({ length: store.weekCount }, (_, index) => `
                <label class="week-toggle">
                  <input type="checkbox" data-p-week="${index}" ${state.selected.has(index) ? 'checked' : ''}>
                  <span title="第 ${index + 1} 周">${index + 1}</span>
                </label>`).join('')}
            </div>
            <div class="week-picker-actions">
              <button class="mini-link" type="button" data-p-pick="all">全部</button>
              <button class="mini-link" type="button" data-p-pick="first8">前 8 周</button>
              <button class="mini-link" type="button" data-p-pick="clear">清空</button>
            </div>
            <div class="scope-note">${icon('info')}批量应用会覆盖目标周原有的节次结构。课程会保留下来，并自动对齐到新的节次。</div>`}
      </div>

      <div class="divider"></div>

      <div class="sheet-section">
        <div class="sheet-section-title">${icon('clock')}节次时间 <span class="sheet-section-sub">每行是一节课，可自由增删</span></div>
        <div class="preset-row">
          <button class="preset-chip" type="button" data-p-preset="45">45 分钟 + 10 分钟课间</button>
          <button class="preset-chip" type="button" data-p-preset="50">50 分钟 + 10 分钟课间</button>
          <button class="preset-chip" type="button" data-p-preset="90">90 分钟连堂</button>
          <button class="preset-chip" type="button" data-p-preset="default">恢复默认节次</button>
        </div>
        <div class="period-editor-wrap" style="margin-top:8px">
          <div class="period-editor">
            <div class="period-row header">
              <span>#</span><span>名称</span><span>开始</span><span></span><span>结束</span><span>时长</span><span></span>
            </div>
            ${state.periods.map((period, index) => `
              <div class="period-row" data-period-row="${index}" data-period-id="${esc(period.id)}">
                <span class="period-index">${index + 1}</span>
                <input class="input" type="text" data-field="label" maxlength="30" value="${esc(period.label)}" aria-label="第 ${index + 1} 节名称">
                <input class="input" type="time" data-field="start" value="${period.start}" aria-label="第 ${index + 1} 节开始时间">
                <span style="text-align:center;color:var(--text-3);font-size:9px">–</span>
                <input class="input" type="time" data-field="end" value="${period.end}" aria-label="第 ${index + 1} 节结束时间">
                <span class="period-duration-cell">${U.durationLabel(period.start, period.end)}</span>
                <button class="icon-btn" type="button" data-p-remove="${index}" title="删除本节" ${state.periods.length <= 1 ? 'disabled' : ''}>${icon('minus')}</button>
              </div>`).join('')}
          </div>
        </div>
        <div class="period-tools">
          <button class="btn btn-sm btn-secondary" type="button" data-p-add>${icon('plus')}插入节次</button>
          <span class="hint">结束时间需晚于开始时间；有重叠时会提示。</span>
        </div>
      </div>`;
  }

  function openPeriodSettings() {
    const currentWeek = store.getWeek(ui.weekIndex);
    const state = {
      scope: 'current',
      selected: new Set([ui.weekIndex]),
      periods: JSON.parse(JSON.stringify(currentWeek.periods)),
    };
    let entry;

    function targetIndices() {
      const indices = state.scope === 'current' ? [ui.weekIndex] : Array.from(state.selected).sort((a, b) => a - b);
      return indices.filter((index) => index >= 0 && index < store.weekCount);
    }

    function footerMarkup() {
      const count = targetIndices().length;
      return `<div class="footer-note">将应用到 <strong>${count}</strong> 周 · 课程不会丢失</div>
        <div class="footer-actions">
          <button class="btn btn-secondary" type="button" data-close>取消</button>
          <button class="btn btn-primary" type="button" data-p-apply ${count ? '' : 'disabled'}>${icon('check')}应用到 ${count} 周</button>
        </div>`;
    }

    entry = openSheet({
      title: '节次与时间',
      subtitle: '每一周都可以有自己的作息，也可以一次性应用到多周。',
      iconName: 'clock',
      wide: true,
      body: periodBodyMarkup(state),
      footer: footerMarkup(),
      focus: '[data-p-scope]',
    });
    const root = entry.el;
    const body = root.querySelector('.sheet-body');
    const footer = root.querySelector('.sheet-footer');

    function collect() {
      const rows = body.querySelectorAll('[data-period-row]');
      if (!rows.length) return;
      state.periods = Array.from(rows).map((row, index) => ({
        id: row.dataset.periodId || U.uid('p'),
        label: (row.querySelector('[data-field="label"]').value || '').trim() || `第 ${index + 1} 节`,
        start: row.querySelector('[data-field="start"]').value,
        end: row.querySelector('[data-field="end"]').value,
      }));
    }

    function rerender() {
      const scroll = body.scrollTop;
      body.innerHTML = periodBodyMarkup(state);
      footer.innerHTML = footerMarkup();
      body.scrollTop = scroll;
      bindFooter();
    }

    function bindFooter() {
      const apply = footer.querySelector('[data-p-apply]');
      if (apply) apply.addEventListener('click', applyPeriods);
    }

    function reflow(duration) {
      collect();
      if (!state.periods.length) return;
      let cursor = state.periods[0].start || '08:00';
      state.periods.forEach((period, index) => {
        const start = U.addMinutes(cursor, index === 0 ? 0 : 10);
        period.start = start;
        period.end = U.addMinutes(start, duration);
        cursor = period.end;
        if (!period.label) period.label = `第 ${index + 1} 节`;
      });
      rerender();
    }

    body.addEventListener('click', (event) => {
      const scopeButton = event.target.closest('[data-p-scope]');
      if (scopeButton) {
        collect();
        state.scope = scopeButton.dataset.pScope;
        if (state.scope === 'selected' && !state.selected.size) state.selected.add(ui.weekIndex);
        rerender();
        return;
      }
      const pickButton = event.target.closest('[data-p-pick]');
      if (pickButton) {
        const mode = pickButton.dataset.pPick;
        if (mode === 'all') state.selected = new Set(Array.from({ length: store.weekCount }, (_, index) => index));
        else if (mode === 'first8') state.selected = new Set(Array.from({ length: Math.min(8, store.weekCount) }, (_, index) => index));
        else state.selected.clear();
        rerender();
        return;
      }
      if (event.target.closest('[data-p-add]')) {
        collect();
        const last = state.periods[state.periods.length - 1];
        const start = last ? U.addMinutes(last.end, 10) : '08:00';
        state.periods.push({
          id: `p_${Date.now().toString(36)}`,
          label: `第 ${state.periods.length + 1} 节`,
          start,
          end: U.addMinutes(start, 45),
        });
        rerender();
        return;
      }
      const removeButton = event.target.closest('[data-p-remove]');
      if (removeButton) {
        collect();
        if (state.periods.length <= 1) return;
        state.periods.splice(Number(removeButton.dataset.pRemove), 1);
        rerender();
        return;
      }
      const presetButton = event.target.closest('[data-p-preset]');
      if (presetButton) {
        const value = presetButton.dataset.pPreset;
        if (value === 'default') {
          state.periods = JSON.parse(JSON.stringify(store.DEFAULT_PERIODS));
          rerender();
        } else {
          reflow(Number(value));
        }
      }
    });

    body.addEventListener('change', (event) => {
      const weekToggle = event.target.closest('[data-p-week]');
      if (weekToggle) {
        const index = Number(weekToggle.dataset.pWeek);
        if (weekToggle.checked) state.selected.add(index);
        else state.selected.delete(index);
        footer.innerHTML = footerMarkup();
        bindFooter();
      }
    });

    body.addEventListener('input', (event) => {
      const input = event.target.closest('[data-field="start"], [data-field="end"], [data-field="label"]');
      if (!input) return;
      const row = input.closest('[data-period-row]');
      if (!row) return;
      if (input.dataset.field === 'start' || input.dataset.field === 'end') {
        const start = row.querySelector('[data-field="start"]').value;
        const end = row.querySelector('[data-field="end"]').value;
        row.querySelector('.period-duration-cell').textContent = U.durationLabel(start, end);
      }
    });

    async function applyPeriods() {
      collect();
      const periods = state.periods;
      if (!periods.length) {
        toast('至少保留一个节次', 'warn');
        return;
      }
      for (let i = 0; i < periods.length; i += 1) {
        const period = periods[i];
        if (!period.start || !period.end) {
          toast(`第 ${i + 1} 节的开始或结束时间没有填写`, 'warn');
          return;
        }
        if (U.timeToMinutes(period.end) <= U.timeToMinutes(period.start)) {
          toast(`第 ${i + 1} 节的结束时间需要晚于开始时间`, 'warn');
          return;
        }
      }
      const sorted = periods.slice().sort((a, b) => U.timeToMinutes(a.start) - U.timeToMinutes(b.start));
      for (let i = 1; i < sorted.length; i += 1) {
        if (U.timeToMinutes(sorted[i].start) < U.timeToMinutes(sorted[i - 1].end)) {
          toast(`节次时间有重叠：「${sorted[i - 1].label}」${sorted[i - 1].start}–${sorted[i - 1].end} 与「${sorted[i].label}」${sorted[i].start}–${sorted[i].end}`, 'warn', 4200);
          return;
        }
      }
      const indices = targetIndices();
      if (!indices.length) {
        toast('请至少选择一个教学周', 'warn');
        return;
      }
      if (indices.length > 1) {
        const changedWeeks = indices.filter((index) => index !== ui.weekIndex).length;
        if (changedWeeks > 0 && !(await confirmDialog({
          title: `应用到 ${indices.length} 个教学周？`,
          message: `将覆盖这些周现有的节次时间，课程会保留并自动对齐。受影响的其他周共 <strong>${changedWeeks}</strong> 个。`,
          confirmLabel: '应用并覆盖',
          danger: false,
        }))) return;
      }
      indices.forEach((index) => applyPeriodsToWeek(index, periods));
      const saved = await store.save();
      closeOverlay(entry);
      renderAll();
      toast(
        saved ? `节次时间已应用到 ${indices.length} 周` : '节次已更新，但写入文件失败',
        saved ? 'success' : 'error',
        3600
      );
    }

    bindFooter();
  }

  function applyPeriodsToWeek(weekIndex, periods) {
    const week = store.getWeek(weekIndex);
    const oldPeriods = week.periods;
    const nextPeriods = JSON.parse(JSON.stringify(periods));
    const nextIds = new Set(nextPeriods.map((period) => period.id));
    week.events.forEach((event) => {
      if (nextIds.has(event.periodId)) return;
      const oldIndex = oldPeriods.findIndex((period) => period.id === event.periodId);
      const fallback = nextPeriods[Math.min(Math.max(oldIndex, 0), nextPeriods.length - 1)] || nextPeriods[0];
      if (fallback) {
        event.periodId = fallback.id;
        store.touchEvent(event);
      }
    });
    week.periods = nextPeriods;
  }

  /* ------------------------------------------------------------------------
     Copy week
     ------------------------------------------------------------------------ */

  function openCopyWeek() {
    if (store.weekCount <= 1) {
      toast('至少需要两个教学周才能复制课表', 'info');
      return;
    }
    const sourceIndex = ui.weekIndex;
    const sourceWeek = store.getWeek(sourceIndex);
    const defaultTarget = sourceIndex + 1 < store.weekCount ? sourceIndex + 1 : Math.max(0, sourceIndex - 1);
    const state = {
      targets: new Set([defaultTarget]),
      copyPeriods: true,
      copyEvents: true,
      overwrite: false,
    };
    let entry;

    const sourceSummary = `
      <div class="overview-summary" style="margin-bottom:2px">
        <div class="overview-summary-text">
          <strong>从第 ${sourceIndex + 1} 周复制</strong>
          <span>${U.formatWeekRange(store.state.semester.startDate, sourceIndex)} · ${sourceWeek.events.length} 个课程块 · ${sourceWeek.periods.length} 个节次</span>
        </div>
        <span class="chip blue">${icon('copy')}源课表</span>
      </div>`;

    function footerMarkup() {
      const count = state.targets.size;
      return `<div class="footer-note">将写入 <strong>${count}</strong> 个目标周</div>
        <div class="footer-actions">
          <button class="btn btn-secondary" type="button" data-close>取消</button>
          <button class="btn btn-primary" type="button" data-copy-apply ${count ? '' : 'disabled'}>${icon('copy')}复制到 ${count} 周</button>
        </div>`;
    }

    function bodyMarkup() {
      return `
        ${sourceSummary}
        <div class="divider"></div>
        <div class="sheet-section">
          <div class="sheet-section-title">${icon('calendar')}复制到 <span class="sheet-section-sub">点击周次多选</span></div>
          <div class="week-picker">
            ${Array.from({ length: store.weekCount }, (_, index) => `
              <label class="week-toggle ${index === sourceIndex ? 'source' : ''}" title="${index === sourceIndex ? '源周' : `第 ${index + 1} 周`}">
                <input type="checkbox" data-copy-week="${index}" ${index === sourceIndex ? 'disabled' : ''} ${state.targets.has(index) ? 'checked' : ''}>
                <span>${index + 1}</span>
              </label>`).join('')}
          </div>
          <div class="week-picker-actions">
            <button class="mini-link" type="button" data-copy-pick="all">全部</button>
            <button class="mini-link" type="button" data-copy-pick="next4">接下来 4 周</button>
            <button class="mini-link" type="button" data-copy-pick="clear">清空</button>
          </div>
        </div>
        <div class="divider"></div>
        <div class="sheet-section">
          <div class="sheet-section-title">${icon('sliders')}复制内容</div>
          <div class="switch-row" style="margin-bottom:8px">
            <div class="switch-row-text"><strong>节次时间</strong><span>把源周的节次时间表一并写入目标周</span></div>
            <label class="switch"><input type="checkbox" id="copyPeriods" ${state.copyPeriods ? 'checked' : ''}><span class="switch-track"></span></label>
          </div>
          <div class="switch-row" style="margin-bottom:8px">
            <div class="switch-row-text"><strong>课程内容</strong><span>复制所有课程、编号、批注与颜色</span></div>
            <label class="switch"><input type="checkbox" id="copyEvents" ${state.copyEvents ? 'checked' : ''}><span class="switch-track"></span></label>
          </div>
          <div class="switch-row">
            <div class="switch-row-text"><strong>覆盖目标周已有课程</strong><span>开启后会先清空目标周的课程，再写入副本</span></div>
            <label class="switch"><input type="checkbox" id="copyOverwrite" ${state.overwrite ? 'checked' : ''}><span class="switch-track"></span></label>
          </div>
          <div class="scope-note">${icon('info')}目标周已有的其他数据不会被修改；不覆盖时，复制的课程会追加在原有课程之后。</div>
        </div>`;
    }

    entry = openSheet({
      title: '复制本周课表',
      subtitle: '把一个周的安排，快速铺到其他教学周。',
      iconName: 'copy',
      body: bodyMarkup(),
      footer: footerMarkup(),
      focus: '[data-copy-week]',
    });
    const root = entry.el;
    const body = root.querySelector('.sheet-body');
    const footer = root.querySelector('.sheet-footer');

    body.addEventListener('click', (event) => {
      const pick = event.target.closest('[data-copy-pick]');
      if (!pick) return;
      const mode = pick.dataset.copyPick;
      const candidates = Array.from({ length: store.weekCount }, (_, index) => index).filter((index) => index !== sourceIndex);
      if (mode === 'all') state.targets = new Set(candidates);
      else if (mode === 'next4') state.targets = new Set(candidates.filter((index) => index > sourceIndex).slice(0, 4));
      else state.targets.clear();
      body.innerHTML = bodyMarkup();
      footer.innerHTML = footerMarkup();
      bindFooter();
    });

    body.addEventListener('change', (event) => {
      const weekToggle = event.target.closest('[data-copy-week]');
      if (weekToggle) {
        const index = Number(weekToggle.dataset.copyWeek);
        if (weekToggle.checked) state.targets.add(index);
        else state.targets.delete(index);
        footer.innerHTML = footerMarkup();
        bindFooter();
        return;
      }
      if (event.target.id === 'copyPeriods') state.copyPeriods = event.target.checked;
      if (event.target.id === 'copyEvents') state.copyEvents = event.target.checked;
      if (event.target.id === 'copyOverwrite') state.overwrite = event.target.checked;
    });

    function bindFooter() {
      const button = footer.querySelector('[data-copy-apply]');
      if (button) button.addEventListener('click', applyCopy);
    }

    async function applyCopy() {
      if (!state.targets.size) {
        toast('请选择至少一个目标周', 'warn');
        return;
      }
      if (!state.copyPeriods && !state.copyEvents) {
        toast('请至少选择一项需要复制的内容', 'warn');
        return;
      }
      const targets = Array.from(state.targets).sort((a, b) => a - b);
      if (state.overwrite && state.copyEvents) {
        const overwritten = targets.reduce((sum, index) => sum + store.getWeek(index).events.length, 0);
        if (overwritten) {
          const ok = await confirmDialog({
            title: '覆盖目标周课程？',
            message: `所选目标周里共有 <strong>${overwritten}</strong> 个已有课程块，它们将被源周课表替换。`,
            confirmLabel: '覆盖并复制',
          });
          if (!ok) return;
        }
      }
      targets.forEach((index) => {
        store.createWeekFrom(sourceIndex, {
          target: index,
          periods: state.copyPeriods,
          events: state.copyEvents,
          overwrite: state.overwrite,
        });
      });
      const saved = await store.save();
      closeOverlay(entry);
      renderAll();
      toast(
        saved ? `已复制到 ${targets.length} 个教学周` : '复制完成，但写入文件失败',
        saved ? 'success' : 'error',
        3600
      );
    }

    bindFooter();
  }

  /* ------------------------------------------------------------------------
     iCal import
     ------------------------------------------------------------------------ */

  function importKey(event, weekIndex) {
    return `${event.sourceUid || event.uid}|${weekIndex}|${event.day}|${event.start}`;
  }

  function openImport() {
    const state = {
      fileName: '',
      parsed: null,
      scope: 'all',
      skipDuplicates: true,
      error: '',
      loading: false,
    };
    let entry;

    function scopedItems() {
      if (!state.parsed) return [];
      return state.parsed.items.filter((item) => state.scope === 'all' || item.weekIndex === ui.weekIndex);
    }

    function analysis() {
      const items = scopedItems();
      const existing = new Set();
      const scopeWeeks = state.scope === 'all'
        ? store.state.weeks
        : [store.getWeek(ui.weekIndex)];
      scopeWeeks.forEach((week, offset) => {
        const weekIndex = state.scope === 'all' ? offset : ui.weekIndex;
        week.events.forEach((event) => existing.add(importKey(event, weekIndex)));
      });
      const fresh = [];
      const seen = new Set();
      let duplicates = 0;
      items.forEach((item) => {
        const key = importKey(item.event, item.weekIndex);
        if (existing.has(key) || seen.has(key)) duplicates += 1;
        else {
          seen.add(key);
          fresh.push(item);
        }
      });
      return { items, fresh, duplicates };
    }

    function likelyWeeks(items) {
      return new Set(items.map((item) => item.weekIndex)).size;
    }

    function previewMarkup(items) {
      if (!items.length) return '';
      const shown = items.slice(0, 14);
      return `<div class="import-preview">
        ${shown.map((item) => `<div class="import-preview-row">
          <span class="import-preview-date">${U.formatShortDate(item.date)}</span>
          <span class="import-preview-name">${esc(item.event.name)}</span>
          <span class="import-preview-time">${item.event.start}–${item.event.end}</span>
          <span class="import-preview-week">第 ${item.weekIndex + 1} 周</span>
        </div>`).join('')}
      </div>`;
    }

    function bodyMarkup() {
      if (state.loading) {
        return `<div class="dropzone"><div class="dropzone-icon">${icon('refresh')}</div><strong>正在读取日历…</strong><span>请稍候</span></div>`;
      }
      if (!state.parsed) {
        return `
          <div class="dropzone" id="icsDropzone" tabindex="0" role="button" aria-label="选择或拖入 iCal 文件">
            <div class="dropzone-icon">${icon('download')}</div>
            <strong>把 .ics 文件拖到这里</strong>
            <span>支持 iCal 标准文件，含每周重复课程</span>
            <span class="drop-browse">或点击选择文件</span>
            <input type="file" id="icsPicker" accept=".ics,text/calendar" hidden>
          </div>
          ${state.error ? `<div class="move-error" style="margin-top:9px;color:var(--red);font-size:9.5px;display:flex;gap:5px;align-items:flex-start">${icon('alert')}<span>${esc(state.error)}</span></div>` : ''}
          <div class="import-note">${icon('info')}<span>课程会按照发生日期落到对应教学周，并根据开始时间自动对齐节次；原始起止时间会保留。全天日程与学期外的日程暂不导入。</span></div>`;
      }
      const all = scopedItems();
      const result = analysis();
      const parsed = state.parsed;
      return `
        <div class="file-loaded">
          <div class="file-loaded-icon">${icon('file')}</div>
          <div class="file-loaded-text">
            <strong>${esc(state.fileName)}</strong>
            <span>${parsed.sourceCount} 个源日程 · 识别出 ${parsed.total} 个课程块 · ${likelyWeeks(all)} 个教学周</span>
          </div>
          <button class="btn btn-sm btn-secondary" type="button" data-ics-reset>重新选择</button>
        </div>
        <div class="import-stats">
          <div class="import-stat"><strong>${all.length}</strong><span>范围内核块</span></div>
          <div class="import-stat"><strong>${result.fresh.length}</strong><span>可导入</span></div>
          <div class="import-stat"><strong>${result.duplicates}</strong><span>重复跳过</span></div>
        </div>
        <div class="divider"></div>
        <div class="sheet-section">
          <div class="sheet-section-title">${icon('calendar')}导入范围</div>
          <div class="radio-cards">
            <label class="radio-card">
              <input type="radio" name="icsScope" value="all" ${state.scope === 'all' ? 'checked' : ''}>
              <span class="radio-card-inner"><span class="radio-dot"></span><span><strong>整个学期</strong><span>按日期分散写入所有教学周</span></span></span>
            </label>
            <label class="radio-card">
              <input type="radio" name="icsScope" value="current" ${state.scope === 'current' ? 'checked' : ''}>
              <span class="radio-card-inner"><span class="radio-dot"></span><span><strong>仅第 ${ui.weekIndex + 1} 周</strong><span>只导入落在本周的日程</span></span></span>
            </label>
          </div>
          <div class="switch-row" style="margin-top:11px">
            <div class="switch-row-text"><strong>跳过重复日程</strong><span>相同来源、周次与时间的课程不会重复写入</span></div>
            <label class="switch"><input type="checkbox" id="icsSkipDuplicates" ${state.skipDuplicates ? 'checked' : ''}><span class="switch-track"></span></label>
          </div>
        </div>
        <div class="divider"></div>
        <div class="sheet-section">
          <div class="sheet-section-title">${icon('list')}预览 <span class="sheet-section-sub">${all.length ? `显示前 ${Math.min(14, all.length)} 条` : '没有可导入的日程'}</span></div>
          ${all.length ? previewMarkup(all) : `<div class="scope-note">${icon('alert')}这个范围内没有日程。可以切换范围，或检查学期开始日期是否与日历一致。</div>`}
          ${parsed.skipped.allDay || parsed.skipped.outside ? `<div class="import-note">${icon('info')}<span>${parsed.skipped.allDay ? `跳过 ${parsed.skipped.allDay} 个全天日程；` : ''}${parsed.skipped.outside ? `跳过 ${parsed.skipped.outside} 个学期外日程；` : ''}${parsed.skipped.invalid ? `跳过 ${parsed.skipped.invalid} 个无法识别的日程；` : ''}你可以稍后手动添加。</span></div>` : ''}
        </div>`;
    }

    function footerMarkup() {
      if (!state.parsed) {
        return `<div class="footer-note">iCal 文件仅在本机解析</div><div class="footer-actions"><button class="btn btn-secondary" type="button" data-close>取消</button></div>`;
      }
      const result = analysis();
      return `<div class="footer-note">将写入 <strong>${state.skipDuplicates ? result.fresh.length : result.items.length}</strong> 个课程块</div>
        <div class="footer-actions">
          <button class="btn btn-secondary" type="button" data-close>取消</button>
          <button class="btn btn-primary" type="button" data-ics-import ${(state.skipDuplicates ? result.fresh.length : result.items.length) ? '' : 'disabled'}>${icon('download')}导入日程</button>
        </div>`;
    }

    function render() {
      const body = entry.el.querySelector('.sheet-body');
      const footer = entry.el.querySelector('.sheet-footer');
      body.innerHTML = bodyMarkup();
      footer.innerHTML = footerMarkup();
      bindContent();
    }

    async function handleFile(file) {
      if (!file) return;
      state.error = '';
      if (!/\.ics$/i.test(file.name)) {
        state.error = '请选择扩展名为 .ics 的 iCal 文件。';
        render();
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        state.error = '文件超过 12 MB，建议先在日历应用中拆分导出。';
        render();
        return;
      }
      state.loading = true;
      render();
      try {
        const text = await file.text();
        const parsed = ical.parseICS(text, store.state);
        if (!parsed.items.length) {
          throw new Error('没有找到落在本学期内的定时日程。请确认学期开始日期与日历一致。');
        }
        state.parsed = parsed;
        state.fileName = file.name;
      } catch (error) {
        state.parsed = null;
        state.error = error.message || '解析失败，请检查 iCal 文件。';
      } finally {
        state.loading = false;
        render();
      }
    }

    function bindContent() {
      const body = entry.el.querySelector('.sheet-body');
      const footer = entry.el.querySelector('.sheet-footer');
      const picker = body.querySelector('#icsPicker');
      const dropzone = body.querySelector('#icsDropzone');
      if (picker && dropzone) {
        picker.addEventListener('change', () => {
          handleFile(picker.files && picker.files[0]);
        });
        dropzone.addEventListener('click', (event) => {
          if (event.target === picker) return;
          picker.click();
        });
        dropzone.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            picker.click();
          }
        });
        ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => {
          event.preventDefault();
          dropzone.classList.add('dragover');
        }));
        ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => {
          event.preventDefault();
          dropzone.classList.remove('dragover');
        }));
        dropzone.addEventListener('drop', (event) => {
          const file = event.dataTransfer.files && event.dataTransfer.files[0];
          handleFile(file);
        });
      }
      const reset = body.querySelector('[data-ics-reset]');
      if (reset) {
        reset.addEventListener('click', () => {
          state.parsed = null;
          state.fileName = '';
          state.error = '';
          render();
        });
      }
      body.querySelectorAll('input[name="icsScope"]').forEach((input) => {
        input.addEventListener('change', () => {
          if (!input.checked) return;
          state.scope = input.value;
          render();
        });
      });
      const skip = body.querySelector('#icsSkipDuplicates');
      if (skip) {
        skip.addEventListener('change', () => {
          state.skipDuplicates = skip.checked;
          render();
        });
      }
      const importButton = footer.querySelector('[data-ics-import]');
      if (importButton) importButton.addEventListener('click', importItems);
    }

    async function importItems() {
      if (!state.parsed) return;
      const result = analysis();
      const toImport = state.skipDuplicates ? result.fresh : result.items;
      if (!toImport.length) {
        toast('没有新的日程可以导入', 'info');
        return;
      }
      toImport.forEach((item) => {
        const week = store.getWeek(item.weekIndex);
        week.events.push(item.event);
      });
      const count = toImport.length;
      const weeks = new Set(toImport.map((item) => item.weekIndex)).size;
      const saved = await store.save();
      closeOverlay(entry);
      renderAll();
      toast(
        saved
          ? `已导入 ${count} 个日程，分布在 ${weeks} 个教学周`
          : '日程已载入，但写入数据文件失败',
        saved ? 'success' : 'error',
        3800
      );
    }

    entry = openSheet({
      title: '导入 iCal 日历',
      subtitle: '把现有日历中的课程带进课序，自动按周归档。',
      iconName: 'download',
      wide: true,
      body: '',
      footer: '',
    });
    render();
    setTimeout(() => entry.el.querySelector('#icsDropzone')?.focus({ preventScroll: true }), 80);
  }

  window.KX.app = {
    init,
    get ui() { return ui; },
    get store() { return store; },
    openInspector: (...args) => openInspector(...args),
    renderAll,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
