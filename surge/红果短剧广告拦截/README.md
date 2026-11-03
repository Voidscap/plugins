# 红果短剧广告拦截（Surge 模块）

由 Loon 插件 `hgdj.lpx` 转换而来，原作者：Tartarus2014  
原仓库：https://github.com/Tartarus2014/Loon-Script  
原链接：https://raw.githubusercontent.com/Tartarus2014/Loon-Script/refs/heads/master/Plugin/Block/hgdj.lpx

拦截红果短剧及字节系相关广告请求，同时直连内容服务器避免加载异常。规则共 15 条：11 条 REJECT（红果核心广告 + 字节系广告兜底），4 条 DIRECT（红果内容直连）。

## Surge 导入

在 Surge → 配置 → 模块 → 添加模块，粘贴以下链接：

```
https://raw.githubusercontent.com/Voidscap/plugins/main/surge/%E7%BA%A2%E6%9E%9C%E7%9F%AD%E5%89%A7%E5%B9%BF%E5%91%8A%E6%8B%A6%E6%88%AA/hgdj.sgmodule
```

## Loon 原版

原 Loon 插件在作者仓库，文件 `Plugin/Block/hgdj.lpx`。
