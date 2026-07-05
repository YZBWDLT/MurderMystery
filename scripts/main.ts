// *-*-*-*-*-*-* 主文件 *-*-*-*-*-*-*
// 实现密室杀手的主体逻辑。

// TODO LIST:
// - 杀手长时间未击杀玩家的提示
// - 地图组件
//   - 虚空（完善特定区域）
//   - 神秘药水效果
//   - 开启暗道
// - 在只剩余 1 名平民/侦探的时候对杀手添加速度 I，并给予有效的位置提示
// - 杀死玩家后显示遗言
// - 移除假玩家的名字显示
// - 设置 UI
// - 弓的明显显示
// - 神秘的箭矢/飞刀轨迹特效
// - 双倍模式
//   - 多个杀手的对局，杀手不能杀队友，杀队友会获得缓慢2失明2效果1秒并提示“你不能击杀你的杀手队友”。
// 上个版本待修复的bug
// 2. 添加抬头tp
// 7. 还原hyp 特殊职业概率
// 8. 书架加屏障

// #region 模块导入
import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as data from "./data";

// #endregion
// #region 自定义组件注册

/** 【方块组件】自定义屏障组件。该组件允许玩家在手持该物品或特定标签的物品时，在方块内部展示粒子。 */
type CustomBarrierParams = {
    /** 展示的粒子效果。 */
    particle: string;

    /** 是否只对创造模式的玩家展示粒子。 | 默认值：true */
    only_creative_player?: boolean;

    /** 仅当该玩家在何范围内时展示粒子。 | 默认值：64 */
    show_range?: number;

    /** 当玩家手持何标签的物品时，也展示粒子。 | 默认值：[] */
    also_show_with_tag?: string[];
};

minecraft.system.beforeEvents.startup.subscribe(event => {
    event.blockComponentRegistry.registerCustomComponent("murder_mystery:custom_barrier", {
        onTick: (compEvent, arg) => {
            const {
                particle,
                only_creative_player: onlyCreativePlayer = true,
                show_range: showRange = 64,
                also_show_with_tag: alsoShowWithTag = [],
            } = arg.params as CustomBarrierParams;
            // 获取玩家
            const block = compEvent.block;
            const players = minecraft.world.getPlayers().filter(player => {
                // 如果要求必须创造模式，但玩家不是创造模式，则直接终止
                if (onlyCreativePlayer && player.getGameMode() !== minecraft.GameMode.Creative) return false;
                // 如果位置过远，则直接终止
                if (lib.Vector3Utils.distance(player.location, block.center()) > showRange) return false;
                // 如果玩家没有手持物品，则直接终止
                const holdingItem = lib.ItemUtils.equipment.getItem(player, minecraft.EquipmentSlot.Mainhand);
                if (!holdingItem) return false;
                // 如果玩家手持的物品不是该物品，并且手持的物品也不是规定标签的物品时，则直接终止
                const typeCondition = holdingItem.typeId !== block.typeId;
                const tagCondition = !alsoShowWithTag.some(tag => holdingItem.hasTag(tag));
                if (typeCondition && tagCondition) return false;
                // 其余情况通过
                return true;
            });
            players.forEach(player => player.spawnParticle(particle, block.center()));
        },
    });
});

// #endregion
// #region 类型与变量声明

/** 游戏阶段。 */
enum GameStage {
    /** 清除阶段，在清除阶段负责清除地图。 @remarks 在本地图中未使用。 */
    ClearStage = "ClearStage",

    /** 加载阶段，在加载阶段负责加载新地图。 @remarks 在本地图中未使用。 */
    LoadStage = "LoadStage",

    /** 等待阶段，在等待阶段负责等待玩家，在玩家人数足够后开始游戏。 */
    WaitingStage = "WaitingStage",

    /** 游戏阶段，在游戏阶段负责执行游戏的主逻辑。 */
    GamingStage = "GamingStage",

    /** 游戏结束阶段，在游戏结束阶段负责执行游戏结束后的逻辑。 */
    GameOverStage = "GameOverStage",
}

/** 密室杀手的所有职业。 */
enum MurderMysteryPlayerRole {
    /** 平民。
     * 平民的任务为尽可能地活到游戏结束。若杀手被侦探杀死，则侦探和平民获胜。
     */
    Innocent = "innocent",

    /** 杀手。
     * 杀手的任务为杀光场上所有的非杀手角色。
     * 杀手将获得一把飞刀，使用飞刀近战攻击或掷出攻击都可以杀死其他玩家。
     */
    Murderer = "murderer",

    /** 侦探。
     * 侦探的任务为杀死场上的杀手角色。在杀手死亡后，侦探和平民获胜。
     * 侦探将获得一把弓。若侦探死亡，则场上会掉落一把弓，平民捡到后则变为侦探。
     */
    Detective = "detective",

    /** 旁观者。
     * 旁观者不能参与游戏，只能进行旁观。
     */
    Spectator = "spectator",
}

/** 玩家数据。 */
interface PlayerData {
    /** 玩家信息所对应的玩家（实体） */
    player: minecraft.Player | minecraft.Entity;

    /** 玩家角色 */
    role: MurderMysteryPlayerRole;
}

/** 密室杀手的金锭 ID。 */
const goldId = "murder_mystery:gold_ingot";

/** 密室杀手的弓掉落物 ID。 */
const bowEntityId = "murder_mystery:item_bow";

/** 尸体 ID。 */
const deadPlayerId = "murder_mystery:dead_player";

/** 判断实体是否为玩家。 */
const isPlayer = lib.PlayerUtils.isPlayer;

// #endregion
// #region 系统

type MurderMysteryPlayers = {
    /** 所有玩家。 */
    allPlayers: MurderMysteryPlayer[];
    /** 平民。 */
    innocent: MurderMysteryPlayer[];
    /** 杀手。 */
    murderer: MurderMysteryPlayer[];
    /** 侦探。 */
    detective: MurderMysteryPlayer[];
    /** 旁观者。 */
    spectator: MurderMysteryPlayer[];
};
type MurderMysteryAlivePlayers = {
    /** 所有玩家。 */
    allPlayers: MurderMysteryPlayer[];
    /** 平民。 */
    innocent: MurderMysteryPlayer[];
    /** 杀手。 */
    murderer: MurderMysteryPlayer[];
    /** 侦探。 */
    detective: MurderMysteryPlayer[];
};
/** 游戏开始前信息。 */
type MurderMysteryBeforeGameInfo = {
    /** 该选项受到设置的控制，见{@link MurderMysteryWaitingSettings}。 */
    minPlayerCount: number;
    /** 该选项受到设置的控制，见{@link MurderMysteryWaitingSettings}。 */
    maxPlayerCount: number;
    /** 当前玩家人数。 */
    currentPlayerCount: number;
    /** 游戏开始倒计时，单位：秒。 */
    startCountdown: number;
    /** 玩家数量是否充足。 */
    playerIsEnough: boolean;
    /** 游戏是否已经开始倒计时。 */
    countdownStarted: boolean;
};

/** 游戏结束的原因。 */
enum MurderMysteryGameOverReason {
    /** 所有玩家死了。 */
    AllPlayersDied = "AllPlayersDied",

    /** 杀手死了。 */
    MurdererDied = "MurdererDied",

    /** 杀手离开了游戏。 */
    MurdererQuit = "MurdererQuit",

    /** 超时。 */
    TimeOut = "TimeOut",
}

/** 密室杀手系统，通过系统调控组件的运行，并获取游戏运行的方方面面。 */
class MurderMysterySystem {
    constructor() {
        this.mapData = this.setMap();
        this.settings = new MurderMysterySettings();
        this.gameStage = GameStage.WaitingStage;
        this.gameId = lib.JSUtils.number.randomInt(10000, 99999);

        // 对系统数据使用设置
        const { minPlayerCount, maxPlayerCount } = this.settings.waiting;
        this.beforeGameInfo.minPlayerCount = minPlayerCount;
        this.beforeGameInfo.maxPlayerCount = maxPlayerCount;
        this.resetStartCountdown();

        const { timePerGame } = this.settings.game;
        this.timeLeft = timePerGame;

        // 初始化游戏规则
        minecraft.world.gameRules.showTags = false;
        minecraft.world.gameRules.fallDamage = false;
        minecraft.world.gameRules.fireDamage = false;

        this.enterWaitingStage();
    }

    // #region - 系统变量

    /** 游戏阶段，不同的游戏阶段会使用不同的功能。 */
    gameStage: GameStage;

    /** 游戏设置信息，获取管理员等输入的设置信息，并自动应用于设置中。 */
    readonly settings: MurderMysterySettings;

    /** 游戏 ID。 */
    readonly gameId: number;

    /** 地图数据。 */
    readonly mapData: data.MurderMysteryMapData;

    /** 玩家信息。玩家信息中会包含已经死亡的玩家的信息和旁观者玩家的信息。 */
    readonly players: MurderMysteryPlayers = {
        allPlayers: [],
        innocent: [],
        murderer: [],
        detective: [],
        spectator: [],
    };

    /** 存活的玩家信息。 */
    readonly alivePlayers: MurderMysteryAlivePlayers = {
        allPlayers: [],
        innocent: [],
        murderer: [],
        detective: [],
    };

    /** 游戏开始前的系统数据。
     * @description 用于在游戏开始前调用。
     */
    readonly beforeGameInfo: MurderMysteryBeforeGameInfo = {
        minPlayerCount: 2,
        maxPlayerCount: 16,
        currentPlayerCount: 0,
        startCountdown: 60,
        playerIsEnough: false,
        countdownStarted: false,
    };

