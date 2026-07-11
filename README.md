# 量筒的密室杀手

欢迎您访问该项目！该项目旨在在基岩版尽可能地还原 Hypixel 的密室杀手（Murder Mystery）小游戏。

该项目由珂朵莉（Tetrisoo）和 Freamoluwu 大力赞助并支持，并且由测试群（QQ：673941729）中的群友进行测试。感谢为这张地图做出贡献的人！

请注意：该项目使用 GPL 协议。您可以使用其中的源代码，但必须同样使用 GPL 协议并开源。

## 项目构建

该项目使用 TypeScript 编写。这意味着如果您需要使用源码，您需要做额外的构建工作才能正常使用该项目。

如果你对源码不感兴趣，只想要一个能玩的地图，我们也有地图可供您下载。您可以在右侧的 Release（手机页面在下方）找到我们发布的地图。按照对应页面进行操作，下载地图后即可游玩。

我们这里使用了 Microsoft 提供的工具 just-scripts 构建，您可以在[下一步：用 TypeScript 编写脚本 | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/next-steps?view=minecraft-bedrock-stable)了解更多。

如果还有什么想要了解的，请联系我们的 QQ 群。

## 最新版本更新日志

> 版本：1.0 - Exp 2

### 新地图

- 新增地图：档案馆
- 档案馆中有岩浆，跳进去就会死亡

### 金锭生成机制

- 全面更新了金锭生成机制
- 现在地图内存在大量的金锭生成点
- 现在只有距离玩家在 xz 坐标周围 5 格范围内的金锭生成点才会尝试生成
- 最多选中 8 个范围内的金锭生成点
- 对每位玩家，每 16 秒尝试生成一次
- 被选中的金锭生成点中，只有大约 15% 的概率可以实际生成
- 如此可以控制玩家大约每 2 分钟出一个弓，不会导致金锭泛滥

### 神秘药水

- 现在每局有 5 种不同的神秘药水
- 每一局，不同颜色的药水都对应不同的药效，例如这一局中蓝色药水对应隐身，下一局就可能对应失明
- 在一开始，并不知道神秘药水有什么药效，只有喝下才能从名字看出是什么药效
- 最多同时拥有 3 瓶药水
- 最多同时拥有 1 种药效
- 不能在炼药锅正在酿造时酿造新药水
- 新增了无敌效果，该效果会阻碍所有除掉出地图之外的伤害实施

### 杀手飞刀

- 现在杀手的飞刀模型会横过来
- 现在杀手的飞刀需要短按右键触发，再次短按右键取消蓄力，以同步 Hypixel
- 修改了杀手飞刀碰到箭的粒子效果

### 特性更改&漏洞修复

- 修复了一些英语翻译中的标点错误  
  **已知问题**：_目前神秘药水无法追随当前所使用的版本，可能会在后续解决_
- 修复了地图中栅栏门无法交互的问题
- 修复了地图中可能会因存在标记方块而导致无法近战打中标记方块内部玩家的问题
- 修复了因游戏区域未添加常加载区域导致神秘药水未能正确工作的问题
- 现在游戏结束后不再能够拾取金锭
- 现在游戏开始倒计时设置为了 15 秒
- 现在会在游戏剩余 60 秒时通知平民将取得胜利
- 现在侦探会在杀手获得剑的同时获得弓
- 统一了侦探、杀手和平民的弓箭位置，除了杀手的弓在 3 号位外，正常情况的弓都在 2 号位，箭都在 4 号位
- 现在右侧的信息板的剩余平民会同时显示侦探的数量
- 现在会在游戏开始 60 秒后提醒未杀过玩家的杀手杀人
- 现在地图图书馆会尝试恢复 10 扇栅栏门的状态

### 技术性

- 更新了行为包和资源包的版本
- 更改了注释内的译名“角色”为“身份”
- 拆分出了标记方块`goldblock`和`spawnpoint`为一个简易工具，从该工具中获取坐标数组
- 现在地图不再从地图内的标记方块获得信息，而是从`mapData`的描述中获取信息
- 提取出了多个瞬间显示的标题选项`instantTitleDisplay: minecraft.TitleDisplayOptions`可用
- 移除了飞刀物品`murder_mystery:iron_sword`
- `lib.ts`：
  - 为`ItemMatchOptions`接口扩展了`typeId: string`为`includeTypeId: string[]`，接收字符串数组，只要在数组内的物品就都会检查通过
  - 更新了`TickingAreaUtils`的`remove`方法，现在试图移除不存在的常加载区域时不会报错
  - 新增了`DimensionUtils`的`getLocationsFromVolume`方法，从`BlockVolumeBase`中提取出该区域的所有坐标点
  - 更新了`BlockUtils`的`fill`方法，现在支持使用特定的方块状态
- `MurderMysterySystem`类：
  - 显性移除了`goldPoints`和`spawnPoints`属性，和`getMarkPoint`方法，现在需要在`mapData`属性中获取
  - 新增`globalGoldSpawnTimes`属性，以判断一共尝试了多少次金锭生成
- `MurderMysteryComponents`类：
  - 新增了`playerIntoLava`组件，当玩家落入岩浆则视为掉入岩浆死亡
  - 新增了`recover`组件，用于恢复地图场景
  - 重新设计`generateGold`组件，使之特性如前文所述
  - 重新设计`mysteryPotion`组件，使之特性如前文所述
  - 重新设计`murdererKnife`组件的部分功能，使之特性如前文所述
  - 更新了`preventDamage`组件，现在在拥有`playerIntoLava`组件时不再阻碍熔岩伤害
- `MurderMysterySettings`类：
  - 新增了`goldSpawn`属性，及其子设置项`spawnRadius: number`、`spawnChance: number`、`spawnInterval: number`
  - 新增了`murdererSword`属性，及其子设置项`knifeSpeed: number`、`knifeCollideArrowDistance: number`、`knifeThrowTime: number`
  - 移除了`game`的`generateGoldInterval`属性和`goldIntervalMultipliedByPlayerAmount`属性，现在迁移到了`goldSpawn`中
- `MurderMysteryPlayer`类：
  - 新增了`mysteryPotionUnlocked: [boolean, boolean, boolean, boolean, boolean]`属性，代表神秘药水的解锁情况
  - 新增了`throwingTime`属性，标记杀手飞刀蓄力时长，单位游戏刻
  - 移除了`killPlayer`方法，该方法的功能与`setDead`重复且在玩家无敌时难以控制
  - 更新了`setDead`方法，现在返回布尔值，并且当玩家拥有抗性提升药效时不能杀死该玩家
  - 合并了`getDetectiveBow`方法和`getNormalBow`方法为`getBow`方法，现在所有身份在获得弓箭时都调用此方法
- 数据文件 `data.ts`
  - 新增了`playerIntoLava?: MurderMysteryPlayerIntoLavaComponent`组件、`endPortal?: MurderMysteryEndPortalComponent`组件、`door?: MurderMysteryDoorComponent`组件、`recover?: MurderMysteryRecoverComponent[]`组件，实装了`playerIntoLava`和`recover`组件的功能
