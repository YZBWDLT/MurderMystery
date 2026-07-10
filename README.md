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

### 特性更改&漏洞修复

- 修复了一些英语翻译中的标点错误  
  **已知问题**：_目前神秘药水无法追随当前所使用的版本，可能会在后续解决_
- 修复了地图中栅栏门无法交互的问题
- 修复了地图中可能会因存在标记方块而导致无法近战打中标记方块内部玩家的问题
- 现在游戏结束后不再能够拾取金锭
- 现在游戏开始倒计时设置为了 15 秒
- 现在会在游戏剩余 60 秒时通知平民将取得胜利

### 技术性

- 更新了行为包和资源包的版本
- 拆分出了标记方块`goldblock`和`spawnpoint`为一个简易工具，从该工具中获取坐标数组
- 现在地图不再从地图内的标记方块获得信息，而是从`mapData`的描述中获取信息
- 为`lib.ItemMatchOptions`扩展了`typeId: string`为`includeTypeId: string[]`，接收字符串数组，只要在数组内的物品就都会检查通过
- 提取出了多个瞬间显示的标题选项`instantTitleDisplay: minecraft.TitleDisplayOptions`可用
- 显性移除了`MurderMysterySystem`的`goldPoints`和`spawnPoints`属性，和`MurderMysterySystem`的`getMarkPoint`方法，现在需要在`mapData`属性中获取
- 为`MurderMysterySystem`新增了`globalGoldSpawnTimes`属性，以判断一共尝试了多少次金锭生成、
- 新增了`MurderMysterySettings.goldSpawn`，及其子设置项`spawnRadius: number`、`spawnChance: number`、`spawnInterval: number`
- 移除了`MurderMysterySettings.game`的`generateGoldInterval`属性和`goldIntervalMultipliedByPlayerAmount`属性，现在迁移到了`MurderMysterySettings.goldSpawn`中
- 重新设计了`MurderMysteryComponents`的`generateGold`组件，使之特性如前文所述
- 重新设计了`MurderMysteryComponents`的`mysteryPotion`组件，使之特性如前文所述
- 为`MurderMysteryPlayer`新增了`mysteryPotionUnlocked: [boolean, boolean, boolean, boolean, boolean]`属性，代表神秘药水的解锁情况
