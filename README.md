# 量筒的密室杀手

欢迎您访问该项目！该项目旨在在基岩版尽可能地还原 Hypixel 的密室杀手（Murder Mystery）小游戏。

该项目由珂朵莉（Tetrisoo，@VioletMiaw）和欧拉（Freamoluwu）大力赞助并支持，并且由测试群（QQ：673941729）中的群友进行测试。感谢为这张地图做出贡献的人！

该地图至少需要使用 26.40 或更高版本游玩。

请注意：该项目使用 GPL 协议。您可以使用其中的源代码，但必须同样使用 GPL 协议并开源。

## 项目构建

该项目使用 TypeScript 编写。这意味着如果您需要使用源码，您需要做额外的构建工作才能正常使用该项目。

如果你对源码不感兴趣，只想要一个能玩的地图，我们也有地图可供您下载。您可以在右侧的 Release（手机页面在下方）找到我们发布的地图。按照对应页面进行操作，下载地图后即可游玩。

我们这里使用了 Microsoft 提供的工具 just-scripts 构建，您可以在[下一步：用 TypeScript 编写脚本 | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/next-steps?view=minecraft-bedrock-stable)了解更多。

如果还有什么想要了解的，请联系我们的 QQ 群，进群申请填写为「GitHub 密室杀手」。

## 1.0 - Snapshot 7 更新日志

本周的更新修复了上周出现的一些问题，并更新了三张新地图。

### 设置

- 现在在玩家死亡后，会直接打开设置页面，并在设置内内置了 传送到 设置项

### 漏洞修复

- 现在游戏内可以开启灵动视效（Vibrant Visuals）和光线追踪（Ray Tracing）了
- 修复了存活玩家判断错误而导致的一系列问题

### 技术性

- 更新了行为包和资源包的版本为`1.0.14`
- 为设置新增了开发者设置
  - 该设置需要玩家拥有`developer`标签，并且玩家是管理员
  - 添加了 2 个设置：新增 1 名假玩家、移除所有假玩家