    /** 地图的所有重生点。
     * @remarks 在游戏正式开始前，无法获取这些重生点。
     */
    readonly spawnPoints: minecraft.Vector3[] = [];

    /** 地图的所有金锭生成点。
     * @remarks 在游戏正式开始前，无法获取这些金锭生成点。
     */
    readonly goldPoints: minecraft.Vector3[] = [];

    /** 剩余时间。单位：秒。 */
    timeLeft: number = 270;

    /** 首位侦探是否已经死亡。 */
    firstDetectiveDied = false;

    /** 是否已给予杀手刀。 */
    murdererGetSword = false;

    /** 是否是一个有效的系统。在游戏结束后，该系统将变得无效化。 */
    isValid = true;

    // #endregion
    // #region - 游戏阶段转换

    /** 通用功能。 */
    general() {
        // 注册通用组件
        MurderMysteryComponents.infoboard(this);
        MurderMysteryComponents.preventDamage();
        MurderMysteryComponents.preventInteractingWithBlock(this);
    }

    /** 令游戏进入清除阶段，在清除阶段清空原有的地图。 */
    enterClearStage() {}

    /** 令游戏进入加载阶段。 */
    enterLoadStage() {}

    /** 令游戏进入等待阶段。
     * @description 转换阶段并移除所有正在监听的时间线和事件。
     * @description 初始化所有玩家。
     * @description 移除多余实体。
     * @description 注册等待阶段的组件。
     * @description 获取地图内所有标记方块的坐标。
     */
    enterWaitingStage() {
        // 转换阶段并移除所有正在监听的时间线和事件
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        this.gameStage = GameStage.WaitingStage;

        // 初始化所有玩家
        const players = this.getPlayersBeforeGame();
        players.forEach(player => this.initPlayer(player));

        // 移除多余实体
        this.removeAllEntities();

        // 注册组件
        this.general();
        MurderMysteryComponents.gameStartTest(this);
        MurderMysteryComponents.initJoinedPlayer(this);

        // 获取标记方块的坐标
        this.getMarkPoint();
    }

