// Surge 版 Telegram 跳转
// 由 Egern 模块转换而来，原作者：panda𝕏
// 原仓库：https://github.com/IBL3ND/module
// 原文件：Telegram.yaml + TgRedirect.js
// 转换说明：Egern 的 ctx / export default 写法 Surge 不认，已按 Surge 的 $request / $argument / $done 重写；
// 跳转逻辑原样保留：invite / joinchat / addstickers / share / 指定帖子 / 用户名解析。
// 客户端通过模块里 argument=CLIENT=xxx 选择，默认 Telegram（官方版，不跳转）；
// 想跳到第三方客户端，把 sgmodule 里 CLIENT= 后面改成 Nagram / Swiftgram / Turrit / iMe / Nicegram / Lingogram / Regram。

const SCHEME = {
  Telegram: "tg",
  Nagram: "na",
  Swiftgram: "sg",
  Turrit: "turrit",
  iMe: "ime",
  Nicegram: "ng",
  Lingogram: "lingo",
  Regram: "regram",
};

function qval(qs, key) {
  if (!qs) return "";
  const re = new RegExp(
    "(?:^|&)" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^&]*)"
  );
  const m = qs.match(re);
  return m ? decodeURIComponent(m[1]) : "";
}

function deeplink(s, path, qs) {
  const p = path.split("/").filter(Boolean);
  if (!p[0]) return "";

  if (p[0][0] === "+") {
    return `${s}://join?invite=${encodeURIComponent(p[0].slice(1))}`;
  }
  if (p[0] === "joinchat" && p[1]) {
    return `${s}://join?invite=${encodeURIComponent(p[1])}`;
  }
  if (p[0] === "addstickers" && p[1]) {
    return `${s}://addstickers?set=${encodeURIComponent(p[1])}`;
  }
  if (p[0] === "share" && p[1] === "url") {
    return `${s}://msg_url?url=${encodeURIComponent(qval(qs, "url"))}&text=${encodeURIComponent(qval(qs, "text"))}`;
  }
  if (p[1] && /^\d+$/.test(p[1])) {
    return `${s}://resolve?domain=${encodeURIComponent(p[0])}&post=${encodeURIComponent(p[1])}`;
  }
  return `${s}://resolve?domain=${encodeURIComponent(p[0])}`;
}

(function () {
  const url = $request.url;
  const m = url.match(/^https?:\/\/(?:t\.me|telegram\.me)\/(.+)$/i);
  if (!m) return $done({});

  // Surge 的 $argument 是字符串，如 "CLIENT=Nagram"
  let client = "Telegram";
  if (typeof $argument === "string" && $argument) {
    const parts = $argument.split("&");
    for (const part of parts) {
      const kv = part.split("=");
      if (kv[0] === "CLIENT" && kv[1]) client = decodeURIComponent(kv[1].trim());
    }
  }

  // 官方 Telegram：不跳转，原样放行
  if (client === "Telegram") return $done({});

  const scheme = SCHEME[client] || "tg";

  let tail = m[1];
  if (tail.startsWith("s/")) tail = tail.slice(2);

  const qi = tail.indexOf("?");
  const path = qi < 0 ? tail : tail.slice(0, qi);
  const qs = qi < 0 ? "" : tail.slice(qi + 1);

  const loc = deeplink(scheme, path, qs);
  if (!loc) return $done({});

  return $done({
    response: {
      status: 302,
      headers: {
        Location: loc,
        "Cache-Control": "no-store, no-cache",
      },
      body: "",
    },
  });
})();
