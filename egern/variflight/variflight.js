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
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'egern-widget', version: '1' } },
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

function flightLines(data) {
  const items = (data && data.items) || [];
  if (!items.length) return ['暂无该航班数据'];
  const f = items[0];
  const lines = [];
  lines.push(f.FlightNo + ' ' + (f.FlightState || ''));
  lines.push((f.FlightDepAirport || f.FlightDep || '') + ' → ' + (f.FlightArrAirport || f.FlightArr || ''));
  lines.push('计划 ' + hhmm(f.FlightDeptimePlanDate) + ' 起飞 · ' + hhmm(f.FlightArrtimePlanDate) + ' 到达');
  const actDep = hhmm(f.FlightDeptimeDate || f.FlightDeptimeEstDate);
  const actArr = hhmm(f.FlightArrtimeDate || f.FlightArrtimeEstDate);
  if (actDep || actArr) lines.push('实际 ' + (actDep || '--:--') + ' 起飞 · ' + (actArr || '--:--') + ' 到达');
  const bits = [];
  if (f.BoardGate) bits.push('登机口 ' + f.BoardGate);
  if (f.CheckinTable) bits.push('值机 ' + f.CheckinTable);
  if (f.BaggageID) bits.push('行李 ' + f.BaggageID);
  if (bits.length) lines.push(bits.join(' · '));
  if (f.ontimeRate) lines.push('准点率 ' + f.ontimeRate + (f.AvgDelay ? ' · 平均延误 ' + f.AvgDelay : ''));
  return lines;
}

function boardLines(data, out) {
  const items = ((data && data.items) || []).slice();
  if (!items.length) return ['暂无航班数据'];
  const now = nowHM();
  const keyOf = (it) => (out === '1' ? it.arrPlanHour : it.depPlanHour) || '99:99';
  const upcoming = items.filter((it) => keyOf(it) >= now).sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
  const list = (upcoming.length ? upcoming : items).slice(0, 12);
  return list.map((it) => {
    const t = out === '1' ? it.arrPlanHour : it.depPlanHour;
    const place = out === '1' ? it.departure : it.arrival;
    let s = it.flightNumber + ' ' + place + ' ' + t + ' ' + (it.flightStatus || '');
    if (/^\+[1-9]/.test(it.delayData || '')) s += ' 延误' + it.delayData.slice(1) + '分';
    return s;
  });
}

function weatherLines(data) {
  const it = (data && data.item) || {};
  const g = it.genericWeather || {};
  const rows = (it.latestWeather && it.latestWeather.rows) || [];
  const w = rows[0] || {};
  const lines = [];
  if (g.desc) lines.push(g.desc + ' ' + (g.low || '') + '~' + (g.high || ''));
  if (w.wtype) lines.push('实况 ' + w.wtype + ' ' + (w.wtemperature || '') + '℃ · 能见度 ' + (w.wvisib === '9999' ? '≥10km' : (w.wvisib || '') + 'm'));
  if (g.wind) lines.push('风 ' + g.wind);
  const lv = { high: '高', medium: '中', low: '低' }[it.impactLevel];
  if (lv) lines.push('天气影响：' + lv);
  return lines.length ? lines : ['暂无天气数据'];
}

export default async function (ctx) {
  const env = ctx.env || {};
  const fam = ctx.widgetFamily || 'systemMedium';
  const refreshMin = Number(env.REFRESH) || 10;
  const refreshAfter = new Date(Date.now() + refreshMin * 60000).toISOString();
  const GRAY = '#8E8E93';
  const RED = '#FF3B30';
  const bg = { light: '#FFFFFF', dark: '#1C1C1E' };
  const mode = env.MODE === '机场大屏' || env.MODE === '机场天气' ? env.MODE : '航班动态';
  const key = (env.API_KEY || '').trim();

  const fail = (msg) => ({
    type: 'widget', padding: 14, gap: 4, backgroundColor: bg, refreshAfter,
    children: [
      { type: 'text', text: '飞常准 · ' + mode, font: { size: 14, weight: 'semibold' } },
      { type: 'text', text: msg, font: { size: 12 }, textColor: RED, maxLines: 3 },
    ],
  });

  if (!key) return fail('请先在模块设置里填 MCP Key');

  const airport = (env.AIRPORT || 'SHA').trim().toUpperCase();
  let title;
  let lines;
  try {
    if (mode === '机场大屏') {
      const out = env.DIRECTION === '进港' ? '1' : '0';
      title = airport + (out === '1' ? ' 进港' : ' 出港');
      lines = boardLines(parseData(await callTool(ctx, key, 'getAirportFlightBoard', { local: airport, out: out })), out);
    } else if (mode === '机场天气') {
      title = airport + ' 机场天气';
      lines = weatherLines(parseData(await callTool(ctx, key, 'getAirportWeatherBriefing', { airportCode: airport })));
    } else {
      const fnum = (env.FLIGHT || 'MU5102').trim().toUpperCase();
      title = fnum + ' · ' + todayStr().slice(5);
      lines = flightLines(parseData(await callTool(ctx, key, 'getFlightStatus', { fnum: fnum, date: todayStr() })));
    }
  } catch (e) {
    return fail(String((e && e.message) || e));
  }
  if (!lines.length) lines = ['暂无数据'];

  if (fam === 'accessoryInline') {
    return { type: 'widget', refreshAfter, children: [{ type: 'text', text: title + ' ' + lines[0] }] };
  }
  if (fam === 'accessoryCircular') {
    return {
      type: 'widget', refreshAfter, padding: 4, gap: 2,
      children: [
        { type: 'text', text: title.split(' ')[0].slice(0, 7), font: { size: 10 }, textAlign: 'center' },
        { type: 'text', text: lines[0].slice(0, 8), font: { size: 11, weight: 'bold' }, maxLines: 1, minScale: 0.5, textAlign: 'center' },
      ],
    };
  }

  const maxLines = fam === 'systemSmall' ? 4 : fam === 'systemMedium' ? 7 : 12;
  const statusColor = (s) => (/取消/.test(s) ? RED : /延误/.test(s) ? '#FF9500' : undefined);
  const body = lines.slice(0, maxLines).map((l, i) => ({
    type: 'text',
    text: l,
    font: i === 0 && mode === '航班动态' ? { size: 15, weight: 'bold' } : { size: 12 },
    textColor: statusColor(l),
    maxLines: fam === 'systemSmall' ? 2 : 1,
    minScale: 0.7,
  }));

  return {
    type: 'widget', padding: 12, gap: 4, backgroundColor: bg, refreshAfter,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          { type: 'text', text: title, font: { size: 13, weight: 'semibold' } },
          { type: 'spacer' },
          { type: 'date', date: new Date().toISOString(), format: 'time', font: { size: 10 }, textColor: GRAY },
        ],
      },
    ].concat(body),
  };
}
