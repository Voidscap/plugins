# YouTube 增强（Surge 模块）

由 Egern 模块转换而来，原作者：gholts、Maasea（Egern 版由 IBL3ND 整理）  
原 Egern 文件：https://raw.githubusercontent.com/IBL3ND/module/refs/heads/main/Egern-YouTube.yaml  
原作者的 Surge 版：https://github.com/gholts/surge/blob/main/modules/youtube-enhance.sgmodule

去除 YouTube 广告，支持后台播放、画中画；另含隐藏上传/Shorts/小游戏/竖屏直播/商店入口、自动最高画质、Jump Ahead、实验性原生下载、双语字幕。

## 包含什么

- 规则 2 条：`googlevideo.com` / `youtubei.googleapis.com` 的 UDP 请求直接 REJECT
- URL 重写 9 条：去掉 `ctier=L`、拦广告埋点（`stats/ads`、`pagead`/`ptracking`、`qoe?adcontext`、`&oad`）、字幕翻译重定向（`tlang` → `subtype=Translate`）
- 脚本 9 条：`youtube-request.js`、`youtube-response.js`、`YT-CC-ASR-Auto.js`（三个脚本原样复制自 IBL3ND/js，未改动；本来就是 Surge 风格的 `$request` / `$response` / `$argument` / `$done` 写法）
- MITM：`*.googlevideo.com`（排除 `redirector*.googlevideo.com`）、`youtubei.googleapis.com`、`www.youtube.com`、`s.youtube.com`、`m.youtube.com`

## 选项默认值（按 Egern 版）

上传、Shorts、小游戏、竖屏直播、Jump Ahead、商店、自动最高画质、原生下载全开。想改哪个，把 `YouTube.sgmodule` 里对应 `argument={...}` 的 `true` 改成 `false`。

两处跟原作者 Surge 版不一样的地方，如实写在这里：

1. Egern 里“屏蔽选段按钮”这个选项声明了，但没传给任何脚本，是个摆设，这里没收。
2. 原作者 Surge 版多了 `block_ai` / `on_the_go` 两个选项，Egern 版没有，这里也没加；`blockShorts` / `blockVerticalLive` 的默认值 Egern 版是 `true`，原作者 Surge 版是 `false`，这里按 Egern 版的 `true`。

## Surge 导入

在 Surge → 配置 → 模块 → 添加模块，粘贴以下链接：

```
https://raw.githubusercontent.com/Voidscap/plugins/main/surge/YouTube%20%E5%A2%9E%E5%BC%BA/YouTube.sgmodule
```

需要开启 MITM，首次使用需安装并信任 Surge 的 MITM 证书。YouTube 有证书 pinning 风险，若播放异常先关掉本模块排查。

注意：脚本逻辑复杂（5,768 行的 protobuf 处理），只做了语法检查和逐项对照，没有在真机 YouTube 上实测过；导入后请自己打开 YouTube 验证广告、后台播放、画中画是否正常。
