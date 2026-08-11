// *-*-*-*-*-*-* 主文件 *-*-*-*-*-*-*
// 实现密室杀手的主体逻辑。

// #region 模块导入
import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as gameData from "./data";

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

/** 密室杀手的所有身份。 */
enum MurderMysteryPlayerRole {
    /** 平民。
     * 平民的任务为尽可能地活到游戏结束。若杀手被侦探杀死，则侦探和平民获胜。
     */
    Innocent = "innocent",

    /** 杀手。
     * 杀手的任务为杀光场上所有的非杀手身份。
     * 杀手将获得一把飞刀，使用飞刀近战攻击或掷出攻击都可以杀死其他玩家。
     */
    Murderer = "murderer",

    /** 侦探。
     * 侦探的任务为杀死场上的杀手身份。在杀手死亡后，侦探和平民获胜。
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

    /** 玩家身份 */
    role: MurderMysteryPlayerRole;
}

/** 密室杀手的金锭 ID。 */
const goldId = "murder_mystery:gold_ingot";

/** 密室杀手的弓掉落物 ID。 */
const bowEntityId = "murder_mystery:item_bow";

/** 判断实体是否为玩家。 */
const isPlayer = lib.PlayerUtils.isPlayer;

/** 瞬间显示标题的选项。 */
const instantTitleDisplay: minecraft.TitleDisplayOptions = { fadeInDuration: 0, stayDuration: 80, fadeOutDuration: 20 };

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
    AllPlayersDied = "allPlayersDied",

    /** 杀手死了。 */
    MurdererDied = "murdererDied",

    /** 杀手离开了游戏。 */
    MurdererQuit = "murdererQuit",

    /** 超时。 */
    TimeOut = "timeOut",
}

/** 密室杀手系统，通过系统调控组件的运行，并获取游戏运行的方方面面。 */
class MurderMysterySystem {
    constructor(mapData?: gameData.MurderMysteryMapData) {
        this.mapData = mapData ?? MurderMysterySystem.getMapData();
        this.settings = MurderMysterySettings.loadSettings();
        this.gameStage = GameStage.WaitingStage;
        this.gameId = lib.JSUtils.number.randomInt(10000, 99999);

        // 对系统数据使用设置
        const { minPlayerCount, maxPlayerCount } = this.settings.waiting;
        this.beforeGameInfo.minPlayerCount = minPlayerCount;
        this.beforeGameInfo.maxPlayerCount = maxPlayerCount;
        this.resetStartCountdown();

        const { timePerGame } = this.settings.gaming;
        this.timeLeft = timePerGame;

        // 初始化游戏规则
        minecraft.world.gameRules.showTags = false;
        minecraft.world.gameRules.doDayLightCycle = false;
        minecraft.world.gameRules.doWeatherCycle = false;
        minecraft.world.gameRules.fallDamage = true;
        minecraft.world.gameRules.fireDamage = true;
        minecraft.world.gameRules.drowningDamage = true;
        minecraft.world.gameRules.freezeDamage = true;
        lib.DimensionUtils.getOverworld().runCommand("gamerule playerWaypoints off");

        // 设置为和平模式
        minecraft.world.setDifficulty(minecraft.Difficulty.Peaceful);

        // 设置时间
        minecraft.world.setTimeOfDay(this.mapData.components?.time ?? 6000);

        // 添加事件管理器
        this.eventManager = new MurderMysteryEventManager(this);

        // 进入等待阶段
        this.enterWaitingStage();
    }

    // #region - 系统变量

    /** 系统版本。 */
    readonly version = "1.0 - Exp 6";

    /** 游戏阶段，不同的游戏阶段会使用不同的功能。 */
    gameStage: GameStage;

    /** 游戏设置信息，获取管理员等输入的设置信息，并自动应用于设置中。 */
    readonly settings: MurderMysterySettings;

    /** 游戏 ID。 */
    readonly gameId: number;

    /** 地图数据。 */
    readonly mapData: gameData.MurderMysteryMapData;

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

    /** 剩余时间。单位：秒。 */
    timeLeft: number = 270;

    /** 首位侦探是否已经死亡。 */
    firstDetectiveDied = false;

    /** 是否已给予杀手和侦探道具。 */
    getSpecialItem = false;

    /** 是否是一个有效的系统。在游戏结束后，该系统将变得无效化。 */
    isValid = true;

    /** 该系统变得无效化后，下一张地图指定为何种地图。 */
    nextMap?: keyof typeof gameData.maps;

    /** 全局金锭的生成次数。该值将会决定每次生成会在哪个玩家周围生成金锭。 */
    globalGoldSpawnTimes: number = 0;

    /** 是否为单挑模式。 */
    isSolo = false;

    /** 事件管理器。 */
    readonly eventManager: MurderMysteryEventManager;

    // #endregion
    // #region - 游戏阶段转换

    /** 通用功能。 */
    general() {
        // 注册通用组件
        MurderMysteryComponents.infoboard(this);
        MurderMysteryComponents.onPlayerHurt(this);
        MurderMysteryComponents.interaction(this);
        MurderMysteryComponents.settings(this);

        // 注册可选组件
        MurderMysteryComponents.applyNightVision(this);
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
        lib.gameSystem.unsubscribeAllDelays();
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
        lib.gameSystem.unsubscribeAllDelays();
        this.gameStage = GameStage.GamingStage;

        // 分配身份，如果存活玩家只有两人，设置为单挑模式
        this.assignRole();
        if (this.alivePlayers.allPlayers.length === 2) this.isSolo = true;

        // 移除多余实体
        this.removeAllEntities();

        // 移除所有玩家的所有物品
        lib.PlayerUtils.getAll().forEach(player => player.getComponent("inventory")?.container.clearAll());

        // 注册必选组件
        this.general();
        MurderMysteryComponents.gameTimer(this);
        MurderMysteryComponents.getSpecialItem(this);
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
        MurderMysteryComponents.spectatorTeleport(this);
        MurderMysteryComponents.murdererGetSpeed(this);
        MurderMysteryComponents.locator(this);

        // 注册可选组件
        MurderMysteryComponents.mysteryPotion(this);
        MurderMysteryComponents.playerInArea(this);
        MurderMysteryComponents.preventDamage(this);

        // 若地图注册了 onGameStart 组件，则触发其规定的事件
        const onGameStart = this.mapData.components?.onGameStart;
        if (onGameStart) {
            const trigger = onGameStart.trigger;
            if (typeof trigger === "string") this.eventManager.triggerEvent(trigger);
            else trigger.forEach(t => this.eventManager.triggerEvent(t));
        }
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
        lib.gameSystem.unsubscribeAllDelays();
        this.gameStage = GameStage.GameOverStage;
        lib.gameSystem.subscribeDelay(
            "resetSystem",
            () => {
                this.removeAllEntities();
                MurderMysterySettings.saveSettings(this); // 保存本局设置，以便下局应用
                this.isValid = false;
            },
            200
        );

        // 提醒玩家游戏结束，并返回胜者信息
        this.gameOverNotice(reason, hero);

        // 移除所有玩家的所有定位栏
        lib.PlayerUtils.getAll().forEach(player => player.locatorBar.removeAllWaypoints());

        // 注册组件
        this.general();
        MurderMysteryComponents.preventPlayerPickupGold();
    }

    // #endregion
    // #region - 地图管理

    /** 获取地图数据。若不指定地图名称，则返回所有可用地图中的一张随机地图。 */
    static getMapData(mapName?: string): gameData.MurderMysteryMapData {
        // ===== 变量准备 =====
        // 从设置中获取全部可用的地图
        const mapEnabled = MurderMysterySettings.loadSettings().mapEnabled;
        const validMapNames = Object.keys(mapEnabled).filter(key => mapEnabled[key]);
        const allMaps = gameData.maps;

        // ===== 返回地图信息 =====
        // 给定地图时，检查该地图是否在可用地图中，若在则返回该地图信息
        if (mapName && validMapNames.includes(mapName)) return allMaps[mapName] as gameData.MurderMysteryMapData;
        // 未给定地图时，随机在可用地图中选择
        const randomMapName = lib.JSUtils.array.randomElement(validMapNames);
        const randomMap = allMaps[randomMapName];
        if (!randomMap) {
            lib.PlayerUtils.broadcast({ message: { translate: "chat.error.noValidMaps" }, sound: "random.anvil_land" });
            return lib.JSUtils.array.randomElement(Object.values(allMaps));
        }
        return randomMap;
    }

    // #endregion
    // #region - 玩家管理

    /** 添加一名新玩家。 */
    addPlayer(playerData: PlayerData) {
        // 如果该玩家已被添加过，则阻止添加
        if (this.players.allPlayers.some(data => data.player.id === playerData.player.id)) return;
        // 创建一个玩家数据实例
        const murderMysteryPlayer = new MurderMysteryPlayer(this, playerData);
        // 根据玩家身份向玩家信息数组推入不同玩家
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

    /** 在开始游戏前获取可能参与游戏的有效玩家。 */
    getPlayersBeforeGame() {
        const players = minecraft.world.getPlayers();
        const fakePlayers = lib.EntityUtils.getType("murder_mystery:fake_player");
        return [...players, ...fakePlayers];
    }

    /** 分配身份，并传送玩家。 */
    assignRole() {
        const players = lib.JSUtils.array.shuffle(this.getPlayersBeforeGame());
        const locations = lib.JSUtils.array.shuffle(this.mapData.description.spawnPoints);
        const maxPlayerCount = this.settings.waiting.maxPlayerCount;
        const maxLocationCount = locations.length;
        players.forEach((player, index) => {
            // 隐藏玩家的名称
            player.nameTag = "";

            // 分配身份，第 1 名玩家设置为杀手，第 2 名玩家设置为侦探，
            // 第 3 ~ maxPlayerCount 名玩家设置为平民，其余玩家设置为旁观者
            if (index === 0) {
                this.addPlayer({ player, role: MurderMysteryPlayerRole.Murderer });
            } else if (index === 1) this.addPlayer({ player, role: MurderMysteryPlayerRole.Detective });
            else if (index >= 2 && index < maxPlayerCount)
                this.addPlayer({ player, role: MurderMysteryPlayerRole.Innocent });
            else this.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });

            // 传送玩家并设置重生点
            const location = locations[index % maxLocationCount] as minecraft.Vector3;
            player.teleport(location);
            if (isPlayer(player)) {
                player.setSpawnPoint({ ...location, dimension: lib.DimensionUtils.getOverworld() });
            }
        });
    }

    /** 更改玩家的身份。 */
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
     * @description 会清除玩家的物品，在快捷栏最后一位留下一个设置物品。
     * @description 会传送玩家到等待大厅，并将玩家的重生点设置在这里。
     * @description 会将玩家的游戏模式设为冒险模式。
     * @description 会恢复玩家的命名牌。
     * @description 会恢复玩家的输入权限。
     * @description 会移除玩家的状态效果。
     */
    initPlayer(player: minecraft.Entity) {
        player.getComponent("inventory")?.container.clearAll();
        lib.ItemUtils.inventory.set(player, 8, "murder_mystery:settings", { itemLock: minecraft.ItemLockMode.slot });

        const { location, facingLocation } = this.mapData.description.waitHall;
        player.teleport(location, { facingLocation });
        if (isPlayer(player)) {
            player.setSpawnPoint({ ...location, dimension: lib.DimensionUtils.getDefault() });
            player.setGameMode(minecraft.GameMode.Adventure);
            player.nameTag = player.name;
            player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Jump, true);
            player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Dismount, true);
        }
        player.getEffects().forEach(effect => player.removeEffect(effect.typeId));
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

    /** 移除场内所有实体（玩家、假玩家与画除外）。 */
    removeAllEntities() {
        const keepEntities = ["minecraft:player", "murder_mystery:fake_player", "minecraft:painting"];
        lib.EntityUtils.get("overworld", { excludeTypes: keepEntities }).forEach(entity => entity.remove());

        minecraft.world.primitiveShapesManager.removeAll();
    }

    /** 游戏结束检测。
     * @param probableHero 代表一个可能的英雄的玩家信息，只要杀死了杀手就是可能的英雄
     */
    gameOverTest(reason: MurderMysteryGameOverReason, probableHero?: MurderMysteryPlayer) {
        // 如果杀手数量不为 0（平民侦探获胜），并且存活玩家不全为杀手（杀手获胜），则游戏不会结束
        if (
            this.alivePlayers.murderer.length !== 0 &&
            this.alivePlayers.murderer.length !== this.alivePlayers.allPlayers.length
        )
            return;
        // 如果英雄不存在，对系统返回无英雄的情况
        if (!probableHero) return this.enterGameOverStage(reason);
        // 如果给定的英雄是杀手，对系统返回无英雄的情况
        if (probableHero.role === MurderMysteryPlayerRole.Murderer) return this.enterGameOverStage(reason);
        // 如果给定的英雄是首位侦探，则对系统返回无英雄的情况
        if (probableHero.role === MurderMysteryPlayerRole.Detective && probableHero.isFirstDetective)
            return this.enterGameOverStage(reason);
        // 其他情况，对系统返回没有英雄的情况
        return this.enterGameOverStage(reason, probableHero);
    }

    /** 游戏结束后，提醒玩家。 */
    gameOverNotice(reason: MurderMysteryGameOverReason, hero?: MurderMysteryPlayer) {
        const playerWin = reason === MurderMysteryGameOverReason.AllPlayersDied ? false : true;

        /** 为玩家名称添加颜色。
         * - 如果该玩家仍然存活，则显示为绿色 §a，否则显示为灰色 §7。
         * - 特别地，如果没有引入一个正确的`playerData`，则返回`undefined`。
         */
        function colorName(playerData?: MurderMysteryPlayer) {
            if (!playerData) return;
            return playerData.isDead ? `§7${playerData.getName()}` : `§a${playerData.getName()}`;
        }

        // 为首位侦探、杀手和英雄添加颜色
        const firstDetectiveName = colorName(this.players.detective.find(detective => detective.isFirstDetective));
        const murdererName = colorName(this.players.murderer[0]);
        const murdererKills = this.players.murderer[0]?.kills ?? 0;
        const heroName = colorName(hero);

        const titleList: Record<MurderMysteryPlayerRole, minecraft.RawMessage> = {
            innocent: { translate: `${playerWin ? "title.win" : "title.lose"}` },
            detective: { translate: `${playerWin ? "title.win" : "title.lose"}` },
            murderer: { translate: `${playerWin ? "title.lose" : "title.win"}` },
            spectator: { translate: "title.gameOver" },
        };
        /** 游戏结束后返回的聊天栏消息。 */
        const message: minecraft.RawMessage[] = [
            { text: "§a§l---------------§r" },
            { text: "" },
            { translate: "chat.title" },
            { text: "" },
            { translate: `chat.winner.${playerWin ? "innocent" : "murderer"}` },
            { text: "" },
        ];
        if (firstDetectiveName) message.push({ translate: "chat.detective", with: [firstDetectiveName] });
        if (murdererName) message.push({ translate: "chat.murderer", with: [murdererName, `${murdererKills}`] });
        if (heroName) message.push({ translate: "chat.hero", with: [heroName] });
        message.push({ text: "" }, { text: "§a§l---------------§r" });

        this.players.allPlayers.forEach(playerData => {
            if (!isPlayer(playerData.player)) return;

            const subtitle: minecraft.RawMessage = {
                translate: `subtitle.${reason}.${playerData.role === MurderMysteryPlayerRole.Murderer ? "murderer" : "player"}`,
            };

            lib.PlayerUtils.notify(playerData.player, {
                title: titleList[playerData.role],
                subtitle: subtitle,
                titleOptions: instantTitleDisplay,
                message: lib.JSUtils.lineText(message),
            });
            // 如果是因为杀手退出导致游戏结束，则提示所有玩家
            if (reason === MurderMysteryGameOverReason.MurdererQuit)
                playerData.player.sendMessage({ translate: "chat.murdererQuit.gameOver" });
        });
    }
    // #endregion
}

