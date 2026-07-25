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

## 1.0 - Exp 4 更新日志

### 地图

- 新增了 4 张地图：档案馆顶部、Hypixel 游乐园、复活节游乐园、游轮
- 其中，Hypixel 是一张夜晚地图
- 为地图暗景秋色实装了神秘药水
- 现在地图档案馆可以用金锭来点大门的火
  - **开发者注**：*大门目前暂时还没有办法打开，等到快照 4 时处理此问题*

### 神秘药水

- 现在在喝下神秘药水后，物品栏内的其他同种未解锁药水将获得新的信息
  - 例如，在有两瓶同种“？？？神秘药水？？？”的情况下，喝下其中一瓶发现是迅捷后，另一瓶会自动更名为“迅捷药水”，并更改其物品备注
- 现在神秘药水的标签“神秘药水 - 1块金锭”支持玩家使用的语言了

### 特性更改&漏洞修复

- 再次更改了平民的弓的图标，现在使用一个类似于弓的图标
- 现在定位栏图标的阶段随距离发生变化的值为 0-25、25-50、50-75、75- 格远，而不再是 0-25、25-50、50-100、100- 格远了
- 修复了一处英文翻译错误的问题

### 技术性

- 更新了行为包和资源包的版本为`1.0.4`
- 现在神秘药水在底层代码上（包括物品 ID、动画实体的实体属性等）使用的编号不再是从 1-5，而是从 0-4，以降低适配脚本系统的难度
- 在底层代码上修改了神秘药水无敌效果的 ID `invincibility`为`resistance`
- 数据文件 `data.ts`
  - 升级了`allowInteractingWithBlock`组件为`interaction`组件：
    - 现在该组件接收一个数组，可包含多种不同的交互类型
    - 交互类型可以用`type`参数定义，目前包括：`none`（无特殊功能）、`mysteryPotion`（触发神秘药水效果）、`setBlock`（在特定位置放置方块）
    - 除了`none`之外，其他特殊功能只能指定至多一次
    - 现在交互组件内置`consume`参数，定义本次交互需要消耗多少金锭
    - 为交互组件新增了`stillCancelEvent`参数，定义本次交互只用于触发事件，而事实上并不与方块进行真正的交互
  - 新增了`setBlock`组件
    - 用于在玩家交互后，在特定位置放置方块
    - 该组件必须搭配`interaction`组件使用，并指定一个`setBlock`类型的交互
  - 更新了`mysteryPotion`组件
    - 移除了`location`属性，现在需要在`interaction`组件内指定一个`mysteryPotion`类型的交互，并在`at`内规定方块位置
    - 新增了`animationLocation`属性，以规定动画的坐标
- 库文件 `lib.ts`
  - 更新了`ItemOptions.lore`的类型声明，使其能够适配高版本的 ScriptAPI
- 主文件 `main.ts`
  - 更新了神秘药水的相关函数：
    - 为`MurderMysterySystem`新增了神秘药水管理器`mysteryPotionManager: MurderMysteryMysteryPotionManager`，现在本局中神秘药水的相关属性可在该管理器中读取
    - 如果地图数据中没有定义`interaction`组件和`mysteryPotion`，则神秘药水管理器无法读取
    - 拆分了`MurderMysteryComponents`的`mysteryPotion`组件，现在该组件将开始调用神秘药水管理器中的功能
    - 现在神秘药水的悬浮文本使用 ScriptAPI 的 2.8.0 版本的`TextPrimitive`，而不再是一个透明的实体，因此现在支持使用`RawMessage`直接读取对应的语言文件
  - 新增了放置方块的相关函数
    - 为`MurderMysterySystem`新增了放置方块管理器`setBlockManager: MurderMysterySetBlockManager`，现在本局中放置方块的相关属性可在该管理器中读取
    - 如果地图数据中没有定义`interaction`组件和`setBlock`，则放置方块管理器无法读取
  - 升级了`preventInteractingWithBlock`为`interaction`组件
    - 现在会同时处理其他和交互有关的事件，例如神秘药水
