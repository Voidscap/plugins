# 番茄小说去广告（Surge 模块）

拦截番茄小说广告、激励广告、日志上报与短链跳转，保留番茄 API、封面与短剧播放。

规则来源：掌柜的手机实测（match_rule 验证）+ DSH 经 Surge MCP 整理，2026-11-12。

## 规则

共 22 条，纯规则，无脚本，不用 MITM：

- 11 条 `REJECT`：手机实测验证过的域名，字节系广告 / 统计 / 电商相关（snssdk.com 下的几个子域名、pstatp.com CDN、byteorge / bytegoofy、ecombdapi / ecombdimg）。
- 11 条 `REJECT-DROP`：短链跳转（ugsdk.cn、bdurl.net、zjurl.cn、byteurl.cn）、激励广告（`DOMAIN-KEYWORD,-reward-`）、日志上报与监控（`log*-applog*.fqnovel.com`、`rtlog*-applog*`、`mon*-misc*`），以及 3 条 AND 组合规则（bytegecko.com + `-tos`、snssdk.com + `-bjlgy` / `frontier-aweme`、douyin.com + `-open-lf`）。

## 与「字节净化」的区别

不再用 `-lf` / `-lq` / `-hl` 后缀总闸——那个总闸会误杀番茄主接口 `api*-normal-*.fqnovel.com`。仓库里的「字节净化」模块只有 1 条规则，正是用这个总闸，**两个模块不要同时开**，否则总闸还是会误杀番茄主接口。

保留的内容：番茄 API、封面（fqnovelpic / novel.byteimg）、短剧（fqnovelvod）。

## Surge 导入

在 Surge → 配置 → 模块 → 添加模块，粘贴以下链接：

```
https://raw.githubusercontent.com/Voidscap/plugins/main/surge/FanQie/FanQie.sgmodule
```

无脚本，不用 MITM。只在手机上实测过规则命中，未在真机上长期验证去广告效果。