// #endregion
// #region 事件管理器

/** 神秘药水信息。 */
interface MysteryPotionData {
    /** 药水名称。 */
    name: "失明" | "缓慢" | "迅捷" | "隐身" | "无敌";

    /** 使用的药水效果。 */
    id: "blindness" | "slowness" | "speed" | "invisibility" | "resistance";

    /** 使用的药水放大等级。 | 默认值：`0` */
    amplifier?: number;

    /** 使用的药水时长。单位：游戏刻。 | 默认值：`200` */
    duration?: number;

    /** 此药水的权重。权重越大则越可能抽中。 */
    weight: number;
}

/** 事件管理器。用于管理游戏中可能存在的事件。 */
class MurderMysteryEventManager {
    constructor(system: MurderMysterySystem) {
        this.system = system;
        this.events = system.mapData.events ?? {};
    }

    /** 游戏系统。 */
    private readonly system: MurderMysterySystem;

    /** 地图使用的事件 */
    readonly events: Record<string, gameData.MurderMysteryEvents>;

    /** 触发事件。
     * @returns 返回是否成功地触发了事件。这会影响是否移除金锭等情况。
     */
    triggerEvent(id: string, playerData?: MurderMysteryPlayer): boolean {
        // 如果游戏已结束，直接终止
        if (this.system.gameStage !== GameStage.GamingStage) return false;

        // 如果不存在对应事件，直接终止
        const triggedEvent = this.events[id];
        if (!triggedEvent) return false;

        // 变量准备
        const {
            condition,
            getMysteryPotion,
            intoHauntedHouseDoor,
            outOfHauntedHouseDoor,
            place,
            setPlayerDead,
            notify,
            broadcast,
            trigger,
            teleport,
            rideMinecart,
            cooldown,
        } = triggedEvent;

        // ===== 判断条件是否通过 =====
        // 如果这里的条件不通过，则直接返回 false，不触发后续的事件
        if (condition) {
            const { isBlock, playerBelowHeight, cooldownCompleted } = condition;

            // 检查方块条件是否通过，如果未指定则默认通过
            const hasBlockUnmatched: boolean = isBlock?.some(data => !lib.BlockUtils.match(data)) ?? false;
            if (hasBlockUnmatched) return false;

            // 检查玩家高度条件是否通过
            if (playerBelowHeight) {
                if (!playerData) return false;
                if (playerData.player.location.y >= playerBelowHeight) return false;
            }

            // 检查玩家特定冷却是否仍在运行
            if (cooldownCompleted) {
                if (!playerData) return false;
                const { type, itemName } = cooldownCompleted;
                const leftDuration = playerData.eventCooldown[type] ?? 0;
                if (leftDuration > 0) {
                    if (isPlayer(playerData.player))
                        playerData.player.sendMessage({
                            translate: "chat.cooldown",
                            with: { rawtext: [{ translate: itemName }, { text: `${leftDuration}` }] },
                        });
                    return false;
                }
            }
        }

        // ===== 执行神秘药水事件 =====
        if (getMysteryPotion) {
            // 如果执行此事件时没有执行玩家，返回 false
            if (!playerData) return false;

            // 尝试执行神秘药水事件，若执行失败直接返回 false
            const result = this.getMysteryPotion(getMysteryPotion, playerData);
            if (!result) return false;
        }

        // ===== 执行鬼屋门事件 =====
        if (intoHauntedHouseDoor) {
            // 如果执行此事件时没有执行玩家，返回 false
            if (!playerData) return false;

            // 尝试执行鬼屋门事件，若执行失败直接返回 false
            const result = this.intoHauntedHouseDoor(intoHauntedHouseDoor, playerData);
            if (!result) return false;
        }

        // ===== 执行离开鬼屋门事件 =====
        if (outOfHauntedHouseDoor) {
            // 如果执行此事件时没有执行玩家，返回 false
            if (!playerData) return false;

            // 标记玩家离开鬼屋门
            playerData.isInHauntedHouseDoor = false;
        }

        // ===== 执行放置方块/结构事件 =====
        if (place) {
            // 如果有方块/结构未能放置，立刻判定为失败
            const hasPlaceFailed = place.some(data => {
                let result = true;

                if (data.type === "setBlock") result = this.setBlock(data);
                else if (data.type === "fillBlock") result = this.fillBlock(data);
                else if (data.type === "setStructure") result = this.setStructure(data);
                else if (data.type === "setEntity") result = this.setEntity(data);
                else result = this.setText(data);

                if (!result) return true;
            });
            if (hasPlaceFailed) return false;
        }

        // ===== 触发处死玩家事件 =====
        if (setPlayerDead) {
            // 如果执行此事件时没有执行玩家，返回 false
            if (!playerData) return false;

            // 尝试执行神秘药水事件，若执行失败直接返回 false
            const result = this.setPlayerDead(setPlayerDead, playerData);
            if (!result) return false;
        }

        // ===== 触发乘坐矿车事件 =====
        if (rideMinecart) {
            // 如果执行此事件时没有执行玩家，返回 false
            if (!playerData) return false;

            // 尝试执行乘坐矿车事件，若执行失败直接返回 false
            const result = this.rideMinecart(rideMinecart, playerData);
            if (!result) return false;
        }

        // ===== 触发传送玩家事件 =====
        if (teleport) {
            // 如果执行此事件时没有执行玩家，返回 false
            if (!playerData) return false;

            // 尝试执行传送玩家事件，若执行失败直接返回 false
            const result = this.teleport(teleport, playerData);
            if (!result) return false;
        }

        // ===== 触发冷却事件 =====
        if (cooldown) {
            // 如果执行此事件时没有执行玩家，返回 false
            if (!playerData) return false;

            // 尝试执行冷却事件，若执行失败直接返回 false
            const result = this.cooldown(cooldown, playerData);
            if (!result) return false;
        }

        // ===== 执行成功后，通告玩家/通知触发玩家 =====
        if (broadcast) lib.PlayerUtils.broadcast(broadcast);
        if (notify && playerData && isPlayer(playerData.player)) lib.PlayerUtils.notify(playerData.player, notify);

        // ===== 执行成功后，触发新的事件 =====
        if (trigger) {
            const { id, delay } = trigger;
            if (!delay) this.triggerEvent(id, playerData);
            else minecraft.system.runTimeout(() => this.triggerEvent(id, playerData), delay);
        }

        return true;
    }

    // #region - 神秘药水

    /** 本局的神秘药水的排布。
     * - 游戏一共有 5 种神秘药水。当玩家喝下神秘药水后，触发一个随机效果。
     * - 在本局游戏内，每种药水的效果是固定的，但在不同游戏内，相同药水的药效是不固定的。
     * - 神秘药水的 ID 为`murder_mystery:mystery_potion_(index)`，其中不同的`index`指代的即为不同的药效。
     */
    readonly mysteryPotionData: MysteryPotionData[] = lib.JSUtils.array.shuffle([
        { name: "失明", id: "blindness", weight: 4 },
        { name: "缓慢", id: "slowness", weight: 5 },
        { name: "迅捷", id: "speed", amplifier: 1, duration: 400, weight: 4 },
        { name: "隐身", id: "invisibility", duration: 280, weight: 5 },
        { name: "无敌", id: "resistance", amplifier: 4, duration: 400, weight: 2 },
    ]);

    /** 默认神秘药水的物品备注。 */
    static readonly mysteryPotionDefaultLore = ["§r§7这是一瓶药水。天知道它会给你什么效果。"];

    /** 记录玩家当前是否处于神秘药水效果影响下。 */
    readonly inPotionEffect: Record<string, MurderMysteryPlayer> = {};

    /** 从药水的 ID 获取索引。 */
    static getPotionIndex(potionId: string) {
        // 匹配完整格式，并捕获数字部分
        const match = potionId.match(/^murder_mystery:mystery_potion_(\d+)$/);
        if (!match) return undefined;
        // 将捕获的字符串转为数字
        return Number(match[1]);
    }

    /** 令玩家试图获取神秘药水。
     * @returns 返回是否成功获得了药水。
     */
    private getMysteryPotion(
        getMysteryPotionEvent: gameData.MurderMysteryGetMysteryPotionEvent,
        playerData: MurderMysteryPlayer
    ): boolean {
        // ===== 条件检查 =====

        // 如果玩家不是 Player，终止运行
        const player = playerData.player;
        if (!isPlayer(player)) return false;

        // 如果已有人在使用（附近有药水动画时），提示玩家后终止运行
        const animationLocation = getMysteryPotionEvent.animationLocation;
        const nearbyAnimationEntities = lib.EntityUtils.getNearby(
            "murder_mystery:mystery_potion",
            animationLocation,
            2
        );
        if (nearbyAnimationEntities.length !== 0) {
            lib.PlayerUtils.notify(player, {
                message: { translate: "chat.mysteryPotion.occupied" },
                sound: "random.anvil_land",
            });
            return false;
        }

        // 如果玩家拥有超过 3 瓶药水，提示玩家后终止运行
        const playerPotionCount = lib.ItemUtils.inventory.getAmount(player, {
            includeTypeId: [
                "murder_mystery:mystery_potion_0",
                "murder_mystery:mystery_potion_1",
                "murder_mystery:mystery_potion_2",
                "murder_mystery:mystery_potion_3",
                "murder_mystery:mystery_potion_4",
            ],
        });
        if (playerPotionCount >= 3) {
            lib.PlayerUtils.notify(player, {
                message: { translate: "chat.mysteryPotion.inventoryFull" },
                sound: "random.anvil_land",
            });
            return false;
        }

        // ===== ↓ 可以成功购买神秘药水 =====

        // 决定本次抽中何种药水（potionIndex），并获取药水的相关信息
        const totalWeight = lib.JSUtils.number.sum(this.mysteryPotionData.map(data => data.weight));
        let randomWeight = lib.JSUtils.number.randomInt(0, totalWeight - 1);
        let potionIndex = 0;
        this.mysteryPotionData.some((data, index) => {
            randomWeight -= data.weight;
            if (randomWeight <= 0) {
                potionIndex = index;
                return true;
            }
        });
        const potionId = `murder_mystery:mystery_potion_${potionIndex}`;
        const potionData = this.mysteryPotionData[potionIndex];
        const potionName = potionData?.name ?? "失明";
        const potionUnlocked = playerData.mysteryPotionUnlocked[potionIndex];

        // 展示药水对应的动画
        const mysteryPotionAnimationEntity = lib.EntityUtils.add(
            "murder_mystery:mystery_potion",
            lib.Vector3Utils.add(animationLocation, 0.5, 0, 0.5),
            player.dimension,
            { initialRotation: player.getRotation().y + 180, spawnEvent: potionId }
        );

        /** 给予玩家药水的槽位。这里只有 3 个槽位可用：6 号位 -> 8 号位 -> 1 号位。如果这些槽位有空缺，则依次顺延。 */
        let replaceSlot = 0;
        const playerContainer = player.getComponent("inventory")?.container;
        if (!playerContainer?.getItem(5)) replaceSlot = 5;
        else if (!playerContainer?.getItem(7)) replaceSlot = 7;
        else replaceSlot = 0;

        // 在 1.5 秒后，销毁动画实体并给予玩家药水
        minecraft.system.runTimeout(() => {
            lib.ItemUtils.inventory.set(player, replaceSlot, potionId, {
                itemLock: minecraft.ItemLockMode.slot,
                name: potionUnlocked ? `§r§a${potionName}药水` : void 0,
                lore: potionUnlocked
                    ? [`§r§7这瓶药水将会使你获得${potionName}效果！`]
                    : MurderMysteryEventManager.mysteryPotionDefaultLore,
            });
            mysteryPotionAnimationEntity.remove();
        }, 30);
        return true;
    }

