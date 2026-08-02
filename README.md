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

## 1.0 - Snapshot 5 更新日志

### 特性更改&漏洞修复

- #32 对定位栏退出重进无法正确运作的问题进行了尝试性修复
- #35 现在当剩余最后一人时，杀手的迅捷效果不再会和神秘药水的效果冲突
- #46 修复了玩家掉进新版档案馆顶层的坑后，“你跑得太远了！”消息会覆盖玩家死亡消息的问题
- #47 修复了一处脚本报错

### 技术性

- 主文件 `main.js`
  - 为事件管理器添加了一个`inPotionEffect`属性，可用于记录玩家是否处于神秘药水的效果下
  - 为`MurderMysteryPlayer`类新增了`isShowingLocatorBar`属性，标记玩家是否正在展示定位栏
