# 量筒的密室杀手

欢迎您访问该项目！该项目旨在在基岩版尽可能地还原 Hypixel 的密室杀手（Murder Mystery）小游戏。

该项目由珂朵莉（Tetrisoo，@VioletMiaw）和欧拉（Freamoluwu）大力赞助并支持，并且由测试群（QQ：673941729）中的群友进行测试。感谢为这张地图做出贡献的人！

该地图至少需要使用 26.40 或更高版本游玩。

请注意：该项目使用 GPL 协议。您可以使用其中的源代码，但必须同样使用 GPL 协议并开源。

## 项目构建

该项目使用 TypeScript 编写。这意味着如果您需要使用源码，您需要做额外的构建工作才能正常使用该项目。

如果你对源码不感兴趣，只想要一个能玩的地图，我们也有地图可供您下载。您可以在右侧的 Release（手机页面在下方）找到我们发布的地图。按照对应页面进行操作，下载地图后即可游玩。

我们这里使用了 Microsoft 提供的工具 just-scripts 构建，您可以在[下一步：用 TypeScript 编写脚本 | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/next-steps?view=minecraft-bedrock-stable)了解更多。

我们的地图安装了自定义头颅，使用了南瓜汁（@PumpkinJui）的脚本进行代码生成。您可以在 [mm_head 仓库](https://github.com/PumpkinJui/mm_head)了解更多。

如果还有什么想要了解的，请联系我们的 QQ 群，进群申请填写为「GitHub 密室杀手」。

## 1.0 - Exp 8 更新日志

### 地图

- 现在新版本的地图不再默认显示 V2 字样

### 设置

- 在关于页面新增了自定义头颅适配名单

### 漏洞修复

- 修复了在英语环境下，杀手获取刀剑时，剩余 1 秒提示"1 seconds"的问题
- 同步了珂朵莉的 Java 版名字（Chthollies）

### 技术性

- 更新了主包的行为包和资源包版本为`1.0.15`
- 更新了头颅包的行为包和资源包版本为`1.0.1`
