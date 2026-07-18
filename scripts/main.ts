// *-*-*-*-*-*-* 主文件 *-*-*-*-*-*-*
// 实现密室杀手的主体逻辑。

// #region 模块导入
import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as data from "./data";

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
    constructor(mapData?: data.MurderMysteryMapData) {
        this.mapData = mapData ?? MurderMysterySystem.getMapData();
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
        lib.DimensionUtils.getOverworld().runCommand("gamerule playerWaypoints off");

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

    /** 剩余时间。单位：秒。 */
    timeLeft: number = 270;

    /** 首位侦探是否已经死亡。 */
    firstDetectiveDied = false;

    /** 是否已给予杀手和侦探道具。 */
    getSpecialItem = false;

    /** 是否是一个有效的系统。在游戏结束后，该系统将变得无效化。 */
    isValid = true;

    /** 全局金锭的生成次数。该值将会决定每次生成会在哪个玩家周围生成金锭。 */
    globalGoldSpawnTimes: number = 0;

    /** 是否为单挑模式。 */
    isSolo = false;

    // #endregion
    // #region - 游戏阶段转换

    /** 通用功能。 */
    general() {
        // 注册通用组件
        MurderMysteryComponents.infoboard(this);
        MurderMysteryComponents.preventDamage(this);
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
        lib.gameSystem.unsubscribeAllDelays();
        this.gameStage = GameStage.WaitingStage;

        // 初始化所有玩家
        const players = this.getPlayersBeforeGame();
        players.forEach(player => this.initPlayer(player));

        // 移除多余实体
        this.removeAllEntities();

        // 注册常加载区域
        const { from, to } = this.mapData.description.range;
        lib.TickingAreaUtils.remove("gamingArea");
        lib.TickingAreaUtils.add("gamingArea", from, to);

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
        MurderMysteryComponents.playerIntoVoid(this);
        MurderMysteryComponents.playerIntoLava(this);
        MurderMysteryComponents.playerIntoEndPortal(this);
        MurderMysteryComponents.mysteryPotion(this);
        MurderMysteryComponents.recover(this);
        MurderMysteryComponents.applyNightVision(this);
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
                this.isValid = false;
            },
            200
        );

        // 提醒玩家游戏结束，并返回胜者信息
        this.gameOverNotice(reason, hero);

        // 注册组件
        this.general();
        MurderMysteryComponents.preventPlayerPickupGold();
    }

    // #endregion
    // #region - 地图管理

    /** 获取地图数据。若不指定地图名称，则返回所有可用地图中的一张随机地图。 */
    static getMapData(mapName?: string): data.MurderMysteryMapData {
        // 选择其中一张地图
        const maps = Object.values(data.maps);
        return mapName ? (data.maps[mapName] as data.MurderMysteryMapData) : lib.JSUtils.array.randomElement(maps);
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

            // 隐藏玩家的名称
            player.nameTag = "";
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
     * @description 会清除玩家的物品。
     * @description 会传送玩家到等待大厅，并将玩家的重生点设置在这里。
     * @description 会将玩家的游戏模式设为冒险模式。
     * @description 会恢复玩家的命名牌。
     * @description 会移除玩家的状态效果。
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

        const firstDetectiveName = this.players.detective.find(detective => detective.isFirstDetective)?.getName();
        const murdererName: string | undefined = this.players.murderer[0]?.getName();
        const murdererKills = this.players.murderer[0]?.kills ?? 0;
        const heroName = hero?.getName();

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

            lib.PlayerUtils.sendMessage(playerData.player, {
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

    /** 神秘药水的价格。 */
    mysteryPotionPrice: number;

    /** 是否施加夜视状态效果。 */
    applyNightVision: boolean;
};

type MurderMysteryGoldSpawnSettings = {
    /** 在玩家附近多少格的金锭会尝试生成。 */
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
    constructor() {}

    /** 等待设置，在等待期间可以调控的设置项。 */
    readonly waiting: MurderMysteryWaitingSettings = {
        minPlayerCount: 2,
        maxPlayerCount: 16,
        startCountdown: 16,
    };

    /** 游戏设置，在游戏期间可以调控的设置项。 */
    readonly game: MurderMysteryGameSettings = {
        timePerGame: 270,
        getSpecialItemDelay: 15,
        pickupBowMethod: "nearby",
        mysteryPotionPrice: 1,
        showRoleInSpectatorTeleportUI: true,
        applyNightVision: false,
    };

    /** 金锭生成设置，控制在游戏过程中金锭生成的表现。 */
    readonly goldSpawn: MurderMysteryGoldSpawnSettings = {
        spawnRadius: 5,
        spawnChance: 0.15,
        spawnInterval: 16,
    };

    /** 杀手刀剑设置，控制在游戏过程中杀手的刀的表现。 */
    readonly murdererSword: MurderMysteryMurdererSwordSettings = {
        knifeCollideArrowDistance: 5,
        knifeSpeed: 1.0,
        knifeThrowTime: 10,
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

    /** 阻止玩家和假玩家受到伤害。
     * @description 阻止玩家受到一切来源的伤害。
     * @description 若地图注册了 playerIntoLava 组件，则该组件不会阻止熔岩伤害，由 playerIntoLava 组件处理逻辑。仅游戏期间执行。
     */
    static preventDamage(system: MurderMysterySystem) {
        lib.gameSystem.subscribeEvent("preventDamage", minecraft.world.beforeEvents.entityHurt, event => {
            if (
                system.mapData.components.playerIntoLava &&
                event.damageSource.cause === minecraft.EntityDamageCause.lava &&
                system.gameStage === GameStage.GamingStage
            )
                return;
            if (
                event.hurtEntity.typeId !== "minecraft:player" &&
                event.hurtEntity.typeId !== "murder_mystery:fake_player"
            )
                return;
            event.cancel = true;
        });
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
                    lib.PlayerUtils.getAll().forEach(player => {
                        lib.PlayerUtils.sendMessage(player, {
                            message: {
                                translate: "chat.beforeGameStart.countdown",
                                with: [countdown],
                            },
                            title: showTitle ? countdown : void 0,
                            titleOptions: instantTitleDisplay,
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
                if (system.settings.game.timePerGame - system.timeLeft === 60)
                    system.alivePlayers.murderer.forEach(murderer => {
                        if (!isPlayer(murderer.player)) return;
                        if (murderer.kills > 0) return;
                        lib.PlayerUtils.sendMessage(murderer.player, {
                            message: { translate: "chat.remindMurderer" },
                            title: { translate: "title.remindMurderer" },
                            subtitle: { translate: "subtitle.remindMurderer" },
                            titleOptions: instantTitleDisplay,
                        });
                    });
                if (system.timeLeft === 60)
                    lib.PlayerUtils.getAll().forEach(player => {
                        lib.PlayerUtils.sendMessage(player, {
                            message: { translate: "chat.gameWillOver" },
                            sound: "note.hat",
                        });
                    });
                if (system.timeLeft === 30) {
                    system.alivePlayers.murderer.forEach(murderer => murderer.getLocator());
                    system.alivePlayers.allPlayers.forEach(playerData => {
                        if (isPlayer(playerData.player))
                            lib.PlayerUtils.sendMessage(playerData.player, {
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
                    system.settings.game.getSpecialItemDelay - (system.settings.game.timePerGame - system.timeLeft);

                // 当给杀手刀剩余 1-5 秒时，对所有玩家提示
                if (getSpecialItemTimeLeft > 0 && getSpecialItemTimeLeft <= 5) {
                    system.alivePlayers.allPlayers.forEach(playerData => {
                        if (!isPlayer(playerData.player)) return;
                        lib.PlayerUtils.sendMessage(playerData.player, {
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
                        lib.PlayerUtils.sendMessage(playerData.player, {
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
        const { spawnChance, spawnInterval, spawnRadius } = system.settings.goldSpawn;
        const goldPoints = lib.JSUtils.array.shuffle(system.mapData.description.goldPoints);
        /** 返回两坐标在 xz 平面上的距离平方。 */
        function xzDistanceSquared(location1: minecraft.Vector3, location2: minecraft.Vector3) {
            return (location2.x - location1.x) ** 2 + (location2.z - location1.z) ** 2;
        }
        lib.gameSystem.subscribeTimeline("generateGold", () => {
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
                    lib.PlayerUtils.sendMessage(playerData.player, {
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
            victimData.setDead(MurderMysteryDeathType.MurdererStab, attackerData);
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
                    victimData.setDead(MurderMysteryDeathType.Player, attackerData);
                    break;
                // 平民或侦探被击杀
                case MurderMysteryPlayerRole.Innocent:
                case MurderMysteryPlayerRole.Detective:
                    // 被杀手杀死，则记录为杀手射杀
                    if (attackerData.role === MurderMysteryPlayerRole.Murderer)
                        victimData.setDead(MurderMysteryDeathType.MurdererShot, attackerData);
                    // 被自己杀死，则记录为自杀
                    else if (attacker.id === victim.id)
                        victimData.setDead(MurderMysteryDeathType.ShotSelf, attackerData);
                    // 被其他人杀死，则记录为其他玩家射杀，并将射杀之人处死
                    else {
                        victimData.setDead(MurderMysteryDeathType.Player, attackerData);
                        attackerData.setDead(MurderMysteryDeathType.Manslaughter);
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
                if (event.projectile.typeId !== "minecraft:arrow") return;
                arrow.triggerEvent("murder_mystery:remove_player_arrow");
                arrow.setDynamicProperty("hit", true);
            }
        );
    }

    /** 防止玩家和方块交互。
     * @description 阻止玩家和地图组件`allowInteractingWithBlock`中指定之外的方块交互。
     * @description 不会阻止创造模式玩家和方块交互。
     */
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
                            playerData.setDead(MurderMysteryDeathType.MurdererKnife, murdererData);
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
                        const showRole = system.settings.game.showRoleInSpectatorTeleportUI;
                        let playerList = system.alivePlayers.allPlayers.map(playerData => {
                            const button: lib.FormButtonComponent = {
                                type: "button",
                                text: {
                                    translate: showRole ? "ui.spectatorTeleport.playerName" : "%s",
                                    with: {
                                        rawtext: [
                                            { text: `${playerData.getName()}` },
                                            { translate: `role.${playerData.role}WithColor` },
                                        ],
                                    },
                                },
                                onClick: () => {
                                    if (!playerData.player.isValid) {
                                        lib.PlayerUtils.sendMessage(player, {
                                            message: { translate: "chat.spectatorTeleport.playerIsInvalid" },
                                            sound: "random.anvil_land",
                                        });
                                        return;
                                    }
                                    player.teleport(playerData.player.location);
                                    minecraft.system.runTimeout(() =>
                                        lib.PlayerUtils.sendMessage(player, {
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
            const { itemStack: locator, player } = event;
            const playerData = system.getPlayer(player);
            if (!playerData) return;
            // 当玩家手持定位器时，显示定位栏
            if (locator?.typeId === "murder_mystery:locator") playerData.showLocatorBar();
            else playerData.hideLocatorBar();
        });
    }

    /** 杀手速度组件。
     * @description 仅在单挑模式下生效。
     * @description 当最后仅剩 1 人时，为杀手提供速度效果，直到游戏结束。
     */
    static murdererGetSpeed(system: MurderMysterySystem) {
        if (!system.isSolo) return;
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
                const gameTime = system.settings.game.timePerGame;
                murdererData.player.addEffect("speed", 20 * gameTime);
                return false;
            },
            21
        );
    }

    // #endregion
    // #region - 开始后可选

    /** 玩家进入虚空组件。
     * @description 会自动判断系统的地图数据是否含有`playerIntoVoid`组件，若不含该组件则不会注册该组件。
     * @description 当玩家掉到特定高度后，将玩家处死。
     */
    static playerIntoVoid(system: MurderMysterySystem) {
        const component = system.mapData.components.playerIntoVoid;
        if (!component) return;
        lib.gameSystem.subscribeTimeline("playerIntoVoid", () => {
            const { voidHeight = 0 } = component;
            system.alivePlayers.allPlayers
                .filter(data => data.player.location.y <= voidHeight)
                .forEach(data => data.setDead(MurderMysteryDeathType.Void));
        });
    }

    /** 神秘药水组件。
     * @description 会自动判断系统的地图数据是否含有`mysteryPotion`组件，若不含该组件则不会注册该组件。
     * @description 会在游戏开始时尝试在规定的位置生成展示文本。
     * @description 会在游戏开始时决定 5 种药水对应何种药效。
     * @description 当玩家与炼药锅交互时，会检查是否允许酿造神秘药水。
     * @description 当玩家喝下神秘药水时，会导致玩家拥有不同的药效。
     */
    static mysteryPotion(system: MurderMysterySystem) {
        const component = system.mapData.components.mysteryPotion;
        if (!component) return;

        // ===== 生成展示文本 =====
        const cauldronLocation = component.location ?? [];
        const mysteryPotionPrice = system.settings.game.mysteryPotionPrice;
        cauldronLocation.forEach(location => {
            const spawnLocation = lib.Vector3Utils.add(location, 0.5, 1, 0.5);
            const textDisplay = lib.EntityUtils.add("murder_mystery:text_display", spawnLocation);
            textDisplay.nameTag = `神秘药水 - ${mysteryPotionPrice}§6块金锭`;
        });

        // ===== 初始化本局神秘药水的信息列表 =====
        /** 药水信息。 */
        type PotionData = {
            /** 药水名称。 */
            name: "失明" | "缓慢" | "迅捷" | "隐身" | "无敌";
            /** 使用的药水效果。若不指定则为无敌效果。 */
            id: "blindness" | "slowness" | "speed" | "invisibility" | "invincibility";
            /** 使用的药水放大等级。 | 默认值：`0` */
            amplifier?: number;
            /** 使用的药水时长。单位：游戏刻。 | 默认值：`200` */
            duration?: number;
        };
        /** 本局使用的药水效果（已打乱）。 */
        const potionData: PotionData[] = lib.JSUtils.array.shuffle([
            { name: "失明", id: "blindness" },
            { name: "缓慢", id: "slowness" },
            { name: "迅捷", id: "speed", amplifier: 1, duration: 400 },
            { name: "隐身", id: "invisibility", duration: 280 },
            { name: "无敌", id: "invincibility", amplifier: 4, duration: 400 },
        ]);
        function getPotionData(id: string) {
            switch (id) {
                case "murder_mystery:mystery_potion_1":
                    return potionData[0];
                case "murder_mystery:mystery_potion_2":
                    return potionData[1];
                case "murder_mystery:mystery_potion_3":
                    return potionData[2];
                case "murder_mystery:mystery_potion_4":
                    return potionData[3];
                case "murder_mystery:mystery_potion_5":
                    return potionData[4];
                default:
                    return;
            }
        }
        function getPotionIndex(id: string) {
            switch (id) {
                case "murder_mystery:mystery_potion_1":
                    return 0;
                case "murder_mystery:mystery_potion_2":
                    return 1;
                case "murder_mystery:mystery_potion_3":
                    return 2;
                case "murder_mystery:mystery_potion_4":
                    return 3;
                case "murder_mystery:mystery_potion_5":
                    return 4;
                default:
                    return 0;
            }
        }
        const defaultLore: string[] = ["§r§7这是一瓶药水。天知道它会给你什么效果。"];

        // ===== 给予玩家神秘药水 =====
        lib.gameSystem.subscribeEvent(
            "playerGetMysteryPotionTest",
            minecraft.world.afterEvents.playerInteractWithBlock,
            event => {
                const { isFirstEvent, player, block } = event;
                if (!isFirstEvent) return;

                // 如果不是密室杀手玩家，终止运行
                const playerData = system.getPlayer(player);
                if (!playerData) return;

                // 如果不是规定的炼药锅，终止运行
                const location = block.location;
                if (!lib.Vector3Utils.hasPosition(cauldronLocation, location)) return;

                // 如果玩家的金锭不足，提示玩家后终止运行
                if (lib.ItemUtils.inventory.getAmount(player, { includeTypeId: [goldId] }) < mysteryPotionPrice) {
                    lib.PlayerUtils.sendMessage(player, {
                        message: { translate: "chat.mysteryPotion.goldNotEnough", with: [`${mysteryPotionPrice}`] },
                        sound: "random.anvil_land",
                    });
                    return;
                }

                // 如果已有人在使用，提示玩家后终止运行
                if (lib.EntityUtils.getNearby("murder_mystery:mystery_potion", location, 2).length > 0) {
                    lib.PlayerUtils.sendMessage(player, {
                        message: { translate: "chat.mysteryPotion.occupied" },
                        sound: "random.anvil_land",
                    });
                    return;
                }

                // 如果玩家拥有超过 3 瓶药水，提示玩家后终止运行
                const potionCount = lib.ItemUtils.inventory.getAmount(player, {
                    includeTypeId: [
                        "murder_mystery:mystery_potion_1",
                        "murder_mystery:mystery_potion_2",
                        "murder_mystery:mystery_potion_3",
                        "murder_mystery:mystery_potion_4",
                        "murder_mystery:mystery_potion_5",
                    ],
                });
                if (potionCount >= 3) {
                    lib.PlayerUtils.sendMessage(player, {
                        message: { translate: "chat.mysteryPotion.inventoryFull" },
                        sound: "random.anvil_land",
                    });
                    return;
                }

                // 金锭足够后，兑换一种随机的神秘药水，展示动画
                lib.ItemUtils.removeItem(player, "murder_mystery:gold_ingot", -1, mysteryPotionPrice);
                const randomPotionIndex = lib.JSUtils.number.randomInt(1, 5);
                const randomPotionId = `murder_mystery:mystery_potion_${randomPotionIndex}`;
                const mysteryPotionEntity = lib.EntityUtils.add(
                    "murder_mystery:mystery_potion",
                    lib.Vector3Utils.add(location, 0.5, 0, 0.5),
                    player.dimension,
                    { initialRotation: player.getRotation().y + 180, spawnEvent: randomPotionId }
                );

                // 在1.5秒后给予玩家神秘药水，并将神秘药水动画实体移除
                /** 将替换到的快捷栏位置。 */
                const replaceSlot = (() => {
                    const container = player.getComponent("inventory")?.container;
                    if (!container) return 0;
                    // 如果 5 号位没有物品，则放到 5 号位
                    if (!container.getItem(5)) return 5;
                    // 如果 7 号位没有物品，则放到 7 号位
                    if (!container.getItem(7)) return 7;
                    return 0;
                })();
                const randomPotionName = getPotionData(randomPotionId)?.name ?? "失明";
                const thisPotionUnlocked = playerData.mysteryPotionUnlocked[randomPotionIndex - 1];
                minecraft.system.runTimeout(() => {
                    lib.ItemUtils.inventory.set(player, replaceSlot, randomPotionId, {
                        itemLock: minecraft.ItemLockMode.slot,
                        name: thisPotionUnlocked ? `§r§a${randomPotionName}药水` : void 0,
                        lore: thisPotionUnlocked ? [`§r§7这瓶药水将会使你获得${randomPotionName}效果！`] : defaultLore,
                    });
                    mysteryPotionEntity.remove();
                }, 30);
            }
        );

        // ===== 喝下神秘药水 =====
        lib.gameSystem.subscribeEvent(
            "playerUseMysteryPotionTest",
            minecraft.world.afterEvents.itemCompleteUse,
            event => {
                const { itemStack: mysteryPotion, source: player } = event;
                const potionId = mysteryPotion.typeId;

                // 如果玩家已有药效，则不给予药效，重新给予药水并提示玩家
                if (player.getEffects().length > 0) {
                    lib.ItemUtils.equipment.set(player, potionId, minecraft.EquipmentSlot.Mainhand, {
                        itemLock: minecraft.ItemLockMode.slot,
                    });
                    player.sendMessage({ translate: "chat.mysteryPotion.onlyOneEffect" });
                    return;
                }

                // 获取药效信息和玩家信息
                const potionData = getPotionData(potionId);
                if (!potionData) return;
                const playerData = system.getPlayer(player);
                if (!playerData) return;

                // 显示副标题
                lib.PlayerUtils.sendMessage(player, {
                    title: "§1",
                    subtitle: { translate: `subtitle.mysteryPotion.${potionData.id}` },
                    titleOptions: instantTitleDisplay,
                });

                // 标记为玩家已解锁该药水
                playerData.mysteryPotionUnlocked[getPotionIndex(potionId)] = true;

                // 给予药效
                player.addEffect(
                    potionData.id === "invincibility" ? "resistance" : potionData.id,
                    potionData.duration ?? 200,
                    { amplifier: potionData.amplifier }
                );
            }
        );
    }

    /** 玩家进入熔岩组件。
     * @description 会自动判断系统的地图数据是否含有`playerIntoLava`组件，若不含该组件则不会注册该组件。
     * @description 当玩家掉到熔岩后，将玩家处死。
     */
    static playerIntoLava(system: MurderMysterySystem) {
        const component = system.mapData.components.playerIntoLava;
        if (!component) return;
        minecraft.world.gameRules.fireDamage = true;
        lib.gameSystem.subscribeEvent(
            "playerIntoLava",
            minecraft.world.beforeEvents.entityHurt,
            event => {
                // 阻止伤害
                event.cancel = true;
                // 获取玩家数据
                const player = event.hurtEntity;
                const playerData = system.getPlayer(player);
                if (!playerData) return;
                // 将玩家处死
                minecraft.system.run(() => playerData.setDead(MurderMysteryDeathType.Lava));
            },
            { allowedDamageCauses: [minecraft.EntityDamageCause.lava] }
        );
    }

    /** 玩家进入末地传送门组件。
     * @description 会自动判断系统的地图数据是否含有`endPortal`组件，若不含该组件则不会注册该组件。
     * @description 当玩家掉到末地传送门后，将玩家处死。
     */
    static playerIntoEndPortal(system: MurderMysterySystem) {
        const component = system.mapData.components.endPortal;
        if (!component) return;
        const { from, to, height } = component;
        const testVolume = new minecraft.BlockVolume(from, lib.Vector3Utils.add(to, 0, height, 0));
        lib.gameSystem.subscribeTimeline(
            "playerIntoEndPortal",
            () => {
                system.alivePlayers.allPlayers
                    .filter(data => lib.EntityUtils.isInVolume(data.player, testVolume))
                    .forEach(data => data.setDead(MurderMysteryDeathType.EndPortal));
            },
            5
        );
    }

    /** 恢复地图内的场景。
     * @description 会自动判断系统的地图数据是否含有`recover`组件，若不含该组件则不会注册该组件。
     * @description 会在游戏开始时尝试恢复场景。
     */
    static recover(system: MurderMysterySystem) {
        const component = system.mapData.components.recover;
        if (!component) return;
        component.forEach(compData => {
            const { from, to, typeId, state } = compData;
            lib.BlockUtils.fill("overworld", from, to, typeId, {}, state);
        });
    }

    /** 对所有玩家施加夜视效果。
     * @description 会自动判断系统的设置是否启用了`applyNightVision`，若未启用则不会注册该组件。
     * @description 会在游戏开始时尝试对所有玩家施加夜视效果。
     */
    static applyNightVision(system: MurderMysterySystem) {
        if (!system.settings.game.applyNightVision) return;
        lib.PlayerUtils.getAll().forEach(player => player.runCommand("effect @s night_vision infinite 0 true"));
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

/** 死亡类型。这个死亡类型会影响显示的死亡消息。 */
enum MurderMysteryDeathType {
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

    /** 掉进熔岩。使用该死亡方法时应该注意侦探的弓的掉落位置。 */
    Lava = "lava",

    /** 掉进末地传送门。使用该死亡方法时应该注意侦探的弓的掉落位置。 */
    EndPortal = "endPortal",

    /** 摔到地上。使用该死亡方法时应该注意侦探的弓的掉落位置。 */
    HitGround = "hitGround",

    /** 踩到陷阱。 */
    Trap = "trap",

    /** 被毒药杀死。 */
    Potion = "potion",

    /** 其他死因。 */
    Other = "other",
}

/** 可能导致出图的死亡方式。 */
const deathTypeOutOfMap: MurderMysteryDeathType[] = [
    MurderMysteryDeathType.Void,
    MurderMysteryDeathType.HitGround,
    MurderMysteryDeathType.Lava,
    MurderMysteryDeathType.EndPortal,
];

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

    /** 神秘药水的解锁情况。 */
    readonly mysteryPotionUnlocked: [boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false];

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
    setDead(deathType: MurderMysteryDeathType = MurderMysteryDeathType.MurdererStab, killer?: MurderMysteryPlayer) {
        // 若该玩家已死亡，则跳过之
        if (this.isDead) return false;

        // 若该玩家正处于无敌状态，并且死亡方式不是虚空等掉出地图的方式，则播放音效和粒子，阻止死亡，终止运行
        const isOutOfMap = deathTypeOutOfMap.includes(deathType);
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

        // 设置失明
        this.player.addEffect("minecraft:blindness", 60);

        // 对玩家显示死因，并设置为旁观
        if (isPlayer(this.player)) {
            this.player.setGameMode(minecraft.GameMode.Spectator);
            lib.PlayerUtils.sendMessage(this.player, {
                title: { translate: "title.youDied" },
                subtitle: { translate: `deathMessage.${deathType}` },
                titleOptions: instantTitleDisplay,
                message: {
                    translate: "chat.youDied",
                    with: { rawtext: [{ translate: `deathMessage.${deathType}` }] },
                },
            });
            this.player.sendMessage({ translate: "chat.spectatorTeleport.tip" });
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
                lib.PlayerUtils.sendMessage(playerData.player, {
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
        lib.PlayerUtils.sendMessage(this.player, {
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
        const player = this.player;
        if (!isPlayer(player)) return;
        // 杀手的定位栏，定位到其他所有存活的玩家
        if (this.role === MurderMysteryPlayerRole.Murderer) {
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
                            { texture: minecraft.WaypointTexture.SmallSquare, lowerBound: 50, upperBound: 100 },
                            { texture: minecraft.WaypointTexture.SmallStar, lowerBound: 100 },
                        ],
                    },
                    { showDead: false, showInvisible: true, showSneaking: true },
                    locatesMurderer ? { red: 1, green: 0, blue: 0 } : { red: 1, green: 1, blue: 1 }
                );
                player.locatorBar.addWaypoint(waypoint);
            });
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
                        { texture: { path: "textures/items/bow_standby", iconHeight: 1, iconWidth: 1 }, lowerBound: 0 },
                    ],
                }
            );
            player.locatorBar.addWaypoint(waypoint);
        }
    }

    /** 为玩家隐藏定位栏。 */
    hideLocatorBar() {
        const player = this.player;
        if (!isPlayer(player)) return;
        player.locatorBar.removeAllWaypoints();
    }

    // #endregion
}

// #endregion
// #region 创建实例
minecraft.world.afterEvents.worldLoad.subscribe(() => {
    let murderMysterySystem: MurderMysterySystem = new MurderMysterySystem();
    minecraft.system.runInterval(() => {
        // 地图无效化后，对下一张地图预加载后再开启新地图
        if (!murderMysterySystem.isValid) {
            const nextMap = MurderMysterySystem.getMapData();
            const { from, to } = nextMap.description.range;
            lib.TickingAreaUtils.add("nextMapPreLoad", from, to)?.then(() => {
                murderMysterySystem = new MurderMysterySystem(nextMap);
                minecraft.system.runTimeout(() => lib.TickingAreaUtils.remove("nextMapPreLoad"), 20);
            });
        }
    }, 20);
    lib.gameSystem.showDebugMessage = false;
});

// #endregion
