// Egern 小组件：飞常准航班动态 / 机场大屏 / 机场天气
// 数据源：飞常准 app 网关 MCP（c-gw.variflight.com，需要会话握手）
// 可选环境变量（env）：
//   API_KEY    飞常准 MCP Key（必填）：飞常准 app「MCP 连接」页生成，sk-user- 开头
//   MODE       航班动态 | 机场大屏 | 机场天气，默认 航班动态
//   FLIGHT     航班号（含航司二字码），默认 MU5102
//   AIRPORT    机场三字码，默认 SHA
//   DIRECTION  出港 | 进港，默认 出港（机场大屏模式用）
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

// MCP 握手（initialize → initialized 通知 → tools/call），返回工具的文本结果
async function callTool(ctx, key, name, args) {
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
  let sid = null;
  try { sid = init.headers && init.headers.get ? init.headers.get('Mcp-Session-Id') : null; } catch (e) { sid = null; }
  const h = Object.assign({}, base);
  if (sid) h['Mcp-Session-Id'] = sid;
  try {
    const n = await ctx.http.post(ENDPOINT, { headers: h, body: { jsonrpc: '2.0', method: 'notifications/initialized' }, timeout: 20000 });
    await n.text();
  } catch (e) { /* 通知失败不阻断查询 */ }

  const resp = await ctx.http.post(ENDPOINT, {
    headers: h,
    body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: name, arguments: args } },
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
    gate: f.BoardGate || '',
    checkin: f.CheckinTable || '',
    baggage: f.BaggageID || '',
    ontime: f.ontimeRate || '',
    avgDelay: f.AvgDelay || '',
  };
}

function boardData(data, out) {
  const items = ((data && data.items) || []).slice();
  const toMin = (s) => { const m = /(\d{2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : 9999; };
  const nowMin = toMin(nowHM());
  const planOf = (it) => (out === '1' ? it.arrPlanHour : it.depPlanHour) || '';
  const estOf = (it) => (out === '1' ? it.arrEstHour : it.depEstHour) || '';
  const effOf = (it) => estOf(it) || planOf(it);
  const upcoming = items
    .filter((it) => toMin(planOf(it)) >= nowMin || toMin(effOf(it)) >= nowMin)
    .sort((a, b) => toMin(effOf(a)) - toMin(effOf(b)));
  const list = upcoming.length ? upcoming : items;
  return list.map((it, idx) => {
    const plan = planOf(it);
    const eff = effOf(it);
    const diff = toMin(eff) - nowMin;
    const isRel = diff >= 0 && diff <= 90;
    const dm = /^[+-]?\d+$/.test((it.delayData || '').trim()) ? parseInt(it.delayData, 10) : 0;
    return {
      rank: idx + 1,
      fno: it.flightNumber || '',
      code: it.airlineCode || '',
      place: (out === '1' ? it.departure : it.arrival) || '',
      time: isRel ? (diff === 0 ? '现在' : diff + '分钟后') : eff,
      eff: eff,
      plan: plan,
      isRel: isRel,
      status: it.flightStatus || '',
      term: (out === '1' ? it.arrTerminal : it.depTerminal) || '',
      delayMins: dm,
    };
  });
}

function weatherData(data) {
  const it = (data && data.item) || {};
  const g = it.genericWeather || {};
  const rows = (it.latestWeather && it.latestWeather.rows) || [];
  const w = rows[0] || {};
  return {
    desc: g.desc || w.wtype || '',
    range: (g.low || '') + '~' + (g.high || ''),
    liveTemp: w.wtemperature || g.temper || '',
    vis: w.wvisib === '9999' ? '≥10km' : (w.wvisib ? w.wvisib + 'm' : (g.seefar || '')),
    wind: g.wind || '',
    impact: { high: '高', medium: '中', low: '低' }[it.impactLevel] || '',
    impactColor: it.impactLevel === 'high' ? RED : it.impactLevel === 'medium' ? ORANGE : GREEN,
  };
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

function boardRow(it, out) {
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
    type: 'stack', direction: 'row', alignItems: 'center', gap: 5, padding: [6, 8], backgroundColor: CARD, borderRadius: 10,
    children: [
      { type: 'text', text: String(it.rank), font: { size: 11 }, textColor: GRAY, width: 14, textAlign: 'center' },
      { type: 'image', src: out === '1' ? ARROW_IN : ARROW_OUT, width: 12, height: 12 },
      {
        type: 'stack', direction: 'column', gap: 1, width: 70, children: [
          { type: 'text', text: it.fno, font: { size: 13, weight: 'bold' }, maxLines: 1, minScale: 0.7 },
          { type: 'text', text: it.code, font: { size: 9 }, textColor: GRAY },
        ],
      },
      {
        type: 'stack', direction: 'column', gap: 2, flex: 1, children: [
          { type: 'text', text: it.place, font: { size: 13, weight: 'semibold' }, maxLines: 1, minScale: 0.7 },
          { type: 'stack', direction: 'row', gap: 4, children: sub },
        ],
      },
      {
        type: 'stack', direction: 'column', gap: 3, width: 84, children: [
          { type: 'text', text: it.time, font: { size: 14, weight: 'bold' }, textAlign: 'right' },
          { type: 'stack', direction: 'row', children: [{ type: 'spacer' }, pill(it.status || '—', statusColor(it.status))] },
        ],
      },
    ],
  };
}

function renderWeather(d) {
  return [
    {
      type: 'stack', direction: 'column', gap: 6, padding: 10, backgroundColor: CARD, borderRadius: 12,
      children: [
        {
          type: 'stack', direction: 'row', alignItems: 'end', gap: 6, children: [
            { type: 'text', text: d.desc, font: { size: 20, weight: 'bold' } },
            { type: 'text', text: d.range, font: { size: 12 }, textColor: GRAY },
            { type: 'spacer' },
            { type: 'text', text: d.liveTemp ? d.liveTemp + '℃' : '', font: { size: 20, weight: 'bold' }, textColor: BLUE },
          ],
        },
        { type: 'text', text: '实况温度 · 能见度 ' + d.vis, font: { size: 10 }, textColor: GRAY },
      ],
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
    if (mode === '机场大屏') {
      const out = env.DIRECTION === '进港' ? '1' : '0';
      title = airport + (out === '1' ? ' 进港' : ' 出港');
      const rows = boardData(parseData(await callTool(ctx, key, 'getAirportFlightBoard', { local: airport, out: out })), out);
      if (!rows.length) return fail('暂无航班数据');
      firstLine = rows[0].fno + ' ' + rows[0].status;
      const max = fam === 'systemSmall' ? 3 : fam === 'systemMedium' ? 4 : fam === 'systemExtraLarge' ? 9 : 7;
      bodyChildren = rows.slice(0, max).map((it) => boardRow(it, out));
    } else if (mode === '机场天气') {
      title = airport + ' 机场天气';
      const d = weatherData(parseData(await callTool(ctx, key, 'getAirportWeatherBriefing', { airportCode: airport })));
      if (!d.desc) return fail('暂无天气数据');
      firstLine = d.desc + ' ' + d.range;
      bodyChildren = renderWeather(d);
    } else {
      const fnum = (env.FLIGHT || 'MU5102').trim().toUpperCase();
      title = fnum + ' · ' + todayStr().slice(5);
      const d = flightData(parseData(await callTool(ctx, key, 'getFlightStatus', { fnum: fnum, date: todayStr() })));
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
