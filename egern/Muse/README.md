# Muse 分流（Egern 模块）

Muse、Instagram、Facebook 的域名走代理，共 17 条规则。

由 Surge 版 `surge/Muse/Muse.list` 转化而来，规则逐条对照，无增减。

## Egern 导入

在 Egern → 模块 → 添加模块，粘贴以下链接：

```
https://raw.githubusercontent.com/Voidscap/plugins/main/egern/Muse/Muse.yaml
```

规则里的 `Proxy` 是 Egern 默认代理组；想走指定策略组，把 `Proxy` 换成组名。