    /** 玩家尝试喝下神秘药水，并获取对应的状态效果。
     * @returns 返回是否成功喝下了药水。
     */
    drinkMysteryPotion(playerData: MurderMysteryPlayer, potionId: string): boolean {
        // ===== 条件检查 =====

        // 获取药效信息，如果玩家喝下的不是有效药水，则终止运行
        const potionIndex = MurderMysteryEventManager.getPotionIndex(potionId);
        if (potionIndex === undefined) return false;
        const potionData = this.mysteryPotionData[potionIndex];
        if (!potionData) return false;

        // 如果玩家不是 Player，终止运行
        const player = playerData.player;
        if (!isPlayer(player)) return false;

        // 如果玩家正受神秘药水效果影响，则不给予药效，重新给予药水并提示玩家
        if (this.inPotionEffect[player.id]) {
            lib.ItemUtils.equipment.set(player, potionId, minecraft.EquipmentSlot.Mainhand, {
                itemLock: minecraft.ItemLockMode.slot,
            });
            player.sendMessage({ translate: "chat.mysteryPotion.onlyOneEffect" });
            return false;
        }

        // ===== ↓ 可以成功喝下药水 =====

        // 显示副标题
        lib.PlayerUtils.notify(player, {
            title: "§1",
            subtitle: { translate: `subtitle.mysteryPotion.${potionData.id}` },
            titleOptions: instantTitleDisplay,
        });

        // 标记为玩家已解锁该药水
        playerData.mysteryPotionUnlocked[potionIndex] = true;

        // 给予药效
        player.addEffect(potionData.id, potionData.duration ?? 200, { amplifier: potionData.amplifier });

        // 替换原有的药水（对 1 号位、6 号位、8 号位分别进行检查，其他槽位不动）
        [0, 5, 7].forEach(slot => {
            const playerContainer = player.getComponent("inventory")?.container;
            if (!playerContainer) return;
            const containerSlot = playerContainer.getSlot(slot);
            const currentItem = containerSlot.getItem();
            if (!currentItem) return;
            if (currentItem.typeId !== potionId) return;
            containerSlot.nameTag = `§r§a${potionData.name}药水`;
            containerSlot.setLore([`§r§7这瓶药水将会使你获得${potionData.name}效果！`]);
        });

        // 记录玩家当前处于神秘药水效果影响下，并在计时结束后移除之
        this.inPotionEffect[player.id] = playerData;
        minecraft.system.runTimeout(() => delete this.inPotionEffect[player.id], potionData.duration ?? 200);

        return true;
    }

    // #endregion
    // #region - 放置方块/结构

    /** 在特定位置试图放置方块。
     * @returns 返回是否成功放置了方块。
     */
    private setBlock(setBlockEvent: gameData.MurderMysterySetBlockEvent): boolean {
        // 如果该方块已放置过，则终止运行
        if (lib.BlockUtils.match(setBlockEvent)) return false;

        // 放置方块
        // 这里 setBlockEvent 的类型是继承自 lib.BlockData 的，所以直接用了
        lib.BlockUtils.set(setBlockEvent, lib.DimensionUtils.getOverworld());
        return true;
    }

    /** 在特定位置试图填充方块。
     * @returns 返回是否成功填充了方块。
     */
    private fillBlock(fillBlockEvent: gameData.MurderMysteryFillBlockEvent): boolean {
        // 填充方块
        // 这里 fillBlockEvent 的类型是继承自 lib.BlockFillData 的，所以直接用了
        lib.BlockUtils.fill(fillBlockEvent, {}, lib.DimensionUtils.getOverworld());
        return true;
    }

    /** 在特定位置试图填充方块。
     * @returns 返回是否成功填充了方块。
     */
    private setStructure(setStructureEvent: gameData.MurderMysterySetStructureEvent): boolean {
        const { structure, location, options } = setStructureEvent;
        lib.StructureUtils.placeAsync(structure, location, options);
        return true;
    }

    /** 在特定位置试图填充方块。
     * @returns 返回是否成功填充了方块。
     */
    private setEntity(setEntityEvent: gameData.MurderMysterySetEntityEvent): boolean {
        const { id, location, options } = setEntityEvent;
        lib.EntityUtils.add(id, location, "overworld", options);
        return true;
    }

    /** 在特定位置试图填充方块。
     * @returns 返回是否成功填充了方块。
     */
    private setText(setTextEvent: gameData.MurderMysterySetTextEvent): boolean {
        const { text, location } = setTextEvent;
        minecraft.world.primitiveShapesManager.addText(
            new minecraft.TextPrimitive(lib.Vector3Utils.add(location, 0.5, 0, 0.5), text)
        );
        return true;
    }

    // #endregion
    // #region - 处死玩家

    /** 设置玩家为死亡状态。
     * @returns 返回是否成功处死了玩家。
     */
    setPlayerDead(
        setPlayerDeadEvent: gameData.MurderMysterySetPlayerDeadEvent,
        playerData: MurderMysteryPlayer
    ): boolean {
        const result = playerData.setDead(setPlayerDeadEvent.deathType);
        return result;
    }

    // #endregion
    // #region - 传送玩家

    /** 传送玩家到指定位置。
     * @returns 返回是否成功传送了玩家。
     */
    private teleport(teleportEvent: gameData.MurderMysteryTeleportEvent, playerData: MurderMysteryPlayer): boolean {
        const { location, facingLocation } = teleportEvent;
        playerData.player.teleport(location, { facingLocation });
        return true;
    }

    // #endregion
    // #region - 鬼屋门

    private intoHauntedHouseDoor(
        intoHauntedHouseDoorEvent: gameData.MurderMysteryIntoHauntedHouseDoorEvent,
        playerData: MurderMysteryPlayer
    ): boolean {
        // ===== 变量准备 =====
        const { doorLocation, voidGlassLocation, lavaCaveGlassLocation, voidBarrierLocation } =
            intoHauntedHouseDoorEvent;
        const player = playerData.player;

        // ===== 条件判断 =====
        // 如果没有方块，则终止运行
        const door = lib.BlockUtils.get(doorLocation);
        if (!door) return false;
        // 如果不是玩家，则终止运行
        if (!isPlayer(player)) return false;
        // 如果玩家已在鬼屋门内，则终止运行
        if (playerData.isInHauntedHouseDoor) return false;

        // ===== 开启鬼屋门的判断 =====
        // 关门
        door.setPermutation(door.permutation.withState("open_bit", false));
        lib.PlayerUtils.notify(player, { sound: "close.wooden_door" });

        // 标记玩家进入鬼屋门
        playerData.isInHauntedHouseDoor = true;

        // 播放音效
        lib.PlayerUtils.notify(player, { sound: "note.bass", soundDelay: 20 });
        lib.PlayerUtils.notify(player, { sound: "note.bass", soundDelay: 40 });
        lib.PlayerUtils.notify(player, { sound: "note.bass", soundDelay: 60 });
        lib.PlayerUtils.notify(player, { sound: "note.bass", soundDelay: 80 });
        lib.PlayerUtils.notify(player, { sound: "note.bass", soundDelay: 100 });
        // 6 秒后随机一个结果
        minecraft.system.runTimeout(() => {
            // 随机结果
            const randomResult = lib.JSUtils.number.randomInt(1, 3) as 1 | 2 | 3;
            switch (randomResult) {
                // 1. 正确的门，给予玩家 3 个金锭并放行
                case 1:
                    lib.ItemUtils.addEntity(player.location, goldId, { amount: 3 });
                    lib.PlayerUtils.notify(player, {
                        message: { translate: "chat.hypixelWorld.doors.right" },
                        sound: "random.pop",
                    });
                    break;

                // 2. 错误的门，但不把玩家送到虚空
                case 2:
                    lib.BlockUtils.set({ id: "minecraft:air", location: lavaCaveGlassLocation });
                    lib.PlayerUtils.notify(player, {
                        message: { translate: "chat.hypixelWorld.doors.wrong" },
                        sound: "mob.enderdragon.flap",
                    });
                    break;

                // 3. 错误的门，且把玩家送到虚空
                case 3:
                    lib.BlockUtils.set({ id: "minecraft:air", location: lavaCaveGlassLocation });
                    lib.BlockUtils.set({ id: "minecraft:air", location: voidGlassLocation });
                    lib.BlockUtils.fill({ id: "minecraft:barrier", ...voidBarrierLocation });
                    lib.PlayerUtils.notify(player, {
                        message: { translate: "chat.hypixelWorld.doors.wrong" },
                        sound: "mob.enderdragon.flap",
                    });
                    break;
            }
        }, 120);
        // 7 秒后开门
        minecraft.system.runTimeout(() => {
            door.setPermutation(door.permutation.withState("open_bit", true));
            lib.PlayerUtils.notify(player, { sound: "open.wooden_door" });
        }, 140);
        return true;
    }

    // #endregion
    // #region - 玩家乘坐矿车
    private rideMinecart(
        rideMinecartEvent: gameData.MurderMysteryRideMinecartEvent,
        playerData: MurderMysteryPlayer
    ): boolean {
        // ===== 变量准备&条件检查 =====
        const { from, to, initVelocity, onArrival } = rideMinecartEvent;
        const player = playerData.player;

        if (!isPlayer(player)) return false;

        // ===== 生成矿车并锁定玩家 =====

        // 生成矿车并施加初始速度
        const minecart = lib.EntityUtils.add("minecraft:minecart", from);
        minecart.applyImpulse(initVelocity);

        // 禁用玩家的下车权限
        player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Dismount, false);
        player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Jump, false);

        // 令玩家坐在矿车上
        const rideableComp = minecart.getComponent("rideable");
        if (!rideableComp) return false;
        rideableComp.addRider(player);

        // 当矿车到达终点时，移除矿车，启用玩家的下车权限并终止时间线
        lib.gameSystem.subscribeTimeline(`${player.id}RideMinecart`, () => {
            const location = minecart.location;
            if (lib.Vector3Utils.distance(location, to, true) <= 1) {
                player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Dismount, true);
                player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Jump, true);
                minecart.remove();
                this.triggerEvent(onArrival, playerData);
                return false;
            }
        });
        return true;
    }

    // #endregion
    // #region - 玩家进入冷却
    private cooldown(cooldownEvent: gameData.MurderMysteryCooldownEvent, playerData: MurderMysteryPlayer): boolean {
        // 记录玩家的冷却
        const { type, duration } = cooldownEvent;
        playerData.eventCooldown[type] = duration;
        // 注册时间线进行倒计时
        lib.gameSystem.subscribeTimeline(
            "eventCooldown",
            () => {
                // 检查还有哪些玩家正处于倒计时下，如果没有玩家则终止这个时间线
                const inCooldownPlayers = this.system.alivePlayers.allPlayers.filter(
                    playerData => Object.keys(playerData.eventCooldown).length > 0
                );
                if (inCooldownPlayers.length === 0) return false;
                // 如果仍有玩家处于冷却，对每个玩家的每个冷却 -1 秒倒计时
                inCooldownPlayers.forEach(playerData => {
                    const cooldowns = Object.keys(playerData.eventCooldown);
                    cooldowns.forEach(cooldown => {
                        const currentDuration = playerData.eventCooldown[cooldown] ?? 0;
                        // 当前值 ≤ 1 时，下一秒归零，直接删除，否则减 1 秒
                        if (currentDuration <= 1) delete playerData.eventCooldown[cooldown];
                        else playerData.eventCooldown[cooldown] = currentDuration - 1;
                    });
                });
            },
            20
        );
        return true;
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

    /** 在游戏开始多久后给予杀手和侦探物品。单位：秒。 */
    getSpecialItemDelay: number;

    /** 平民如何拾取弓。可以选择右键拾取或接近拾取。 */
    pickupBowMethod: "rightClick" | "nearby";

    /** 旁观模式的传送列表中，是否显示身份。 */
    showRoleInSpectatorTeleportUI: boolean;

    /** 是否对所有玩家施加夜视状态效果。 */
    applyNightVision: boolean;
};

type MurderMysteryGoldSpawnSettings = {
    /** 在玩家附近多少格的金点会尝试生成。 */
    spawnRadius: number;

    /** 待生成金锭的金点中，有多少概率能够实际生成。 */
    spawnChance: number;

    /** 对于每位玩家，金锭的平均生成间隔。单位：秒。 */
    spawnInterval: number;
};

type MurderMysteryMurdererSwordSettings = {
    /** 杀手飞刀投掷出去的速度。 */
    knifeSpeed: number;

    /** 杀手飞刀距离箭多近时视为相碰。 */
    knifeCollideArrowDistance: number;

    /** 杀手飞刀需要蓄力多久才能投掷出去。单位：游戏刻。 */
    knifeThrowTime: number;
};

type MurderMysteryMiscellaneousSettings = {
    /** 信息板最后一行的内容。默认为黄色字体。 */
    infoboardLastLine: string;
};

/** 密室杀手设置。在设置内包含众多玩家可以调控的设置项。 */
class MurderMysterySettings {
    constructor() {
        // mapEnabled 的默认设置：若 enabledByDefault 为 false，则 mapEnabled 为 false，否则为 true
        Object.keys(gameData.maps).forEach(mapName => {
            const mapData = gameData.maps[mapName];
            // 如果 mapData 不存在则默认不使用
            if (!mapData) {
                this.mapEnabled[mapName] = false;
                return;
            }
            // 如果专门设置了默认不启用，则默认不启用
            if (mapData.description.enabledByDefault === false) {
                this.mapEnabled[mapName] = false;
                return;
            }
            this.mapEnabled[mapName] = true;
        });
    }