    /** 令游戏进入游戏阶段。
     * @description 转换阶段并移除所有正在监听的时间线和事件。
     * @description 随机传送玩家。
     * @description 移除多余实体。
     * @description 注册游戏阶段的组件。
     */
    enterGamingStage() {
        // 转换阶段并移除所有正在监听的时间线和事件
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        this.gameStage = GameStage.GamingStage;

        // 选取并随机传送玩家
        const players = lib.JSUtils.array.shuffle(this.getPlayersBeforeGame());
        const locations = lib.JSUtils.array.shuffle(this.spawnPoints);
        const maxPlayerCount = this.settings.waiting.maxPlayerCount;
        const maxLocationCount = locations.length;
        players.forEach((player, index) => {
            // 分配角色，第 1 名玩家设置为杀手，第 2 名玩家设置为侦探，
            // 第 3 ~ maxPlayerCount 名玩家设置为平民，其余玩家设置为旁观者
            if (index === 0) {
                this.addPlayer({ player, role: MurderMysteryPlayerRole.Murderer });
            } else if (index === 1) this.addPlayer({ player, role: MurderMysteryPlayerRole.Detective });
            else if (index >= 2 && index < maxPlayerCount)
                this.addPlayer({ player, role: MurderMysteryPlayerRole.Innocent });
            else this.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });

            // 传送玩家并设置重生点
            // 这里，因为玩家总数可能超出安排的重生点数量，可能会导致locations[index]返回undefined，因此需要进行限制
            const location = locations[index % maxLocationCount];
            player.teleport(location);
            if (isPlayer(player)) {
                player.setSpawnPoint({ ...location, dimension: lib.DimensionUtils.getOverworld() });
            }

            // 隐藏玩家的名称
            player.nameTag = "";
        });

        // 移除多余实体
        this.removeAllEntities();

        // 注册必选组件
        this.general();
        MurderMysteryComponents.gameTimer(this);
        MurderMysteryComponents.murdererGetSword(this);
        MurderMysteryComponents.infoboard(this); // 重新注册信息板组件，以防时间错位
        MurderMysteryComponents.generateGold(this);
        MurderMysteryComponents.playerCollectGold(this);
        MurderMysteryComponents.playerKillTest(this);
        MurderMysteryComponents.playerPickupBowTest(this);
        MurderMysteryComponents.chargeAmmunition(this);
        MurderMysteryComponents.spectatorOutOfBorderTest(this);
        MurderMysteryComponents.playerLeaveTest(this);
        MurderMysteryComponents.playerJoinTest(this);
        MurderMysteryComponents.preventPlayerPickupArrow();
        MurderMysteryComponents.murdererKnife(this);

        // 注册可选组件
        MurderMysteryComponents.playerIntoVoid(this);
    }

    /** 令游戏进入结束阶段。
     * @description 转换阶段并移除所有正在监听的时间线和事件。
     * @description 注册结束阶段的组件。
     * @description 通知玩家游戏结束。
     */
    enterGameOverStage(reason: MurderMysteryGameOverReason, hero?: MurderMysteryPlayer) {
        // 转换阶段并移除所有正在监听的时间线和事件
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        this.gameStage = GameStage.GameOverStage;
        minecraft.system.runTimeout(() => {
            this.removeAllEntities();
            this.isValid = false;
        }, 200);

        // 注册组件
        this.general();

        // 提示玩家胜负情况
        const playerWinList: Record<MurderMysteryGameOverReason, boolean> = {
            AllPlayersDied: false,
            MurdererDied: true,
            MurdererQuit: true,
            TimeOut: true,
        };
        const playerWin = playerWinList[reason];
        // 侦探的名字
        const firstDetective = this.players.detective.find(detective => detective.isFirstDetective);
        const firstDetectiveName: string = (() => {
            if (!firstDetective) return "§c--";
            if (isPlayer(firstDetective.player)) return firstDetective.player.name;
            return firstDetective.player.nameTag;
        })();
        // 杀手的名字和击杀数
        const murderer = this.players.murderer[0];
        const murdererName: string = (() => {
            if (!murderer) return "§c--";
            if (isPlayer(murderer.player)) return murderer.player.name;
            return murderer.player.nameTag;
        })();
        const murdererKills = `${murderer?.kills ?? "§c--"}`;
        // 英雄的名字
        const heroName: string = (() => {
            if (!hero) return "§c--";
            if (isPlayer(hero.player)) return hero.player.name;
            return hero.player.nameTag;
        })();

        /** 发送消息。 */
        const sendMessage = (playerData: MurderMysteryPlayer, title: minecraft.RawMessage) => {
            /** 游戏结束后返回的副标题。 */
            const subtitle: minecraft.RawMessage = (() => {
                // 如果是超时，返回超时信息
                if (reason === MurderMysteryGameOverReason.TimeOut) {
                    // 杀手和其他玩家显示的内容不同
                    if (playerData.role === MurderMysteryPlayerRole.Murderer)
                        return { translate: "subtitle.murdererLose.timeOut" };
                    return { translate: "subtitle.playerWin.timeOut" };
                }
                // 如果正常获胜，返回一般的获胜信息
                if (playerWin) return { translate: "subtitle.playerWin" };
                // 否则，返回失败信息
                return { translate: "subtitle.murdererWin" };
            })();
            /** 游戏结束后返回的消息。 */
            const message: minecraft.RawMessage[] = [
                { text: "§a§l---------------§r" },
                { text: "" },
                { translate: "chat.title" },
                { text: "" },
                { translate: `chat.winner.${playerWin ? "innocent" : "murderer"}` },
                { text: "" },
                { translate: "chat.detective", with: [firstDetectiveName] },
                { translate: "chat.murderer", with: [murdererName, murdererKills] },
            ];
            if (hero) message.push({ translate: "chat.hero", with: [heroName] });
            message.push({ text: "" }, { text: "§a§l---------------§r" });
            // 发送消息
            if (isPlayer(playerData.player))
                lib.PlayerUtils.sendMessage(playerData.player, {
                    title: title,
                    subtitle: subtitle,
                    titleOptions: { fadeInDuration: 0, stayDuration: 80, fadeOutDuration: 20 },
                    message: lib.JSUtils.lineText(message),
                });
        };
        this.players.allPlayers.forEach(playerData => {
            if (!isPlayer(playerData.player)) return;
            const player = playerData.player;

            switch (playerData.role) {
                case MurderMysteryPlayerRole.Innocent:
                case MurderMysteryPlayerRole.Detective:
                    sendMessage(playerData, { translate: `${playerWin ? "title.win" : "title.lose"}` });
                    return;
                case MurderMysteryPlayerRole.Murderer:
                    sendMessage(playerData, { translate: `${playerWin ? "title.lose" : "title.win"}` });
                    return;
                case MurderMysteryPlayerRole.Spectator:
                    sendMessage(playerData, { translate: "title.gameOver" });
                    return;
            }
        });

        // 如果是因为杀手退出导致游戏结束，则提示所有玩家
        if (reason === MurderMysteryGameOverReason.MurdererQuit)
            this.players.allPlayers.forEach(playerData => {
                if (isPlayer(playerData.player))
                    playerData.player.sendMessage({ translate: "chat.murdererQuit.gameOver" });
            });
    }

    // #endregion
    // #region - 地图管理

    setMap(mapName?: string) {
        // 选择其中一张地图
        const maps = Object.values(data.maps);
        return mapName ? data.maps[mapName] : lib.JSUtils.array.randomElement(maps);
    }

    /** 获取标记方块的位置并自动注册到系统上。 */
    getMarkPoint() {
        // 确定地图范围，先添加常加载区域再注册方块位置
        const { from, to } = this.mapData.description.range;
        const overworld = lib.DimensionUtils.getOverworld();
        lib.TickingAreaUtils.add("temp", from, to)
            .then(() => {
                /** 所有特殊标记方块的位置。 */
                const markPoints = overworld
                    .getBlocks(new minecraft.BlockVolume(from, to), {
                        includeTypes: ["murder_mystery:mark_spawnpoint", "murder_mystery:mark_goldpoint"],
                    })
                    .getBlockLocationIterator();

                // 对所有方块位置进行遍历，注册其位置
                while (true) {
                    const { value: location, done } = markPoints.next() as {
                        value: minecraft.Vector3 | undefined;
                        done: boolean;
                    };
                    if (done) break;
                    if (!location) continue;
                    const block = lib.BlockUtils.get(location) as minecraft.Block;
                    if (block.typeId === "murder_mystery:mark_spawnpoint") this.spawnPoints.push(block.center());
                    else this.goldPoints.push(block.center());
                }
                minecraft.world.sendMessage(`检索到并添加了 ${this.spawnPoints.length} 个重生点。`);
                minecraft.world.sendMessage(`检索到并添加了 ${this.goldPoints.length} 个金锭生成点。`);
            })
            .then(() => {
                lib.TickingAreaUtils.remove("temp");
            });
    }

    // #endregion
    // #region - 玩家管理

    /** 添加一名新玩家。 */
    addPlayer(playerData: PlayerData) {
        // 如果该玩家已被添加过，则阻止添加
        if (this.players.allPlayers.some(data => data.player.id === playerData.player.id)) return;
        // 创建一个玩家数据实例
        const murderMysteryPlayer = new MurderMysteryPlayer(this, playerData);
        // 根据玩家角色向玩家信息数组推入不同玩家
        const playerRole = playerData.role;
        this.players.allPlayers.push(murderMysteryPlayer);
        switch (playerRole) {
            case MurderMysteryPlayerRole.Innocent:
                this.players.innocent.push(murderMysteryPlayer);
                this.alivePlayers.allPlayers.push(murderMysteryPlayer);
                this.alivePlayers.innocent.push(murderMysteryPlayer);
                break;
            case MurderMysteryPlayerRole.Murderer:
                this.players.murderer.push(murderMysteryPlayer);
                this.alivePlayers.allPlayers.push(murderMysteryPlayer);
                this.alivePlayers.murderer.push(murderMysteryPlayer);
                break;
            case MurderMysteryPlayerRole.Detective:
                this.players.detective.push(murderMysteryPlayer);
                this.alivePlayers.allPlayers.push(murderMysteryPlayer);
                this.alivePlayers.detective.push(murderMysteryPlayer);
                break;
            case MurderMysteryPlayerRole.Spectator:
                this.players.spectator.push(murderMysteryPlayer);
                break;
        }
    }

    /** 获取一名玩家的玩家信息。 */
    getPlayer(player: minecraft.Player | minecraft.Entity) {
        return this.players.allPlayers.find(playerData => playerData.player.id === player.id);
    }

    /** 移除一名玩家的信息。
     * @param onlyAlive 是否只移除存活玩家的信息。若设定为`false`则同时从所有玩家列表和存活玩家列表中除名；若设定为`true`则只从存活玩家列表中除名。这个参数往往用于玩家刚刚死亡时。 | 默认值：`false`
     */
    removePlayer(playerData: MurderMysteryPlayer, onlyAlive = false) {
        const filterCondition = (player: MurderMysteryPlayer) => player.player.id !== playerData.player.id;
        if (!onlyAlive) this.players.allPlayers = this.players.allPlayers.filter(filterCondition);
        this.alivePlayers.allPlayers = this.alivePlayers.allPlayers.filter(filterCondition);
        switch (playerData.role) {
            case MurderMysteryPlayerRole.Innocent:
                if (!onlyAlive) this.players.innocent = this.players.innocent.filter(filterCondition);
                this.alivePlayers.innocent = this.alivePlayers.innocent.filter(filterCondition);
                break;
            case MurderMysteryPlayerRole.Murderer:
                if (!onlyAlive) this.players.murderer = this.players.murderer.filter(filterCondition);
                this.alivePlayers.murderer = this.alivePlayers.murderer.filter(filterCondition);
                break;
            case MurderMysteryPlayerRole.Detective:
                if (!onlyAlive) this.players.detective = this.players.detective.filter(filterCondition);
                this.alivePlayers.detective = this.alivePlayers.detective.filter(filterCondition);
                break;
            case MurderMysteryPlayerRole.Spectator:
                if (!onlyAlive) this.players.spectator = this.players.spectator.filter(filterCondition);
                break;
        }
    }

    /** 游戏结束检测。 */
    gameOverTest(reason: MurderMysteryGameOverReason, hero?: MurderMysteryPlayer) {
        // 当杀手数量为 0 时，判定平民/侦探获胜
        if (this.alivePlayers.murderer.length === 0) this.enterGameOverStage(reason, hero);
        // 当所有存活玩家全是杀手时，判定杀手获胜
        else if (this.alivePlayers.murderer.length === this.alivePlayers.allPlayers.length)
            this.enterGameOverStage(reason);
    }

    /** 在开始游戏前获取可能参与游戏的有效玩家。 */
    getPlayersBeforeGame() {
        const players = minecraft.world.getPlayers();
        const fakePlayers = lib.EntityUtils.getType("murder_mystery:fake_player");
        return [...players, ...fakePlayers];
    }

    /** 更改玩家的职业。 */
    transformRole(playerData: MurderMysteryPlayer, toRole: MurderMysteryPlayerRole) {
        this.removePlayer(playerData);
        playerData.role = toRole;
        const isDead = playerData.isDead;
        this.players.allPlayers.push(playerData);
        switch (toRole) {
            case MurderMysteryPlayerRole.Innocent:
                this.players.innocent.push(playerData);
                if (!isDead) {
                    this.alivePlayers.allPlayers.push(playerData);
                    this.alivePlayers.innocent.push(playerData);
                }
                break;
            case MurderMysteryPlayerRole.Murderer:
                this.players.murderer.push(playerData);
                if (!isDead) {
                    this.alivePlayers.allPlayers.push(playerData);
                    this.alivePlayers.murderer.push(playerData);
                }
                break;
            case MurderMysteryPlayerRole.Detective:
                this.players.detective.push(playerData);
                if (!isDead) {
                    this.alivePlayers.allPlayers.push(playerData);
                    this.alivePlayers.detective.push(playerData);
                }
                break;
            case MurderMysteryPlayerRole.Spectator:
                this.players.spectator.push(playerData);
                break;
        }
    }

    /** 在游戏开始前初始化玩家。
     * @description 会清除玩家的物品。
     * @description 会传送玩家到等待大厅，并将玩家的重生点设置在这里。
     * @description 会将玩家的游戏模式设为冒险模式。
     * @description 会恢复玩家的命名牌。
     */
    initPlayer(player: minecraft.Entity) {
        player.getComponent("inventory")?.container.clearAll();

        const { location, facingLocation } = this.mapData.description.waitHall;
        player.teleport(location, { facingLocation });
        if (isPlayer(player)) {
            player.setSpawnPoint({ ...location, dimension: lib.DimensionUtils.getDefault() });
            player.setGameMode(minecraft.GameMode.Adventure);
            player.nameTag = player.name;
        }
    }

    // #endregion
    // #region - 系统功能

    /** 获取游戏前信息板。 */
    getBeforeGameInfoboard() {
        const { id: mapName, mode: mapMode } = this.mapData.description;
        const { startCountdown, currentPlayerCount, maxPlayerCount, playerIsEnough } = this.beforeGameInfo;
        const stateText: minecraft.RawMessage = (() => {
            if (playerIsEnough)
                return {
                    translate: "infoboard.countdown",
                    with: [`${startCountdown}`],
                };
            return { translate: "infoboard.waiting" };
        })();
        const texts: minecraft.RawMessage[] = [
            { translate: "infoboard.title" },
            { text: `§7${lib.JSUtils.timeDisplay.formatDateToYYMMDD()} §8${this.gameId}` },
            { text: `` },
            {
                translate: "infoboard.mapName",
                with: { rawtext: [{ translate: `map.${mapName}` }] },
            },
            {
                translate: "infoboard.playerCount",
                with: {
                    rawtext: [{ text: `${currentPlayerCount}` }, { text: `${maxPlayerCount}` }],
                },
            },
            { text: `` },
            stateText,
            { text: `` },
            { translate: "infoboard.mode", with: { rawtext: [{ translate: `mode.${mapMode}` }] } },
            { text: `` },
            { text: `§e${this.settings.miscellaneous.infoboardLastLine}` },
        ];
        return texts;
    }

    /** 恢复游戏开始倒计时。 */
    resetStartCountdown() {
        this.beforeGameInfo.startCountdown = this.settings.waiting.startCountdown;
    }

    /** 移除场内所有实体（玩家与假玩家除外）。 */
    removeAllEntities() {
        lib.EntityUtils.get("overworld", { excludeTypes: ["minecraft:player", "murder_mystery:fake_player"] }).forEach(
            entity => entity.remove()
        );
    }
    // #endregion
}

// #endregion
// #region 设置
type MurderMysteryWaitingSettings = {
    /** 要开始游戏至少需要多少名玩家。 */
    minPlayerCount: number;

    /** 一局游戏最多允许多少名玩家。 */
    maxPlayerCount: number;

    /** 玩家人数足够后，游戏开始倒计时。单位：秒。 */
    startCountdown: number;
};

