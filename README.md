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

## 1.0 - Exp 5 更新日志

### 特性更改&漏洞修复

- 现在地图档案馆顶层中，掉到坑里之后不再显示为掉进了虚空
- 现在地图游轮中，玩家会溺死了
- 现在地图暗景秋色中，可以与酿造台交互获取神秘药水了

### 技术性

- 更新了行为包和资源包的版本为`1.0.5`
- 主文件 `main.ts`
  - 为了文件中大量应用的`data`变量不和导入的`data`混淆，重命名了导入的`data`为`gameData`
  - 为事件管理器新增了`fillBlock`方法和`setStructure`方法
- 库文件 `lib.ts`
  - 重命名`PlayerUtils.sendMessage`方法为`PlayerUtils.notify`方法，`MessageOptions`接口为`NotifyOptions`，以更好地表达其意
  - 更新了`GameSystem.subscribeDelay`方法，现在不再接受结果为`boolean`的回调函数
  - 更新了`StructureUtils.placeAsync`方法，现在维度接受`Dimension`，且为可选参数
  - 更新了`BlockUtils.set`方法，现在接受`blockData: BlockData`，而不再是分立的`location`，`blockId`，并且新增了对特定方块状态的支持
- 数据文件 `data.ts`
  - 导出了全部的接口
  - 移动死亡类型`MurderMysteryDeathType`枚举和`deathTypeOutOfMap`变量到`data`中，并新增了几个死亡方式
  - 恢复了`MurderMysteryInteractionComponent`接口和`interaction`组件，现在交互属性不再独立于`components`外
  - 新增了`enableMysteryPotion`组件，定义本局启用神秘药水，应用神秘药水的功能，并规定神秘药水的显示内容
  - 重命名`mysteryPotion`事件响应为`getMysteryPotion`事件响应
  - 新增了`playerInArea`组件，定义玩家在特定区域时可触发事件
  - 新增了`setPlayerDead`事件响应，直接处死玩家
    - 因此，移除了`playerIntoVoid`组件，同时移除了对应的接口声明，请使用`playerInArea`组件和`setPlayerDead`事件响应代替之
    - 因此，移除了`endPortal`组件，同时移除了对应的接口声明，请使用`playerInArea`组件和`setPlayerDead`事件响应代替之
  - 新增了`playerHurt`组件，定义玩家受到特定类型的伤害后可触发事件
    - 因此，移除了`playerIntoLava`组件，同时移除了对应的接口声明，请使用`playerHurt`组件和`setPlayerDead`事件响应代替之
  - 升级了`setBlock`事件响应为`place`，现在可以通过`place`事件来放置方块、填充方块或放置结构
  - 为`openDoor`事件响应新增了`close`参数，以确定何时关门
