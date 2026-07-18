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

### 定位栏

- 升级了指南针为定位栏！
- 现在杀手在剩余 30 秒时会获得一个定位器
  - 这个定位器会追踪剩余的所有玩家
  - 距离越远，显示的小点就会越小
  - 如果追踪的是其他杀手，会显示为红色
- 现在平民在侦探死亡后会获得一个定位器
  - 这个定位器会追踪侦探掉落的弓

### 特性更改&漏洞修复

- 提高了末地传送门的检查频率
- 改进了游戏结束的副标题表述，现在显示的内容会同时随着游戏结束原因和玩家角色发生变化
- #1 在剩余最后1名玩家时，杀手将拥有速度 I 效果
  - 特别地，如果本局游戏只有 2 名玩家，则不会施加这个效果
- #15 现在多出的玩家成为旁观者后会正确地变为旁观模式
- #17 现在进入末地传送门等出图死亡方式不再能生成尸体
- #18 修复了一处错别字
- #19 修复了两处可能存在的脚本报错
- #21 修复了首任侦探死亡后，继任侦探击杀杀手不显示英雄的问题
- #22 修复了杀手在飞刀蓄力期间切换快捷栏后，蓄力不停止的问题
- #25 新增了一个施加夜视效果的设置，开始游戏后对所有玩家添加夜视

### 技术性

- 为使用定位栏，提高了游戏的版本需求到 26.30
- 现在`playerWaypoints`游戏规则将强制被设定为`off`
- 为`tsconfig.json`增加了`"noUncheckedIndexedAccess": true`，修复了一些可能由调用数组索引导致返回`undefined`的报错
- 新增了`murder_mystery:locator`自定义物品
- 更新了`MurderMysteryGameOverReason`枚举，现在其对应的内部的字符串首字母小写，以对应语言文件
- `MurderMysterySystem`
  - 从`enterGamingStage`方法提取出了`assignRole`方法
  - 从`enterGamOverStage`方法提取出了`gameOverNotice`方法
  - 新增了`murdererGetSpeed`方法
- `MurderMysteryComponents`
  - 升级了`compass`组件为`locator`组件，以满足上文要求
- `MurderMysterySettings`
  - 在`game`设置下新增子设置项`applyNightVision: boolean`，修复了`showRoleInSpectatorTeleportUI`的类型
- `MurderMysteryPlayer`
  - 移除了`compassUnlocked`属性，现在不再使用指南针
  - 移除了`getCompass`方法和`removeCompass`方法，现在不再使用指南针
  - 新增了`getLocator`方法和`removeLocator`方法，以使玩家获取定位器
  - 新增了`showLocatorBar`方法和`hideLocatorBar`方法，使不同玩家显示不同的定位栏
- `lib.ts`
  - 更新了`TickingAreaUtils.add`方法，现在会在已存在常加载区域时返回`undefined`
  - 尝试修复了`UIUtils`可能导致的玩家无响应报错问题