type MurderMysteryGameSettings = {
    /** 一局的游戏时长。单位：秒。 */
    timePerGame: number;

    /** 在游戏开始多久后给予杀手剑。单位：秒。 */
    murdererGetSwordDelay: number;

    /** 金锭的生成间隔。单位：秒。 */
    generateGoldInterval: number;

    /** 金锭的生成间隔是否会随玩家人数变化。若设定为`true`，则将金锭生成间隔等比例放大`最大玩家数/玩家数`倍。 */
    goldIntervalMultipliedByPlayerAmount: boolean;

    /** 平民如何拾取弓。可以选择右键拾取或接近拾取。 */
    pickupBowMethod: "rightClick" | "nearby";

    /** 杀手飞刀的速度。 */
    thrownKnifeSpeed: number;

    /** 杀手飞刀距离箭多近时视为相碰。 */
    thrownKnifeCollideArrowDistance: number;
};

type MurderMysteryMiscellaneousSettings = {
    /** 信息板最后一行的内容。默认为黄色字体。 */
    infoboardLastLine: string;
};

/** 密室杀手设置。在设置内包含众多玩家可以调控的设置项。 */
class MurderMysterySettings {
    constructor() {}

    /** 等待设置，在等待期间可以调控的设置项。 */
    readonly waiting: MurderMysteryWaitingSettings = {
        minPlayerCount: 2,
        maxPlayerCount: 16,
        startCountdown: 10,
    };

    /** 游戏设置，在游戏期间可以调控的设置项。 */
    readonly game: MurderMysteryGameSettings = {
        timePerGame: 270,
        murdererGetSwordDelay: 15,
        generateGoldInterval: 10,
        goldIntervalMultipliedByPlayerAmount: true,
        pickupBowMethod: "nearby",
        thrownKnifeSpeed: 1.0,
        thrownKnifeCollideArrowDistance: 5,
    };

    /** 杂项设置，控制游戏中一些其他内容的设置项。 */
    readonly miscellaneous: MurderMysteryMiscellaneousSettings = {
        infoboardLastLine: "一只卑微的量筒",
    };
}

// #endregion
// #region 组件

/** 密室杀手的全部组件，代表一个个的游戏功能。 */
class MurderMysteryComponents {
    // #region - 通用组件

    /** 显示游戏信息板。
     * @remarks 该组件会自动重注册。
     * @description 为特定玩家输出信息板（实际上是actionbar）。
     */
    static infoboard(system: MurderMysterySystem) {
        lib.gameSystem.unsubscribeTimeline("infoboard");
        lib.gameSystem.subscribeTimeline("infoboard", () => {
            switch (system.gameStage) {
                case GameStage.ClearStage:
                case GameStage.LoadStage:
                case GameStage.WaitingStage:
                    const texts = system.getBeforeGameInfoboard();
                    lib.PlayerUtils.getAll().forEach(player =>
                        player.onScreenDisplay.setActionBar(lib.JSUtils.lineText(texts))
                    );
                    break;
                case GameStage.GamingStage:
                case GameStage.GameOverStage:
                    system.players.allPlayers.forEach(playerData => playerData.showInfoboard());
                    break;
            }
        });
    }

    /** 阻止玩家和假玩家受到伤害。 */
    static preventDamage() {
        lib.gameSystem.subscribeEvent("preventDamage", minecraft.world.beforeEvents.entityHurt, event => {
            if (
                event.hurtEntity.typeId !== "minecraft:player" &&
                event.hurtEntity.typeId !== "murder_mystery:fake_player"
            )
                return;
            event.cancel = true;
        });
    }

    // #endregion
    // #region - 游戏开始前

    /** 游戏开始检测器。
     * @description 进行人数检测。
     * @description 当玩家人数达到最少人数时，开始倒计时。
     * @description 当玩家人数人数不足时，停止倒计时。
     */
    static gameStartTest(system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline("gameStartTest", () => {
            // 获取玩家并向系统注册基本信息
            const players = system.getPlayersBeforeGame();
            const beforeGameInfo = system.beforeGameInfo;
            beforeGameInfo.currentPlayerCount = players.length;
            beforeGameInfo.playerIsEnough = beforeGameInfo.currentPlayerCount >= beforeGameInfo.minPlayerCount;

            // 如果玩家人数足够且倒计时还未开始，则开始倒计时
            const { playerIsEnough, countdownStarted } = beforeGameInfo;
            if (playerIsEnough && !countdownStarted) {
                beforeGameInfo.countdownStarted = true;
                this.gameStartCountdown(system);
                // 重新注册游戏前信息板组件，防止倒计时错位
                this.infoboard(system);
                return;
            }

            // 否则，如果玩家人数不足且倒计时已开始，则停止倒计时
            if (!playerIsEnough && countdownStarted) {
                beforeGameInfo.countdownStarted = false;
                system.resetStartCountdown();
                lib.gameSystem.unsubscribeTimeline("gameStartCountdown");
                return;
            }
        });
    }

    /** 游戏开始倒计时。
     * @description 游戏开始倒计时。
     * @description 如果倒计时降为 0，则直接开始游戏。
     */
    static gameStartCountdown(system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline(
            "gameStartCountdown",
            () => {
                // 倒计时
                system.beforeGameInfo.startCountdown--;

                // 显示倒计时消息，当倒计时为 0 时进入游戏阶段
                const countdown = system.beforeGameInfo.startCountdown;
                /** 显示倒计时消息 */
                function countdownNotice(countdown: string, showTitle = true) {
                    lib.PlayerUtils.getAll().forEach(player => {
                        lib.PlayerUtils.sendMessage(player, {
                            message: {
                                translate: "chat.beforeGameStart.countdown",
                                with: [countdown],
                            },
                            title: showTitle ? countdown : void 0,
                            titleOptions: {
                                fadeInDuration: 0,
                                stayDuration: 40,
                                fadeOutDuration: 0,
                            },
                            sound: "note.hat",
                        });
                    });
                }
                switch (countdown) {
                    case 15:
                        countdownNotice("§a15", false);
                        break;
                    case 10:
                        countdownNotice("§610", false);
                        break;
                    case 5:
                    case 4:
                    case 3:
                    case 2:
                    case 1:
                        countdownNotice(`§c${countdown}`);
                        break;
                    case 0:
                        system.enterGamingStage();
                        break;
                }
            },
            20
        );
    }

    /** 初始化刚进入的玩家。
     * @description 当玩家进入时，清除玩家的物品。
     */
    static initJoinedPlayer(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent("initJoinedPlayer", minecraft.world.afterEvents.playerSpawn, event => {
            const { player, initialSpawn } = event;
            if (!initialSpawn) return;
            system.initPlayer(player);
        });
    }

    // #endregion
    // #region - 游戏开始后（必选组件）

    /** 游戏计时器。
     * @description 每秒进行倒计时。
     * @description 若超时则直接游戏结束。
     */
    static gameTimer(system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline(
            "gameTimer",
            () => {
                system.timeLeft--;
                if (system.timeLeft <= 0) system.enterGameOverStage(MurderMysteryGameOverReason.TimeOut);
            },
            20
        );
    }

    /** 杀手获得剑。
     * @description 剩余 0-5 秒时，对玩家公告杀手将拿到剑。
     * @description 剩余 0 秒时，杀手将拿到剑并注销此组件。
     */
    static murdererGetSword(system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline(
            "murdererGetSword",
            () => {
                const murdererGetSwordTimeLeft =
                    system.settings.game.murdererGetSwordDelay - (system.settings.game.timePerGame - system.timeLeft);

                // 当给杀手刀剩余 1-5 秒时，对所有玩家提示
                if (murdererGetSwordTimeLeft > 0 && murdererGetSwordTimeLeft <= 5) {
                    system.alivePlayers.allPlayers.forEach(playerData => {
                        if (!isPlayer(playerData.player)) return;
                        lib.PlayerUtils.sendMessage(playerData.player, {
                            message: {
                                translate: `chat.murderWillGetSword.${playerData.role}`,
                                with: [`§c${murdererGetSwordTimeLeft}`],
                            },
                            sound: "note.hat",
                        });
                    });
                }
                // 当倒计时结束后，给予杀手剑并对所有玩家提示
                if (murdererGetSwordTimeLeft <= 0) {
                    system.alivePlayers.allPlayers.forEach(playerData => {
                        if (!isPlayer(playerData.player)) return;
                        lib.PlayerUtils.sendMessage(playerData.player, {
                            message: {
                                translate: `chat.murderGetSword.${playerData.role}`,
                                with: [`§c${murdererGetSwordTimeLeft}`],
                            },
                            sound: "note.hat",
                        });
                    });
                    system.alivePlayers.murderer.forEach(murderer => murderer.getSword());
                    system.murdererGetSword = true;
                    return false;
                }
            },
            20
        );
    }

    /** 金锭生成。
     * @description 每隔一段时间在所有金点处生成金锭。
     */
    static generateGold(system: MurderMysterySystem) {
        const locations = system.goldPoints;

        const maxPlayerCount = system.players.allPlayers.filter(
            playerData => playerData.role !== MurderMysteryPlayerRole.Spectator
        ).length;
        const goldIntervalMultiplier = system.settings.game.goldIntervalMultipliedByPlayerAmount
            ? Math.floor(system.settings.waiting.maxPlayerCount / maxPlayerCount)
            : 1;
        const intervalTick = system.settings.game.generateGoldInterval * 20 * goldIntervalMultiplier;
        lib.gameSystem.subscribeTimeline(
            "generateGold",
            () => {
                locations.forEach(location => lib.ItemUtils.addEntity(location, goldId, {}, true));
            },
            intervalTick
        );
    }