    /** 等待设置，控制地图在等待期间的行为。 */
    waiting: MurderMysteryWaitingSettings = {
        minPlayerCount: 2,
        maxPlayerCount: 16,
        startCountdown: 16,
    };

    /** 游戏设置，控制地图在游戏期间的行为。 */
    gaming: MurderMysteryGameSettings = {
        timePerGame: 270,
        getSpecialItemDelay: 15,
        pickupBowMethod: "nearby",
        showRoleInSpectatorTeleportUI: true,
        applyNightVision: false,
    };

    /** 金锭生成设置，控制如何生成金锭。 */
    goldSpawn: MurderMysteryGoldSpawnSettings = {
        spawnRadius: 5,
        spawnChance: 0.15,
        spawnInterval: 16,
    };

    /** 杀手刀剑设置，控制杀手的刀的表现。 */
    murdererSword: MurderMysteryMurdererSwordSettings = {
        knifeCollideArrowDistance: 2.5,
        knifeSpeed: 1.0,
        knifeThrowTime: 10,
    };

    /** 杂项设置，控制游戏中一些其他内容的设置项。 */
    miscellaneous: MurderMysteryMiscellaneousSettings = {
        infoboardLastLine: "一只卑微的量筒",
    };

    mapEnabled: Record<keyof typeof gameData.maps, boolean> = {};

    // #region - 保存与加载设置

    /** 对系统保存设置。 */
    static saveSettings(system: MurderMysterySystem) {
        minecraft.world.setDynamicProperty("murder_mystery:settings", JSON.stringify(system.settings));
    }

    /** 加载设置。返回待加载的设置。 */
    static loadSettings() {
        const settings = new MurderMysterySettings();

        // 如果没有保存设置，则直接返回新生成的设置
        const savedSettingsStr = minecraft.world.getDynamicProperty("murder_mystery:settings") as string | undefined;
        if (!savedSettingsStr) return settings;

        // 递归合并（只合并 settings 中已有的键），但如果 JSON 解析失败，则保留默认配置
        try {
            const parsed = JSON.parse(savedSettingsStr);
            this.mergeDeep(settings, parsed);
        } catch {}

        return settings;
    }

    /** 深度合并工具：将 source 对象中与 target 同名的键合并到 target。
     * - 只合并 target 已有的属性，忽略 source 中多余的键
     * - 嵌套对象递归合并，数组/基本类型直接覆盖
     *
     * （代码由 Deepseek 生成 =P）
     */
    private static mergeDeep(target: any, source: any): void {
        for (const key of Object.keys(source)) {
            if (Object.prototype.hasOwnProperty.call(target, key)) {
                const targetValue = target[key];
                const sourceValue = source[key];
                // 两者都是普通对象（非数组、非 null）时递归合并
                if (lib.JSUtils.isPlainObject(targetValue) && lib.JSUtils.isPlainObject(sourceValue))
                    this.mergeDeep(targetValue, sourceValue);
                // 否则直接覆盖（数组、基本类型、函数等）
                else target[key] = sourceValue;
            }
            // 如果 target 没有该键，忽略
        }
    }

    // #endregion

    // #region - 设置 UI

    /** 对玩家显示设置界面。 */
    static showMainSettingsUI(system: MurderMysterySystem, player: minecraft.Player) {
        // ===== 变量准备 =====

        /** 玩家权限。部分选项仅对管理员或更高权限的玩家开放。 */
        const permission = player.playerPermissionLevel;

        /** 玩家设置选项。 */
        const playerSettings: lib.ActionUIComponent[] = [
            { type: "divider" },
            { type: "label", text: { translate: "ui.settings.main.playerSettings" } },
            {
                type: "button",
                text: { translate: "ui.settings.main.about" },
                icon: "textures/items/spyglass",
                onClick: () => this.showAboutUI(system, player),
            },
            {
                type: "button",
                text: { translate: "ui.settings.main.updateLog" },
                icon: "textures/items/book_writable",
                onClick: () => this.showUpdateLogUI(system, player),
            },
        ];

        /** 管理员设置选项。 */
        const operatorSettings: lib.ActionUIComponent[] = [];
        if (permission >= 2)
            operatorSettings.push(
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.main.operatorSettings" } },
                {
                    type: "button",
                    text: { translate: "ui.settings.main.selectMap" },
                    icon: "textures/items/map_empty",
                    onClick: () => this.showSelectMapUI(system, player),
                },
                {
                    type: "button",
                    text: { translate: "ui.settings.main.enableMap" },
                    icon: "textures/items/map_filled",
                    onClick: () => this.showEnableMapUI(system, player),
                },
                {
                    type: "button",
                    text: { translate: "ui.settings.main.waiting" },
                    icon: "textures/items/clock_item",
                    onClick: () => this.showWaitingUI(system, player),
                },
                {
                    type: "button",
                    text: { translate: "ui.settings.main.gaming" },
                    icon: "textures/items/bow_standby",
                    onClick: () => this.showGamingUI(system, player),
                },
                {
                    type: "button",
                    text: { translate: "ui.settings.main.goldSpawn" },
                    icon: "textures/items/gold_ingot",
                    onClick: () => this.showGoldSpawnUI(system, player),
                },
                {
                    type: "button",
                    text: { translate: "ui.settings.main.murdererSword" },
                    icon: "textures/items/iron_sword",
                    onClick: () => this.showMurdererSwordUI(system, player),
                },
                {
                    type: "button",
                    text: { translate: "ui.settings.main.miscellaneous" },
                    icon: "textures/items/diamond_pickaxe",
                    onClick: () => this.showMiscellaneousUI(system, player),
                }
            );

        // ===== 显示设置界面 =====
        lib.UIUtils.createAction(player, {
            type: "action",
            components: [
                { type: "header", text: { translate: "ui.settings.main.title" } },
                ...playerSettings,
                ...operatorSettings,
            ],
        });
    }

