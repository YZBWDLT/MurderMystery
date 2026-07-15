# 量筒的密室杀手

欢迎您访问该项目！该项目旨在在基岩版尽可能地还原 Hypixel 的密室杀手（Murder Mystery）小游戏。

该项目由珂朵莉（Tetrisoo，@VioletMiaw）和欧拉（Freamoluwu）大力赞助并支持，并且由测试群（QQ：673941729）中的群友进行测试。感谢为这张地图做出贡献的人！

该地图至少需要使用 26.30 或更高版本游玩。

请注意：该项目使用 GPL 协议。您可以使用其中的源代码，但必须同样使用 GPL 协议并开源。

## 项目构建

该项目使用 TypeScript 编写。这意味着如果您需要使用源码，您需要做额外的构建工作才能正常使用该项目。

如果你对源码不感兴趣，只想要一个能玩的地图，我们也有地图可供您下载。您可以在右侧的 Release（手机页面在下方）找到我们发布的地图。按照对应页面进行操作，下载地图后即可游玩。

我们这里使用了 Microsoft 提供的工具 just-scripts 构建，您可以在[下一步：用 TypeScript 编写脚本 | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/next-steps?view=minecraft-bedrock-stable)了解更多。

如果还有什么想要了解的，请联系我们的 QQ 群，进群申请填写为「GitHub 密室杀手」。

## 1.0 - Exp 3 更新日志

### 特性更改&漏洞修复

- 提高了末地传送门的检查频率
- 改进了游戏结束的副标题表述，现在显示的内容会同时随着游戏结束原因和玩家角色发生变化
- #15 现在多出的玩家成为旁观者后会正确地变为旁观模式
- #17 现在进入末地传送门等出图死亡方式不再能生成尸体
- #18 修复了一处错别字
- #19 修复了两处可能存在的脚本报错
- #21 修复了首任侦探死亡后，继任侦探击杀杀手不显示英雄的问题

### 技术性

- 更新了`MurderMysteryGameOverReason`枚举，现在其对应的内部的字符串首字母小写，以对应语言文件
- `MurderMysterySystem`
  - 从`enterGamingStage`方法提取出了`assignRole`方法
  - 从`enterGamOverStage`方法提取出了`gameOverNotice`方法
- `lib.ts`
  - 更新了`TickingAreaUtils.add`方法，现在会在已存在常加载区域时返回`undefined`
  - 尝试修复了`UIUtils`可能导致的玩家无响应报错问题
