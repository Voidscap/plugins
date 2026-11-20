// Egern 小组件：飞常准航班动态 / 机场大屏 / 机场天气
// 数据源：飞常准 app 网关 MCP（c-gw.variflight.com，需要会话握手）
// 可选环境变量（env）：
//   API_KEY    飞常准 MCP Key（必填）：飞常准 app「MCP 连接」页生成，sk-user- 开头
//   MODE       航班动态 | 机场大屏 | 机场天气，默认 航班动态
//   FLIGHT     航班号（含航司二字码），默认 MU5102
//   AIRPORT    机场三字码，默认 SHA
//   DIRECTION  出港 | 进港 | 全局，默认 出港（机场大屏模式用）
//   REFRESH    刷新间隔（分钟），默认 10；每次刷新调用一次接口

const ENDPOINT = 'https://c-gw.variflight.com/chat_message/mcp/api/legacy';

const GRAY = '#8E8E93';
const RED = '#FF3B30';
const ORANGE = '#FF9500';
const GREEN = '#34C759';
const BLUE = '#0A84FF';
const BG = { light: '#FFFFFF', dark: '#1C1C1E' };
const CARD = { light: '#F2F2F7', dark: '#2C2C2E' };
const PLANE = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%230A84FF' d='M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'/></svg>";
const ARROW_OUT = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M6 18L18 6M10 6h8v8' stroke='%230A84FF' stroke-width='2.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>";
const ARROW_IN = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M6 6l12 12M18 10v8h-8' stroke='%2334C759' stroke-width='2.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>";

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function nowHM() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

function hhmm(s) {
  const m = /(\d{2}:\d{2})/.exec(s || '');
  return m ? m[1] : '';
}

function shortErr(t) {
  if (/invalid|unauthorized|401/i.test(t)) return 'Key 无效或已重新生成，请在模块设置里重填';
  if (/Session ID/i.test(t)) return '会话建立失败，请稍后刷新';
  return String(t).replace(/\s+/g, ' ').slice(0, 60);
}

// MCP 会话：握手一次（initialize → initialized 通知），之后多次 tools/call 复用
async function openSession(ctx, key) {
  const base = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': 'Bearer ' + key,
  };
  const init = await ctx.http.post(ENDPOINT, {
    headers: base,
    body: {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'egern-widget', version: '2' } },
    },
    timeout: 20000,
  });
  await init.text();
  if (init.status === 401) throw new Error('Key 无效或已重新生成，请在模块设置里重填');
  let sid = null;
  try { sid = init.headers && init.headers.get ? init.headers.get('Mcp-Session-Id') : null; } catch (e) { sid = null; }
  const h = Object.assign({}, base);
  if (sid) h['Mcp-Session-Id'] = sid;
  try {
    const n = await ctx.http.post(ENDPOINT, { headers: h, body: { jsonrpc: '2.0', method: 'notifications/initialized' }, timeout: 20000 });
    await n.text();
  } catch (e) { /* 通知失败不阻断查询 */ }

  let seq = 2;
  return async function call(name, args) {
    const resp = await ctx.http.post(ENDPOINT, {
      headers: h,
      body: { jsonrpc: '2.0', id: seq++, method: 'tools/call', params: { name: name, arguments: args } },
      timeout: 20000,
    });
    let text = await resp.text();
    if (resp.status !== 200) throw new Error('HTTP ' + resp.status);
    if (text.indexOf('data:') >= 0) {
      const parts = text.split('\n').filter((l) => l.indexOf('data:') === 0).map((l) => l.slice(5).trim()).filter(Boolean);
      if (parts.length) text = parts[parts.length - 1];
    }
    const msg = JSON.parse(text);
    if (msg.error) throw new Error(shortErr(JSON.stringify(msg.error)));
    const result = msg.result || {};
    const content = (result.content || []).map((c) => c.text || '').join('\n').trim();
    if (result.isError) throw new Error(shortErr(content));
    return content;
  };
}

