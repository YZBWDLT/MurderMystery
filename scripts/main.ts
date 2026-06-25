// *-*-*-*-*-*-* 主文件 *-*-*-*-*-*-*
// 实现密室杀手的主体逻辑。

// TODO LIST:
// - 实现侦探和平民杀死其他玩家，包括误杀判断
// - 实现侦探被杀死后掉落弓
// - 实现玩家捡起弓后完成角色转换
// - 实现杀死玩家后显示尸体和遗言
// - 实现杀手飞刀和穿过玻璃板的破碎效果
// - 实现游戏结束检查
// - 实现杀手长时间未击杀玩家的提示
// - 实现神秘药水效果

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

    // #endregion
    // #region - 游戏阶段转换

    /** 通用功能。 */
    general() {
        // 注册通用组件
        MurderMysteryComponents.infoboard(this);
        MurderMysteryComponents.preventDamage();
    }

    /** 令游戏进入清除阶段，在清除阶段清空原有的地图。 */
    enterClearStage() {}

    /** 令游戏进入加载阶段。 */
    enterLoadStage() {}

    /** 令游戏进入等待阶段。 */
    enterWaitingStage() {
        // 初始化所有玩家
        const players = this.getPlayersBeforeGame();
        players.forEach(player => this.initPlayer(player));

        // 移除掉落物
        lib.ItemUtils.removeEntity();

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
            if (lib.PlayerUtils.isPlayer(player)) {
                player.setSpawnPoint({ ...location, dimension: lib.DimensionUtils.getOverworld() });
            }
        });

        // 移除掉落物
        lib.ItemUtils.removeEntity();

        // 注册必选组件
        this.general();
        MurderMysteryComponents.gameTimer(this);
        MurderMysteryComponents.murdererGetSword(this);
        MurderMysteryComponents.infoboard(this); // 重新注册信息板组件，以防时间错位
        MurderMysteryComponents.generateGold(this);
        MurderMysteryComponents.playerCollectGold(this);
        MurderMysteryComponents.playerKillTest(this);
        MurderMysteryComponents.spectatorOutOfBorderTest(this);
        MurderMysteryComponents.playerLeaveTest(this);
        MurderMysteryComponents.playerJoinTest(this);

        // 注册可选组件
        const { playerIntoVoid, preventOpeningChest, mysteryPotion } = this.mapData.components;
        if (playerIntoVoid) MurderMysteryComponents.playerIntoVoid(playerIntoVoid, this);
        if (preventOpeningChest) MurderMysteryComponents.preventOpeningChest(preventOpeningChest);
    }

    /** 令游戏进入结束阶段。 */
    enterGameOverStage(murdererWin = false) {}

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
        this.alivePlayers.allPlayers.push(murderMysteryPlayer);
        switch (playerRole) {
            case MurderMysteryPlayerRole.Innocent:
                this.players.innocent.push(murderMysteryPlayer);
                this.alivePlayers.innocent.push(murderMysteryPlayer);
                break;
            case MurderMysteryPlayerRole.Murderer:
                this.players.murderer.push(murderMysteryPlayer);
                this.alivePlayers.murderer.push(murderMysteryPlayer);
                break;
            case MurderMysteryPlayerRole.Detective:
                this.players.detective.push(murderMysteryPlayer);
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
        switch (toRole) {
            case MurderMysteryPlayerRole.Innocent:
                this.players.innocent.push(playerData);
                if (!isDead) this.alivePlayers.innocent.push(playerData);
                break;
            case MurderMysteryPlayerRole.Murderer:
                this.players.murderer.push(playerData);
                if (!isDead) this.alivePlayers.murderer.push(playerData);
                break;
            case MurderMysteryPlayerRole.Detective:
                this.players.detective.push(playerData);
                if (!isDead) this.alivePlayers.detective.push(playerData);
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
     */
    initPlayer(player: minecraft.Entity) {
        player.getComponent("inventory")?.container.clearAll();

        const { location, facingLocation } = this.mapData.description.waitHall;
        player.teleport(location, { facingLocation });
        if (lib.PlayerUtils.isPlayer(player)) {
            player.setSpawnPoint({ ...location, dimension: lib.DimensionUtils.getDefault() });
        }

        if (lib.PlayerUtils.isPlayer(player)) {
            player.setGameMode(minecraft.GameMode.Adventure);
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
            { text: `§8${this.gameId}` },
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

    /** 游戏设置，在等待期间可以调控的设置项。 */
    readonly game: MurderMysteryGameSettings = {
        timePerGame: 270,
        murdererGetSwordDelay: 15,
        generateGoldInterval: 10,
        goldIntervalMultipliedByPlayerAmount: true,
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
        lib.gameSystem.subscribeTimeline(
            "infoboard",
            () => {
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
            },
            20
        );
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
     */
    static gameTimer(system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline(
            "gameTimer",
            () => {
                system.timeLeft--;
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
                        if (!lib.PlayerUtils.isPlayer(playerData.player)) return;
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
                        if (!lib.PlayerUtils.isPlayer(playerData.player)) return;
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
                if (!lib.PlayerUtils.isPlayer(player)) return;
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
                const playerData = system.getPlayer(player);
                if (!playerData) return;
                if (
                    playerData.role !== MurderMysteryPlayerRole.Innocent &&
                    playerData.role !== MurderMysteryPlayerRole.Murderer
                )
                    return;
                const goldAmount = inventoryUtils.getAmount(player, { typeId: goldId });
                if (goldAmount < 10) return;
                inventoryUtils.set(player, 0, "minecraft:bow", { itemLock: minecraft.ItemLockMode.slot });
                inventoryUtils.add(player, "minecraft:arrow", { itemLock: minecraft.ItemLockMode.slot });
                lib.ItemUtils.removeItem(player, goldId, -1, 10);
                lib.PlayerUtils.sendMessage(player, {
                    message: { translate: "chat.10GoldCollected" },
                    title: "§1",
                    subtitle: { translate: "subtitle.10GoldCollected" },
                    titleOptions: { fadeInDuration: 0, stayDuration: 60, fadeOutDuration: 20 },
                });
            },
            { entityFilter: { type: "minecraft:player" }, itemFilter: { includeTypes: [goldId] } }
        );
    }

    /** 玩家击杀检测。
     * @description 当杀手手持剑击打其他玩家时，将其他玩家标记为已死亡
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
            if (attackerMainhandItem?.typeId !== "minecraft:iron_sword") return;
            // 被击杀者标记为已死亡
            victimData.setDead();
        });
    }

    /** 旁观玩家出界检测。 */
    static spectatorOutOfBorderTest(system: MurderMysterySystem) {}

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

            minecraft.system.run(() => {
                // 如果退出玩家是侦探，掉落弓
                if (playerData.role === MurderMysteryPlayerRole.Detective) {
                    playerData.dropBow(false);
                    system.alivePlayers.innocent.forEach(innocent => {
                        if (!lib.PlayerUtils.isPlayer(innocent.player)) return;
                        innocent.player.sendMessage({ translate: "chat.detectiveQuit" });
                    });
                    return;
                }
                // 如果退出玩家是杀手：
                if (playerData.role === MurderMysteryPlayerRole.Murderer) {
                    const gameOver = () => {
                        system.enterGameOverStage();
                        system.players.allPlayers.forEach(playerData => {
                            if (lib.PlayerUtils.isPlayer(playerData.player)) {
                                playerData.player.sendMessage({ translate: "chat.murdererQuit.gameOver" });
                            }
                        });
                    };
                    // 如果已给刀，则游戏结束
                    if (system.murdererGetSword) {
                        gameOver();
                        return;
                    }
                    // 如果未给刀，但不再有平民，则游戏结束
                    if (system.alivePlayers.innocent.length === 0) {
                        gameOver();
                        return;
                    }
                    // 如果未给刀则重新分配一个杀手
                    const innocents = system.alivePlayers.innocent;
                    const randomInnocent = lib.JSUtils.array.randomElement(innocents);
                    system.transformRole(randomInnocent, MurderMysteryPlayerRole.Murderer);
                    if (lib.PlayerUtils.isPlayer(randomInnocent.player)) {
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
        lib.gameSystem.subscribeEvent(
            "fakePlayerLeaveTest",
            minecraft.world.afterEvents.entityDie,
            event => playerLeaveLogic(event.deadEntity),
            { entityTypes: ["murder_mystery:fake_player"] }
        );
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
        });
        lib.gameSystem.subscribeEvent("fakePlayerJoinTest", minecraft.world.afterEvents.entitySpawn, event => {
            const player = event.entity;
            if (player.typeId !== "murder_mystery:fake_player") return;
            system.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });
        });
    }

    // #endregion
    // #region - 游戏开始后（可选组件）

    /** 玩家进入虚空组件。 */
    static playerIntoVoid(component: data.MurderMysteryPlayerIntoVoidComponent, system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline("playerIntoVoid", () => {
            const { voidHeight = 0 } = component;
            system.alivePlayers.allPlayers
                .filter(data => data.player.location.y <= voidHeight)
                .forEach(data => data.setDead(DeathType.Void));
        });
    }

    /** 玩家禁止开箱组件。 */
    static preventOpeningChest(component: data.MurderMysteryPreventOpeningChestComponent) {
        lib.gameSystem.subscribeEvent(
            "preventOpeningChest",
            minecraft.world.beforeEvents.playerInteractWithBlock,
            event => {
                // 初步的条件检查
                const { isFirstEvent, block: chest, player } = event;
                if (chest.typeId !== "minecraft:chest") return;
                if (!isFirstEvent) {
                    event.cancel = true;
                    return;
                }
                // 检查箱子是否为给定坐标的箱子（可打开）
                const { allowedChest = [] } = component;
                if (allowedChest.some(location => lib.Vector3Utils.isEqual(location, chest.location))) return;
                // 其余情况，阻止玩家打开箱子，并且提示玩家
                event.cancel = true;
                minecraft.system.run(() => {
                    player.sendMessage({ translate: "chat.chestLocked" });
                    player.playSound("open.wooden_door");
                });
            }
        );
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

    /** 被其他玩家误杀。 */
    Player = "player",

    /** 误杀了其他玩家。 */
    Manslaughter = "manslaughter",

    /** 掉进虚空。 */
    Void = "void",

    /** 摔到地上。 */
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
            this.detectiveGetBow();
        }

        // 为玩家展示身份
        this.showRole();

        // [debug]
        if (!lib.PlayerUtils.isPlayer(this.player)) {
            switch (this.role) {
                case MurderMysteryPlayerRole.Innocent:
                    this.player.nameTag = "§a平民";
                    break;
                case MurderMysteryPlayerRole.Murderer:
                    this.player.nameTag = "§c杀手";
                    break;
                case MurderMysteryPlayerRole.Detective:
                    this.player.nameTag = "§b侦探";
                    break;
                case MurderMysteryPlayerRole.Spectator:
                    this.player.nameTag = "§7旁观者";
                    break;
            }
        }
    }

    /** 对玩家展示身份。
     * @remarks 只对非旁观者的玩家生效。
     */
    showRole() {
        const { player, role } = this;
        if (!lib.PlayerUtils.isPlayer(player)) return;
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

    /** 设置玩家为已死亡，并对玩家播放死因。如果是侦探死亡，则全体公告。 */
    setDead(deathType: DeathType = DeathType.MurdererStab) {
        // 若该玩家已死亡，则跳过之
        if (this.isDead) return;

        // 标记为该玩家已死亡
        this.isDead = true;
        this.system.removePlayer(this, true);

        // 设置失明
        this.player.addEffect("minecraft:blindness", 60);
        if (lib.PlayerUtils.isPlayer(this.player)) {
            // 设置为旁观模式
            this.player.setGameMode(minecraft.GameMode.Spectator);
            // 对该玩家显示死因
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
            this.player.teleport(this.system.mapData.description.waitHall.location);
        }

        // 对所有玩家播放音效
        this.system.alivePlayers.allPlayers.forEach(playerData => {
            if (!lib.PlayerUtils.isPlayer(playerData.player)) return;
            playerData.player.playSound("game.player.hurt");
        });

        // 如果是侦探死亡，则掉落弓
        if (this.role === MurderMysteryPlayerRole.Detective) this.dropBow();
    }

    /** 显示信息板。 */
    showInfoboard() {
        if (!lib.PlayerUtils.isPlayer(this.player)) return;
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
        const texts: minecraft.RawMessage[] = [
            { translate: "infoboard.title" },
            { text: `§8${this.system.gameId}§r` },
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
            { text: `§e${this.system.settings.miscellaneous.infoboardLastLine}` },
        ];
        this.player.onScreenDisplay.setActionBar(lib.JSUtils.lineText(texts));
    }

    /** 给予杀手剑。 */
    getSword() {
        if (this.role !== MurderMysteryPlayerRole.Murderer) return;
        if (!lib.PlayerUtils.isPlayer(this.player)) return;
        lib.ItemUtils.inventory.set(this.player, 1, "minecraft:iron_sword", {
            unbreakable: true,
            itemLock: minecraft.ItemLockMode.slot,
        });
        lib.PlayerUtils.sendMessage(this.player, {
            title: "§1",
            subtitle: { translate: "subtitle.murderGetSword.murder" },
            titleOptions: { fadeInDuration: 0, stayDuration: 60, fadeOutDuration: 20 },
        });
    }

    /** 侦探获取弓 */
    detectiveGetBow() {
        if (this.role === MurderMysteryPlayerRole.Murderer) return;
        lib.ItemUtils.inventory.set(this.player, 1, "minecraft:bow", {
            unbreakable: true,
            itemLock: minecraft.ItemLockMode.slot,
        });
        lib.ItemUtils.inventory.set(this.player, 6, "minecraft:arrow", {
            itemLock: minecraft.ItemLockMode.slot,
        });
    }

    /** 掉落弓。
     * @param shouldAnnounce 是否对其他玩家公告弓已掉落。 | 默认值：`true`。
     */
    dropBow(shouldAnnounce = true) {
        if (this.role !== MurderMysteryPlayerRole.Detective) return;
        // 如果是首位侦探，则标记为首位侦探已死亡
        if (this.isFirstDetective) this.system.firstDetectiveDied = true;
        // 对其它玩家公告
        if (shouldAnnounce) {
            const message = this.isFirstDetective ? "detectiveKilled" : "bowDropped";
            this.system.alivePlayers.allPlayers.forEach(playerData => {
                if (!lib.PlayerUtils.isPlayer(playerData.player)) return;
                lib.PlayerUtils.sendMessage(playerData.player, {
                    message: { translate: `chat.${message}` },
                    title: { text: "§1" },
                    subtitle: { translate: `subtitle.${message}` },
                    titleOptions: { fadeInDuration: 0, stayDuration: 80, fadeOutDuration: 20 },
                });
            });
        }
    }
}

// #endregion
// #region 创建实例
minecraft.world.afterEvents.worldLoad.subscribe(event => {
    const murderMysterySystem = new MurderMysterySystem();
    lib.gameSystem.showDebugMessage = true;
});

// #endregion
