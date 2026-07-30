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

## 1.0 - Snapshot 4 更新日志

### 特性更改&漏洞修复

- 现在地图档案馆可以通过暗道开门了
- 现在地图档案馆顶层可以掉进虚空里了
- 现在地图 Hypixel 游乐园和复活节游乐园可以掉进熔岩里了
- 修复了英文环境下，声明身份时的标题均为红色的问题

### 技术性

- 将多数脚本文件中的`type`声明更改为`interface`接口声明
- 主文件 `main.ts`
  - 将放置方块管理器和神秘药水管理器合并为事件管理器`MurderMysteryEventManager`
    - 和以前的两个管理器不同，事件管理器随时都可以调用，不会返回`undefined`
    - 向事件管理器添加了`events`属性，用于调用本局游戏内的全部事件
    - 向事件管理器添加了`triggerEvent`方法，用于触发游戏事件
    - 向事件管理器添加了`openDoor`方法，用于开启门
  - 更新了`interaction`组件，现在会自动检查玩家金锭是否足够，相关事件是否成功执行，并调用事件管理器的方法
- 库文件 `lib.ts`
  - 新增了`BlockData`接口，代表一个方块的信息，包括其位置、ID 和方块状态信息
  - 新增了`BlockFillData`接口，代表方块的填充信息，包括其填充位置、ID 和方块状态信息
  - 现在`BlockUtils.fill`方法接收`blockData: BlockFillData`参数，而不再接收分立的`dimension`、`from`、`to`、`blockId`、`states?`参数
  - 现在`BlockUtils.hollow`方法接收`blockData: BlockFillData`参数，而不再接收分立的`dimension`、`from`、`to`、`blockId`参数
  - 现在`PlayerUtils.broadcast`方法接收`options: MessageOptions`参数，而不再接收分立的`message`参数
  - 声明了`InventoryUtils.getAmount`和`ItemUtils.match`方法不允许在受限模式下执行
  - 新增了`InventoryUtils.getTypeAmount`方法，只用于检查特定 ID 的物品数量
- 数据文件 `data.ts`
  - 新增了`MurderMysteryInteractions`接口，用于判断玩家的交互逻辑
    - 可在地图数据下直接调用`interactions`属性，和`description`、`components`同级
    - 由原来的`interactions`组件变更而来，移除了`MurderMysteryInteractionComponent`类型和`interactions`组件
    - 新增了`notifyPlayerWhenGoldNotEnough`属性，代表是否在玩家金锭不足时提示玩家
    - 新增了`trigger`属性，代表触发何种事件
  - 新增了`MurderMysteryEvents`接口，用于代表各种游戏内的事件
    - 目前支持的事件包括：玩家获取神秘药水`mysteryPotion`、放置方块`setBlock`、开启门`openDoor`
    - 更新了`MurderMysteryMysteryPotionComponent`类型为`MurderMysteryMysteryPotionEvent`接口，使其中的`animationLocation`参数由接收一个坐标数组改为接收一个坐标（不再是数组）
    - 更新了`MurderMysterySetBlockComponent`类型为`MurderMysterySetBlockEvent`接口，继承自`lib.ts`的`BlockData`，并允许在该事件执行后继续执行一个事件
    - 移除了`MurderMysteryDoorComponent`类型
    - 新增了`MurderMysteryOpenDoorEvent`接口，用于在触发该事件时开门
      - 新增了`condition?`属性，仅当符合该条件时才能开门，目前该属性内部仅接收一个`isBlock?: lib.BlockData[]`，仅当特定位置为特定方块时才会开门
      - 新增了`door`属性，代表门的位置
      - 新增了`notifyPlayer`属性，代表对全体玩家播放的消息
  - 因此，更新了许多地图的组件形式
