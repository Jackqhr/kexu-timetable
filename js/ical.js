/* 课序 · iCalendar import and export */
(function () {
  'use strict';

  const KX = window.KX;
  const U = KX.utils;

  const DAY_CODES = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const TZ_CACHE = new Map();

  function unfold(text) {
    return String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n[ \t]/g, '');
  }

  function unescapeText(value) {
    return String(value || '')
      .replace(/\\[nN]/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  function splitLine(line) {
    let colon = -1;
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === ':' && !quoted) {
        colon = i;
        break;
      }
    }
    if (colon < 0) return null;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const segments = left.split(';');
    const name = (segments.shift() || '').toUpperCase();
    const params = {};
    segments.forEach((segment) => {
      const eq = segment.indexOf('=');
      const key = eq >= 0 ? segment.slice(0, eq).toUpperCase() : segment.toUpperCase();
      let val = eq >= 0 ? segment.slice(eq + 1) : '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      params[key] = val;
    });
    return { name, params, value };
  }

  function parseVEvents(text) {
    const blocks = [];
    const lines = unfold(text).split('\n');
    let current = null;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed === 'BEGIN:VEVENT') {
        current = [];
      } else if (trimmed === 'END:VEVENT') {
        if (current) blocks.push(current);
        current = null;
      } else if (current) {
        current.push(line);
      }
    });
    return blocks;
  }

  function propsMap(lines) {
    const map = {};
    lines.forEach((line) => {
      const parsed = splitLine(line);
      if (!parsed) return;
      if (!map[parsed.name]) map[parsed.name] = parsed;
    });
    return map;
  }

  function getTimezoneFormatter(tzid) {
    if (TZ_CACHE.has(tzid)) return TZ_CACHE.get(tzid);
    let formatter = null;
    try {
      formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tzid,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch (error) {
      formatter = null;
    }
    TZ_CACHE.set(tzid, formatter);
    return formatter;
  }

  function zonedTimeToDate(year, month, day, hour, minute, second, tzid) {
    const formatter = getTimezoneFormatter(tzid);
    if (!formatter) return new Date(year, month - 1, day, hour, minute, second || 0);
    const target = Date.UTC(year, month - 1, day, hour, minute, second || 0);
    let guess = target;
    for (let i = 0; i < 3; i += 1) {
      const parts = {};
      formatter.formatToParts(new Date(guess)).forEach((part) => {
        if (part.type !== 'literal') parts[part.type] = Number(part.value);
      });
      const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
      const offset = asUTC - guess;
      const next = target - offset;
      if (next === guess) break;
      guess = next;
    }
    return new Date(guess);
  }

  function parseDateValue(prop) {
    if (!prop || !prop.value) return null;
    const raw = prop.value.trim();
    const dateMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateMatch) {
      return {
        allDay: true,
        date: new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 0, 0, 0),
      };
    }
    const dateTime = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/);
    if (!dateTime) return null;
    const [, y, mo, d, h, mi, s, suffix] = dateTime;
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    const hour = Number(h);
    const minute = Number(mi);
    const second = Number(s);
    if (suffix === 'Z') {
      return { allDay: false, date: new Date(Date.UTC(year, month - 1, day, hour, minute, second)) };
    }
    if (suffix) {
      const sign = suffix[0] === '-' ? -1 : 1;
      const offsetMinutes = sign * (Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(3, 5)));
      return {
        allDay: false,
        date: new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60000),
      };
    }
    const tzid = prop.params && prop.params.TZID;
    if (tzid) {
      return { allDay: false, date: zonedTimeToDate(year, month, day, hour, minute, second, tzid) };
    }
    return { allDay: false, date: new Date(year, month - 1, day, hour, minute, second) };
  }

  function parseUntil(value) {
    if (!value) return null;
    const prop = { value, params: {} };
    const match = value.match(/^(\d{8})T(\d{6})Z$/);
    if (match) {
      const result = parseDateValue({ value, params: {} });
      return result ? result.date : null;
    }
    const result = parseDateValue(prop);
    return result ? result.date : null;
  }

  function parseRule(value) {
    const rule = {};
    String(value || '')
      .split(';')
      .forEach((part) => {
        const eq = part.indexOf('=');
        if (eq > 0) rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
      });
    return rule;
  }

  function sameLocalDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${U.pad(date.getMonth() + 1)}-${U.pad(date.getDate())}T${U.pad(date.getHours())}:${U.pad(date.getMinutes())}`;
  }

  function dayKey(date) {
    return `${date.getFullYear()}-${U.pad(date.getMonth() + 1)}-${U.pad(date.getDate())}`;
  }

  function startOfLocalDay(value) {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  }

  function endOfLocalDay(value) {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  }

  function occurrenceAt(base, date, hour, minute, second) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, second || 0);
  }

  function expandOccurrences(start, end, rule, exdates, windowStart, windowEnd) {
    const duration = Math.max(15 * 60000, end && end > start ? end.getTime() - start.getTime() : 45 * 60000);
    const occurrences = [];
    const limit = 1200;
    const exKeys = new Set(exdates.filter((item) => !item.allDay).map((item) => dateKey(item.date)));
    const exDays = new Set(exdates.filter((item) => item.allDay).map((item) => dayKey(item.date)));
    const until = rule.UNTIL ? parseUntil(rule.UNTIL) : null;
    const countLimit = rule.COUNT ? Math.max(1, Number(rule.COUNT) || 1) : Infinity;
    const interval = Math.max(1, Number(rule.INTERVAL) || 1);
    const freq = String(rule.FREQ || '').toUpperCase();
    const push = (date, guard) => {
      if (!date || occurrences.length >= limit) return;
      if (date < start) return;
      if (until && date > endOfLocalDay(until)) return;
      if (countLimit !== Infinity && guard && guard.count >= countLimit) return;
      if (exKeys.has(dateKey(date)) || exDays.has(dayKey(date))) {
        if (guard) guard.count += 1;
        return;
      }
      if (guard) guard.count += 1;
      if (date >= windowStart && date <= windowEnd) occurrences.push(date);
    };

    if (!freq) {
      if (start >= windowStart && start <= windowEnd) occurrences.push(start);
      return { dates: occurrences, duration };
    }

    const hour = start.getHours();
    const minute = start.getMinutes();
    const second = start.getSeconds();
    const guard = { count: 0 };
    const maxIterations = 4000;
    let iterations = 0;

    if (freq === 'DAILY') {
      let cursor = startOfLocalDay(start);
      while (cursor <= windowEnd && iterations < maxIterations && guard.count < countLimit) {
        iterations += 1;
        const occurrence = occurrenceAt(start, cursor, hour, minute, second);
        push(occurrence, guard);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + interval, 12);
      }
    } else if (freq === 'WEEKLY') {
      let anchor = startOfLocalDay(start);
      const anchorDay = anchor.getDay();
      anchor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - (anchorDay === 0 ? 6 : anchorDay - 1), 12);
      const byDay = String(rule.BYDAY || '')
        .split(',')
        .map((code) => DAY_CODES[code.trim().toUpperCase()])
        .filter((value) => value !== undefined);
      const days = byDay.length ? byDay : [start.getDay()];
      let cursor = anchor;
      while (cursor <= windowEnd && iterations < maxIterations && guard.count < countLimit) {
        iterations += 1;
        days.forEach((weekday) => {
          const offset = (weekday + 6) % 7;
          const dayDate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + offset, 12);
          const occurrence = occurrenceAt(start, dayDate, hour, minute, second);
          push(occurrence, guard);
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7 * interval, 12);
      }
    } else if (freq === 'MONTHLY') {
      let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
      while (cursor <= windowEnd && iterations < maxIterations && guard.count < countLimit) {
        iterations += 1;
        const occurrence = occurrenceAt(start, cursor, hour, minute, second);
        push(occurrence, guard);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + interval, cursor.getDate(), 12);
      }
    } else {
      push(start, guard);
    }

    if (rule.COUNT && occurrences.length > countLimit) occurrences.length = countLimit;
    return { dates: occurrences, duration };
  }

  function choosePeriod(week, startTime) {
    if (!week || !week.periods.length) return 'p1';
    const target = U.timeToMinutes(startTime);
    let best = week.periods[0];
    let bestScore = Infinity;
    week.periods.forEach((period) => {
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
    return best.id;
  }

  function parseICS(text, state) {
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('文件中没有找到 VCALENDAR');
    const blocks = parseVEvents(text);
    if (!blocks.length) throw new Error('日历文件中没有可导入的日程（VEVENT）');
    const startDate = state.semester.startDate;
    const weekCount = state.semester.weekCount;
    const windowStart = new Date(U.parseDate(startDate));
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(U.parseDate(U.addDays(startDate, weekCount * 7)));
    windowEnd.setHours(23, 59, 59, 999);
    const items = [];
    const skipped = { allDay: 0, outside: 0, invalid: 0, cancelled: 0 };
    let sourceCount = 0;
    const seen = new Set();

    blocks.forEach((block) => {
      const props = propsMap(block);
      if (props['RECURRENCE-ID']) return;
      if ((props.STATUS && props.STATUS.value || '').toUpperCase() === 'CANCELLED') {
        skipped.cancelled += 1;
        return;
      }
      const startProp = props.DTSTART;
      const endProp = props.DTEND;
      const startParsed = parseDateValue(startProp);
      if (!startParsed) {
        skipped.invalid += 1;
        return;
      }
      if (startParsed.allDay) {
        skipped.allDay += 1;
        return;
      }
      sourceCount += 1;
      const endParsed = parseDateValue(endProp);
      const end = endParsed && !endParsed.allDay ? endParsed.date : new Date(startParsed.date.getTime() + 45 * 60000);
      const rule = props.RRULE ? parseRule(props.RRULE.value) : {};
      const exdates = [];
      block.forEach((line) => {
        const parsed = splitLine(line);
        if (!parsed || parsed.name !== 'EXDATE') return;
        String(parsed.value || '')
          .split(',')
          .forEach((entry) => {
            const value = parseDateValue({ value: entry.trim(), params: parsed.params || {} });
            if (value) exdates.push({ date: value.date, allDay: Boolean(value.allDay) });
          });
      });
      const expanded = expandOccurrences(startParsed.date, end, rule, exdates, windowStart, windowEnd);
      const title = unescapeText((props.SUMMARY && props.SUMMARY.value) || '').trim() || '未命名日程';
      const description = U.stripHtml(unescapeText((props.DESCRIPTION && props.DESCRIPTION.value) || ''));
      const location = unescapeText((props.LOCATION && props.LOCATION.value) || '').trim();
      const sourceUid = (props.UID && props.UID.value || '').trim();
      expanded.dates.forEach((occDate) => {
        const weekIndex = state.semester.startDate
          ? Math.floor(U.daysBetween(state.semester.startDate, U.startOfWeek(occDate)) / 7)
          : -1;
        if (weekIndex < 0 || weekIndex >= weekCount) {
          skipped.outside += 1;
          return;
        }
        const week = state.weeks[weekIndex];
        if (!week) {
          skipped.invalid += 1;
          return;
        }
        const day = U.daysBetween(U.addDays(startDate, weekIndex * 7), occDate);
        if (day < 0 || day > 6) {
          skipped.outside += 1;
          return;
        }
        const startTime = `${U.pad(occDate.getHours())}:${U.pad(occDate.getMinutes())}`;
        const endDate = new Date(occDate.getTime() + expanded.duration);
        let endTime = `${U.pad(endDate.getHours())}:${U.pad(endDate.getMinutes())}`;
        if (endDate.getDate() !== occDate.getDate()) endTime = '23:59';
        if (U.timeToMinutes(endTime) <= U.timeToMinutes(startTime)) {
          endTime = U.addMinutes(startTime, 45);
        }
        const dedupeKey = `${sourceUid || title}|${occDate.getTime()}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        items.push({
          weekIndex,
          day,
          periodId: choosePeriod(week, startTime),
          event: {
            id: U.uid('ev'),
            uid: `${sourceUid || U.uid('ical')}-${occDate.getTime()}@kexu.local`,
            sourceUid,
            name: title.slice(0, 120),
            code: '',
            day,
            periodId: choosePeriod(week, startTime),
            color: U.colorForText(title),
            location: location.slice(0, 120),
            teacher: '',
            note: description.slice(0, 12000),
            customTime: true,
            start: startTime,
            end: endTime,
            demo: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          date: U.isoDate(occDate),
          dayName: DAY_NAMES[occDate.getDay()],
          time: `${startTime}–${endTime}`,
        });
      });
    });

    items.sort((a, b) => {
      if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
      if (a.day !== b.day) return a.day - b.day;
      return a.event.start.localeCompare(b.event.start);
    });

    return {
      items,
      sourceCount,
      skipped,
      dateRange: items.length
        ? { from: items[0].date, to: items[items.length - 1].date }
        : null,
      total: items.length,
    };
  }

  function foldLine(line) {
    if (line.length <= 70) return line;
    const parts = [];
    let rest = line;
    while (rest.length > 70) {
      parts.push(rest.slice(0, 70));
      rest = rest.slice(70);
    }
    if (rest) parts.push(rest);
    return parts.join('\r\n ');
  }

  function icsDate(date, time) {
    const d = U.parseDate(date);
    const [h, m] = time.split(':');
    return `${d.getFullYear()}${U.pad(d.getMonth() + 1)}${U.pad(d.getDate())}T${h}${m}00`;
  }

  function exportICS(state) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kexu//Timetable//ZH',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${U.escapeICS(state.semester.name)}`,
    ];
    state.weeks.forEach((week, weekIndex) => {
      week.events.forEach((event) => {
        const times = KX.store.timesFor(week, event);
        const date = U.weekDate(state.semester.startDate, weekIndex, event.day);
        const descriptionParts = [];
        if (event.code) descriptionParts.push(`课程编号：${event.code}`);
        if (event.teacher) descriptionParts.push(`教师：${event.teacher}`);
        if (event.note) descriptionParts.push('', event.note);
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${U.escapeICS(event.uid || event.id)}`);
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(foldLine(`DTSTART:${icsDate(date, times.start)}`));
        lines.push(foldLine(`DTEND:${icsDate(date, times.end)}`));
        lines.push(foldLine(`SUMMARY:${U.escapeICS(event.name)}`));
        if (descriptionParts.length) lines.push(foldLine(`DESCRIPTION:${U.escapeICS(descriptionParts.join('\n'))}`));
        if (event.location) lines.push(foldLine(`LOCATION:${U.escapeICS(event.location)}`));
        if (event.code) lines.push(foldLine(`CATEGORIES:${U.escapeICS(event.code)}`));
        lines.push(`X-KEXU-WEEK:${weekIndex + 1}`);
        lines.push(`X-KEXU-COLOR:${event.color}`);
        lines.push('END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }

  KX.ical = {
    parseICS,
    exportICS,
    unfold,
    parseDateValue,
  };
})();
