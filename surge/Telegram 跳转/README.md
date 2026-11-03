# Telegram 跳转（Surge 模块）

由 Egern 模块转换而来，原作者：panda𝕏  
原仓库：https://github.com/IBL3ND/module  
原文件：`Telegram.yaml` + `TgRedirect.js`

将 `t.me` / `telegram.me` 链接重定向到你选择的 Telegram 客户端。

## 可选客户端

Telegram（默认，官方版，不跳转）、Nagram、Swiftgram、Turrit、iMe、Nicegram、Lingogram、Regram

想换客户端，改 `Telegram.sgmodule` 里这一行 `argument=CLIENT=` 后面的值即可。

## Surge 导入

在 Surge → 配置 → 模块 → 添加模块，粘贴以下链接：

```
https://raw.githubusercontent.com/Voidscap/plugins/main/surge/Telegram%20%E8%B7%B3%E8%BD%AC/Telegram.sgmodule
```

需要开启 MITM，模块已包含 `t.me`、`telegram.me` 的 MITM 主机名；首次使用需安装并信任 Surge 的 MITM 证书。
