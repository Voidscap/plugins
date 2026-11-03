# 字节净化（Surge 模块）

由 Egern 模块转换而来，原作者：ByteValley  
原仓库：https://github.com/ByteValley/NetTool  
原文件：`Egern/Module/Purification/ByteDance.yaml`

按域名精细拦截字节系广告（蛋花 / 番茄 / 头条 / 抖音内嵌），屏蔽开屏 / 激励 / 前贴片及埋点，兼容短剧播放。

## 规则

只有 1 条 Surge 逻辑规则（AND / OR 嵌套），策略 `REJECT-DROP`。同时满足才拦截：

1. 域名属于 `douyin.com`、`zijieapi.com`、`snssdk.com`、`toutiaoapi.com`、`fqnovel.com`、`fqnovelvod.com`
2. 主机名里含有 `-lf`、`-lq` 或 `-hl`

不满足任一条件的不拦截，所以对短剧正常播放影响小，但也不是全量广告拦截。

## Surge 导入

在 Surge → 配置 → 模块 → 添加模块，粘贴以下链接：

```
https://raw.githubusercontent.com/Voidscap/plugins/main/surge/%E5%AD%97%E8%8A%82%E5%87%80%E5%8C%96/ByteDance.sgmodule
```

无脚本，不用 MITM。