    /** 当玩家收集到金锭时的组件。
     * @description 提示玩家收集到金锭。
     * @description 锁定玩家的金锭到快捷栏的最后一位。
     * @description 当平民和杀手玩家集齐 10 个金锭后，给予其一把弓和一支箭。
     */
    static playerCollectGold(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent(
            "onPlayerCollectGold",
            minecraft.world.afterEvents.entityItemPickup,
            event => {
                const { entity: player, items: goldIngot } = event;
                if (!isPlayer(player)) return;
                player.sendMessage({ translate: "chat.pickedUpGold", with: [`${goldIngot[0].amount}`] });
                const inventoryUtils = lib.ItemUtils.inventory;
                // 锁定玩家的金锭到快捷栏的最后一位
                inventoryUtils
                    .getValidItems(player)
                    .filter(itemData => itemData.item.typeId === goldId)
                    .forEach(itemData => {
                        const slot = itemData.slot;
                        if (itemData.slot !== 8) {
                            const clearedAmount = inventoryUtils.remove(player, slot);
                            inventoryUtils.addSlot(player, 8, clearedAmount, goldId, {
                                itemLock: minecraft.ItemLockMode.slot,
                            });
                        }
                    });
                // 如果玩家集齐 10 个金锭，则给予一把弓和一根箭
                if (inventoryUtils.getAmount(player, { typeId: goldId }) < 10) return;
                system.getPlayer(player)?.getNormalBow();
            },
            { entityFilter: { type: "minecraft:player" }, itemFilter: { includeTypes: [goldId] } }
        );
    }

    /** 玩家击杀检测。
     * @description 当杀手手持剑击打其他玩家时，将其他玩家标记为已死亡。
     * @description 当杀手被射中时，杀手死亡，游戏结束。
     * @description 当侦探或平民被射中时，标记死亡，并奖励杀手/惩罚误杀之人。
     */
    static playerKillTest(system: MurderMysterySystem) {
        // 击打检测，仅杀手拿剑时可以击杀其他玩家
        lib.gameSystem.subscribeEvent("playerKillTestHit", minecraft.world.afterEvents.entityHitEntity, event => {
            const { damagingEntity: attacker, hitEntity: victim } = event;
            const attackerData = system.getPlayer(attacker);
            if (!attackerData) return;
            const victimData = system.getPlayer(victim);
            if (!victimData) return;
            // 必须为杀手
            if (attackerData.role !== MurderMysteryPlayerRole.Murderer) return;
            // 杀手必须拿剑
            const attackerMainhandItem = lib.ItemUtils.equipment.getItem(attacker, minecraft.EquipmentSlot.Mainhand);
            if (attackerMainhandItem?.typeId !== "murder_mystery:iron_sword") return;
            // 记录击杀
            attackerData.killPlayer(victimData);
        });
        // 弓箭射杀检测
        lib.gameSystem.subscribeEvent("playerKillTestArrow", minecraft.world.afterEvents.projectileHitEntity, event => {
            const { projectile, source: attacker } = event;
            if (projectile.typeId !== "minecraft:arrow") return;
            if (!attacker) return;
            const attackerData = system.getPlayer(attacker);
            if (!attackerData) return;
            const victim = event.getEntityHit().entity;
            if (!victim) return;
            const victimData = system.getPlayer(victim);
            if (!victimData) return;
            // 考虑各个角色被射中时：
            switch (victimData.role) {
                case MurderMysteryPlayerRole.Murderer:
                    attackerData.killPlayer(victimData, DeathType.Player);
                    break;
                case MurderMysteryPlayerRole.Innocent:
                case MurderMysteryPlayerRole.Detective:
                    // 如果平民/侦探被杀手杀死，则记录为杀手射杀
                    if (attackerData.role === MurderMysteryPlayerRole.Murderer)
                        attackerData.killPlayer(victimData, DeathType.MurdererShot);
                    // 如果平民/侦探被自己杀死，则记录为自杀
                    else if (attacker.id === victim.id) attackerData.killPlayer(victimData, DeathType.ShotSelf);
                    // 如果平民/侦探被其他人杀死，则记录为其他玩家射杀，并将射杀之人处死
                    else {
                        attackerData.killPlayer(victimData, DeathType.Player);
                        attackerData.setDead(DeathType.Manslaughter);
                    }
                    break;
                case MurderMysteryPlayerRole.Spectator:
                    break;
            }
        });
    }

    /** 玩家拾取弓检测。
     * @description 判断设置中使用何种拾取弓的方式，并采用不同的逻辑。
     * @description 如果是靠近拾取，则循环检查弓附近的玩家，如果是存活的平民则令其拾取。
     * @description 如果是右键拾取，则检查玩家与实体交互，如果是存活的平民则令其拾取。
     */
    static playerPickupBowTest(system: MurderMysterySystem) {
        const pickupBowMethod = system.settings.game.pickupBowMethod;
        const isAliveInnocentData = (
            playerData: MurderMysteryPlayer | undefined
        ): playerData is MurderMysteryPlayer => {
            if (!playerData) return false;
            if (playerData.role !== MurderMysteryPlayerRole.Innocent) return false;
            if (playerData.isDead) return false;
            return true;
        };
        if (pickupBowMethod === "nearby")
            lib.gameSystem.subscribeTimeline(
                "playerGetBowTestNearby",
                () => {
                    const bowEntity = lib.EntityUtils.getType(bowEntityId)[0];
                    if (!bowEntity) return;
                    // 获取拾取者（必须为存活的平民）
                    const picker = [
                        ...lib.EntityUtils.getNearby("minecraft:player", bowEntity.location, 1.5),
                        ...lib.EntityUtils.getNearby("murder_mystery:fake_player", bowEntity.location, 1.5),
                    ].find(player => isAliveInnocentData(system.getPlayer(player)));
                    if (!picker) return;
                    // 令拾取者拾取弓
                    system.getPlayer(picker)?.pickupBow(bowEntity);
                },
                3
            );
        if (pickupBowMethod === "rightClick")
            lib.gameSystem.subscribeEvent(
                "playerGetBowTestRightClick",
                minecraft.world.afterEvents.playerInteractWithEntity,
                event => {
                    const { player: picker, target: bowEntity } = event;
                    if (bowEntity.typeId !== bowEntityId) return;
                    // 获取拾取者（必须为存活的平民）
                    const pickerData = system.getPlayer(picker);
                    if (!isAliveInnocentData(pickerData)) return;
                    // 令拾取者拾取弓
                    pickerData.pickupBow(bowEntity);
                }
            );
    }

    /** 旁观玩家出界检测。
     * @description 如果玩家是死亡玩家，则进行循环检查，检查玩家从哪个面出界，距离是多少，如果出界则拉回来。
     */
    static spectatorOutOfBorderTest(system: MurderMysterySystem) {
        const { from, to } = system.mapData.description.range;
        const gameVolume = new minecraft.BlockVolume(from, to);
        lib.gameSystem.subscribeTimeline(
            "spectatorOutOfBorderTest",
            () => {
                system.players.allPlayers
                    .filter(playerData => playerData.isDead)
                    .forEach(spectator => {
                        // 先判断玩家有没有出界，没有就直接终止
                        const player = spectator.player;
                        const location = player.location;
                        const { direction: outOfDirection, distance: outOfDistance } = lib.Vector3Utils.getVolumeSector(
                            location,
                            gameVolume
                        );
                        if (!outOfDirection) return;
                        // 出界后，反向拉回玩家，拉回的距离为出界距离 + 10
                        const teleportLocations: Record<minecraft.Direction, minecraft.Vector3> = {
                            Down: lib.Vector3Utils.up(location, outOfDistance + 10),
                            Up: lib.Vector3Utils.down(location, outOfDistance + 10),
                            East: lib.Vector3Utils.west(location, outOfDistance + 10),
                            West: lib.Vector3Utils.east(location, outOfDistance + 10),
                            North: lib.Vector3Utils.south(location, outOfDistance + 10),
                            South: lib.Vector3Utils.north(location, outOfDistance + 10),
                        };
                        player.teleport(teleportLocations[outOfDirection]);
                        if (isPlayer(player)) {
                            lib.PlayerUtils.sendMessage(player, {
                                title: "§1",
                                subtitle: { translate: "subtitle.spectatorOutOfBorder" },
                                titleOptions: { fadeInDuration: 0, stayDuration: 80, fadeOutDuration: 20 },
                                sound: "mob.villager.no",
                                soundDelay: 3,
                            });
                        }
                    });
            },
            20
        );
    }

