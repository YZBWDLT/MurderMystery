# 量筒的密室杀手

欢迎您访问该项目！该项目旨在在基岩版尽可能地还原 Hypixel 的密室杀手（Murder Mystery）小游戏。

该项目由珂朵莉（Tetrisoo，@VioletMiaw）和欧拉（Freamoluwu）大力赞助并支持，并且由测试群（QQ：673941729）中的群友进行测试。感谢为这张地图做出贡献的人！

该地图至少需要使用 26.40 或更高版本游玩。

请注意：该项目使用 GPL 协议。您可以使用其中的源代码，但必须同样使用 GPL 协议并开源。

## 项目构建

该项目使用 TypeScript 编写。这意味着如果您需要使用源码，您需要做额外的构建工作才能正常使用该项目。

如果你对源码不感兴趣，只想要一个能玩的地图，我们也有地图可供您下载。您可以在右侧的 Release（手机页面在下方）找到我们发布的地图。按照对应页面进行操作，下载地图后即可游玩。

我们这里使用了 Microsoft 提供的工具 just-scripts 构建，您可以在[下一步：用 TypeScript 编写脚本 | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/next-steps?view=minecraft-bedrock-stable)了解更多。

如果还有什么想要了解的，请联系我们的 QQ 群，进群申请填写为「GitHub 密室杀手」。

## 1.0 - Exp 7 更新日志

### 地图

- 更新了地图 Widow’s Den 的翻译为 黑寡妇巢穴，和 Hypixel 最新的翻译一致
- 现在若地图未完成适配，会在开始游戏前提示玩家

### 最低版本需求

- 因为添加了 16 向旋转的头颅，现在提高了游戏最低版本需求为 26.40

### 杀手飞刀

- #29 为手机版的杀手飞刀添加了一个交互按钮，现在不必长按也能触发杀手飞刀了

### 设置

- 现在游戏开始后会在玩家的物品栏中新增一个设置物品，以便管理员等玩家可以在游戏内进行设置
- 更改了默认的信息板最后一行黄字为“YZBWDLT”，以确保英语下信息板的字体可以正常显示为 Mojangles

### 漏洞修复

- 修复了多处英语翻译错误或不清的地方
- 修复了系统会在常加载区域加载完毕之前就尝试新建新系统，导致系统无法创建，游戏直接卡死的问题

### 技术性

- 更新了行为包和资源包的版本为`1.0.13`
  - 这里，更新为`1.0.13`是为了把 Exp 版本的资源包和 Snapshot 版本的资源包区分开，防止管理群内测和测试群公测时部分群友需要删缓存重进
  - 版本号原则是：Exp 版本：`1.0.(version*2-1)`；Snapshot 版本：`1.0.(version*2)`，例如 Exp 7 版本为`1.0.13`，Snapshot 7 则为`1.0.14`
- 现在使用 Minecraft 世界动态属性`murder_mystery:nextMap`来存储下一张待生成的地图信息
  - 该值可能为 3 种类型：`string | false | undefined`
  - 为`string`时，指定为特定类型的地图
  - 为`undefined`时，指定为随机地图，在该地图初始化时亦可用此值
  - 为`false`时，不进行检查和系统变换
- 现在在进行系统切换时，会事先检查`murder_mystery:nextMap`是否不为`false`，一旦不为`false`则会立刻尝试重置系统
- 更名了系统的`alivePlayers`为`livingPlayers`
- 移除了`MurderMysteryPlayers`和`MurderMysteryAlivePlayers`类型声明，现在使用更灵活的`Record`声明系统的`players`和`livingPlayers`类型
- 提取了更新日志 UI 的文本内容和关于我们 UI 的文本内容到 data.ts 中去，并实现了初步的 Markdown 化
- 移除了系统的`removePlayers()`方法中的`onlyAlive`参数，使用新的`removeLivingPlayers()`方法代替之
