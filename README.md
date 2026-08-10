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

## 1.0 - Exp 6 更新日志

本周我们带来了大家心心念念的游乐园的完整功能，过山车！芜湖——！！

一起来看看本周的更新吧~

### 地图

- 完全还原了 Hypixel 游乐园和复活节游乐园的功能，现在它们支持进入鬼屋门和使用单轨列车和过山车了
- 略微修改了两张游乐园地图的金点，确保金点不会尝试遍历禁区
- 略微修改了两张游乐园地图的金点，确保不会离岩浆过近
- 现在地图总部可以开启云杉门了
- 新增了运输塔 V1 和运输塔 V2
- 修复了部分地图可能的出图点位，或卡位点位
- 补充了部分地图的画

### 特性更改&漏洞修复

- 修复了默认会启用所有地图的问题
- #49 现在游戏结束后玩家不再能死亡，导致游戏产生进一步的误判

### 技术性

- 更新了行为包和资源包的版本为`1.0.6`
- 现在`onGameStart`事件响应支持触发多个事件
- 新增了`intoHauntedHouseDoor`和`outOfHauntedHouseDoor`事件响应，代表进入和离开鬼屋门；同时，为密室杀手玩家添加了`isInHauntedHouseDoor`属性，以标记玩家是否进入了鬼屋门
- 剥离`interaction`组件中的`setText`功能到`place`事件响应去，现在可以通过`place`事件响应来放置悬浮文本
- 新增了`preventDamage`组件，用于防止实体受伤，用于矿车
- 新增了`cooldown`事件响应，用于使玩家进入特定事件的冷却状态；同时为`condition`事件响应新增了`cooldownCompleted`参数，只有冷却结束后才能通过
- 新增了`rideMinecart`事件响应，用于使玩家骑乘矿车