    /** 玩家离开游戏检测。
     * @description 当玩家离开时，将该玩家从玩家列表中除名。
     * @description 如果该玩家是侦探，则标记首位侦探已死亡，并掉落弓。
     * @description 如果该玩家是杀手，则判断是否已给刀，若未给刀则重新分配一个平民为杀手，否则游戏结束。
     */
    static playerLeaveTest(system: MurderMysterySystem) {
        /** 退出主逻辑。 */
        function playerLeaveLogic(player: minecraft.Entity | minecraft.Player) {
            const playerData = system.getPlayer(player);
            if (!playerData) return;
            system.removePlayer(playerData);
            const location = player.location;

            minecraft.system.run(() => {
                // 如果退出玩家是侦探，掉落弓
                if (playerData.role === MurderMysteryPlayerRole.Detective) {
                    playerData.dropBow(false, lib.Vector3Utils.getClosest(location, system.spawnPoints));
                    system.alivePlayers.innocent.forEach(innocent => {
                        if (!isPlayer(innocent.player)) return;
                        innocent.player.sendMessage({ translate: "chat.detectiveQuit" });
                    });
                    // 尝试检查游戏是否已结束
                    system.gameOverTest(MurderMysteryGameOverReason.AllPlayersDied);
                    return;
                }
                // 如果退出玩家是杀手：
                if (playerData.role === MurderMysteryPlayerRole.Murderer) {
                    // 如果已给刀，或者未给刀但只剩下侦探时，则游戏结束
                    if (
                        system.murdererGetSword ||
                        system.alivePlayers.detective.length === system.alivePlayers.allPlayers.length
                    ) {
                        system.gameOverTest(MurderMysteryGameOverReason.MurdererQuit);
                        return;
                    }
                    // 否则，重新分配一个杀手
                    const innocents = system.alivePlayers.innocent;
                    const randomInnocent = lib.JSUtils.array.randomElement(innocents);
                    system.transformRole(randomInnocent, MurderMysteryPlayerRole.Murderer);
                    if (isPlayer(randomInnocent.player)) {
                        randomInnocent.showRole();
                        randomInnocent.player.sendMessage({ translate: "chat.murdererQuit" });
                    }
                }
            });
        }
        // 真实玩家退出
        lib.gameSystem.subscribeEvent("playerLeaveTest", minecraft.world.beforeEvents.playerLeave, event =>
            playerLeaveLogic(event.player)
        );
        // 虚拟玩家退出
        lib.gameSystem.subscribeEvent("fakePlayerLeaveTest", minecraft.world.beforeEvents.entityRemove, event => {
            if (event.removedEntity.typeId !== "murder_mystery:fake_player") return;
            playerLeaveLogic(event.removedEntity);
        });
    }

    /** 玩家进入游戏检测。
     * @description 当玩家进入时，将玩家注册为旁观者。
     */
    static playerJoinTest(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent("playerJoinTest", minecraft.world.afterEvents.playerSpawn, event => {
            const { player, initialSpawn } = event;
            if (!initialSpawn) return;
            system.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });
            player.setGameMode(minecraft.GameMode.Spectator);
            player.teleport(lib.JSUtils.array.randomElement(system.spawnPoints));
        });
        lib.gameSystem.subscribeEvent("fakePlayerJoinTest", minecraft.world.afterEvents.entitySpawn, event => {
            const player = event.entity;
            if (player.typeId !== "murder_mystery:fake_player") return;
            system.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });
            player.teleport(lib.JSUtils.array.randomElement(system.spawnPoints));
        });
    }

    /** 为侦探和杀手填充弓箭/飞刀。
     * @description 若侦探和杀手的冷却时间不为 0，则进行倒计时，倒计时结束后填充之。
     */
    static chargeAmmunition(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent("chargeAmmunition", minecraft.world.afterEvents.itemReleaseUse, event => {
            const { source: player, itemStack } = event;
            if (!itemStack) return;
            const playerData = system.getPlayer(player);
            if (!playerData) return;
            const role = playerData.role;
            // 侦探使用弓箭
            if (role === MurderMysteryPlayerRole.Detective && itemStack.typeId === "minecraft:bow") {
                playerData.chargingTime = 100;
            }
        });
        lib.gameSystem.subscribeTimeline("chargeAmmunition", () => {
            // 为侦探填充弓箭
            system.alivePlayers.detective
                .filter(detective => detective.chargingTime > 0)
                .forEach(detective => {
                    detective.chargingTime--;
                    if (detective.chargingTime <= 0) detective.getDetectiveBow();
                });
            // 为杀手填充飞刀
            system.alivePlayers.murderer
                .filter(murderer => murderer.chargingTime > 0)
                .forEach(murderer => {
                    murderer.chargingTime--;
                    if (murderer.chargingTime <= 0 && isPlayer(murderer.player)) murderer.player.playSound("note.hat");
                });
        });
    }

    /** 防止玩家捡起射出的箭。 */
    static preventPlayerPickupArrow() {
        lib.gameSystem.subscribeEvent(
            "preventPlayerPickupArrow",
            minecraft.world.afterEvents.projectileHitBlock,
            event => {
                const arrow = event.projectile;
                if (event.projectile.typeId !== "minecraft:arrow") return;
                arrow.triggerEvent("murder_mystery:remove_player_arrow");
            }
        );
    }

    /** 防止玩家和方块交互。 */
    static preventInteractingWithBlock(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent(
            "preventInteractingWithBlock",
            minecraft.world.beforeEvents.playerInteractWithBlock,
            event => {
                const { isFirstEvent, block, player } = event;
                // 如果不是首次交互，直接终止
                if (!isFirstEvent) {
                    event.cancel = true;
                    return;
                }
                // 如果是创造模式玩家，直接终止
                if (player.getGameMode() === minecraft.GameMode.Creative) return;
                // 解析允许交互的组件，如果交互的方块是 allowedBlocks 中的方块列表，或交互的坐标是 allowedLocation 中的坐标列表，则终止之
                const { blocks: allowedBlocks = [], location: allowedLocation = [] } =
                    system.mapData.components.allowInteractingWithBlock ?? {};
                if (allowedBlocks.includes(block.typeId)) return;
                if (allowedLocation.some(location => lib.Vector3Utils.isEqual(location, block.location))) return;
                // 阻止玩家交互
                event.cancel = true;
            }
        );
    }

    /** 杀手飞刀。 */
    static murdererKnife(system: MurderMysterySystem) {
        // 【备注】因为原版不能通过`minecraft:throwable`自动到点射出，所以不使用`minecraft:throwable`
        //        又因为原版试图使用就会触发`minecraft:cooldown`，而不是使用完毕后触发，所以不使用`minecraft:cooldown`

        /** 杀手在蓄力投刀时播放的音效。 */
        function knifeSound(murderer: minecraft.Player, murdererData: MurderMysteryPlayer) {
            let pitch = 0.7;
            lib.gameSystem.subscribeTimeline(
                "murdererKnifeSoundTimeline",
                () => {
                    murderer.playSound("note.hat", { pitch });
                    pitch += 0.1;
                },
                3
            );
            lib.gameSystem.subscribeEvent("murdererKnifeSoundStopper", minecraft.world.afterEvents.itemStopUse, () => {
                // 终止上述时间线，同时终止本事件
                lib.gameSystem.unsubscribeTimeline("murdererKnifeSoundTimeline");
                return false;
            });
        }

        /** 检查杀手是否蓄力了 0.5 秒，并在蓄力结束后投刀。 */
        function throwKnife(murderer: minecraft.Player, murdererData: MurderMysteryPlayer) {
            lib.gameSystem.subscribeEvent("murdererKnifeThrowTest", minecraft.world.afterEvents.itemStopUse, event => {
                // 如果蓄力没有满 0.5s，则直接终止本事件
                if (event.useDuration !== 0) return false;
                // 生成飞刀并掷出
                const ironSwordEntity = lib.EntityUtils.add("murder_mystery:iron_sword", murderer.getHeadLocation());
                const projectileComp = ironSwordEntity.getComponent("projectile");
                if (!projectileComp) return;
                projectileComp.owner = murderer;
                projectileComp.shoot(
                    lib.Vector3Utils.scale(murderer.getViewDirection(), system.settings.game.thrownKnifeSpeed),
                    { uncertainty: 0 }
                );
                // 播放飞刀音效
                murderer.playSound("mob.enderdragon.flap");
                // 令杀手进入冷却
                murdererData.chargingTime = 100;
                // 后续：检查杀手的刀击中了何种物体
                knifeHitPlayerTest(murderer, murdererData);
                knifeHitBlockTest(murderer);
                knifeHitNothing(ironSwordEntity);
                knifeHitArrow(ironSwordEntity);
                // 终止本事件
                return false;
            });
        }

        /** 检查投出去的刀是否来自于给定的杀手。 */
        function isFromMurderer(knife: minecraft.Entity, murderer: minecraft.Entity, thrower?: minecraft.Entity) {
            if (knife.typeId !== "murder_mystery:iron_sword") return false;
            if (!thrower) return false;
            if (thrower.id !== murderer.id) return false;
            return true;
        }

        /** 取消所有的投刀后检查。 */
        function cancelEvents() {
            lib.gameSystem.unsubscribeEvent("murdererKnifeHitPlayerTest");
            lib.gameSystem.unsubscribeEvent("murdererKnifeHitBlockTest");
            lib.gameSystem.unsubscribeTimeline("murdererKnifeHitNothing");
            lib.gameSystem.unsubscribeTimeline("murdererKnifeHitArrow");
        }

        /** 检查杀手的刀是否击中了玩家，如果击中玩家则淘汰之。在投出刀后进行检查。 */
        function knifeHitPlayerTest(murderer: minecraft.Player, murdererData: MurderMysteryPlayer) {
            lib.gameSystem.subscribeEvent(
                "murdererKnifeHitPlayerTest",
                minecraft.world.afterEvents.projectileHitEntity,
                event => {
                    // 如果这把刀不是来源于给定杀手的，保留检测，只终止运行。
                    if (!isFromMurderer(event.projectile, murderer, event.source)) return;
                    // 移除刀
                    event.projectile.remove();
                    // 现在，击中的一定是给定杀手的刀。接下来结束运行后必须取消全部投刀后事件。

                    // 检查被击中实体是否为密室杀手玩家，不是则终止运行
                    const player = event.getEntityHit().entity;
                    if (!player) {
                        cancelEvents();
                        return;
                    }
                    const playerData = system.getPlayer(player);
                    if (!playerData) {
                        cancelEvents();
                        return;
                    }
                    // 如果是击中了侦探或平民，则直接处死
                    switch (playerData.role) {
                        case MurderMysteryPlayerRole.Innocent:
                        case MurderMysteryPlayerRole.Detective:
                            murdererData.killPlayer(playerData, DeathType.MurdererKnife);
                            const distance = lib.Vector3Utils.distance(murderer.location, player.location);
                            murderer.sendMessage({ translate: "chat.knifeKilledPlayer", with: [distance.toFixed(2)] });
                            break;
                        case MurderMysteryPlayerRole.Murderer:
                            break;
                        case MurderMysteryPlayerRole.Spectator:
                            break;
                    }
                    cancelEvents();
                }
            );
        }

        /** 检查杀手的刀是否击中了方块。在投出刀后进行检查。 */
        function knifeHitBlockTest(murderer: minecraft.Player) {
            lib.gameSystem.subscribeEvent(
                "murdererKnifeHitBlockTest",
                minecraft.world.afterEvents.projectileHitBlock,
                event => {
                    // 如果这把刀不是来源于给定杀手的，保留检测，只终止运行。
                    if (!isFromMurderer(event.projectile, murderer, event.source)) return;
                    // 现在，击中的一定是给定杀手的刀。接下来结束运行后需要视情况取消全部投刀后事件。

                    // 如果击中的方块是玻璃板，则留下裂纹，然后任其穿过，只终止运行
                    const block = event.getBlockHit().block;
                    if (block.typeId.includes("glass_pane")) {
                        const location = lib.Vector3Utils.add(block.location, 0.5, 0, 0.5);
                        // 对附近的玩家播放破碎音效
                        lib.PlayerUtils.getNearby(location, 15).forEach(player => player.playSound("random.glass"));
                        // 如果东西向有方块连接，则还产生裂纹，旋转 90°
                        if (block.east()?.typeId !== "minecraft:air" && block.west()?.typeId !== "minecraft:air") {
                            lib.EntityUtils.add("murder_mystery:glass_pane_crack", location, block.dimension, {
                                initialRotation: 90,
                            });
                        }
                        // 如果南北向有方块连接，则还产生裂纹，不旋转
                        if (block.south()?.typeId !== "minecraft:air" && block.north()?.typeId !== "minecraft:air") {
                            lib.EntityUtils.add("murder_mystery:glass_pane_crack", location);
                        }
                        return;
                    }
                    // 如果击中的方块是屏障，则只任其穿过，终止运行
                    if (block.typeId === "minecraft:barrier") return;
                    // 否则，击中其他方块，销毁实体，结束事件检查后终止运行
                    event.projectile.remove();
                    // event.projectile.triggerEvent("murder_mystery:stick_in_ground"); // 插在地上
                    cancelEvents();
                }
            );
        }

        const { from, to } = system.mapData.description.range;
        const gameArea = new minecraft.BlockVolume(from, to);
        /** 检查杀手的刀是否出界。在投出刀后进行检查。 */
        function knifeHitNothing(knife: minecraft.Entity) {
            lib.gameSystem.subscribeTimeline(
                "murdererKnifeHitNothing",
                () => {
                    const { direction } = lib.Vector3Utils.getVolumeSector(knife.location, gameArea);
                    if (!direction) return;
                    // 如果出界，则直接销毁实体，结束事件检查后终止运行
                    knife.remove();
                    cancelEvents();
                },
                20
            );
        }

        /** 检查杀手的刀是否击中了箭。只要刀附近有箭即视为击中。在投出刀后进行检查。 */
        function knifeHitArrow(knife: minecraft.Entity) {
            lib.gameSystem.subscribeTimeline("murdererKnifeHitArrow", () => {
                const location = knife.location;
                const dimension = knife.dimension;
                const arrowNearby: minecraft.Entity | undefined = lib.EntityUtils.getNearby(
                    "minecraft:arrow",
                    location,
                    system.settings.game.thrownKnifeCollideArrowDistance
                )[0];
                if (!arrowNearby) return;
                // 如果和其他箭相碰，则直接销毁刀和箭，播放粒子和音效，结束事件检查后终止运行
                arrowNearby.remove();
                knife.remove();
                lib.PlayerUtils.getNearby(location, 10).forEach(player => player.playSound("random.break"));
                dimension.spawnParticle("minecraft:totem_particle", location);
                cancelEvents();
            });
        }

        // 主程序，用于判断条件。条件通过后尝试蓄力，蓄力结束后通过 throwKnife 函数进入下一步的判断。
        lib.gameSystem.subscribeEvent("murdererKnifeTest", minecraft.world.afterEvents.itemStartUse, event => {
            const { itemStack: ironSword, source: murderer } = event;

            // 检查是否为杀手
            const murdererData = system.getPlayer(murderer);
            if (!murdererData) return;
            if (murdererData.role !== MurderMysteryPlayerRole.Murderer) return;

            // 检查是否为剑，且对应的杀手是否未在冷却期，如果不是则终止运行
            if (ironSword.typeId !== "murder_mystery:iron_sword") return;
            if (murdererData.chargingTime !== 0) return;

            knifeSound(murderer, murdererData);
            throwKnife(murderer, murdererData);
        });
    }

    // #endregion
    // #region - 游戏开始后（可选组件）

    /** 玩家进入虚空组件。
     * @description 会自动判断系统的地图数据是否含有`playerIntoVoid`信息，若不含该信息则不会注册该组件。
     * @description 当玩家掉到特定高度后，将玩家处死。
     */
    static playerIntoVoid(system: MurderMysterySystem) {
        const component = system.mapData.components.playerIntoVoid;
        if (!component) return;
        lib.gameSystem.subscribeTimeline("playerIntoVoid", () => {
            const { voidHeight = 0 } = component;
            system.alivePlayers.allPlayers
                .filter(data => data.player.location.y <= voidHeight)
                .forEach(data => data.setDead(DeathType.Void));
        });
    }

    // #endregion
    // #region - 游戏结束
    // #endregion
}

