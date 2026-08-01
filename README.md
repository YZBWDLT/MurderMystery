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

### 地图

- 新增了一张地图：档案馆顶层  
  **开发者注**：我们发现以前添加的档案馆顶层地图是很久以前的旧版地图，在 Hypixel 中早已废弃。因此，以前的档案馆顶层地图作为 V1 版本使用，并且添加设置之后，默认状态下将不会启用
- 现在地图档案馆顶层中，掉到坑里之后不再显示为掉进了虚空
- 现在地图游轮中，玩家会溺死了
- 现在地图暗景秋色中，可以与酿造台交互获取神秘药水了

### 特性更改&漏洞修复

- #34 现在非游戏阶段下，玩家不再能与场景交互了
- #36 实装了地图暗景秋色的陷阱

### 技术性

- 更新了行为包和资源包的版本为`1.0.5`
- 新增了一个亡魂实体，在暗景秋色地图的坑中应用
- 新增了一个传送门方块，在暗景秋色地图中应用，该方块相比于原版的传送门没有实际的传送效果，为了简便也没有做音效和粒子
  - 这是为了避免原版的传送门方块在接收了方块更新后就会被立刻摧毁
- 主文件 `main.ts`
  - 为了文件中大量应用的`data`变量不和导入的`data`混淆，重命名了导入的`data`为`gameData`
  - 为事件管理器新增了`fillBlock`方法和`setStructure`方法
- 库文件 `lib.ts`
  - 重命名`PlayerUtils.sendMessage`方法为`PlayerUtils.notify`方法，`MessageOptions`接口为`NotifyOptions`，以更好地表达其意
  - 更新了`GameSystem.subscribeDelay`方法，现在不再接受结果为`boolean`的回调函数
  - 更新了`StructureUtils.placeAsync`方法，现在维度接受`Dimension`，且为可选参数
  - 更新了`BlockUtils.set`方法，现在接受`blockData: BlockData`，而不再是分立的`location`，`blockId`，并且新增了对特定方块状态的支持
  - 新增了`BroadcastOptions`接口，继承自`NotifyOptions`接口，现在可以用该接口中的`playerOptions`来决定对哪些玩家公告
- 数据文件 `data.ts`
  - 导出了全部的接口
  - 移动死亡类型`MurderMysteryDeathType`枚举和`deathTypeOutOfMap`变量到`data`中，并新增了几个死亡方式
  - 组件
    - 恢复了`MurderMysteryInteractionComponent`接口和`interaction`组件，现在交互属性不再独立于`components`外
    - 新增了`enableMysteryPotion`组件，定义本局启用神秘药水，应用神秘药水的功能，并规定神秘药水的显示内容
    - 新增了`playerInArea`组件，定义玩家在特定区域时可触发事件
    - 新增了`playerHurt`组件，定义玩家受到特定类型的伤害后可触发事件
    - 新增了`onGameStart`组件，定义开始游戏时执行的事件，该组件不含有任何玩家执行
    - 移除了`playerIntoLava`组件，同时移除了对应的接口声明，请使用`playerHurt`组件和`setPlayerDead`事件响应代替之
    - 移除了`recover`组件，请使用`onGameStart`组件和`place`事件响应代替之
    - 移除了`playerIntoVoid`组件，同时移除了对应的接口声明，请使用`playerInArea`组件和`setPlayerDead`事件响应代替之
    - 移除了`endPortal`组件，同时移除了对应的接口声明，请使用`playerInArea`组件和`setPlayerDead`事件响应代替之
  - 事件响应
    - 重命名`mysteryPotion`事件响应为`getMysteryPotion`事件响应
    - 新增了`setPlayerDead`事件响应，直接处死玩家
    - 升级了`setBlock`事件响应为`place`，现在可以通过`place`事件来放置方块、填充方块、放置结构和放置实体
      - 同时，`place`事件响应要求输入放置信息的数组，接受同时进行多处放置操作
    - 新增了`condition`事件响应，系统会首先判断该条件是否通过，仅当触发该事件时，所有的条件都通过时才能触发事件，否则无法触发事件。
    - 新增了`broadcast`事件响应，事件触发成功后，如何通知全体玩家
    - 新增了`notify`事件响应，事件触发成功后，如何通知触发事件的玩家
    - 新增了`trigger`事件响应，事件触发成功后，以触发玩家的名义触发另一个事件，可延迟触发事件
    - 新增了`teleport`事件响应，传送玩家到指定位置
    - 移除了`openDoor`事件响应，同时移除了对应的接口声明，请使用`condition`事件响应、`place`事件响应和`broadcast`事件响应代替之
    - 移除了原来`setBlock`事件响应（现`place`事件响应）的`notifyPlayer`参数和`trigger`参数，请使用`notify`事件响应和`trigger`事件响应代替之