function parseData(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

function statusColor(s) {
  if (/取消/.test(s)) return RED;
  if (/延误/.test(s)) return ORANGE;
  if (/到达/.test(s)) return GREEN;
  if (/起飞|登机|催促|滑行|值机/.test(s)) return BLUE;
  return GRAY;
}

function pill(text, color) {
  return {
    type: 'stack', direction: 'row', padding: [2, 6], backgroundColor: color + '1F', borderRadius: 6,
    children: [{ type: 'text', text: text, font: { size: 10, weight: 'semibold' }, textColor: color }],
  };
}

function header(title) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 5,
    children: [
      { type: 'image', src: PLANE, width: 13, height: 13 },
      { type: 'text', text: title, font: { size: 13, weight: 'semibold' } },
      { type: 'spacer' },
      { type: 'date', date: new Date().toISOString(), format: 'time', font: { size: 10 }, textColor: GRAY },
    ],
  };
}

function chip(label, value) {
  return {
    type: 'stack', direction: 'column', alignItems: 'center', gap: 1, flex: 1, padding: [5, 2], backgroundColor: CARD, borderRadius: 8,
    children: [
      { type: 'text', text: label, font: { size: 9 }, textColor: GRAY },
      { type: 'text', text: value, font: { size: 12, weight: 'bold' }, maxLines: 1, minScale: 0.6 },
    ],
  };
}

// ---------- 数据整理 ----------