// #endregion
// #region 玩家

/** 死亡类型。这个死亡类型会影响显示的死亡消息。 */
enum DeathType {
    /** 被杀手杀害。 */
    MurdererStab = "murdererStab",

    /** 被杀手射杀。 */
    MurdererShot = "murdererShot",

    /** 被杀手的飞刀杀害。 */
    MurdererKnife = "murdererKnife",

    /** 射杀了自己。 */
    ShotSelf = "shotSelf",

    /** 被其他玩家杀死。 */
    Player = "player",

    /** 误杀了其他玩家。 */
    Manslaughter = "manslaughter",

    /** 掉进虚空。使用该死亡方法时应该注意侦探的弓的掉落位置。 */
    Void = "void",

    /** 摔到地上。使用该死亡方法时应该注意侦探的弓的掉落位置。 */
    HitGround = "hitGround",

    /** 踩到陷阱。 */
    Trap = "trap",

    /** 被毒药杀死。 */
    Potion = "potion",

    /** 其他死因。 */
    Other = "other",
}

/** 代表一个密室杀手玩家，包含玩家的密室杀手信息和相关方法。 */
class MurderMysteryPlayer {
    /** 系统。 */
    readonly system: MurderMysterySystem;

    /** 玩家角色。 */
    role: MurderMysteryPlayerRole;

    /** 是否已死亡。 */
    isDead = false;

    /** 是否为首位侦探。该选项只对侦探可用。
     *
     * 首位侦探指游戏刚开始时即分配到侦探角色的玩家。
     * 后来的平民捡起弓后也将成为侦探，但不会是首位侦探。
     */
    isFirstDetective = false;

    /** 该玩家信息对应的玩家 */
    readonly player: minecraft.Player | minecraft.Entity;

    /** 击杀数。该选项只对杀手可用。 */
    kills = 0;

    /** 侦探的箭或杀手的飞刀剩余的冷却时间。单位：游戏刻。 */
    chargingTime = 0;

    /** @remarks 这里的构造函数应当仅在游戏开始时执行。若要转换职业，应使用 {@link MurderMysterySystem} 的`transformRole`方法。 */
    constructor(system: MurderMysterySystem, playerData: PlayerData) {
        this.system = system;
        this.role = playerData.role;
        this.player = playerData.player;

        // 如果是旁观者，标记为已死亡
        if (this.role === MurderMysteryPlayerRole.Spectator) this.isDead = true;

        // 如果是侦探，标记为首位侦探并给予弓
        if (this.role === MurderMysteryPlayerRole.Detective) {
            this.isFirstDetective = true;
            this.getDetectiveBow();
        }

        // 为玩家展示身份
        this.showRole();
    }

    /** 对玩家展示身份。
     * @remarks 只对非旁观者的玩家生效。
     */
    showRole() {
        const { player, role } = this;
        if (!isPlayer(player)) return;
        const sendMessage = (sound: string) =>
            lib.PlayerUtils.sendMessage(player, {
                title: { translate: `title.gameStart.${role}` },
                subtitle: { translate: `subtitle.gameStart.${role}` },
                titleOptions: { fadeInDuration: 0, stayDuration: 80, fadeOutDuration: 20 },
                message: { translate: `chat.teaming.${role}` },
                sound: sound,
                soundDelay: 3,
            });
        switch (role) {
            case MurderMysteryPlayerRole.Innocent:
                sendMessage("mob.villager.yes");
                break;
            case MurderMysteryPlayerRole.Murderer:
                sendMessage("mob.elderguardian.curse");
                break;
            case MurderMysteryPlayerRole.Detective:
                sendMessage("random.levelup");
                break;
            case MurderMysteryPlayerRole.Spectator:
                break;
        }
    }

