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
- 新增了地图山脉、港口小镇、雪中平安夜 V1、雪中平安夜、地铁
- 略微扩大了地图阴森庄园的可活动范围

### 主动旁观

- #10 添加了主动旁观功能！
- 允许玩家选择：不旁观、仅下局旁观、总是旁观
- 如果玩家选择了主动旁观，在开始游戏后玩家会默认被调整为旁观者
- 若使用仅下局旁观，则玩家在下一局开始后设置为旁观者，并且该设置会自动恢复为不旁观
- 若开启了主动旁观，则在开始游戏前的信息板会告知玩家开启了主动旁观

### 设置

- 在关于页面新增了自定义头颅适配名单
- 为旁观者设置新增了发送消息设置，该设置允许玩家在旁观者模式频道上发言，而不对其他玩家造成任何影响
  - #30 使用`/s`也可以用于呼出该 UI，但不能在玩家未死亡时成功发送消息
- #54 为开发者设置新增了恢复默认设置的设置

### 漏洞修复

- 修复了在英语环境下，杀手获取刀剑时，剩余 1 秒提示"1 seconds"的问题
- 同步了珂朵莉的 Java 版名字（Chthollies）
- #55 修复了侦探弓冷却在设置为 0 时无法正确获取第 2 根箭的问题
- #56 修复了飞刀有可能穿过普通方块继续飞下去的问题

### 技术性

- 更新了主包的行为包和资源包版本为`1.0.15`
- 更新了头颅包的行为包和资源包版本为`1.0.1`
- 为`lib`新增了`gameSystem.unsubscribeTimelines()`方法和`gameSystem.unsubscribeEvents()`方法
- 为密室杀手系统新增了`getOptOutSpectateState()`静态方法和`setOptOutSpectateState()`静态方法，以获取玩家当前的主动旁观设置
- 为密室杀手系统新增了`getArrowHitState()`静态方法和`setArrowHitState()`静态方法，以获取箭是否击中
- 现在特殊物品冷却交由`MurderMysteryPlayer.startCharging()`方法执行
- 更名密室杀手组件`chargeAmmunition()`为`detectiveUseBow()`
- 为密室杀手玩家添加了`shootArrow()`方法，以检查玩家射箭是否为侦探，若为侦探则应用冷却
- 为密室杀手玩家添加了`throwingKnife()`方法、`knifeHitTest()`私有方法，并将`throwKnife()`改造为私有方法，现在通过调用`throwingKnife()`方法使玩家开始尝试飞刀，大幅简化了`murdererKnife()`组件的实现
