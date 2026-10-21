/* 课序 · local persistence and data model */
(function () {
  'use strict';

  const KX = window.KX;
  const U = KX.utils;
  const STORAGE_KEY = 'kexu.timetable.v1';
  const VERSION = 1;
  const FILE_PATH = 'data/timetable.json';

  async function apiFetch(path, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 2000);
    try {
      return await fetch(path, {
        cache: 'no-store',
        ...(options || {}),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function readLegacyState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return { state: normalize(JSON.parse(raw)), raw };
    } catch (error) {
      return { error };
    }
  }

  function clearLegacyState() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  const DEFAULT_PERIODS = [
    { id: 'p1', label: '第 1 节', start: '08:00', end: '08:45' },
    { id: 'p2', label: '第 2 节', start: '08:55', end: '09:40' },
    { id: 'p3', label: '第 3 节', start: '10:00', end: '10:45' },
    { id: 'p4', label: '第 4 节', start: '10:55', end: '11:40' },
    { id: 'p5', label: '第 5 节', start: '14:00', end: '14:45' },
    { id: 'p6', label: '第 6 节', start: '14:55', end: '15:40' },
    { id: 'p7', label: '第 7 节', start: '16:00', end: '16:45' },
    { id: 'p8', label: '第 8 节', start: '16:55', end: '17:40' },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultPeriods() {
    return clone(DEFAULT_PERIODS);
  }

  function semesterName(date) {
    const d = U.parseDate(date);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    if (month >= 9) return `${year} 秋季学期`;
    if (month >= 2 && month <= 7) return `${year} 春季学期`;
    return `${year} 冬季学期`;
  }

  function emptyWeek(periods) {
    return { periods: periods ? clone(periods) : defaultPeriods(), events: [] };
  }

  function demoEvents(now) {
    const stamp = new Date().toISOString();
    const make = (values) => ({
      id: U.uid('ev'),
      uid: `${U.uid('uid')}@kexu.local`,
      name: '',
      code: '',
      day: 0,
      periodId: 'p1',
      color: 'blue',
      location: '',
      teacher: '',
      note: '',
      customTime: true,
      start: '08:00',
      end: '09:40',
      demo: true,
      createdAt: stamp,
      updatedAt: stamp,
      ...values,
    });

    return [
      make({
        name: '高等数学',
        code: 'MATH-201',
        day: 0,
        periodId: 'p1',
        color: 'blue',
        location: '教三 204',
        teacher: '陈老师',
        note: '极限与连续 · 记得带计算器\n复习笔记：[[高数笔记]]',
        start: '08:00',
        end: '09:40',
      }),
      make({
        name: '大学英语',
        code: 'ENG-102',
        day: 0,
        periodId: 'p3',
        color: 'purple',
        location: '外语楼 301',
        teacher: '李老师',
        note: 'Unit 4 presentation',
        start: '10:00',
        end: '11:40',
      }),
      make({
        name: '数据结构',
        code: 'CS-210',
        day: 1,
        periodId: 'p1',
        color: 'teal',
        location: '计算机楼 105',
        teacher: '王老师',
        note: '图与遍历 · 带电脑\n[[数据结构-第5周]]',
        start: '08:00',
        end: '09:40',
      }),
      make({
        name: '体育 · 羽毛球',
        code: 'PE-101',
        day: 1,
        periodId: 'p5',
        color: 'orange',
        location: '东区体育馆',
        teacher: '赵老师',
        note: '',
        start: '14:00',
        end: '15:40',
      }),
      make({
        name: '操作系统',
        code: 'CS-320',
        day: 2,
        periodId: 'p3',
        color: 'indigo',
        location: '计算机楼 402',
        teacher: '周老师',
        note: '进程调度 · 实验二截止',
        start: '10:00',
        end: '11:40',
      }),
      make({
        name: '数据结构',
        code: 'CS-210',
        day: 3,
        periodId: 'p1',
        color: 'teal',
        location: '计算机楼 105',
        teacher: '王老师',
        note: '',
        start: '08:00',
        end: '09:40',
      }),
      make({
        name: '创新创业基础',
        code: 'GEN-110',
        day: 3,
        periodId: 'p7',
        color: 'pink',
        location: '创新创业学院 201',
        teacher: '孙老师',
        note: '小组路演',
        start: '16:00',
        end: '17:40',
      }),
      make({
        name: '高等数学',
        code: 'MATH-201',
        day: 4,
        periodId: 'p1',
        color: 'blue',
        location: '教三 204',
        teacher: '陈老师',
        note: '',
        start: '08:00',
        end: '09:40',
      }),
    ].map((event) => ({ ...event, createdAt: now, updatedAt: now }));
  }

  function createInitialState() {
    const today = new Date();
    const currentMonday = U.startOfWeek(today);
    const startDate = U.addDays(currentMonday, -28);
    const weekCount = 18;
    const periods = defaultPeriods();
    const weeks = Array.from({ length: weekCount }, () => emptyWeek(periods));
    const currentIndex = Math.max(0, Math.min(weekCount - 1, Math.floor(U.daysBetween(startDate, currentMonday) / 7)));
    const demo = demoEvents(new Date().toISOString());
    weeks[currentIndex].events = demo;
    return {
      version: VERSION,
      semester: {
        name: semesterName(today),
        startDate,
        weekCount,
      },
      weeks,
      preferences: {
        theme: 'auto',
      },
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        demoEventIds: demo.map((event) => event.id),
        demoNoticeDismissed: false,
        lastSavedAt: null,
      },
    };
  }

  function createBlankState(source) {
    const initial = createInitialState();
    if (source) {
      initial.semester = clone(source.semester);
      initial.preferences = clone(source.preferences || initial.preferences);
      initial.weeks = Array.from({ length: initial.semester.weekCount }, () => emptyWeek(initial.weeks[0].periods));
    }
    initial.meta.demoEventIds = [];
    initial.meta.demoNoticeDismissed = true;
    return initial;
  }

  function normalizePeriods(raw, fallback) {
    const source = Array.isArray(raw) && raw.length ? raw : fallback || defaultPeriods();
    const seen = new Set();
    const result = [];
    source.slice(0, 24).forEach((period, index) => {
      let id = String(period && period.id ? period.id : `p${index + 1}`).replace(/[^\w-]/g, '');
      if (!id || seen.has(id)) id = `p${Date.now().toString(36)}_${index}`;
      seen.add(id);
      const range = U.clampTimeRange(period && period.start, period && period.end);
      result.push({
        id,
        label: String((period && period.label) || `第 ${index + 1} 节`).slice(0, 30),
        start: range.start,
        end: range.end,
      });
    });
    return result.length ? result : defaultPeriods();
  }

  function normalizeEvent(raw, periods, index) {
    if (!raw || typeof raw !== 'object') return null;
    const periodIds = new Set(periods.map((period) => period.id));
    let periodId = String(raw.periodId || '');
    if (!periodIds.has(periodId)) {
      const byIndex = periods[Math.min(index || 0, periods.length - 1)];
      periodId = byIndex ? byIndex.id : periods[0].id;
    }
    const period = periods.find((item) => item.id === periodId) || periods[0];
    const range = U.clampTimeRange(raw.start || period.start, raw.end || period.end);
    const color = U.COLORS.some((item) => item.id === raw.color) ? raw.color : U.colorForText(raw.name || raw.code || '');
    return {
      id: String(raw.id || U.uid('ev')),
      uid: String(raw.uid || `${U.uid('uid')}@kexu.local`),
      sourceUid: String(raw.sourceUid || ''),
      name: String(raw.name || '未命名课程').slice(0, 120),
      code: String(raw.code || '').slice(0, 40),
      day: Math.max(0, Math.min(6, Number.isFinite(Number(raw.day)) ? Number(raw.day) : 0)),
      periodId,
      color,
      location: String(raw.location || '').slice(0, 120),
      teacher: String(raw.teacher || '').slice(0, 80),
      note: String(raw.note || '').slice(0, 12000),
      customTime: Boolean(raw.customTime),
      start: range.start,
      end: range.end,
      demo: Boolean(raw.demo),
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeWeek(raw, fallbackPeriods) {
    const periods = normalizePeriods(raw && raw.periods, fallbackPeriods);
    const rawEvents = Array.isArray(raw && raw.events) ? raw.events : [];
    const events = rawEvents
      .map((event, index) => normalizeEvent(event, periods, index))
      .filter(Boolean);
    return { periods, events };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('数据格式无法识别');
    const semester = raw.semester && typeof raw.semester === 'object' ? raw.semester : {};
    let startDate = /^\d{4}-\d{2}-\d{2}$/.test(semester.startDate || '') ? semester.startDate : U.startOfWeek(new Date());
    const weekCount = Math.max(1, Math.min(40, Number(semester.weekCount) || 18));
    const basePeriods = normalizePeriods((raw.weeks && raw.weeks[0] && raw.weeks[0].periods) || null, null);
    const weeks = [];
    for (let i = 0; i < weekCount; i += 1) {
      const sourceWeek = Array.isArray(raw.weeks) ? raw.weeks[i] : null;
      const previous = i > 0 ? weeks[i - 1].periods : basePeriods;
      weeks.push(normalizeWeek(sourceWeek, previous));
    }
    const providedPrefs = raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {};
    const theme = ['auto', 'light', 'dark'].includes(providedPrefs.theme) ? providedPrefs.theme : 'auto';
    const providedMeta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
    const demoIds = Array.isArray(providedMeta.demoEventIds)
      ? providedMeta.demoEventIds.map(String)
      : weeks.flatMap((week) => week.events.filter((event) => event.demo).map((event) => event.id));
    return {
      version: VERSION,
      semester: {
        name: String(semester.name || semesterName(startDate)).slice(0, 60),
        startDate,
        weekCount,
      },
      weeks,
      preferences: { theme },
      meta: {
        createdAt: providedMeta.createdAt || new Date().toISOString(),
        updatedAt: providedMeta.updatedAt || new Date().toISOString(),
        demoEventIds: demoIds,
        demoNoticeDismissed: Boolean(providedMeta.demoNoticeDismissed),
        lastSavedAt: providedMeta.lastSavedAt || null,
      },
    };
  }

  const store = {
    STORAGE_KEY,
    VERSION,
    DEFAULT_PERIODS,
    FILE_PATH,
    state: null,
    mode: 'browser',
    filePath: FILE_PATH,
    absolutePath: '',
    storageAvailable: false,
    loadError: null,
    lastSavedAt: null,
    saving: false,
    pendingWrites: 0,
    saveChain: Promise.resolve(true),
    migratedFromBrowser: false,

    async init() {
      this.mode = 'browser';
      this.storageAvailable = false;
      this.loadError = null;
      this.saveChain = Promise.resolve(true);
      this.pendingWrites = 0;
      this.saving = false;

      if (window.location.protocol !== 'file:') {
        try {
          const healthRes = await apiFetch('api/health', { headers: { Accept: 'application/json' } }, 1600);
          if (healthRes.ok) {
            const health = await healthRes.json();
            if (health && health.ok && health.mode === 'file') {
              this.mode = 'file';
              this.filePath = health.path || FILE_PATH;
              this.absolutePath = health.absolute || '';
              await this.loadFileState();
              this.applySavedTime();
              return this.state;
            }
          }
        } catch (error) {
          this.loadError = error;
        }
      }

      this.mode = 'browser';
      this.filePath = FILE_PATH;
      this.absolutePath = '';
      const legacy = readLegacyState();
      if (legacy && legacy.state) {
        this.state = legacy.state;
        this.storageAvailable = true;
      } else {
        this.state = createInitialState();
        this.storageAvailable = true;
        if (legacy && legacy.error) this.loadError = legacy.error;
      }
      const ok = await this.save();
      this.storageAvailable = ok;
      this.applySavedTime();
      return this.state;
    },

    async loadFileState() {
      try {
        const response = await apiFetch('api/state', { headers: { Accept: 'application/json' } }, 3000);
        if (response.status === 204) {
          const legacy = readLegacyState();
          this.state = legacy && legacy.state ? legacy.state : createInitialState();
          this.migratedFromBrowser = Boolean(legacy && legacy.state);
          this.storageAvailable = true;
          const ok = await this.save();
          if (!ok) throw this.loadError || new Error('无法写入 data/timetable.json');
          clearLegacyState();
          return;
        }
        if (!response.ok) {
          let message = `读取 data/timetable.json 失败（HTTP ${response.status}）`;
          try {
            const errorBody = await response.json();
            if (errorBody && errorBody.error) message = errorBody.error;
          } catch (error) {
            /* ignore */
          }
          throw new Error(message);
        }
        const raw = await response.json();
        this.state = normalize(raw);
        this.storageAvailable = true;
        this.loadError = null;
        clearLegacyState();
      } catch (error) {
        this.mode = 'file-error';
        this.storageAvailable = false;
        this.loadError = error;
        const legacy = readLegacyState();
        this.state = legacy && legacy.state ? legacy.state : createInitialState();
      }
    },

    applySavedTime() {
      if (this.state && this.state.meta && this.state.meta.lastSavedAt) {
        const saved = new Date(this.state.meta.lastSavedAt);
        if (!Number.isNaN(saved.getTime())) this.lastSavedAt = saved;
      }
    },

    async connectFileMode() {
      if (window.location.protocol === 'file:') {
        return { ok: false, reason: '请先关闭当前页面，运行 ./start.sh 再打开本地地址。' };
      }
      try {
        const healthRes = await apiFetch('api/health', { headers: { Accept: 'application/json' } }, 1800);
        if (!healthRes.ok) throw new Error('本地文件服务未响应');
        const health = await healthRes.json();
        if (!health || !health.ok) throw new Error('本地文件服务未就绪');
        const stateRes = await apiFetch('api/state', { headers: { Accept: 'application/json' } }, 2500);
        if (stateRes.status === 204) {
          const previousMode = this.mode;
          this.mode = 'file';
          this.filePath = health.path || FILE_PATH;
          this.absolutePath = health.absolute || '';
          const ok = await this.save();
          if (!ok) {
            this.mode = previousMode;
            return { ok: false, reason: '无法写入数据文件，请检查目录权限。' };
          }
          clearLegacyState();
          this.loadError = null;
          this.storageAvailable = true;
          return { ok: true, migrated: true };
        }
        if (!stateRes.ok) throw new Error('数据文件读取失败');
        const raw = await stateRes.json();
        this.state = normalize(raw);
        this.mode = 'file';
        this.filePath = health.path || FILE_PATH;
        this.absolutePath = health.absolute || '';
        this.storageAvailable = true;
        this.loadError = null;
        clearLegacyState();
        this.applySavedTime();
        return { ok: true, loaded: true };
      } catch (error) {
        this.loadError = error;
        return { ok: false, reason: error.message || '无法连接本地文件服务' };
      }
    },

    save() {
      if (!this.state) return Promise.resolve(false);
      this.state.meta.updatedAt = new Date().toISOString();

      if (this.mode === 'file' || this.mode === 'file-error') {
        if (this.mode !== 'file') return Promise.resolve(false);
        const payload = JSON.stringify(this.state);
        this.pendingWrites += 1;
        this.saving = true;
        const write = async () => {
          try {
            const response = await apiFetch(
              'api/state',
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: payload,
              },
              8000
            );
            let body = null;
            try {
              body = await response.json();
            } catch (error) {
              /* ignore */
            }
            if (!response.ok || !body || !body.ok) {
              throw new Error((body && body.error) || `写入失败（HTTP ${response.status}）`);
            }
            this.storageAvailable = true;
            this.loadError = null;
            this.lastSavedAt = new Date();
            this.state.meta.lastSavedAt = this.lastSavedAt.toISOString();
            return true;
          } catch (error) {
            this.storageAvailable = false;
            this.loadError = error;
            return false;
          } finally {
            this.pendingWrites = Math.max(0, this.pendingWrites - 1);
            this.saving = this.pendingWrites > 0;
          }
        };
        this.saveChain = this.saveChain.then(write, write);
        return this.saveChain;
      }

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        this.storageAvailable = true;
        this.loadError = null;
        this.lastSavedAt = new Date();
        this.state.meta.lastSavedAt = this.lastSavedAt.toISOString();
        return Promise.resolve(true);
      } catch (error) {
        this.storageAvailable = false;
        this.loadError = error;
        return Promise.resolve(false);
      }
    },

    touchEvent(event) {
      if (event) event.updatedAt = new Date().toISOString();
    },

    get weekCount() {
      return this.state.semester.weekCount;
    },

    getWeek(index) {
      return this.state.weeks[Math.max(0, Math.min(this.state.semester.weekCount - 1, index))];
    },

    getPeriod(week, periodId) {
      return week.periods.find((period) => period.id === periodId) || week.periods[0];
    },

    timesFor(week, event) {
      if (!event) return { start: '08:00', end: '08:45' };
      if (event.customTime) {
        return U.clampTimeRange(event.start, event.end);
      }
      const period = this.getPeriod(week, event.periodId);
      return { start: period.start, end: period.end };
    },

    eventDate(weekIndex, event) {
      return U.weekDate(this.state.semester.startDate, weekIndex, event.day);
    },

    weekDate(weekIndex, day) {
      return U.weekDate(this.state.semester.startDate, weekIndex, day);
    },

    weekStart(weekIndex) {
      return U.addDays(this.state.semester.startDate, weekIndex * 7);
    },

    currentWeekIndex() {
      const todayMonday = U.startOfWeek(new Date());
      const diff = Math.floor(U.daysBetween(this.state.semester.startDate, todayMonday) / 7);
      return Math.max(0, Math.min(this.state.semester.weekCount - 1, diff));
    },

    weekIndexForDate(value) {
      const monday = U.startOfWeek(value);
      const diff = Math.floor(U.daysBetween(this.state.semester.startDate, monday) / 7);
      return diff >= 0 && diff < this.state.semester.weekCount ? diff : -1;
    },

    allEvents() {
      return this.state.weeks.flatMap((week, weekIndex) =>
        week.events.map((event) => ({ event, week, weekIndex }))
      );
    },

    stats() {
      const events = this.allEvents();
      const codes = new Set();
      events.forEach(({ event }) => codes.add(event.code.trim() || event.name.trim()));
      const totalMinutes = events.reduce((sum, { event, week }) => {
        const range = this.timesFor(week, event);
        return sum + U.durationMinutes(range.start, range.end);
      }, 0);
      return {
        sessions: events.length,
        courses: codes.size,
        totalMinutes,
      };
    },

    weekStats(index) {
      const week = this.getWeek(index);
      const codes = new Set(week.events.map((event) => event.code.trim() || event.name.trim()));
      return { sessions: week.events.length, courses: codes.size, periods: week.periods.length };
    },

    findEvent(eventId) {
      for (let weekIndex = 0; weekIndex < this.state.weeks.length; weekIndex += 1) {
        const event = this.state.weeks[weekIndex].events.find((item) => item.id === eventId);
        if (event) return { event, week: this.state.weeks[weekIndex], weekIndex };
      }
      return null;
    },

    nextPeriodId(week) {
      const used = new Set(week.periods.map((period) => period.id));
      let i = 1;
      while (used.has(`p${i}`)) i += 1;
      return `p${i}`;
    },

    resizeWeeks(count) {
      const next = Math.max(1, Math.min(40, Number(count) || 18));
      const weeks = this.state.weeks;
      if (next > weeks.length) {
        const template = weeks[weeks.length - 1].periods;
        while (weeks.length < next) weeks.push(emptyWeek(template));
      } else if (next < weeks.length) {
        weeks.length = next;
      }
      this.state.semester.weekCount = next;
    },

    clearAllCourses() {
      this.state.weeks.forEach((week) => {
        week.events = [];
      });
      this.state.meta.demoEventIds = [];
      this.state.meta.demoNoticeDismissed = true;
    },

    removeDemoCourses() {
      let removed = 0;
      this.state.weeks.forEach((week) => {
        const before = week.events.length;
        week.events = week.events.filter((event) => !event.demo);
        removed += before - week.events.length;
      });
      this.state.meta.demoEventIds = [];
      this.state.meta.demoNoticeDismissed = true;
      return removed;
    },

    hasDemoCourses() {
      return this.allEvents().some(({ event }) => event.demo);
    },

    createWeekFrom(startWeekIndex, options) {
      const target = options && options.target;
      const copy = this.getWeek(target);
      const source = this.getWeek(startWeekIndex);
      const opts = { periods: true, events: true, overwrite: false, ...(options || {}) };
      if (opts.periods) {
        copy.periods = clone(source.periods);
      }
      if (opts.overwrite) copy.events = [];
      if (opts.events) {
        const periodMap = new Map(source.periods.map((period, index) => [period.id, copy.periods[index] && copy.periods[index].id]));
        source.events.forEach((event) => {
          const nextPeriodId = periodMap.get(event.periodId) || copy.periods[0].id;
          copy.events.push({
            ...clone(event),
            id: U.uid('ev'),
            uid: `${U.uid('uid')}@kexu.local`,
            periodId: nextPeriodId,
            demo: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
      }
      return copy.events.length;
    },

    exportJSON() {
      return JSON.stringify(
        {
          ...this.state,
          meta: { ...this.state.meta, exportedAt: new Date().toISOString() },
        },
        null,
        2
      );
    },

    importJSON(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error('这不是有效的 JSON 备份文件');
      }
      const normalized = normalize(parsed);
      this.state = normalized;
      return normalized;
    },

    createBlankState,
  };

  KX.store = store;
})();