function flightData(data) {
  const items = (data && data.items) || [];
  if (!items.length) return null;
  const f = items[0];
  const mins = (s) => { const m = /(\d{2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  return {
    fnum: f.FlightNo || '',
    state: f.FlightState || '',
    depA: f.FlightDepAirport || f.FlightDep || '',
    arrA: f.FlightArrAirport || f.FlightArr || '',
    depT: f.FlightDepTerminal || '',
    arrT: f.FlightArrTerminal || '',
    planD: hhmm(f.FlightDeptimePlanDate),
    planA: hhmm(f.FlightArrtimePlanDate),
    actD: hhmm(f.FlightDeptimeDate || f.FlightDeptimeEstDate),
    actA: hhmm(f.FlightArrtimeDate || f.FlightArrtimeEstDate),
    planDm: mins(f.FlightDeptimePlanDate),
    planAm: mins(f.FlightArrtimePlanDate),
    actDm: mins(f.FlightDeptimeDate || f.FlightDeptimeEstDate),
    actAm: mins(f.FlightArrtimeDate || f.FlightArrtimeEstDate),
    gate: f.BoardGate || '',
    checkin: f.CheckinTable || '',
    baggage: f.BaggageID || '',
    ontime: f.ontimeRate || '',
    avgDelay: f.AvgDelay || '',
  };
}

function progressOf(d) {
  const dep = d.actDm != null ? d.actDm : d.planDm;
  const arr = d.actAm != null ? d.actAm : d.planAm;
  if (dep == null || arr == null || arr <= dep) return null;
  if (/到达/.test(d.state)) return 1;
  const now = new Date();
  const t = (now.getHours() * 60 + now.getMinutes() - dep) / (arr - dep);
  return Math.max(0, Math.min(1, t));
}

function routeSvg(t) {
  const p0 = [18, 42], c = [150, -14], p2 = [282, 42];
  const tt = Math.max(0.03, Math.min(0.97, t));
  const x = (1 - tt) * (1 - tt) * p0[0] + 2 * (1 - tt) * tt * c[0] + tt * tt * p2[0];
  const y = (1 - tt) * (1 - tt) * p0[1] + 2 * (1 - tt) * tt * c[1] + tt * tt * p2[1];
  const plane = 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';
  return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 54'>"
    + "<path d='M18 42 Q150 -14 282 42' stroke='%23C7C7CC' stroke-width='2' stroke-dasharray='4 4' fill='none'/>"
    + "<circle cx='18' cy='42' r='4' fill='%2334C759'/>"
    + "<circle cx='282' cy='42' r='4' fill='%23FF9500'/>"
    + "<g transform='translate(" + (x - 9).toFixed(1) + ' ' + (y - 9).toFixed(1) + ") scale(0.75)'><path d='" + plane + "' fill='%230A84FF'/></g>"
    + '</svg>';
}

function barsSvg(counts) {
  const max = Math.max.apply(null, counts.concat([1]));
  let rects = '';
  counts.forEach((n, i) => {
    const cx = 25 + i * 50;
    const h = n === 0 ? 2 : Math.max(4, Math.round(n / max * 34));
    const fill = n === 0 ? '%23E5E5EA' : i === 0 ? '%230A84FF' : '%23AEAEB2';
    rects += "<rect x='" + (cx - 7) + "' y='" + (40 - h) + "' width='13' height='" + h + "' rx='4' fill='" + fill + "'/>";
  });
  return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 44'>"
    + rects + "<rect x='0' y='41' width='300' height='1.5' fill='%23E5E5EA'/></svg>";
}

function tempSvg(low, high) {
  if (low == null || high == null || isNaN(low) || isNaN(high)) return null;
  const min = -5, max = 40;
  const x1 = (low - min) / (max - min) * 292;
  const x2 = (high - min) / (max - min) * 292;
  return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 292 12'>"
    + "<defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%230A84FF'/><stop offset='1' stop-color='%23FF9500'/></linearGradient></defs>"
    + "<rect x='0' y='3' width='292' height='6' rx='3' fill='%23E5E5EA'/>"
    + "<rect x='" + x1.toFixed(0) + "' y='3' width='" + Math.max(6, x2 - x1).toFixed(0) + "' height='6' rx='3' fill='url(%23g)'/></svg>";
}

function boardData(items, out) {
  items = (items || []).slice();
  const toMin = (s) => { const m = /(\d{2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const nowD = new Date();
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const wrap = (d) => { if (d == null) return null; if (d < -720) return d + 1440; if (d > 720) return d - 1440; return d; };
  const dirOf = (it) => (out === 'all' ? (it._dir || '0') : out);
  const planOf = (it) => (dirOf(it) === '1' ? it.arrPlanHour : it.depPlanHour) || '';
  const estOf = (it) => (dirOf(it) === '1' ? it.arrEstHour : it.depEstHour) || '';
  const actOf = (it) => (dirOf(it) === '1' ? (it.arrActHour || it.arrEstHour || it.arrPlanHour) : (it.depActHour || it.depEstHour || it.depPlanHour)) || '';
  const effOf = (it) => estOf(it) || planOf(it);
  const isDone = (it) => (dirOf(it) === '1'
    ? (/到达/.test(it.flightStatus || '') || !!it.arrActHour)
    : (/起飞|到达/.test(it.flightStatus || '') || !!it.depActHour));

  const enriched = items.map((it) => {
    const eff = effOf(it);
    const act = actOf(it);
    const eMin = toMin(eff);
    const aMin = toMin(act);
    return {
      it: it, done: isDone(it), eff: eff, act: act, plan: planOf(it),
      dEff: eMin != null ? wrap(eMin - nowMin) : null,
      dAct: aMin != null ? wrap(aMin - nowMin) : null,
    };
  });
  const doneList = enriched
    .filter((e) => e.done && e.dAct != null && e.dAct <= 5 && e.dAct >= -90)
    .sort((a, b) => b.dAct - a.dAct)
    .slice(0, 2);
  const doneSet = new Set(doneList.map((e) => e.it));
  let upList = enriched
    .filter((e) => !doneSet.has(e.it) && e.dEff != null && e.dEff >= -30)
    .sort((a, b) => a.dEff - b.dEff);

  const toRow = (e, rank) => {
    const it = e.it;
    const dm = /^[+-]?\d+$/.test((it.delayData || '').trim()) ? parseInt(it.delayData, 10) : 0;
    let time;
    let isRel = false;
    if (e.done) {
      if (e.dAct != null && e.dAct <= 0 && e.dAct >= -90) { time = e.dAct === 0 ? '刚刚' : (-e.dAct) + '分钟前'; isRel = true; }
      else time = e.act;
    } else if (e.dEff != null && e.dEff >= 0 && e.dEff <= 90) {
      time = e.dEff === 0 ? '现在' : e.dEff + '分钟后';
      isRel = true;
    } else {
      time = e.eff;
    }
    return {
      rank: rank, done: e.done, dir: dirOf(it),
      fno: it.flightNumber || '', code: it.airlineCode || '',
      place: (dirOf(it) === '1' ? it.departure : it.arrival) || '',
      time: time, eff: e.eff, plan: e.plan, isRel: isRel,
      status: it.flightStatus || '',
      term: (dirOf(it) === '1' ? it.arrTerminal : it.depTerminal) || '',
      delayMins: dm,
    };
  };

  const rows = [];
  doneList.forEach((e) => rows.push(toRow(e, '')));
  if (doneList.length) rows.push({ divider: out === '1' ? '以上是已进港航班' : out === '0' ? '以上是已出港航班' : '以上是已起降航班' });
  upList.forEach((e, i) => rows.push(toRow(e, i + 1)));
  if (!rows.length) {
    enriched
      .sort((a, b) => (a.dEff == null ? 9999 : a.dEff) - (b.dEff == null ? 9999 : b.dEff))
      .slice(0, 12)
      .forEach((e, i) => rows.push(toRow(e, i + 1)));
  }
  return rows;
}

function boardBars(items, out) {
  const now = new Date();
  const nowH = now.getHours();
  const counts = [0, 0, 0, 0, 0, 0];
  const hours = [0, 1, 2, 3, 4, 5].map((i) => (nowH + i) % 24);
  let total = 0;
  for (const it of items || []) {
    const dir = out === 'all' ? (it._dir || '0') : out;
    const eff = (dir === '1' ? (it.arrEstHour || it.arrPlanHour) : (it.depEstHour || it.depPlanHour)) || '';
    const m = /(\d{2}):/.exec(eff);
    if (!m) continue;
    let idx = (+m[1]) - nowH;
    if (idx < 0) idx += 24;
    if (idx >= 0 && idx < 6) { counts[idx]++; total++; }
  }
  return { counts: counts, hours: hours, total: total };
}

function weatherData(data) {
  const it = (data && data.item) || {};
  const g = it.genericWeather || {};
  const rows = (it.latestWeather && it.latestWeather.rows) || [];
  const w = rows[0] || {};
  return {
    desc: g.desc || w.wtype || '',
    range: (g.low || '') + '~' + (g.high || ''),
    lowN: parseInt(g.low, 10),
    highN: parseInt(g.high, 10),
    liveTemp: w.wtemperature || g.temper || '',
    vis: w.wvisib === '9999' ? '≥10km' : (w.wvisib ? w.wvisib + 'm' : (g.seefar || '')),
    wind: g.wind || '',
    impact: { high: '高', medium: '中', low: '低' }[it.impactLevel] || '',
    impactColor: it.impactLevel === 'high' ? RED : it.impactLevel === 'medium' ? ORANGE : GREEN,
  };
}

// 大屏数据里没有已到达航班时，拿最近一班已过点的航班查单航班状态，确认落地才置顶
async function fetchPinned(call, items, dirEnv) {
  const toMin = (s) => { const m = /(\d{2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const nowD = new Date();
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const wrap = (d) => { if (d == null) return null; if (d < -720) return d + 1440; if (d > 720) return d - 1440; return d; };
  const dirs = dirEnv === 'all' ? ['1'] : [dirEnv];
  for (const dir of dirs) {
    const cands = (items || [])
      .filter((it) => (dirEnv === 'all' ? (it._dir || '0') : dirEnv) === dir)
      .filter((it) => !/取消/.test(it.flightStatus || ''))
      .map((it) => {
        const t = (dir === '1' ? (it.arrEstHour || it.arrPlanHour) : (it.depEstHour || it.depPlanHour)) || '';
        const m = toMin(t);
        return { it: it, d: m != null ? wrap(m - nowMin) : null };
      })
      .filter((c) => c.d != null && c.d <= 5 && c.d >= -120)
      .sort((a, b) => b.d - a.d)
      .slice(0, 15);
    if (!cands.length) continue;
    // 分批并行查单航班状态，收集所有已确认落地的，再取其中最晚到达的一班
    const confirmed = [];
    for (let i = 0; i < cands.length; i += 5) {
      const batch = cands.slice(i, i + 5);
      const results = await Promise.all(batch.map(async (cand) => {
        try {
          const fd = flightData(parseData(await call('getFlightStatus', { fnum: cand.it.flightNumber, date: todayStr() })));
          return fd ? { cand: cand, fd: fd } : null;
        } catch (e) { return null; }
      }));
      for (const r of results) {
        if (!r) continue;
        const actStr = dir === '1' ? r.fd.actA : r.fd.actD;
        const ok = dir === '1' ? /到达/.test(r.fd.state) : /起飞|到达/.test(r.fd.state);
        if (!ok || !actStr) continue;
        const aMin = toMin(actStr);
        const dAct = aMin != null ? wrap(aMin - nowMin) : null;
        if (dAct == null || dAct > 10 || dAct < -150) continue;
        confirmed.push({ cand: r.cand, fd: r.fd, actStr: actStr, dAct: dAct });
      }
      if (confirmed.length) break;
    }
    if (!confirmed.length) continue;
    confirmed.sort((a, b) => b.dAct - a.dAct);
    const best = confirmed[0];
    const cand = best.cand;
    const fd = best.fd;
    const inWin = best.dAct <= 0 && best.dAct >= -120;
    const dm = /^[+-]?\d+$/.test((cand.it.delayData || '').trim()) ? parseInt(cand.it.delayData, 10) : 0;
    return {
      rank: '', done: true, dir: dir,
      fno: fd.fnum, code: fd.fnum.slice(0, 2),
      place: (dir === '1' ? cand.it.departure : cand.it.arrival) || '',
      time: inWin ? (best.dAct === 0 ? '刚刚' : (-best.dAct) + '分钟前') : best.actStr,
      eff: best.actStr,
      plan: (dir === '1' ? cand.it.arrPlanHour : cand.it.depPlanHour) || '',
      isRel: inWin,
      status: fd.state,
      term: (dir === '1' ? fd.arrT : fd.depT) || (dir === '1' ? cand.it.arrTerminal : cand.it.depTerminal) || '',
      delayMins: dm,
    };
  }
  return null;
}

// ---------- 渲染 ----------

function renderFlight(d, fam) {
  const children = [];
  const card = {
    type: 'stack', direction: 'column', gap: 6, padding: 10, backgroundColor: CARD, borderRadius: 12,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'start', children: [
          {
            type: 'stack', direction: 'column', gap: 1, children: [
              { type: 'text', text: d.depA, font: { size: 16, weight: 'bold' }, maxLines: 1, minScale: 0.7 },
              { type: 'text', text: d.depT, font: { size: 9 }, textColor: GRAY },
            ],
          },
          { type: 'spacer' },
          { type: 'text', text: '→', font: { size: 15 }, textColor: GRAY },
          { type: 'spacer' },
          {
            type: 'stack', direction: 'column', gap: 1, children: [
              { type: 'text', text: d.arrA, font: { size: 16, weight: 'bold' }, maxLines: 1, minScale: 0.7, textAlign: 'right' },
              { type: 'text', text: d.arrT, font: { size: 9 }, textColor: GRAY, textAlign: 'right' },
            ],
          },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [
          pill(d.state || '—', statusColor(d.state)),
          { type: 'spacer' },
          { type: 'text', text: d.ontime ? '准点率 ' + d.ontime + (d.avgDelay ? ' · 均延 ' + d.avgDelay : '') : '', font: { size: 9 }, textColor: GRAY },
        ],
      },
    ],
  };
  children.push(card);
  if (fam !== 'systemSmall') {
    const t = progressOf(d);
    if (t != null) {
      children.push({ type: 'image', src: routeSvg(t), width: 300, height: 54 });
      children.push({
        type: 'stack', direction: 'row', children: [
          { type: 'spacer' },
          { type: 'text', text: t >= 1 ? '已到达' : t <= 0 ? '待起飞' : '飞行中 · 已飞约 ' + Math.round(t * 100) + '%', font: { size: 9 }, textColor: GRAY },
          { type: 'spacer' },
        ],
      });
    }
    children.push({
      type: 'stack', direction: 'row', gap: 6, children: [
        chip('计划', d.planD + ' → ' + d.planA),
        chip('实际', (d.actD || '--:--') + ' → ' + (d.actA || '--:--')),
      ],
    });
    const chips = [];
    if (d.gate) chips.push(chip('登机口', d.gate));
    if (d.checkin) chips.push(chip('值机', d.checkin));
    if (d.baggage) chips.push(chip('行李', d.baggage));
    if (chips.length) children.push({ type: 'stack', direction: 'row', gap: 6, children: chips });
  }
  return children;
}

function boardRow(it) {
  if (it.divider) {
    return {
      type: 'stack', direction: 'row', children: [
        { type: 'spacer' },
        { type: 'text', text: '— ' + it.divider + ' —', font: { size: 9 }, textColor: GRAY },
        { type: 'spacer' },
      ],
    };
  }
  const sub = [];
  if (it.term) sub.push({ type: 'text', text: it.term, font: { size: 9 }, textColor: GRAY });
  if (it.isRel) {
    if (it.eff) sub.push({ type: 'text', text: it.eff, font: { size: 9 }, textColor: GRAY });
  } else if (it.plan && it.eff !== it.plan) {
    sub.push({ type: 'text', text: '计划 ' + it.plan, font: { size: 9 }, textColor: GRAY });
  }
  if (it.delayMins > 0) sub.push({ type: 'text', text: '延误 ' + it.delayMins + ' 分', font: { size: 9, weight: 'semibold' }, textColor: ORANGE });
  if (it.delayMins < 0) sub.push({ type: 'text', text: '提前 ' + (-it.delayMins) + ' 分', font: { size: 9, weight: 'semibold' }, textColor: GREEN });
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 5, padding: [5, 2],
    children: [
      { type: 'text', text: String(it.rank), font: { size: 10 }, textColor: GRAY, width: 14, textAlign: 'center' },
      { type: 'image', src: it.dir === '1' ? ARROW_IN : ARROW_OUT, width: 12, height: 12 },
      {
        type: 'stack', direction: 'column', gap: 1, width: 70, children: [
          { type: 'text', text: it.fno, font: { size: 12, weight: 'bold' }, maxLines: 1, minScale: 0.7 },
          { type: 'text', text: it.code, font: { size: 9 }, textColor: GRAY },
        ],
      },
      {
        type: 'stack', direction: 'column', gap: 2, flex: 1, children: [
          { type: 'text', text: it.place, font: { size: 12, weight: 'semibold' }, maxLines: 1, minScale: 0.7 },
          { type: 'stack', direction: 'row', gap: 4, children: sub },
        ],
      },
      {
        type: 'stack', direction: 'column', gap: 3, width: 84, children: [
          { type: 'text', text: it.time, font: { size: 13, weight: 'bold' }, textAlign: 'right' },
          { type: 'stack', direction: 'row', children: [{ type: 'spacer' }, pill(it.status || '—', statusColor(it.status))] },
        ],
      },
    ],
  };
}

function renderWeather(d) {
  const cardChildren = [
    {
      type: 'stack', direction: 'row', alignItems: 'end', gap: 6, children: [
        { type: 'text', text: d.desc, font: { size: 20, weight: 'bold' } },
        { type: 'text', text: d.range, font: { size: 12 }, textColor: GRAY },
        { type: 'spacer' },
        { type: 'text', text: d.liveTemp ? d.liveTemp + '℃' : '', font: { size: 20, weight: 'bold' }, textColor: BLUE },
      ],
    },
    { type: 'text', text: '实况温度 · 能见度 ' + d.vis, font: { size: 10 }, textColor: GRAY },
  ];
  const bar = tempSvg(d.lowN, d.highN);
  if (bar) cardChildren.push({ type: 'image', src: bar, width: 292, height: 12 });
  return [
    {
      type: 'stack', direction: 'column', gap: 6, padding: 10, backgroundColor: CARD, borderRadius: 12,
      children: cardChildren,
    },
    {
      type: 'stack', direction: 'row', gap: 6, children: [
        chip('风', d.wind || '—'),
        chip('能见度', d.vis || '—'),
        d.impact ? chip('天气影响', d.impact) : chip('天气影响', '—'),
      ],
    },
  ];
}

export default async function (ctx) {
  const env = ctx.env || {};
  const fam = ctx.widgetFamily || 'systemMedium';
  const refreshMin = Number(env.REFRESH) || 10;
  const refreshAfter = new Date(Date.now() + refreshMin * 60000).toISOString();
  const mode = env.MODE === '机场大屏' || env.MODE === '机场天气' ? env.MODE : '航班动态';
  const key = (env.API_KEY || '').trim();

  const shell = (children) => ({ type: 'widget', padding: 12, gap: 6, backgroundColor: BG, refreshAfter, children });
  const fail = (msg) => shell([
    header('飞常准 · ' + mode),
    { type: 'text', text: msg, font: { size: 12 }, textColor: RED, maxLines: 3 },
  ]);

  if (!key) return fail('请先在模块设置里填 MCP Key');

  const airport = (env.AIRPORT || 'SHA').trim().toUpperCase();
  let title;
  let firstLine = '';
  let bodyChildren;
  try {
    const call = await openSession(ctx, key);
    if (mode === '机场大屏') {
      const dirEnv = env.DIRECTION === '进港' ? '1' : env.DIRECTION === '全局' ? 'all' : '0';
      title = airport + (dirEnv === '1' ? ' 进港' : dirEnv === 'all' ? ' 全局' : ' 出港');
      let boardItems;
      if (dirEnv === 'all') {
        const dOut = parseData(await call('getAirportFlightBoard', { local: airport, out: '0' }));
        const dIn = parseData(await call('getAirportFlightBoard', { local: airport, out: '1' }));
        boardItems = ((dOut && dOut.items) || []).map((it) => Object.assign({}, it, { _dir: '0' }))
          .concat(((dIn && dIn.items) || []).map((it) => Object.assign({}, it, { _dir: '1' })));
      } else {
        const d = parseData(await call('getAirportFlightBoard', { local: airport, out: dirEnv }));
        boardItems = (d && d.items) || [];
      }
      const rows0 = boardData(boardItems, dirEnv);
      let rows = rows0;
      if (!rows.some((r) => r.done)) {
        const pinned = await fetchPinned(call, boardItems, dirEnv);
        if (pinned) {
          rows = rows.filter((r) => r.divider || r.fno !== pinned.fno);
          rows = [pinned, { divider: dirEnv === '1' ? '以上是已进港航班' : dirEnv === '0' ? '以上是已出港航班' : '以上是已起降航班' }].concat(rows);
        }
      }
      if (!rows.length) return fail('暂无航班数据');
      firstLine = rows[0].fno + ' ' + rows[0].status;
      const withChart = fam === 'systemLarge' || fam === 'systemExtraLarge';
      const budget = fam === 'systemSmall' ? 3 : fam === 'systemMedium' ? 4 : fam === 'systemExtraLarge' ? 8 : 6;
      const picked = [];
      let flights = 0;
      for (const r of rows) {
        if (r.divider) { if (flights < budget) picked.push(r); continue; }
        if (flights >= budget) break;
        picked.push(r); flights++;
      }
      if (picked.length && picked[picked.length - 1].divider) picked.pop();
      const rowNodes = [];
      picked.forEach((r, i) => {
        if (i > 0 && !r.divider && !picked[i - 1].divider) {
          rowNodes.push({ type: 'stack', direction: 'row', height: 1, backgroundColor: { light: '#EDEDF0', dark: '#2C2C2E' }, children: [] });
        }
        rowNodes.push(boardRow(r));
      });
      bodyChildren = (fam === 'accessoryRectangular' || fam === 'accessoryCircular' || fam === 'accessoryInline')
        ? picked.slice(0, 2).map((it) => boardRow(it))
        : [{ type: 'stack', direction: 'column', gap: 0, children: rowNodes }];
      if (withChart) {
        const bars = boardBars(boardItems, dirEnv);
        if (bars.total > 0) {
          bodyChildren = [
            {
              type: 'stack', direction: 'column', gap: 2, padding: [6, 8], backgroundColor: CARD, borderRadius: 10,
              children: [
                {
                  type: 'stack', direction: 'row', children: [
                    { type: 'text', text: '未来 6 小时航班分布', font: { size: 9 }, textColor: GRAY },
                    { type: 'spacer' },
                    { type: 'text', text: '共 ' + bars.total + ' 班', font: { size: 9 }, textColor: GRAY },
                  ],
                },
                { type: 'image', src: barsSvg(bars.counts), width: 300, height: 44 },
                {
                  type: 'stack', direction: 'row', children: [
                    { type: 'spacer' },
                    { type: 'text', text: bars.hours.map((h, i) => h + '时 ' + bars.counts[i] + '班').join('  ·  '), font: { size: 9 }, textColor: GRAY },
                    { type: 'spacer' },
                  ],
                },
              ],
            },
          ].concat(bodyChildren);
        }
      }
    } else if (mode === '机场天气') {
      title = airport + ' 机场天气';
      const d = weatherData(parseData(await call('getAirportWeatherBriefing', { airportCode: airport })));
      if (!d.desc) return fail('暂无天气数据');
      firstLine = d.desc + ' ' + d.range;
      bodyChildren = renderWeather(d);
    } else {
      const fnum = (env.FLIGHT || 'MU5102').trim().toUpperCase();
      title = fnum + ' · ' + todayStr().slice(5);
      const d = flightData(parseData(await call('getFlightStatus', { fnum: fnum, date: todayStr() })));
      if (!d) return fail('暂无该航班数据');
      firstLine = d.fnum + ' ' + d.state;
      bodyChildren = renderFlight(d, fam);
    }
  } catch (e) {
    return fail(String((e && e.message) || e));
  }

  if (fam === 'accessoryInline') {
    return { type: 'widget', refreshAfter, children: [{ type: 'text', text: title + ' ' + firstLine }] };
  }
  if (fam === 'accessoryCircular') {
    return {
      type: 'widget', refreshAfter, padding: 4, gap: 2,
      children: [
        { type: 'text', text: title.split(' ')[0].slice(0, 7), font: { size: 10 }, textAlign: 'center' },
        { type: 'text', text: firstLine.slice(0, 8), font: { size: 11, weight: 'bold' }, maxLines: 1, minScale: 0.5, textAlign: 'center' },
      ],
    };
  }
  if (fam === 'accessoryRectangular') {
    return shell([header(title)].concat(bodyChildren.slice(0, 2)));
  }
  return shell([header(title)].concat(bodyChildren));
}
