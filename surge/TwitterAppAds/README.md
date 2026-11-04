# X (Twitter) App 去广告（Surge 模块，未实测）

改编自奶思 fmz200 的网页版模块，原作者：fmz200  
原模块：https://github.com/fmz200/wool_scripts/blob/main/Surge/module/XWebAds.module  
原脚本：`Scripts/X/X_ads.js`（2026-06-17 更新）

## 为什么没有现成的 App 版

GitHub 上能找到的推特去广告 Surge 模块基本都是网页版（`x.com`），没有一个是专门给原生 App 做的。这份是把网页版改编过来的：脚本本身不认域名，只看 URL 里有没有 `/HomeTimeline`、`/HomeLatestTimeline`、`/TweetDetail`，再按 `promoted-tweet` / `promotedMetadata` 过滤推广条目；App 走的也是同一套 GraphQL 接口，只是域名换成 `api.x.com` / `api.twitter.com`，所以把匹配地址和 MITM 主机名改成这两个域名，理论上就能用。

## 包含什么

- 脚本 1 条：`X_ads.js`（原样复制，未改动），过滤首页“为你推荐”/“正在关注”和推文详情里的推广条目
- 规则 6 条：`ads-twitter.com` 等广告域名拦截（fmz200 的 `Twitter.sgmodule` 里那 6 条，只拦广告域名，拦不掉时间线推广）
- MITM：`api.x.com`、`api.twitter.com`、`x.com`

## Surge 导入

在 Surge → 配置 → 模块 → 添加模块，粘贴以下链接：

```
https://raw.githubusercontent.com/Voidscap/plugins/main/surge/TwitterAppAds/X.sgmodule
```

需要开启 MITM，首次使用需安装并信任 Surge 的 MITM 证书。

## ⚠️ 未实测，必须你自己验证

只做了语法检查和逐项对照，**没在真机 X App 上跑过**。有两个风险如实写在这里：

1. X App 可能对 `api.twitter.com` / `api.x.com` 做证书固定（pinning），MITM 一开 App 可能直接加载不出来或闪退。如果出现这种情况，先把本模块关掉，再把 MITM 里这两个域名排除。
2. App 的接口可能跟网页版不完全一样，推广也可能出现在搜索、用户主页等其他时间线里，这个脚本只处理首页和详情页。

如果 App 版用不了，退路是网页版：用 fmz200 的原版 `XWebAds.module`（只 MITM `x.com`），在 Safari 里打开 x.com，点分享 → 添加到主屏幕，体验跟 App 差不多，而且 MITM 不影响网页版正常使用。

```
https://raw.githubusercontent.com/fmz200/wool_scripts/main/Surge/module/XWebAds.module
```