    /** 对玩家显示关于我们 UI。 */
    private static showAboutUI(system: MurderMysterySystem, player: minecraft.Player) {
        lib.UIUtils.createAction(player, {
            type: "action",
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: "ui.settings.about.title" } },
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.author" } },
                { type: "label", text: "§a一只卑微的量筒 (YZBWDLT)" },
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.version" } },
                { type: "label", text: `§a${system.version}` },
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.tester" } },
                { type: "label", text: "§a1.0 正式版更新后同步……" },
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.specialThanks" } },
                { type: "label", text: "§a珂朵莉 (Tetrisoo)" },
                { type: "label", text: "§a欧拉 (EurluoL)" },
                // { type: "label", text: "§a祉语 (xhduoduobaby)" }, 应祉语要求，不显示
            ],
        });
    }

    /** 对玩家显示更新日志 UI。 */
    private static showUpdateLogUI(system: MurderMysterySystem, player: minecraft.Player) {
        const texts: string[] = [
            "§l1.0 - Snapshot 6 更新日志",
            "本周我们带来了大家心心念念的游乐园的完整功能，过山车！芜湖——！！",
            "并且，我们在本周还带来了重磅更新——完全实装设置功能！现在你可以在设置中控制地图的运行方式，也可以控制何种地图将会启用，等等。通过设置，这张地图就可以玩出很多花活了！",
            "一起来看看本周的更新吧~",
            "==========",
            "§7§l设置",
            "§7- 隆重推出剩下的设置项！",
            "§7- 现在应用设置可以全局保存，无论/reload还是重开游戏都可以自动应用上次的更改",
            "§7- 对于管理员，可以随时使用/give @s murder_mystery:settings获取设置物品，并随时应用设置更改",
            "§7- 实装了启用地图设置，现在可以控制哪些地图可以生成，哪些地图不能生成",
            "§7  - 这同样也会影响每局之后的随机地图生成，也就是只要禁用一张地图，那么这张地图不能在设置中选中，也不能随机生成，只能启用后才能游玩",
            "§7  - 不能把所有地图全部关闭，会阻止设置应用",
            "§7- 实装了游戏前设置，现在可以控制一局的最多最少为多少人，并控制游戏倒计时需要多久",
            "§7- 实装了游戏时设置，可以控制一局的游戏时长，多久后给予侦探或杀手物品，如何拾起弓，是否对旁观玩家显示职业和是否全局启用夜视效果 5 个设置",
            "§7- 实装了金锭生成设置，控制金锭以何种频率和密度生成",
            "§7- 实装了杀手刀剑设置，控制杀手飞刀如何运行",
            "§7- 实装了杂项设置，目前可控制右侧信息栏最底下一行的文本",
            "§7§l地图",
            "§7- #37 完全还原了 Hypixel 游乐园和复活节游乐园的功能，现在它们支持进入鬼屋门和使用单轨列车和过山车了",
            "§7- 略微修改了两张游乐园地图的金点，确保金点不会尝试遍历禁区",
            "§7- 略微修改了两张游乐园地图的金点，确保不会离岩浆过近",
            "§7- 现在地图总部可以开启云杉门了",
            "§7- 新增了运输塔 V1 和运输塔 V2",
            "§7- 修复了部分地图可能的出图点位，或卡位点位",
            "§7- 补充了部分地图的画",
            "§7§l特性更改&漏洞修复",
            "§7- 修复了默认会启用所有地图的问题",
            "§7- #49 现在游戏结束后玩家不再能死亡，导致游戏产生进一步的误判",
        ];
        const textComponent: lib.FormLabelComponent[] = texts.map(text => ({ type: "label", text: text }));
        lib.UIUtils.createAction(player, {
            type: "action",
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: "ui.settings.updateLog.title" } },
                { type: "label", text: { translate: "ui.settings.updateLog.line1" } },
                { type: "divider" },
                ...textComponent,
            ],
        });
    }

    /** 对玩家显示选择地图 UI。
     * @description 不会显示已被禁用的地图。
     */
    private static showSelectMapUI(system: MurderMysterySystem, player: minecraft.Player) {
        const mapNames = Object.keys(gameData.maps) as (keyof typeof gameData.maps)[];
        const validMapNames = mapNames.filter(mapName => system.settings.mapEnabled[mapName]);
        const selectMapButtons: lib.FormButtonComponent[] = validMapNames.map(mapName => ({
            type: "button",
            text: { translate: `map.${mapName}` },
            onClick: () => {
                // 立刻无效化系统
                system.isValid = false;

                // 移除所有正在监听的时间线和事件
                lib.gameSystem.unsubscribeAllTimelines();
                lib.gameSystem.unsubscribeAllEvents();
                lib.gameSystem.unsubscribeAllDelays();

                // 设定下一张地图
                system.nextMap = mapName;
            },
        }));
        lib.UIUtils.createAction(player, {
            type: "action",
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: "ui.settings.selectMap.title" } },
                { type: "divider" },
                ...selectMapButtons,
            ],
        });
    }

    /** 对玩家显示启用地图 UI。 */
    private static showEnableMapUI(system: MurderMysterySystem, player: minecraft.Player) {
        const mapNames = Object.keys(gameData.maps);
        const currentMapEnabledSettings = { ...system.settings.mapEnabled };
        const enableMapButtons: lib.FormToggleComponent[] = mapNames.map(mapName => ({
            type: "toggle",
            description: { translate: `map.${mapName}` },
            default: system.settings.mapEnabled[mapName],
            onSubmit: result => {
                system.settings.mapEnabled[mapName] = result;
            },
        }));
        this.generateSettingsUI(system, player, "mapEnabled", enableMapButtons, () => {
            // 如果所有地图都被禁用，则直接打回到原始设置
            const values = Object.values(system.settings.mapEnabled);
            if (values.every(value => !value)) {
                lib.PlayerUtils.notify(player, {
                    message: { translate: "ui.settings.mapEnabled.disabledAllMaps" },
                    sound: "mob.villager.no",
                });
                system.settings.mapEnabled = currentMapEnabledSettings;
            }
        });
    }

    /** 对玩家显示等待时 UI。 */
    private static showWaitingUI(system: MurderMysterySystem, player: minecraft.Player) {
        const { maxPlayerCount, minPlayerCount, startCountdown } = system.settings.waiting;
        this.generateSettingsUI(
            system,
            player,
            "waiting",
            [
                {
                    type: "slider",
                    description: { translate: "ui.settings.waiting.minPlayerCount.title" },
                    tipText: { translate: "ui.settings.waiting.minPlayerCount.description" },
                    default: minPlayerCount,
                    min: 2,
                    max: 24,
                    step: 1,
                    onSubmit: result => {
                        system.settings.waiting.minPlayerCount = result;
                    },
                },
                {
                    type: "slider",
                    description: { translate: "ui.settings.waiting.maxPlayerCount.title" },
                    tipText: { translate: "ui.settings.waiting.maxPlayerCount.description" },
                    default: maxPlayerCount,
                    min: 2,
                    max: 24,
                    step: 1,
                    onSubmit: result => {
                        system.settings.waiting.maxPlayerCount = result;
                    },
                },
                {
                    type: "slider",
                    description: { translate: "ui.settings.waiting.startCountdown.title" },
                    tipText: { translate: "ui.settings.waiting.startCountdown.description" },
                    default: startCountdown,
                    min: 5,
                    max: 120,
                    step: 5,
                    onSubmit: result => {
                        system.settings.waiting.startCountdown = result;
                    },
                },
            ],
            () => {
                // 立刻应用设置
                system.beforeGameInfo.startCountdown = system.settings.waiting.startCountdown;
                system.beforeGameInfo.minPlayerCount = system.settings.waiting.minPlayerCount;
                system.beforeGameInfo.maxPlayerCount = system.settings.waiting.maxPlayerCount;
            }
        );
    }

    /** 对玩家显示游戏时 UI。 */
    private static showGamingUI(system: MurderMysterySystem, player: minecraft.Player) {
        const { timePerGame, getSpecialItemDelay, pickupBowMethod, showRoleInSpectatorTeleportUI, applyNightVision } =
            system.settings.gaming;
        const pickupBowMethodList: Record<"rightClick" | "nearby", number> = {
            rightClick: 0,
            nearby: 1,
        };
        const pickupBowMethods: ["rightClick", "nearby"] = ["rightClick", "nearby"];

        this.generateSettingsUI(
            system,
            player,
            "gaming",
            [
                {
                    type: "slider",
                    description: { translate: "ui.settings.gaming.timePerGame.title" },
                    tipText: { translate: "ui.settings.gaming.timePerGame.description" },
                    default: timePerGame,
                    min: 30,
                    max: 600,
                    step: 30,
                    onSubmit: result => {
                        system.settings.gaming.timePerGame = result;
                    },
                },
                {
                    type: "slider",
                    description: { translate: "ui.settings.gaming.getSpecialItemDelay.title" },
                    tipText: { translate: "ui.settings.gaming.getSpecialItemDelay.description" },
                    default: getSpecialItemDelay,
                    min: 0,
                    max: 30,
                    step: 5,
                    onSubmit: result => {
                        system.settings.gaming.getSpecialItemDelay = result;
                    },
                },
                {
                    type: "dropdown",
                    description: { translate: "ui.settings.gaming.pickupBowMethod.title" },
                    tipText: { translate: "ui.settings.gaming.pickupBowMethod.description" },
                    items: [
                        { translate: "ui.settings.gaming.pickupBowMethod.rightClick" },
                        { translate: "ui.settings.gaming.pickupBowMethod.nearby" },
                    ],
                    default: pickupBowMethodList[pickupBowMethod],
                    onSubmit: result => {
                        system.settings.gaming.pickupBowMethod = pickupBowMethods[result] ?? "nearby";
                    },
                },
                {
                    type: "toggle",
                    description: { translate: "ui.settings.gaming.showRoleInSpectatorTeleportUI.title" },
                    tipText: { translate: "ui.settings.gaming.showRoleInSpectatorTeleportUI.description" },
                    default: showRoleInSpectatorTeleportUI,
                    onSubmit: result => {
                        system.settings.gaming.showRoleInSpectatorTeleportUI = result;
                    },
                },
                {
                    type: "toggle",
                    description: { translate: "ui.settings.gaming.applyNightVision.title" },
                    tipText: { translate: "ui.settings.gaming.applyNightVision.description" },
                    default: applyNightVision,
                    onSubmit: result => {
                        system.settings.gaming.applyNightVision = result;
                    },
                },
            ],
            () => {
                // 如果要设置的游戏时间小于当前剩余的游戏时间，则直接改为待设置的游戏时间
                if (system.settings.gaming.timePerGame < system.timeLeft)
                    system.timeLeft = system.settings.gaming.timePerGame;
                // 重新注册弓箭检测组件
                MurderMysteryComponents.playerPickupBowTest(system);
                // 若启用夜视，则立刻应用组件，否则立刻移除夜视效果
                if (system.settings.gaming.applyNightVision) MurderMysteryComponents.applyNightVision(system);
                else {
                    lib.PlayerUtils.getAll().forEach(player => player.removeEffect("minecraft:night_vision"));
                }
            }
        );
    }

    /** 对玩家显示金锭生成 UI。 */
    private static showGoldSpawnUI(system: MurderMysterySystem, player: minecraft.Player) {
        const { spawnChance, spawnInterval, spawnRadius } = system.settings.goldSpawn;
        this.generateSettingsUI(system, player, "goldSpawn", [
            {
                type: "slider",
                description: { translate: "ui.settings.goldSpawn.spawnChance.title" },
                tipText: { translate: "ui.settings.goldSpawn.spawnChance.description" },
                default: spawnChance * 100,
                min: 0,
                max: 100,
                step: 5,
                onSubmit: result => {
                    system.settings.goldSpawn.spawnChance = result / 100;
                },
            },
            {
                type: "slider",
                description: { translate: "ui.settings.goldSpawn.spawnInterval.title" },
                tipText: { translate: "ui.settings.goldSpawn.spawnInterval.description" },
                default: spawnInterval,
                min: 4,
                max: 32,
                step: 4,
                onSubmit: result => {
                    system.settings.goldSpawn.spawnInterval = result;
                },
            },
            {
                type: "slider",
                description: { translate: "ui.settings.goldSpawn.spawnRadius.title" },
                tipText: { translate: "ui.settings.goldSpawn.spawnRadius.description" },
                default: spawnRadius,
                min: 1,
                max: 10,
                step: 1,
                onSubmit: result => {
                    system.settings.goldSpawn.spawnRadius = result;
                },
            },
        ]);
    }

    /** 对玩家显示杀手刀剑 UI。 */
    private static showMurdererSwordUI(system: MurderMysterySystem, player: minecraft.Player) {
        const { knifeCollideArrowDistance, knifeSpeed, knifeThrowTime } = system.settings.murdererSword;
        this.generateSettingsUI(system, player, "murdererSword", [
            {
                type: "slider",
                description: { translate: "ui.settings.murdererSword.knifeCollideArrowDistance.title" },
                tipText: { translate: "ui.settings.murdererSword.knifeCollideArrowDistance.description" },
                default: knifeCollideArrowDistance * 10,
                min: 5,
                max: 50,
                step: 5,
                onSubmit: result => {
                    system.settings.murdererSword.knifeCollideArrowDistance = result / 10;
                },
            },
            {
                type: "slider",
                description: { translate: "ui.settings.murdererSword.knifeSpeed.title" },
                tipText: { translate: "ui.settings.murdererSword.knifeSpeed.description" },
                default: knifeSpeed * 10,
                min: 1,
                max: 40,
                step: 3,
                onSubmit: result => {
                    system.settings.murdererSword.knifeSpeed = result / 10;
                },
            },
            {
                type: "slider",
                description: { translate: "ui.settings.murdererSword.knifeThrowTime.title" },
                tipText: { translate: "ui.settings.murdererSword.knifeThrowTime.description" },
                default: knifeThrowTime,
                min: 0,
                max: 50,
                step: 5,
                onSubmit: result => {
                    system.settings.murdererSword.knifeThrowTime = result;
                },
            },
        ]);
    }

    /** 对玩家显示杂项 UI。 */
    private static showMiscellaneousUI(system: MurderMysterySystem, player: minecraft.Player) {
        const { infoboardLastLine } = system.settings.miscellaneous;
        this.generateSettingsUI(system, player, "miscellaneous", [
            {
                type: "textField",
                description: { translate: "ui.settings.miscellaneous.infoboardLastLine.title" },
                tipText: { translate: "ui.settings.miscellaneous.infoboardLastLine.description" },
                default: infoboardLastLine,
                placeholderText: "",
                onSubmit: result => {
                    system.settings.miscellaneous.infoboardLastLine = result;
                },
            },
        ]);
    }

    /** 生成一个常规设置 UI。可以通过添加设置名称和组件来新增功能。 */
    private static generateSettingsUI<K extends keyof MurderMysterySettings>(
        system: MurderMysterySystem,
        player: minecraft.Player,
        settingsName: K,
        components: lib.ModalUIComponent[],
        submitCallback?: () => void
    ) {
        lib.UIUtils.createModal(player, {
            type: "modal",
            submitButton: { translate: "ui.settings.confirm" },
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: `ui.settings.${settingsName}.title` } },
                { type: "label", text: { translate: `ui.settings.${settingsName}.description` } },
                { type: "divider" },
                ...components,
                { type: "divider" },
                {
                    type: "toggle",
                    description: { translate: "ui.settings.defaultSettings.title" },
                    onSubmit: result => {
                        if (result) system.settings[settingsName] = new MurderMysterySettings()[settingsName];
                    },
                },
            ],
            onSubmit: () => {
                if (submitCallback) submitCallback();
                MurderMysterySettings.saveSettings(system);
                this.showMainSettingsUI(system, player); // 返回到上一级
            },
        });
    }

    // #endregion
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

    /** 玩家受到伤害组件。
     * @description 阻止玩家受到一切来源的伤害。
     * @description 若地图注册了 playerHurt 组件，则该组件会尝试在玩家受到该类型伤害时触发事件。
     */
    static onPlayerHurt(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent("onPlayerHurt", minecraft.world.beforeEvents.entityHurt, event => {
            // ===== 变量准备 & 取消游戏引擎事件 =====
            const thisCause = event.damageSource.cause;
            const eventManager = system.eventManager;
            event.cancel = true;

            // ===== 条件判断 =====
            // 如果不是玩家和假玩家受伤，则直接终止运行
            const player = event.hurtEntity;
            const playerData = system.getPlayer(player);
            if (!playerData) return;

            // ===== 触发系统事件 =====
            const playerHurtComponent = system.mapData.components?.playerHurt;
            if (!playerHurtComponent) return;
            playerHurtComponent.forEach(({ cause, trigger }) => {
                if (cause !== thisCause) return;
                minecraft.system.run(() => eventManager.triggerEvent(trigger, playerData));
            });
        });
    }

    /** 玩家和方块交互组件。
     * @description 阻止玩家和地图交互组件`interactions`中指定之外的方块交互。
     * @description 触发具有交互组件的其他事件，例如门、获得神秘药水等。
     * @description 不会阻止创造模式玩家和方块交互。
     */
    static interaction(system: MurderMysterySystem) {
        const interactionComponent = system.mapData.components?.interaction;

        // 检查玩家交互
        lib.gameSystem.subscribeEvent("interaction", minecraft.world.beforeEvents.playerInteractWithBlock, event => {
            // ===== 初步判断 =====
            const { isFirstEvent, block, player } = event;
            const location = block.location;
            const blockId = block.typeId;
            // 如果不是首次交互，取消事件并直接终止
            if (!isFirstEvent) {
                event.cancel = true;
                return;
            }
            // 如果是创造模式玩家，直接终止
            if (player.getGameMode() === minecraft.GameMode.Creative) return;

            // 如果不是游戏阶段，取消事件并直接终止
            if (system.gameStage !== GameStage.GamingStage) {
                event.cancel = true;
                return;
            }
            // 如果不是有效玩家，直接终止
            const playerData = system.getPlayer(player);
            if (!playerData) return;

            // ===== 解析地图交互属性 =====

            const matchedInteraction = interactionComponent?.find(data => {
                // 如果有给定坐标或给定方块则返回
                if (data.at && lib.Vector3Utils.hasPosition(data.at, location)) return true;
                if (data.blocks && data.blocks.includes(blockId)) return true;
                // 否则不返回
                return false;
            });

            // 如果地图交互属性不存在，取消事件并直接终止运行
            if (!matchedInteraction) {
                event.cancel = true;
                return;
            }

            const {
                consume = 0,
                notifyPlayerWhenGoldNotEnough = true,
                stillCancelEvent = false,
                trigger = "",
            } = matchedInteraction;

            // 如果玩家没有足够的金锭，则取消事件并终止运行
            const playerGoldCount = lib.ItemUtils.inventory.getTypeAmount(player, goldId);
            if (playerGoldCount < consume) {
                if (notifyPlayerWhenGoldNotEnough) {
                    minecraft.system.run(() =>
                        lib.PlayerUtils.notify(player, {
                            message: { translate: "chat.mysteryPotion.goldNotEnough", with: [`${consume}`] },
                            sound: "random.anvil_land",
                        })
                    );
                }
                event.cancel = true;
                return;
            }

            // ===== 执行交互属性的功能 =====
            if (stillCancelEvent) event.cancel = true;
            minecraft.system.run(() => {
                // 检查是否成功执行了相关逻辑，仅当成功执行才能移除金锭
                const result = system.eventManager.triggerEvent(trigger, playerData);
                if (result) lib.ItemUtils.removeItem(player, "murder_mystery:gold_ingot", -1, consume);
            });
        });
    }

    /** 玩家使用设置。
     * @description 为使用玩家开启一个设置界面。
     */
    static settings(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent("settings", minecraft.world.afterEvents.itemUse, event => {
            if (event.itemStack.typeId === "murder_mystery:settings")
                MurderMysterySettings.showMainSettingsUI(system, event.source);
        });
    }

    /** 对所有玩家施加夜视效果。
     * @description 会自动判断系统的设置是否启用了`applyNightVision`，若未启用则不会注册该组件。
     * @description 会在游戏开始时尝试对所有玩家施加夜视效果。
     */
    static applyNightVision(system: MurderMysterySystem) {
        if (!system.settings.gaming.applyNightVision) return;
        lib.PlayerUtils.getAll().forEach(player => player.runCommand("effect @s night_vision infinite 0 true"));
    }

    // #endregion
    // #region - 开始前必选

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
                    lib.PlayerUtils.broadcast({
                        message: {
                            translate: "chat.beforeGameStart.countdown",
                            with: [countdown],
                        },
                        title: showTitle ? countdown : void 0,
                        titleOptions: instantTitleDisplay,
                        sound: "note.hat",
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

    /** 初始化刚进入的玩家。 */
    static initJoinedPlayer(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent("initJoinedPlayer", minecraft.world.afterEvents.playerSpawn, event => {
            const { player, initialSpawn } = event;
            if (!initialSpawn) return;
            system.initPlayer(player);
        });
    }

    // #endregion
    // #region - 开始后必选

    /** 游戏计时器。
     * @description 每秒进行倒计时。
     * @description 游戏经过 1 分钟后，提醒未杀人的杀手该杀人了。
     * @description 游戏剩余 1 分钟后，提醒游戏即将结束，平民将获得胜利。
     * @description 游戏剩余 30 秒后，杀手将获得定位器，平民将获得提示。
     * @description 若超时则直接游戏结束。
     */
    static gameTimer(system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline(
            "gameTimer",
            () => {
                system.timeLeft--;
                if (system.settings.gaming.timePerGame - system.timeLeft === 60)
                    system.alivePlayers.murderer.forEach(murderer => {
                        if (!isPlayer(murderer.player)) return;
                        if (murderer.kills > 0) return;
                        lib.PlayerUtils.notify(murderer.player, {
                            message: { translate: "chat.remindMurderer" },
                            title: { translate: "title.remindMurderer" },
                            subtitle: { translate: "subtitle.remindMurderer" },
                            titleOptions: instantTitleDisplay,
                        });
                    });
                if (system.timeLeft === 60)
                    lib.PlayerUtils.broadcast({
                        message: { translate: "chat.gameWillOver" },
                        sound: "note.hat",
                    });
                if (system.timeLeft === 30) {
                    system.alivePlayers.murderer.forEach(murderer => murderer.getLocator());
                    system.alivePlayers.allPlayers.forEach(playerData => {
                        if (isPlayer(playerData.player))
                            lib.PlayerUtils.notify(playerData.player, {
                                message: { translate: `chat.murdererGetLocator.${playerData.role}` },
                                sound: "note.hat",
                            });
                    });
                }
                if (system.timeLeft <= 0) system.enterGameOverStage(MurderMysteryGameOverReason.TimeOut);
            },
            20
        );
    }

    /** 杀手获得剑。
     * @description 剩余 0-5 秒时，对玩家公告杀手将拿到剑。
     * @description 剩余 0 秒时，杀手将拿到剑，侦探将拿到弓，并注销此组件。
     */
    static getSpecialItem(system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline(
            "getSpecialItem",
            () => {
                const getSpecialItemTimeLeft =
                    system.settings.gaming.getSpecialItemDelay - (system.settings.gaming.timePerGame - system.timeLeft);

                // 当给杀手刀剩余 1-5 秒时，对所有玩家提示
                if (getSpecialItemTimeLeft > 0 && getSpecialItemTimeLeft <= 5) {
                    system.alivePlayers.allPlayers.forEach(playerData => {
                        if (!isPlayer(playerData.player)) return;
                        lib.PlayerUtils.notify(playerData.player, {
                            message: {
                                translate: `chat.murderWillGetSword.${playerData.role}`,
                                with: [`§c${getSpecialItemTimeLeft}`],
                            },
                            sound: "note.hat",
                        });
                    });
                }
                // 当倒计时结束后，给予杀手和侦探道具并对所有玩家提示
                if (getSpecialItemTimeLeft <= 0) {
                    system.alivePlayers.allPlayers.forEach(playerData => {
                        if (!isPlayer(playerData.player)) return;
                        lib.PlayerUtils.notify(playerData.player, {
                            message: {
                                translate: `chat.murderGetSword.${playerData.role}`,
                                with: [`§c${getSpecialItemTimeLeft}`],
                            },
                            sound: "note.hat",
                        });
                    });
                    system.alivePlayers.murderer.forEach(murderer => murderer.getSword());
                    system.alivePlayers.detective.forEach(detective => detective.getBow());
                    system.getSpecialItem = true;
                    return false;
                }
            },
            20
        );
    }

    /** 金锭生成。
     * @description 根据 Hypixel 的实测数据，Hypixel 的金点行为更类似于大量定点 + 玩家附近生成，平均 2 分钟出弓。
     * @description 对每位玩家会尝试每隔 16s 在玩家附近 5 格的位置检索所有金点，并挑出其中的 15% 生成金锭。
     */
    static generateGold(system: MurderMysterySystem) {
        const goldPoints = lib.JSUtils.array.shuffle(system.mapData.description.goldPoints);
        /** 返回两坐标在 xz 平面上的距离平方。 */
        function xzDistanceSquared(location1: minecraft.Vector3, location2: minecraft.Vector3) {
            return (location2.x - location1.x) ** 2 + (location2.z - location1.z) ** 2;
        }
        lib.gameSystem.subscribeTimeline("generateGold", () => {
            const { spawnChance, spawnInterval, spawnRadius } = system.settings.goldSpawn;
            // 1. 判断现在是不是时机生成
            // 默认来讲，平均每位玩家有 16s（spawnInterval）的生成时间，这 16s 中所有玩家依次轮流生成。
            // 因此，每 spawnInterval/alivePlayersCount 秒尝试生成一次。
            const alivePlayersCount = system.alivePlayers.allPlayers.length;
            const realSpawnInterval = Math.floor((20 * spawnInterval) / alivePlayersCount);
            if (minecraft.system.currentTick % realSpawnInterval !== 0) return;
            // 2. 确定生成时机后，判断对哪个玩家生成
            system.globalGoldSpawnTimes++;
            const index = system.globalGoldSpawnTimes % alivePlayersCount;
            const playerData =
                system.alivePlayers.allPlayers[index] ?? (system.alivePlayers.allPlayers[0] as MurderMysteryPlayer);
            // 3. 查找距离该玩家平面距离（xz）最近的可生成金点，并在选中的金点位置生成金锭
            goldPoints
                .filter((goldPoint, index) => {
                    // 如果距离过远，则排除之
                    if (xzDistanceSquared(playerData.player.location, goldPoint) > spawnRadius ** 2) return false;
                    // 如果不幸没随机到，则排除之
                    if (Math.random() > spawnChance) return false;
                    return true;
                })
                .filter((goldPoint, index) => {
                    // 最多取 8 个金点
                    if (index > 8) return false;
                    return true;
                })
                .forEach(goldPoint => {
                    lib.ItemUtils.addEntity(goldPoint, goldId);
                });
        });
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
                player.sendMessage({ translate: "chat.pickedUpGold", with: [`${goldIngot[0]?.amount}`] });
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
                // 如果玩家（必须是非侦探）集齐 10 个金锭，则给予一把弓和一根箭
                if (inventoryUtils.getAmount(player, { includeTypeId: [goldId] }) < 10) return;
                const playerData = system.getPlayer(player);
                if (!playerData) return;
                if (playerData.role === MurderMysteryPlayerRole.Detective) return;
                if (isPlayer(playerData.player)) {
                    lib.ItemUtils.removeItem(playerData.player, goldId, -1, 10);
                    lib.PlayerUtils.notify(playerData.player, {
                        message: { translate: "chat.10GoldCollected" },
                        title: "§1",
                        subtitle: { translate: "subtitle.10GoldCollected" },
                        titleOptions: instantTitleDisplay,
                    });
                }
                playerData.getBow();
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
            if (attackerMainhandItem?.typeId !== "minecraft:iron_sword") return;
            // 记录击杀
            victimData.setDead(gameData.MurderMysteryDeathType.MurdererStab, attackerData);
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
            // 考虑各个身份被射中时：
            switch (victimData.role) {
                // 杀手被击杀
                case MurderMysteryPlayerRole.Murderer:
                    victimData.setDead(gameData.MurderMysteryDeathType.Player, attackerData);
                    break;
                // 平民或侦探被击杀
                case MurderMysteryPlayerRole.Innocent:
                case MurderMysteryPlayerRole.Detective:
                    // 被杀手杀死，则记录为杀手射杀
                    if (attackerData.role === MurderMysteryPlayerRole.Murderer)
                        victimData.setDead(gameData.MurderMysteryDeathType.MurdererShot, attackerData);
                    // 被自己杀死，则记录为自杀
                    else if (attacker.id === victim.id)
                        victimData.setDead(gameData.MurderMysteryDeathType.ShotSelf, attackerData);
                    // 被其他人杀死，则记录为其他玩家射杀，并将射杀之人处死
                    else {
                        victimData.setDead(gameData.MurderMysteryDeathType.Player, attackerData);
                        attackerData.setDead(gameData.MurderMysteryDeathType.Manslaughter);
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
        // 仅当游戏阶段可注册
        if (system.gameStage !== GameStage.GamingStage) return;
        // 注销组件重注册
        lib.gameSystem.unsubscribeTimeline("playerGetBowTestNearby");
        lib.gameSystem.unsubscribeEvent("playerGetBowTestRightClick");

        const pickupBowMethod = system.settings.gaming.pickupBowMethod;
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
                            lib.PlayerUtils.notify(player, {
                                title: "§1",
                                subtitle: { translate: "subtitle.spectatorOutOfBorder" },
                                titleOptions: instantTitleDisplay,
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
     * @description 如果该玩家是存活的侦探，则标记首位侦探已死亡，并掉落弓。
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
                // 如果退出玩家是存活的侦探，掉落弓
                if (playerData.role === MurderMysteryPlayerRole.Detective && !playerData.isDead) {
                    playerData.dropBow(
                        false,
                        lib.Vector3Utils.getClosest(location, system.mapData.description.spawnPoints)
                    );
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
                        system.getSpecialItem ||
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
            player.teleport(lib.JSUtils.array.randomElement(system.mapData.description.spawnPoints));
        });
        lib.gameSystem.subscribeEvent("fakePlayerJoinTest", minecraft.world.afterEvents.entitySpawn, event => {
            const player = event.entity;
            if (player.typeId !== "murder_mystery:fake_player") return;
            system.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });
            player.teleport(lib.JSUtils.array.randomElement(system.mapData.description.spawnPoints));
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
                    if (detective.chargingTime <= 0) detective.getBow();
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

    /** 防止玩家捡起射出的箭。
     * @description 将玩家射出的箭标记为非玩家的箭，并标记为已击中。
     */
    static preventPlayerPickupArrow() {
        lib.gameSystem.subscribeEvent(
            "preventPlayerPickupArrow",
            minecraft.world.afterEvents.projectileHitBlock,
            event => {
                const arrow = event.projectile;
                if (!arrow.isValid) return;
                if (arrow.typeId !== "minecraft:arrow") return;
                arrow.triggerEvent("murder_mystery:remove_player_arrow");
                arrow.setDynamicProperty("hit", true);
            }
        );
    }

    /** 杀手飞刀。
     * @description 杀手蓄力时播放音效，杀手飞刀需要用 0.5s 蓄力才能飞刀，若未满 0.5s 则停止播放音效。
     * @description 若满 0.5s 则飞刀，并注册相关事件，检查飞刀是否击中玩家、方块、箭或出界。
     * @description 若飞刀击中玩家，该玩家死亡。
     * @description 若飞刀击中方块，玻璃板可以穿过并留下裂痕，屏障可以穿过，其余方块则销毁飞刀。
     * @description 若飞刀击中箭（必须是未击中的），二者俱被销毁。
     * @description 若飞刀出界则销毁。
     */
    static murdererKnife(system: MurderMysterySystem) {
        // 【备注】因为原版不能通过`minecraft:throwable`自动到点射出，所以不使用`minecraft:throwable`
        //        又因为原版试图使用就会触发`minecraft:cooldown`，而不是使用完毕后触发，所以不使用`minecraft:cooldown`
        //        又因为原版使用逻辑是长按触发，而 Hypixel 是短按触发，再次短按取消触发，所以不使用`minecraft:use_modifier`
        //        综上所述，使用自定义物品没有意义，必须自行写相关逻辑。

        /** 杀手投刀检测。 */
        function throwKnifeTest(murderer: minecraft.Player, murdererData: MurderMysteryPlayer) {
            let pitch = 0.7;
            // 如果已经开始扔刀，则终止运行，交给函数内的 itemUse 执行逻辑
            if (murdererData.throwingTime !== 0) return;
            lib.gameSystem.subscribeTimeline("murdererKnifeThrowTest", () => {
                // 计时
                murdererData.throwingTime++;
                // 每 3 刻播放音效
                if (murdererData.throwingTime % 3 === 0) {
                    murderer.playSound("note.hat", { pitch });
                    pitch += 0.1;
                }
                // 如果杀手再度交互则阻止扔刀
                lib.gameSystem.subscribeEvent(
                    "murdererKnifeStopThrowingByUsingAgain",
                    minecraft.world.afterEvents.itemUse,
                    event => {
                        // 如果交互的不是刀，或者交互的不是这名玩家，则终止
                        if (event.itemStack.typeId !== "minecraft:iron_sword") return;
                        if (event.source.id !== murderer.id) return;
                        // 取消蓄力
                        stopThrowingKnifeTest(murderer, murdererData);
                    }
                );
                // 如果杀手切换手持则阻止扔刀
                lib.gameSystem.subscribeEvent(
                    "murdererKnifeStopThrowingByChangingHand",
                    minecraft.world.afterEvents.playerHotbarSelectedSlotChange,
                    event => {
                        // 如果交互的不是这名玩家，则终止
                        if (event.player.id !== murderer.id) return;
                        // 取消蓄力
                        stopThrowingKnifeTest(murderer, murdererData);
                    }
                );
                // 若时间已到，则扔刀，监听相关事件，并终止该事件监听和时间线监听
                if (murdererData.throwingTime >= system.settings.murdererSword.knifeThrowTime) {
                    const knife = murdererData.throwKnife() as minecraft.Entity;
                    knifeHitPlayerTest(murderer, murdererData);
                    knifeHitBlockTest(murderer);
                    knifeHitNothing(knife);
                    knifeHitArrow(knife);
                    stopThrowingKnifeTest(murderer, murdererData, false);
                }
            });
        }

        /** 停止继续扔刀，并取消所有的投刀前检查。 */
        function stopThrowingKnifeTest(
            murderer: minecraft.Player,
            murdererData: MurderMysteryPlayer,
            shouldSendMessage: boolean = true
        ) {
            if (shouldSendMessage) murderer.sendMessage({ translate: "chat.murdererThrowingKnife.stopped" });
            murdererData.throwingTime = 0;
            lib.gameSystem.unsubscribeTimeline("murdererKnifeThrowTest");
            lib.gameSystem.unsubscribeEvent("murdererKnifeStopThrowingByUsingAgain");
            lib.gameSystem.unsubscribeEvent("murdererKnifeStopThrowingByChangingHand");
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
                    if (event.projectile.isValid) event.projectile.remove();
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
                            playerData.setDead(gameData.MurderMysteryDeathType.MurdererKnife, murdererData);
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
                    // 如果刀无效，直接结束时间线监听
                    if (!knife.isValid) return false;
                    const { direction } = lib.Vector3Utils.getVolumeSector(knife.location, gameArea);
                    if (!direction) return;
                    // 如果出界，则直接销毁实体，结束事件检查后终止运行
                    knife.remove();
                    cancelEvents();
                },
                20
            );
        }

        /** 检查杀手的刀是否击中了未击中的箭。只要刀附近有箭即视为击中。在投出刀后进行检查。 */
        function knifeHitArrow(knife: minecraft.Entity) {
            lib.gameSystem.subscribeTimeline("murdererKnifeHitArrow", () => {
                // 如果刀无效，直接结束时间线监听
                if (!knife.isValid) return false;
                const location = knife.location;
                const dimension = knife.dimension;
                const arrowNearby: minecraft.Entity | undefined = lib.EntityUtils.getNearby(
                    "minecraft:arrow",
                    location,
                    system.settings.murdererSword.knifeCollideArrowDistance
                )[0];
                if (!arrowNearby) return;
                if (arrowNearby.getDynamicProperty("hit")) return;
                // 如果和其他箭相碰，则直接销毁刀和箭，播放粒子和音效，结束事件检查后终止运行
                arrowNearby.remove();
                knife.remove();
                lib.PlayerUtils.getNearby(location, 10).forEach(player =>
                    player.playSound("random.break", { pitch: 2 })
                );
                dimension.spawnParticle("murder_mystery:knife_arrow_collide", location);
                cancelEvents();
            });
        }

        // 主程序，用于判断条件。条件通过后尝试蓄力，蓄力结束后通过 throwKnife 函数进入下一步的判断。
        lib.gameSystem.subscribeEvent("murdererKnifeTest", minecraft.world.afterEvents.itemUse, event => {
            const { itemStack: ironSword, source: murderer } = event;

            // 检查是否为杀手
            const murdererData = system.getPlayer(murderer);
            if (!murdererData) return;
            if (murdererData.role !== MurderMysteryPlayerRole.Murderer) return;

            // 检查是否为剑，且对应的杀手是否未在冷却期，如果不是则终止运行
            if (ironSword.typeId !== "minecraft:iron_sword") return;
            if (murdererData.chargingTime !== 0) return;

            // 注册扔出刀检查的时间线
            throwKnifeTest(murderer, murdererData);
        });
    }

    /** 旁观玩家抬头传送组件。
     * @description 当旁观玩家或死亡玩家抬头时，调用 UI。
     */
    static spectatorTeleport(system: MurderMysterySystem) {
        lib.gameSystem.subscribeTimeline(
            "spectatorTeleport",
            () => {
                system.players.allPlayers
                    .filter(spectatorData => spectatorData.isDead)
                    .forEach(spectatorData => {
                        // 检查旁观者是否抬头，若未抬头则终止运行
                        const player = spectatorData.player;
                        const playerRotation = player.getRotation();
                        if (playerRotation.x > -88) return;
                        // 抬头后，放平视角
                        player.teleport(player.location, { rotation: { ...playerRotation, x: 0 } });
                        // 调用 UI
                        if (!isPlayer(player)) return;
                        const showRole = system.settings.gaming.showRoleInSpectatorTeleportUI;
                        let playerList = system.alivePlayers.allPlayers.map(playerData => {
                            const button: lib.FormButtonComponent = {
                                type: "button",
                                text: {
                                    translate: showRole ? "ui.spectatorTeleport.playerName" : "%%s",
                                    with: {
                                        rawtext: [
                                            { text: `${playerData.getName()}` },
                                            { translate: `role.${playerData.role}WithColor` },
                                        ],
                                    },
                                },
                                onClick: () => {
                                    if (!playerData.player.isValid) {
                                        lib.PlayerUtils.notify(player, {
                                            message: { translate: "chat.spectatorTeleport.playerIsInvalid" },
                                            sound: "random.anvil_land",
                                        });
                                        return;
                                    }
                                    player.teleport(playerData.player.location);
                                    minecraft.system.runTimeout(() =>
                                        lib.PlayerUtils.notify(player, {
                                            message: {
                                                translate: "chat.spectatorTeleport.teleported",
                                                with: [`${playerData.getName()}`],
                                            },
                                            sound: "random.orb",
                                            soundDelay: 3,
                                        })
                                    );
                                },
                            };
                            return button;
                        });
                        if (!showRole) playerList = lib.JSUtils.array.shuffle(playerList);
                        lib.UIUtils.createAction(player, {
                            type: "action",
                            components: [
                                { type: "header", text: { translate: "ui.spectatorTeleport.title" } },
                                { type: "label", text: { translate: "ui.spectatorTeleport.line1" } },
                                { type: "divider" },
                                ...playerList,
                            ],
                        });
                    });
            },
            5
        );
    }

    /** 定位栏组件。
     * @description 控制游戏何时给予杀手和平民定位器。
     * @description 当玩家手持定位器时，对其显示定位栏。
     */
    static locator(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent("locator", minecraft.world.afterEvents.playerHotbarSelectedSlotChange, event => {
            const { itemStack, player } = event;
            const playerData = system.getPlayer(player);
            if (!playerData) return;
            // 当玩家手持定位器时，显示定位栏
            if (itemStack?.typeId === "murder_mystery:locator") {
                playerData.showLocatorBar();
            } else {
                playerData.hideLocatorBar();
            }
        });
    }

    /** 杀手速度组件。
     * @description 仅在单挑模式下生效。
     * @description 当最后仅剩 1 人时，为杀手提供速度效果，直到游戏结束。
     */
    static murdererGetSpeed(system: MurderMysterySystem) {
        if (system.isSolo) return;
        lib.gameSystem.subscribeTimeline(
            "murdererGetSpeed",
            () => {
                // 如果没有杀手，直接终止
                const murdererData = system.alivePlayers.murderer[0];
                if (!murdererData) return;
                // 如果存活玩家不止 1 人，直接终止
                const alivePlayerCount = [...system.alivePlayers.innocent, ...system.alivePlayers.detective].length;
                if (alivePlayerCount !== 1) return;
                // 为杀手添加速度效果，并终止该时间线的检查
                const gameTime = system.settings.gaming.timePerGame;
                murdererData.player.addEffect("speed", 20 * gameTime, { showParticles: false });
                return false;
            },
            21
        );
    }

    // #endregion
    // #region - 开始后可选

    /** 神秘药水组件。
     * @description 会自动判断系统的地图数据是否含有`enableMysteryPotion`组件，若不含该组件则不会注册该组件。
     * @description 会在游戏开始时尝试在规定的位置生成展示文本。
     * @description 当玩家喝下神秘药水时，会导致玩家拥有不同的药效。
     */
    static mysteryPotion(system: MurderMysterySystem) {
        // 检查是否有神秘药水组件
        const mysteryPotionComponent = system.mapData.components?.enableMysteryPotion;
        if (!mysteryPotionComponent) return;

        // 变量准备
        const eventManager = system.eventManager;

        // 喝下神秘药水
        lib.gameSystem.subscribeEvent(
            "playerUseMysteryPotionTest",
            minecraft.world.afterEvents.itemCompleteUse,
            event => {
                const playerData = system.getPlayer(event.source);
                if (!playerData) return;
                eventManager.drinkMysteryPotion(playerData, event.itemStack.typeId);
            }
        );
    }

    /** 玩家进入特定区域组件。
     * @description 会自动判断系统的地图数据是否含有`playerInArea`组件，若不含该组件则不会注册该组件。
     * @description 当玩家在特定区域时，触发事件。
     */
    static playerInArea(system: MurderMysterySystem) {
        // ===== 条件检查 & 变量准备 =====
        const component = system.mapData.components?.playerInArea;
        if (!component) return;

        const eventManager = system.eventManager;

        // ===== 主程序 =====
        lib.gameSystem.subscribeTimeline(
            "playerInArea",
            () => {
                component.forEach(areaData => {
                    const { area, trigger } = areaData;
                    system.alivePlayers.allPlayers
                        .filter(playerData => {
                            const { x, y, z } = playerData.player.location;
                            // 判断玩家实体的位置，如果规定了条件且不满足条件的则返回 false
                            // 先判断坐标值是否大于最大值，若是则不在该区域内
                            if (area.xMax && x > area.xMax) return false;
                            if (area.yMax && y > area.yMax) return false;
                            if (area.zMax && z > area.zMax) return false;
                            // 再判断坐标值是否小于最小值，若是则不在该区域内
                            if (area.xMin && x < area.xMin) return false;
                            if (area.yMin && y < area.yMin) return false;
                            if (area.zMin && z < area.zMin) return false;
                            // 否则，实体在该区域内
                            return true;
                        })
                        .forEach(playerData => {
                            eventManager.triggerEvent(trigger, playerData);
                        });
                });
            },
            5
        );
    }

    /** 阻止实体受到伤害组件。
     * @description 会自动判断系统的地图数据是否含有`preventDamage`组件，若不含该组件则不会注册该组件。
     * @description 会阻止特定实体受到伤害。
     */
    static preventDamage(system: MurderMysterySystem) {
        // 检查是否有阻止受伤组件
        const preventDamageComponent = system.mapData.components?.preventDamage;
        if (!preventDamageComponent) return;

        // 变量准备
        const entityTypes = preventDamageComponent.id;

        // 阻止受伤
        lib.gameSystem.subscribeEvent("playerUseMysteryPotionTest", minecraft.world.beforeEvents.entityHurt, event => {
            if (entityTypes.includes(event.hurtEntity.typeId)) event.cancel = true;
        });
    }

    // #endregion
    // #region - 游戏结束

    /** 阻止玩家在游戏结束后拾取金锭。 */
    static preventPlayerPickupGold() {
        lib.gameSystem.subscribeEvent(
            "preventPlayerPickupItem",
            minecraft.world.beforeEvents.entityItemPickup,
            event => {
                event.cancel = true;
            },
            {
                itemFilter: { includeTypes: [goldId] },
            }
        );
    }

    // #endregion
}

// #endregion
// #region 玩家

/** 代表一个密室杀手玩家，包含玩家的密室杀手信息和相关方法。 */
class MurderMysteryPlayer {
    /** @remarks 这里的构造函数应当仅在游戏开始时执行。若要转换身份，应使用 {@link MurderMysterySystem} 的`transformRole`方法。 */
    constructor(system: MurderMysterySystem, playerData: PlayerData) {
        this.system = system;
        this.role = playerData.role;
        this.player = playerData.player;

        // 如果是旁观者，标记为已死亡
        if (this.role === MurderMysteryPlayerRole.Spectator) {
            this.isDead = true;
            if (isPlayer(this.player)) this.player.setGameMode(minecraft.GameMode.Spectator);
        }

        // 如果是侦探，标记为首位侦探
        if (this.role === MurderMysteryPlayerRole.Detective) {
            this.isFirstDetective = true;
        }

        // 为玩家展示身份
        this.showRole();
    }

    /** 系统。 */
    readonly system: MurderMysterySystem;

    /** 玩家身份。 */
    role: MurderMysteryPlayerRole;

    /** 是否已死亡。 */
    isDead = false;

    /** 是否为首位侦探。该选项只对侦探可用。
     *
     * 首位侦探指游戏刚开始时即分配到侦探身份的玩家。
     * 后来的平民捡起弓后也将成为侦探，但不会是首位侦探。
     */
    isFirstDetective = false;

    /** 该玩家信息对应的玩家 */
    readonly player: minecraft.Player | minecraft.Entity;

    /** 击杀数。该选项只对杀手可用。 */
    kills = 0;

    /** 侦探的箭或杀手的飞刀剩余的冷却时间。单位：游戏刻。 */
    chargingTime = 0;

    /** 杀手的飞刀的蓄力时间。单位：游戏刻。 */
    throwingTime = 0;

    /** 正在显示定位栏。 */
    isShowingLocatorBar = false;

    /** 对玩家展示身份。
     * @remarks 只对非旁观者的玩家生效。
     */
    showRole() {
        const { player, role } = this;
        if (!isPlayer(player)) return;
        const sendMessage = (sound: string) =>
            lib.PlayerUtils.notify(player, {
                title: { translate: `title.gameStart.${role}` },
                subtitle: { translate: `subtitle.gameStart.${role}` },
                titleOptions: instantTitleDisplay,
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

    /** 设置玩家为已死亡，并对玩家播放死因。如果是侦探死亡，则全体公告。如果触发特定条件，会导致游戏结束。
     * @returns 返回是否成功将该玩家设定为死亡。
     */
    setDead(
        deathType: gameData.MurderMysteryDeathType = gameData.MurderMysteryDeathType.Other,
        killer?: MurderMysteryPlayer
    ) {
        // 如果游戏已结束，直接终止
        if (this.system.gameStage !== GameStage.GamingStage) return false;

        // 若该玩家已死亡，则跳过之
        if (this.isDead) return false;

        // 若该玩家正处于无敌状态，并且死亡方式不是虚空等掉出地图的方式，则播放音效和粒子，阻止死亡，终止运行
        const isOutOfMap = gameData.deathTypeOutOfMap.includes(deathType);
        if (this.player.getEffect("resistance") && !isOutOfMap) {
            lib.PlayerUtils.getNearby(this.player.location, 10).forEach(player =>
                player.playSound("mob.irongolem.death", { pitch: 2 })
            );
            this.player.dimension.spawnParticle("murder_mystery:invincible", this.player.location);
            return false;
        }

        // 标记为该玩家已死亡
        this.isDead = true;
        this.chargingTime = 0;
        this.system.removePlayer(this, true);

        // 若不是出图死亡方式，则生成尸体
        if (!isOutOfMap)
            lib.EntityUtils.add("murder_mystery:dead_player", this.player.location, this.player.dimension, {
                initialRotation: this.player.getRotation().y,
            });

        if (isPlayer(this.player)) {
            // 设置为旁观
            this.player.setGameMode(minecraft.GameMode.Spectator);
            // 对玩家显示死因
            lib.PlayerUtils.notify(this.player, {
                title: { translate: "title.youDied" },
                subtitle: { translate: `deathMessage.${deathType}` },
                titleOptions: instantTitleDisplay,
                message: {
                    translate: "chat.youDied",
                    with: { rawtext: [{ translate: `deathMessage.${deathType}` }] },
                },
                sound: "mob.skeleton.death",
                soundDelay: 3,
            });
            this.player.sendMessage({ translate: "chat.spectatorTeleport.tip" });
            // 恢复玩家的输入权限
            this.player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Jump, true);
            this.player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Dismount, true);
            // 设置失明
            this.player.addEffect("minecraft:blindness", 60);
        } else {
            // 传送假玩家到出生点
            minecraft.system.run(() => this.player.teleport(this.system.mapData.description.waitHall.location));
        }

        // 对所有玩家播放音效
        this.system.alivePlayers.allPlayers.forEach(playerData => {
            if (!isPlayer(playerData.player)) return;
            // 对自己播放骷髅死亡音效（上文已写，这里直接终止）
            if (playerData.player.id === this.player.id) return;
            // 对其他玩家播放受伤音效
            playerData.player.playSound("game.player.hurt");
        });

        // 如果是侦探死亡，则掉落弓
        if (this.role === MurderMysteryPlayerRole.Detective) {
            // 如果是掉到虚空或摔到地上等出图的死亡方法，把弓的位置强行设定到其中一个出生点上
            if (isOutOfMap) {
                const closestSpawnPoint = lib.Vector3Utils.getClosest(
                    this.player.location,
                    this.system.mapData.description.spawnPoints
                );
                this.dropBow(true, lib.Vector3Utils.up(closestSpawnPoint, 1));
            }
            // 否则就设置到侦探本身的位置上
            else this.dropBow();
        }

        // 为攻击者添加 1 个击杀数
        if (killer) killer.kills++;

        // 判断一次游戏有没有结束
        if (this.role === MurderMysteryPlayerRole.Murderer) {
            this.system.gameOverTest(MurderMysteryGameOverReason.MurdererDied, killer);
        } else {
            this.system.gameOverTest(MurderMysteryGameOverReason.AllPlayersDied);
        }

        return true;
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
        const throwKnifeLine: minecraft.RawMessage[] = (() => {
            if (this.throwingTime <= 0) return [];
            const throwingTimeSecond = lib.JSUtils.timeDisplay.showSecondsByTick(this.throwingTime);
            return [{ translate: "infoboard.throwing", with: [throwingTimeSecond] }, { text: "" }];
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
                with: [`${alivePlayers.innocent.length + alivePlayers.detective.length}`],
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
            ...throwKnifeLine,
            ...chargeLine,
            { text: `§e${this.system.settings.miscellaneous.infoboardLastLine}` },
        ];
        this.player.onScreenDisplay.setActionBar(lib.JSUtils.lineText(texts));
    }

    /** 获取该玩家的名称。 */
    getName() {
        if (isPlayer(this.player)) return this.player.name;
        return this.player.nameTag;
    }

    /** 获取弓箭。如果是侦探则重置冷却时间。 */
    getBow() {
        // 新增箭并移除金锭，并提示玩家
        lib.ItemUtils.inventory.set(
            this.player,
            this.role === MurderMysteryPlayerRole.Murderer ? 2 : 1,
            "minecraft:bow",
            {
                unbreakable: true,
                itemLock: minecraft.ItemLockMode.slot,
            }
        );
        lib.ItemUtils.inventory.addSlot(this.player, 3, 1, "minecraft:arrow", {
            itemLock: minecraft.ItemLockMode.slot,
        });
        // 如果该玩家是侦探，则还重置弓箭的冷却时间。
        if (this.role === MurderMysteryPlayerRole.Detective) this.chargingTime = 0;
    }

    // #region - 平民

    /** 平民拾取弓。 */
    pickupBow(bowEntity: minecraft.Entity) {
        this.system.transformRole(this, MurderMysteryPlayerRole.Detective);
        if (isPlayer(this.player)) this.player.sendMessage({ translate: "chat.bowPicked.picker" });
        // 获取弓
        if (isPlayer(this.player)) {
            lib.ItemUtils.removeItem(this.player, "minecraft:bow");
            lib.ItemUtils.removeItem(this.player, "minecraft:arrow");
        }
        this.getBow();
        // 通知其他玩家
        this.system.alivePlayers.allPlayers.forEach(playerData => {
            const player = playerData.player;
            if (player.id === this.player.id) return;
            if (isPlayer(player)) player.sendMessage({ translate: "chat.bowPicked" });
        });
        // 为所有平民禁用定位器
        [...this.system.alivePlayers.innocent, ...this.system.alivePlayers.detective].forEach(innocent =>
            innocent.removeLocator()
        );
        // 移除弓实体
        bowEntity.remove();
    }

    // #endregion
    // #region - 侦探

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
                lib.PlayerUtils.notify(playerData.player, {
                    message: { translate: `chat.${message}` },
                    title: { text: "§1" },
                    subtitle: { translate: `subtitle.${message}` },
                    titleOptions: instantTitleDisplay,
                });
            });
        }
        // 生成弓
        const bowLocation = forceLocation ?? this.player.location;
        lib.EntityUtils.add(bowEntityId, bowLocation);
        // 为所有平民解锁定位器
        this.system.alivePlayers.innocent.forEach(innocent => {
            if (isPlayer(innocent.player)) innocent.player.sendMessage({ translate: "chat.innocentGetLocator" });
            innocent.getLocator();
        });
    }

    // #endregion
    // #region - 杀手

    /** 给予杀手剑。 */
    getSword() {
        if (this.role !== MurderMysteryPlayerRole.Murderer) return;
        if (!isPlayer(this.player)) return;
        lib.ItemUtils.inventory.set(this.player, 1, "minecraft:iron_sword", {
            unbreakable: true,
            itemLock: minecraft.ItemLockMode.slot,
        });
        lib.PlayerUtils.notify(this.player, {
            title: "§1",
            subtitle: { translate: "subtitle.murderGetSword.murder" },
            titleOptions: instantTitleDisplay,
        });
    }

    /** 杀手飞刀。返回飞出的刀的信息。
     * @returns 如果该玩家不是杀手，则不能飞刀，返回`undefined`。
     */
    throwKnife() {
        // 如果不是杀手，不能飞刀
        if (this.role !== MurderMysteryPlayerRole.Murderer) return;
        // 生成飞刀
        const knife = lib.EntityUtils.add("murder_mystery:iron_sword", this.player.getHeadLocation());
        const projectileComp = knife.getComponent("projectile") as minecraft.EntityProjectileComponent;
        projectileComp.owner = this.player;
        projectileComp.shoot(
            lib.Vector3Utils.scale(this.player.getViewDirection(), this.system.settings.murdererSword.knifeSpeed),
            { uncertainty: 0 }
        );
        // 播放飞刀音效
        if (isPlayer(this.player)) this.player.playSound("mob.enderdragon.flap");
        // 令杀手进入冷却
        this.chargingTime = 100;
        this.throwingTime = 0;
        // 返回飞刀信息
        return knife;
    }

    // #endregion
    // #region - 定位栏

    /** 使玩家获取定位器。 */
    getLocator() {
        lib.ItemUtils.inventory.set(this.player, 4, "murder_mystery:locator", {
            itemLock: minecraft.ItemLockMode.slot,
        });
        // 如果玩家此时恰好手持 5 号位，则显示定位栏
        if (isPlayer(this.player) && this.player.selectedSlotIndex === 4) this.showLocatorBar();
    }

    /** 移除玩家的定位器。 */
    removeLocator() {
        lib.ItemUtils.inventory.remove(this.player, 4);
        this.hideLocatorBar();
    }

    /** 为玩家显示定位栏。 */
    showLocatorBar() {
        // 若正在显示定位栏，则直接终止运行
        if (this.isShowingLocatorBar) return;

        // 如果不是玩家，则直接终止运行
        const player = this.player;
        if (!isPlayer(player)) return;

        // 杀手的定位栏，定位到其他所有存活的玩家
        if (this.role === MurderMysteryPlayerRole.Murderer) {
            player.locatorBar.removeAllWaypoints();
            this.system.alivePlayers.allPlayers.forEach(playerData => {
                // 不注册自己的定位栏
                if (player.id === playerData.player.id) return;
                // 如果是杀手，注册红色的定位栏
                const locatesMurderer = playerData.role === MurderMysteryPlayerRole.Murderer;
                const waypoint = new minecraft.EntityWaypoint(
                    playerData.player,
                    {
                        textureBoundsList: [
                            { texture: minecraft.WaypointTexture.Square, lowerBound: 0, upperBound: 25 },
                            { texture: minecraft.WaypointTexture.Circle, lowerBound: 25, upperBound: 50 },
                            { texture: minecraft.WaypointTexture.SmallSquare, lowerBound: 50, upperBound: 75 },
                            { texture: minecraft.WaypointTexture.SmallStar, lowerBound: 75 },
                        ],
                    },
                    { showDead: false, showInvisible: true, showSneaking: true },
                    locatesMurderer ? { red: 1, green: 0, blue: 0 } : { red: 1, green: 1, blue: 1 }
                );
                player.locatorBar.addWaypoint(waypoint);
            });
            this.isShowingLocatorBar = true;
            return;
        }
        // 平民的定位栏，定位到弓的位置
        if (this.role === MurderMysteryPlayerRole.Innocent) {
            const bow = lib.EntityUtils.getType("murder_mystery:item_bow")[0];
            if (!bow) return;
            const { dimension, location } = bow;
            const waypoint = new minecraft.LocationWaypoint(
                { dimension, ...location },
                {
                    textureBoundsList: [
                        {
                            texture: { path: "textures/locator_bar/bow", iconHeight: 1, iconWidth: 1 },
                            lowerBound: 0,
                            upperBound: 25,
                        },
                        {
                            texture: { path: "textures/locator_bar/bow", iconHeight: 0.75, iconWidth: 0.75 },
                            lowerBound: 25,
                            upperBound: 50,
                        },
                        {
                            texture: { path: "textures/locator_bar/bow", iconHeight: 0.5, iconWidth: 0.5 },
                            lowerBound: 50,
                            upperBound: 75,
                        },
                        {
                            texture: { path: "textures/locator_bar/bow", iconHeight: 0.25, iconWidth: 0.25 },
                            lowerBound: 75,
                        },
                    ],
                },
                { red: 0.333, green: 1, blue: 1 }
            );
            player.locatorBar.removeAllWaypoints();
            player.locatorBar.addWaypoint(waypoint);
            this.isShowingLocatorBar = true;
            return;
        }
    }

    /** 为玩家隐藏定位栏。 */
    hideLocatorBar() {
        // 若未在显示定位栏，则直接终止运行
        if (!this.isShowingLocatorBar) return;

        // 如果不是玩家，则直接终止运行
        const player = this.player;
        if (!isPlayer(player)) return;

        // 隐藏定位栏
        player.locatorBar.removeAllWaypoints();
        this.isShowingLocatorBar = false;
    }

    // #endregion
    // #region - 特殊地图属性

    /** 神秘药水的解锁情况。 */
    readonly mysteryPotionUnlocked: [boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false];

    /** 是否在鬼屋门内。 */
    isInHauntedHouseDoor = false;

    /** 事件冷却列表。触发了特定事件后可能会导致特定类型的事件冷却，在冷却期内可指定为无法再次触发事件。 */
    readonly eventCooldown: Record<string, number> = {};

    // #endregion
}

// #endregion
// #region 创建实例
minecraft.world.afterEvents.worldLoad.subscribe(() => {
    let murderMysterySystem: MurderMysterySystem | undefined;
    minecraft.system.runInterval(() => {
        // 地图无效化后，对下一张地图预加载后再开启新地图
        if (!murderMysterySystem || !murderMysterySystem.isValid) {
            let nextMap = MurderMysterySystem.getMapData(murderMysterySystem?.nextMap);
            const { from, to } = nextMap.description.range;
            lib.TickingAreaUtils.remove("gamingArea");
            const tickingArea = lib.TickingAreaUtils.add("gamingArea", from, to);
            // 如果未能完成常加载区域初始化，则警告玩家并重置旧系统指定的地图
            if (!tickingArea) {
                lib.PlayerUtils.broadcast({
                    message: {
                        translate: "chat.error.areaToLarge",
                        with: { rawtext: [{ translate: `map.${nextMap.description.id}` }] },
                    },
                    sound: "random.anvil_land",
                });
                if (murderMysterySystem) murderMysterySystem.nextMap = void 0;
                return;
            }
            tickingArea.then(() => {
                murderMysterySystem = new MurderMysterySystem(nextMap);
            });
        }
    }, 20);
    lib.gameSystem.showDebugMessage = false;
});

// #endregion