    /** 设置玩家为已死亡，并对玩家播放死因。如果是侦探死亡，则全体公告。如果触发特定条件，会导致游戏结束。 */
    setDead(deathType: DeathType = DeathType.MurdererStab, killer?: MurderMysteryPlayer) {
        // 若该玩家已死亡，则跳过之
        if (this.isDead) return;

        // 标记为该玩家已死亡
        this.isDead = true;
        this.chargingTime = 0;
        this.system.removePlayer(this, true);

        // 生成尸体
        const deadPlayer = lib.EntityUtils.add(deadPlayerId, this.player.location, this.player.dimension);
        deadPlayer.setRotation(this.player.getRotation());

        // 设置失明，设置为旁观模式并对该玩家显示死因
        this.player.addEffect("minecraft:blindness", 60);
        if (isPlayer(this.player)) {
            this.player.setGameMode(minecraft.GameMode.Spectator);
            lib.PlayerUtils.sendMessage(this.player, {
                title: { translate: "title.youDied" },
                subtitle: { translate: `deathMessage.${deathType}` },
                titleOptions: { fadeInDuration: 0, stayDuration: 60, fadeOutDuration: 20 },
                message: {
                    translate: "chat.youDied",
                    with: { rawtext: [{ translate: `deathMessage.${deathType}` }] },
                },
            });
        } else {
            // 传送假玩家到出生点
            minecraft.system.run(() => this.player.teleport(this.system.mapData.description.waitHall.location));
        }

        // 对所有玩家播放音效
        this.system.alivePlayers.allPlayers.forEach(playerData => {
            if (!isPlayer(playerData.player)) return;
            playerData.player.playSound("game.player.hurt");
        });

        // 如果是侦探死亡，则掉落弓
        if (this.role === MurderMysteryPlayerRole.Detective) {
            // 如果是掉到虚空或摔到地上等出图的死亡方法，把弓的位置强行设定到其中一个出生点上
            if (deathType === DeathType.Void || deathType === DeathType.HitGround) {
                const closestSpawnPoint = lib.Vector3Utils.getClosest(this.player.location, this.system.spawnPoints);
                this.dropBow(true, lib.Vector3Utils.up(closestSpawnPoint, 1));
            }
            // 否则就设置到侦探本身的位置上
            else this.dropBow();
        }

        // 判断一次游戏有没有结束
        if (this.role === MurderMysteryPlayerRole.Murderer) {
            this.system.gameOverTest(MurderMysteryGameOverReason.MurdererDied, killer);
        } else {
            this.system.gameOverTest(MurderMysteryGameOverReason.AllPlayersDied);
        }
    }

    /** 显示信息板。 */
    showInfoboard() {
        if (!isPlayer(this.player)) return;
        const alivePlayers = this.system.alivePlayers;
        const bowLine: minecraft.RawMessage = (() => {
            if (!this.system.firstDetectiveDied) return { translate: "infoboard.detectiveAlive" };
            if (alivePlayers.detective.length > 0) return { translate: "infoboard.bowNotDropped" };
            return { translate: "infoboard.bowDropped" };
        })();
        const killsLine: minecraft.RawMessage[] = (() => {
            if (this.role !== MurderMysteryPlayerRole.Murderer) return [];
            return [{ translate: "infoboard.kills", with: [`${this.kills}`] }, { text: "" }];
        })();
        const role = (() => {
            if (this.role === MurderMysteryPlayerRole.Spectator) return this.role;
            if (this.isDead) return "dead";
            return this.role;
        })();
        const chargeLine: minecraft.RawMessage[] = (() => {
            if (this.chargingTime <= 0) return [];
            const chargingTimeSecond = lib.JSUtils.timeDisplay.showSecondsByTick(this.chargingTime);
            return [{ translate: "infoboard.charging", with: [chargingTimeSecond] }, { text: "" }];
        })();
        const texts: minecraft.RawMessage[] = [
            { translate: "infoboard.title" },
            { text: `§7${lib.JSUtils.timeDisplay.formatDateToYYMMDD()} §8${this.system.gameId}§r` },
            { text: "" },
            {
                translate: "infoboard.role",
                with: { rawtext: [{ translate: `role.${role}WithColor` }] },
            },
            { text: "" },
            {
                translate: "infoboard.innocentLeft",
                with: [`${alivePlayers.innocent.length}`],
            },
            {
                translate: "infoboard.timeLeft",
                with: {
                    rawtext: [{ text: lib.JSUtils.timeDisplay.showMinuteAndSecondsBySecond(this.system.timeLeft) }],
                },
            },
            { text: "" },
            bowLine,
            { text: "" },
            ...killsLine,
            {
                translate: "infoboard.mapName",
                with: { rawtext: [{ translate: `map.${this.system.mapData.description.id}` }] },
            },
            { text: "" },
            ...chargeLine,
            { text: `§e${this.system.settings.miscellaneous.infoboardLastLine}` },
        ];
        this.player.onScreenDisplay.setActionBar(lib.JSUtils.lineText(texts));
    }

    /** 给予杀手剑。 */
    getSword() {
        if (this.role !== MurderMysteryPlayerRole.Murderer) return;
        if (!isPlayer(this.player)) return;
        lib.ItemUtils.inventory.set(this.player, 1, "murder_mystery:iron_sword", {
            unbreakable: true,
            itemLock: minecraft.ItemLockMode.slot,
        });
        lib.PlayerUtils.sendMessage(this.player, {
            title: "§1",
            subtitle: { translate: "subtitle.murderGetSword.murder" },
            titleOptions: { fadeInDuration: 0, stayDuration: 60, fadeOutDuration: 20 },
        });
    }

    /** 获取平民或杀手的弓，并添加箭。 */
    getNormalBow() {
        // 如果不是平民或杀手，阻止之
        if (this.role !== MurderMysteryPlayerRole.Innocent && this.role !== MurderMysteryPlayerRole.Murderer) return;
        // 新增箭并移除金锭，并提示玩家
        lib.ItemUtils.inventory.set(this.player, 0, "minecraft:bow", {
            unbreakable: true,
            itemLock: minecraft.ItemLockMode.slot,
        });
        lib.ItemUtils.inventory.add(this.player, "minecraft:arrow", { itemLock: minecraft.ItemLockMode.slot });
        if (isPlayer(this.player)) {
            lib.ItemUtils.removeItem(this.player, goldId, -1, 10);
            lib.PlayerUtils.sendMessage(this.player, {
                message: { translate: "chat.10GoldCollected" },
                title: "§1",
                subtitle: { translate: "subtitle.10GoldCollected" },
                titleOptions: { fadeInDuration: 0, stayDuration: 60, fadeOutDuration: 20 },
            });
        }
    }

    /** 获取侦探的弓，添加箭。这会重置弓箭的冷却时间。 */
    getDetectiveBow() {
        this.chargingTime = 0;
        lib.ItemUtils.inventory.set(this.player, 1, "minecraft:bow", {
            unbreakable: true,
            itemLock: minecraft.ItemLockMode.slot,
        });
        lib.ItemUtils.inventory.addSlot(this.player, 6, 1, "minecraft:arrow", {
            itemLock: minecraft.ItemLockMode.slot,
        });
    }

    /** 平民拾取弓。 */
    pickupBow(bowEntity: minecraft.Entity) {
        this.system.transformRole(this, MurderMysteryPlayerRole.Detective);
        if (isPlayer(this.player)) this.player.sendMessage({ translate: "chat.bowPicked.picker" });
        // 获取弓
        if (isPlayer(this.player)) {
            lib.ItemUtils.removeItem(this.player, "minecraft:bow");
            lib.ItemUtils.removeItem(this.player, "minecraft:arrow");
        }
        this.getDetectiveBow();
        // 通知其他玩家
        this.system.alivePlayers.allPlayers.forEach(playerData => {
            const player = playerData.player;
            if (player.id === this.player.id) return;
            if (isPlayer(player)) player.sendMessage({ translate: "chat.bowPicked" });
        });
        // 移除弓实体
        bowEntity.remove();
    }

    /** 掉落弓。
     * @param shouldAnnounce 是否对其他玩家公告弓已掉落。 | 默认值：`true`。
     * @param forceLocation 强制在某个位置生成弓。
     */
    dropBow(shouldAnnounce = true, forceLocation?: minecraft.Vector3) {
        if (this.role !== MurderMysteryPlayerRole.Detective) return;
        // 如果是首位侦探，则标记为首位侦探已死亡
        if (this.isFirstDetective) this.system.firstDetectiveDied = true;
        // 对其它玩家公告
        if (shouldAnnounce) {
            const message = this.isFirstDetective ? "detectiveKilled" : "bowDropped";
            this.system.alivePlayers.allPlayers.forEach(playerData => {
                if (!isPlayer(playerData.player)) return;
                lib.PlayerUtils.sendMessage(playerData.player, {
                    message: { translate: `chat.${message}` },
                    title: { text: "§1" },
                    subtitle: { translate: `subtitle.${message}` },
                    titleOptions: { fadeInDuration: 0, stayDuration: 80, fadeOutDuration: 20 },
                });
            });
        }
        // 生成弓
        const bowLocation = forceLocation ?? this.player.location;
        lib.EntityUtils.add(bowEntityId, bowLocation);
    }

    /** 杀死了另一名玩家。 */
    killPlayer(victimData: MurderMysteryPlayer, killType?: DeathType) {
        this.kills++;
        victimData.setDead(killType, this);
    }
}

// #endregion
// #region 创建实例
minecraft.world.afterEvents.worldLoad.subscribe(() => {
    let murderMysterySystem: MurderMysterySystem = new MurderMysterySystem();
    minecraft.system.runInterval(() => {
        if (!murderMysterySystem.isValid) murderMysterySystem = new MurderMysterySystem();
    }, 20);
    lib.gameSystem.showDebugMessage = true;
});

// #endregion
