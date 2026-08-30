// *-*-*-*-*-*-* 主文件 *-*-*-*-*-*-*
// 实现密室杀手的主体逻辑。
// #region 模块导入
import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as gameData from "./data";
// #endregion
// #region 类型与变量声明
/** 游戏阶段。 */
var GameStage;
(function (GameStage) {
    /** 清除阶段，在清除阶段负责清除地图。 @remarks 在本地图中未使用。 */
    GameStage["ClearStage"] = "ClearStage";
    /** 加载阶段，在加载阶段负责加载新地图。 @remarks 在本地图中未使用。 */
    GameStage["LoadStage"] = "LoadStage";
    /** 等待阶段，在等待阶段负责等待玩家，在玩家人数足够后开始游戏。 */
    GameStage["WaitingStage"] = "WaitingStage";
    /** 游戏阶段，在游戏阶段负责执行游戏的主逻辑。 */
    GameStage["GamingStage"] = "GamingStage";
    /** 游戏结束阶段，在游戏结束阶段负责执行游戏结束后的逻辑。 */
    GameStage["GameOverStage"] = "GameOverStage";
})(GameStage || (GameStage = {}));
/** 密室杀手的所有身份。 */
var MurderMysteryPlayerRole;
(function (MurderMysteryPlayerRole) {
    /** 平民。
     * 平民的任务为尽可能地活到游戏结束。若杀手被侦探杀死，则侦探和平民获胜。
     */
    MurderMysteryPlayerRole["Innocent"] = "innocent";
    /** 杀手。
     * 杀手的任务为杀光场上所有的非杀手身份。
     * 杀手将获得一把飞刀，使用飞刀近战攻击或掷出攻击都可以杀死其他玩家。
     */
    MurderMysteryPlayerRole["Murderer"] = "murderer";
    /** 侦探。
     * 侦探的任务为杀死场上的杀手身份。在杀手死亡后，侦探和平民获胜。
     * 侦探将获得一把弓。若侦探死亡，则场上会掉落一把弓，平民捡到后则变为侦探。
     */
    MurderMysteryPlayerRole["Detective"] = "detective";
    /** 旁观者。
     * 旁观者不能参与游戏，只能进行旁观。
     */
    MurderMysteryPlayerRole["Spectator"] = "spectator";
})(MurderMysteryPlayerRole || (MurderMysteryPlayerRole = {}));
/** 密室杀手的金锭 ID。 */
const goldId = "murder_mystery:gold_ingot";
/** 密室杀手的弓掉落物 ID。 */
const bowEntityId = "murder_mystery:item_bow";
/** 判断实体是否为玩家。 */
const isPlayer = lib.PlayerUtils.isPlayer;
/** 瞬间显示标题的选项。 */
const instantTitleDisplay = { fadeInDuration: 0, stayDuration: 80, fadeOutDuration: 20 };
/** 游戏结束的原因。 */
var MurderMysteryGameOverReason;
(function (MurderMysteryGameOverReason) {
    /** 所有玩家死了。 */
    MurderMysteryGameOverReason["AllPlayersDied"] = "allPlayersDied";
    /** 杀手死了。 */
    MurderMysteryGameOverReason["MurdererDied"] = "murdererDied";
    /** 杀手离开了游戏。 */
    MurderMysteryGameOverReason["MurdererQuit"] = "murdererQuit";
    /** 超时。 */
    MurderMysteryGameOverReason["TimeOut"] = "timeOut";
})(MurderMysteryGameOverReason || (MurderMysteryGameOverReason = {}));
/** 密室杀手系统，通过系统调控组件的运行，并获取游戏运行的方方面面。 */
export class MurderMysterySystem {
    constructor(mapData) {
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
    version = "1.0 - Exp 9";
    /** 游戏阶段，不同的游戏阶段会使用不同的功能。 */
    gameStage;
    /** 游戏设置信息，获取管理员等输入的设置信息，并自动应用于设置中。 */
    settings;
    /** 游戏 ID。 */
    gameId;
    /** 地图数据。 */
    mapData;
    /** 玩家信息。玩家信息中会包含已经死亡的玩家的信息和旁观者玩家的信息。 */
    players = {
        allPlayers: [],
        innocent: [],
        murderer: [],
        detective: [],
        spectator: [],
    };
    /** 存活的玩家信息。 */
    livingPlayers = {
        allPlayers: [],
        innocent: [],
        murderer: [],
        detective: [],
    };
    /** 游戏开始前的系统数据。
     * @description 用于在游戏开始前调用。
     */
    beforeGameInfo = {
        minPlayerCount: 2,
        maxPlayerCount: 16,
        currentPlayerCount: 0,
        startCountdown: 60,
        playerIsEnough: false,
        countdownStarted: false,
    };
    /** 剩余时间。单位：秒。 */
    timeLeft = 270;
    /** 首位侦探是否已经死亡。 */
    firstDetectiveDied = false;
    /** 是否已给予杀手和侦探道具。 */
    getSpecialItem = false;
    /** 全局金锭的生成次数。该值将会决定每次生成会在哪个玩家周围生成金锭。 */
    globalGoldSpawnTimes = 0;
    /** 是否为单挑模式。 */
    isSolo = false;
    /** 事件管理器。 */
    eventManager;
    // #endregion
    // #region - 游戏阶段转换
    /** 通用功能。 */
    general() {
        // 注册通用组件
        MurderMysteryComponents.infoboard(this);
        MurderMysteryComponents.onPlayerHurt(this);
        MurderMysteryComponents.interaction(this);
        MurderMysteryComponents.settings(this);
        MurderMysteryComponents.sendMessageToSpectator(this);
        // 注册可选组件
        MurderMysteryComponents.applyNightVision(this);
    }
    /** 令游戏进入清除阶段，在清除阶段清空原有的地图。 */
    enterClearStage() { }
    /** 令游戏进入加载阶段。 */
    enterLoadStage() { }
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
        const players = this.getPlayersBeforeGame(true);
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
        if (this.livingPlayers.allPlayers.length === 2)
            this.isSolo = true;
        // 移除多余实体
        this.removeAllEntities();
        // 移除所有玩家的所有物品，新增设置物品
        lib.PlayerUtils.getAll().forEach(player => {
            player.getComponent("inventory")?.container.clearAll();
            lib.ItemUtils.inventory.set(player, 6, "murder_mystery:settings", { itemLock: minecraft.ItemLockMode.slot });
        });
        // 注册必选组件
        this.general();
        MurderMysteryComponents.gameTimer(this);
        MurderMysteryComponents.getSpecialItem(this);
        MurderMysteryComponents.infoboard(this); // 重新注册信息板组件，以防时间错位
        MurderMysteryComponents.generateGold(this);
        MurderMysteryComponents.playerCollectGold(this);
        MurderMysteryComponents.playerKillTest(this);
        MurderMysteryComponents.playerPickupBowTest(this);
        MurderMysteryComponents.detectiveUseBow(this);
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
        // 若地图注册了 onGameStart 组件，则触发其规定的事件
        const onGameStart = this.mapData.components?.onGameStart;
        if (onGameStart) {
            const trigger = onGameStart.trigger;
            if (typeof trigger === "string")
                this.eventManager.triggerEvent(trigger);
            else
                trigger.forEach(t => this.eventManager.triggerEvent(t));
        }
        // 若该地图没有实现完整功能，提示玩家
        const hasFullFunction = this.mapData.description.hasFullFunction;
        if (hasFullFunction === false) {
            lib.PlayerUtils.broadcast({ message: { translate: "chat.hasNoFullFunction" } });
        }
    }
    /** 令游戏进入结束阶段。
     * @description 转换阶段并移除所有正在监听的时间线和事件。
     * @description 注册结束阶段的组件。
     * @description 通知玩家游戏结束。
     */
    enterGameOverStage(reason, hero) {
        // 如果当前已经在游戏结束阶段，直接终止
        if (this.gameStage === GameStage.GameOverStage)
            return;
        // 转换阶段并移除所有正在监听的时间线和事件
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        lib.gameSystem.unsubscribeAllDelays();
        this.gameStage = GameStage.GameOverStage;
        lib.gameSystem.subscribeDelay("resetSystem", () => {
            this.removeAllEntities();
            MurderMysterySettings.saveSettings(this); // 保存本局设置，以便下局应用
            minecraft.world.setDynamicProperty("murder_mystery:nextMap"); // 随机设置一张新地图
        }, 200);
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
    static getMapData(mapName) {
        // ===== 变量准备 =====
        // 从设置中获取全部可用的地图
        const mapEnabled = MurderMysterySettings.loadSettings().mapEnabled;
        const validMapNames = Object.keys(mapEnabled).filter(key => mapEnabled[key]);
        const allMaps = gameData.maps;
        // ===== 返回地图信息 =====
        // 给定地图时，检查该地图是否在可用地图中，若在则返回该地图信息
        if (mapName && validMapNames.includes(mapName))
            return allMaps[mapName];
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
    addPlayer(playerData) {
        // 如果该玩家已被添加过，则阻止添加
        if (this.players.allPlayers.some(data => data.player.id === playerData.player.id))
            return;
        // 创建一个玩家数据实例
        const murderMysteryPlayer = new MurderMysteryPlayer(this, playerData);
        // 根据玩家身份向所有玩家列表推入玩家信息
        const playerRole = playerData.role;
        this.players.allPlayers.push(murderMysteryPlayer);
        this.players[playerRole].push(murderMysteryPlayer);
        // 如果不是旁观者，则还要向存活玩家列表中推入玩家信息
        if (playerRole !== MurderMysteryPlayerRole.Spectator) {
            this.livingPlayers.allPlayers.push(murderMysteryPlayer);
            this.livingPlayers[playerRole].push(murderMysteryPlayer);
        }
    }
    /** 获取一名玩家的玩家信息。 */
    getPlayer(player) {
        return this.players.allPlayers.find(playerData => playerData.player.id === player.id);
    }
    /** 在全部玩家列表中，移除一名玩家的信息，代表该玩家已不在世界内。 */
    removePlayer(playerData) {
        // 在存活列表中移除该玩家
        this.removeLivingPlayer(playerData);
        // 在全部玩家列表中移除该玩家
        this.players.allPlayers = this.players.allPlayers.filter(player => player.player.id !== playerData.player.id);
        this.players[playerData.role] = this.players[playerData.role].filter(player => player.player.id !== playerData.player.id);
    }
    /** 在存活列表中，移除一名玩家的信息，代表该玩家已经死亡。 */
    removeLivingPlayer(playerData) {
        this.livingPlayers.allPlayers = this.livingPlayers.allPlayers.filter(player => player.player.id !== playerData.player.id);
        if (playerData.role !== MurderMysteryPlayerRole.Spectator) {
            this.livingPlayers[playerData.role] = this.livingPlayers[playerData.role].filter(player => player.player.id !== playerData.player.id);
        }
    }
    /** 在开始游戏前获取可能参与游戏的有效玩家。
     * @param includeOptOutSpectators 是否包含主动旁观的玩家。
     */
    getPlayersBeforeGame(includeOptOutSpectators = false) {
        // 若玩家的动态属性 "murder_mystery:optOutSpectate" 为 undefined，则为正常参与游戏，否则为主动旁观，不考虑该玩家
        const players = minecraft.world.getPlayers().filter(player => {
            const isOptOutSpectator = MurderMysterySystem.getState(player, "murder_mystery:optOutSpectate", "none") !== "none";
            if (!includeOptOutSpectators && isOptOutSpectator)
                return false;
            return true;
        });
        const fakePlayers = lib.EntityUtils.getType("murder_mystery:fake_player");
        return [...players, ...fakePlayers];
    }
    /** 分配身份，并传送玩家。 */
    assignRole() {
        /** 所有玩家（包括主动旁观的玩家）。 */
        let players = lib.JSUtils.array.shuffle(this.getPlayersBeforeGame(true));
        const locations = lib.JSUtils.array.shuffle(this.mapData.description.spawnPoints);
        const maxPlayerCount = this.settings.waiting.maxPlayerCount;
        const maxLocationCount = locations.length;
        /** 处理玩家，包括设置名字为空、传送玩家、设置重生点。 */
        function dealPlayer(player, index) {
            player.nameTag = "";
            const location = locations[index % maxLocationCount];
            player.teleport(location);
            if (isPlayer(player)) {
                player.setSpawnPoint({ ...location, dimension: lib.DimensionUtils.getOverworld() });
            }
        }
        // ===== 主动旁观玩家筛选 =====
        // 先筛掉主动旁观玩家，然后再分配玩家身份。
        players
            .filter(player => MurderMysterySystem.getState(player, "murder_mystery:optOutSpectate", "none") !== "none")
            .forEach(player => {
            const optOutSpectateState = MurderMysterySystem.getState(player, "murder_mystery:optOutSpectate", "none");
            if (optOutSpectateState !== "none")
                this.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });
            // 如果玩家此时是仅下局旁观，则改回 none
            if (optOutSpectateState === "nextGame")
                MurderMysterySystem.setState(player, "murder_mystery:optOutSpectate", "none");
            // 更改全部玩家列表，将该玩家弹出
            players = players.filter(leftPlayer => leftPlayer.id !== player.id);
            // 处理玩家
            dealPlayer(player, 0);
        });
        // ===== 非主动旁观玩家筛选 =====
        players.forEach((player, index) => {
            // ===== 处理玩家 =====
            dealPlayer(player, index);
            // ===== 分配玩家身份 =====
            // 第 1 名玩家设置为杀手
            if (index === 0)
                return this.addPlayer({ player, role: MurderMysteryPlayerRole.Murderer });
            // 第 2 名玩家设置为侦探
            if (index === 1)
                return this.addPlayer({ player, role: MurderMysteryPlayerRole.Detective });
            // 第 3 - maxPlayerCount 名玩家设置为平民
            if (index >= 2 && index < maxPlayerCount)
                return this.addPlayer({ player, role: MurderMysteryPlayerRole.Innocent });
            // 其余玩家设置为旁观者
            this.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });
        });
    }
    /** 更改玩家的身份。 */
    transformRole(playerData, toRole) {
        // 先彻底移除该玩家
        this.removePlayer(playerData);
        // 更改玩家的身份
        playerData.role = toRole;
        // 向所有玩家列表列表推入玩家信息
        this.players.allPlayers.push(playerData);
        this.players[toRole].push(playerData);
        // 如果玩家不是旁观者，并且玩家未死亡，则还要向存活玩家列表列表推入玩家信息
        if (toRole !== MurderMysteryPlayerRole.Spectator && !playerData.isDead) {
            this.livingPlayers.allPlayers.push(playerData);
            this.livingPlayers[toRole].push(playerData);
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
    initPlayer(player) {
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
            // 强制关闭所有 UI
            lib.UIUtils.close(player);
        }
        player.getEffects().forEach(effect => player.removeEffect(effect.typeId));
    }
    // #endregion
    // #region - 系统功能
    /** 获取游戏前信息板。 */
    getBeforeGameInfoboard(player) {
        const { id: mapName, mode: mapMode } = this.mapData.description;
        const { startCountdown, currentPlayerCount, maxPlayerCount, playerIsEnough } = this.beforeGameInfo;
        const stateText = playerIsEnough
            ? { translate: "infoboard.countdown", with: [`${startCountdown}`] }
            : { translate: "infoboard.waiting" };
        const optOutSpectateEnabled = MurderMysterySystem.getState(player, "murder_mystery:optOutSpectate", "none") === "none"
            ? []
            : [{ text: "" }, { translate: "infoboard.optOutSpectate.enabled" }];
        const texts = [
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
            ...optOutSpectateEnabled,
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
    gameOverTest(reason, probableHero) {
        // 如果杀手数量不为 0（平民侦探获胜），并且存活玩家不全为杀手（杀手获胜），则游戏不会结束
        if (this.livingPlayers.murderer.length !== 0 && this.livingPlayers.murderer.length !== this.livingPlayers.allPlayers.length)
            return;
        // 如果英雄不存在，对系统返回无英雄的情况
        if (!probableHero)
            return this.enterGameOverStage(reason);
        // 如果给定的英雄是杀手，对系统返回无英雄的情况
        if (probableHero.role === MurderMysteryPlayerRole.Murderer)
            return this.enterGameOverStage(reason);
        // 如果给定的英雄是首位侦探，则对系统返回无英雄的情况
        if (probableHero.role === MurderMysteryPlayerRole.Detective && probableHero.isFirstDetective)
            return this.enterGameOverStage(reason);
        // 其他情况，对系统返回没有英雄的情况
        return this.enterGameOverStage(reason, probableHero);
    }
    /** 游戏结束后，提醒玩家。 */
    gameOverNotice(reason, hero) {
        const playerWin = reason === MurderMysteryGameOverReason.AllPlayersDied ? false : true;
        /** 为玩家名称添加颜色。
         * - 如果该玩家仍然存活，则显示为绿色 §a，否则显示为灰色 §7。
         * - 特别地，如果没有引入一个正确的`playerData`，则返回`undefined`。
         */
        function colorName(playerData) {
            if (!playerData)
                return;
            return playerData.isDead ? `§7${playerData.getName()}` : `§a${playerData.getName()}`;
        }
        // 为首位侦探、杀手和英雄添加颜色
        const firstDetectiveName = colorName(this.players.detective.find(detective => detective.isFirstDetective));
        const murdererName = colorName(this.players.murderer[0]);
        const murdererKills = this.players.murderer[0]?.kills ?? 0;
        const heroName = colorName(hero);
        const titleList = {
            innocent: { translate: `${playerWin ? "title.win" : "title.lose"}` },
            detective: { translate: `${playerWin ? "title.win" : "title.lose"}` },
            murderer: { translate: `${playerWin ? "title.lose" : "title.win"}` },
            spectator: { translate: "title.gameOver" },
        };
        /** 游戏结束后返回的聊天栏消息。 */
        const message = [
            { text: "§a§l---------------§r" },
            { text: "" },
            { translate: "chat.title" },
            { text: "" },
            { translate: `chat.winner.${playerWin ? "innocent" : "murderer"}` },
            { text: "" },
        ];
        if (firstDetectiveName)
            message.push({ translate: "chat.detective", with: [firstDetectiveName] });
        if (murdererName)
            message.push({ translate: "chat.murderer", with: [murdererName, `${murdererKills}`] });
        if (heroName)
            message.push({ translate: "chat.hero", with: [heroName] });
        message.push({ text: "" }, { text: "§a§l---------------§r" });
        this.players.allPlayers.forEach(playerData => {
            if (!isPlayer(playerData.player))
                return;
            const subtitle = {
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
    /** 获取游戏已开始的时长。单位：秒。 */
    getGameStartedTime() {
        return this.settings.gaming.timePerGame - this.timeLeft;
    }
    /** 获取实体的状态。状态列表可在 {@link DynamicProperties} 检查或注册。 */
    static getState(entity, state, defaultValue) {
        const property = entity.getDynamicProperty(state);
        return property ?? defaultValue;
    }
    /** 设置实体的状态。状态列表可在 {@link DynamicProperties} 检查或注册。 */
    static setState(entity, state, value) {
        entity.setDynamicProperty(state, value);
    }
}
/** 事件管理器。用于管理游戏中可能存在的事件。 */
class MurderMysteryEventManager {
    constructor(system) {
        this.system = system;
        this.events = system.mapData.events ?? {};
    }
    /** 游戏系统。 */
    system;
    /** 地图使用的事件 */
    events;
    // #region - 触发事件
    /** 触发事件。 */
    triggerEvent(id, playerData) {
        // ===== 条件检查 =====
        // 如果游戏已结束，直接终止
        if (this.system.gameStage !== GameStage.GamingStage)
            return false;
        // 如果不存在对应事件，直接终止
        const triggedEvent = this.events[id];
        if (!triggedEvent)
            return;
        if (!this.isEventConditionPassed(triggedEvent, playerData))
            return;
        this.executeEvent(triggedEvent, playerData);
    }
    /** 判断事件的条件是否通过。 */
    isEventConditionPassed(event, playerData) {
        // ===== 变量准备 =====
        const { condition, cooldown, consumeGold } = event;
        // ===== 判断条件是否通过 =====
        if (condition && !condition(this.system, playerData))
            return false;
        // ===== 判断玩家金锭是否充足 =====
        if (consumeGold) {
            // 如果执行此事件时没有执行玩家，返回 false
            if (!playerData)
                return false;
            const player = playerData.player;
            if (!isPlayer(player))
                return false;
            // 解析事件响应
            let count = 0;
            let notifyPlayerWhenGoldNotEnough = true;
            let onInsufficient;
            if (typeof consumeGold === "number")
                count = consumeGold;
            else {
                count = consumeGold.count;
                notifyPlayerWhenGoldNotEnough = consumeGold.notifyWhenGoldNotEnough ?? true;
                onInsufficient = consumeGold.onInsufficient;
            }
            // 检查玩家的金锭数
            const playerGoldCount = lib.ItemUtils.inventory.getTypeAmount(player, goldId);
            if (playerGoldCount < count) {
                if (notifyPlayerWhenGoldNotEnough) {
                    minecraft.system.run(() => lib.PlayerUtils.notify(player, {
                        message: { translate: "chat.consumeGold.insufficient", with: [`${count}`] },
                        sound: "random.anvil_land",
                    }));
                }
                if (onInsufficient)
                    onInsufficient(this.system, playerData);
                return false;
            }
        }
        // ===== 判断系统是否处于冷却期间 =====
        if (cooldown && cooldown.target === "system") {
            const leftDuration = this.getEventCooldownCountdown(cooldown.type, cooldown.itemName, playerData?.player);
            if (leftDuration > 0)
                return false;
        }
        return true;
    }
    /** 执行事件。 */
    executeEvent(event, playerData) {
        const { getMysteryPotion, intoHauntedHouseDoor, outOfHauntedHouseDoor, place, setPlayerDead, notify, broadcast, trigger, teleport, rideMinecart, cooldown, consumeGold, run, } = event;
        // ===== 执行函数 =====
        if (run && run(this.system, playerData) === false)
            return;
        // ===== 神秘药水事件 =====
        // 若执行此事件时没有执行玩家，或执行失败，则终止运行
        if (getMysteryPotion && (!playerData || !this.getMysteryPotion(getMysteryPotion, playerData)))
            return;
        // ===== 鬼屋门事件 =====
        // 若执行此事件时没有执行玩家，或执行失败，则终止运行
        if (intoHauntedHouseDoor && (!playerData || !this.intoHauntedHouseDoor(intoHauntedHouseDoor, playerData)))
            return;
        // ===== 离开鬼屋门事件 =====
        // 若执行此事件时没有执行玩家，则终止运行
        if (outOfHauntedHouseDoor) {
            if (!playerData)
                return;
            playerData.isInHauntedHouseDoor = false;
        }
        // ===== 放置方块/结构事件 =====
        if (place) {
            // 如果有方块/结构未能放置，立刻判定为失败
            const hasPlaceFailed = place.some(data => {
                let result = true;
                if (data.type === "setBlock")
                    result = this.setBlock(data);
                else if (data.type === "fillBlock")
                    result = this.fillBlock(data);
                else if (data.type === "setStructure")
                    result = this.setStructure(data);
                else if (data.type === "setEntity")
                    result = this.setEntity(data);
                else
                    result = this.setText(data);
                if (!result)
                    return true;
            });
            if (hasPlaceFailed)
                return false;
        }
        // ===== 处死玩家事件 =====
        // 若执行此事件时没有执行玩家，或执行失败，则终止运行
        if (setPlayerDead && (!playerData || !this.setPlayerDead(setPlayerDead, playerData)))
            return;
        // ===== 乘坐矿车事件 =====
        // 若执行此事件时没有执行玩家，或执行失败，则终止运行
        if (rideMinecart && (!playerData || !this.rideMinecart(rideMinecart, playerData)))
            return;
        // ===== 传送玩家事件 =====
        if (teleport && (!playerData || !this.teleport(teleport, playerData)))
            return;
        // ===== 冷却事件 =====
        // 若执行此事件时没有执行玩家，则终止运行
        if (cooldown) {
            if (!playerData)
                return;
            if (cooldown.target === "player")
                playerData.setEventCooldown(cooldown.type, cooldown.duration);
            else
                this.setEventCooldown(cooldown.type, cooldown.duration);
        }
        // ===== 执行成功后 =====
        // 通告玩家/通知触发玩家
        if (broadcast)
            lib.PlayerUtils.broadcast(broadcast);
        if (notify && playerData && isPlayer(playerData.player))
            lib.PlayerUtils.notify(playerData.player, notify);
        // 移除金锭
        const consumeGoldCount = typeof consumeGold === "number" ? consumeGold : (consumeGold?.count ?? 0);
        if (consumeGoldCount && playerData?.player && isPlayer(playerData.player))
            lib.ItemUtils.removeItem(playerData.player, "murder_mystery:gold_ingot", -1, consumeGoldCount);
        // 触发新的事件
        if (trigger)
            this.triggerEvent(trigger, playerData);
    }
    // #endregion
    // #region - 系统事件冷却
    /** 事件冷却列表。触发了特定事件后可能会导致特定类型的事件冷却，在冷却期内可指定为无法再次触发事件。冷却单位：秒。 */
    eventCooldown = {};
    /** 对玩家设置事件冷却状态。 */
    setEventCooldown(type, duration) {
        // 设置冷却
        this.eventCooldown[type] = duration;
        // 注册每秒 -1 的冷却时间线
        lib.gameSystem.subscribeTimeline(`system${type}EventCooldown`, () => {
            const currentDuration = this.eventCooldown[type] ?? 0;
            if (currentDuration <= 1)
                delete this.eventCooldown[type];
            else
                this.eventCooldown[type] = currentDuration - 1;
        }, 20);
    }
    /** 返回玩家是否处于某个事件的冷却状态中。 */
    getEventCooldownCountdown(type, itemName, notifyPlayer) {
        const countdown = this.eventCooldown[type] ?? 0;
        if (countdown > 0 && itemName && notifyPlayer && isPlayer(notifyPlayer))
            notifyPlayer.sendMessage({
                translate: "chat.cooldown",
                with: { rawtext: [{ translate: itemName }, { text: `${countdown}` }] },
            });
        return countdown;
    }
    // #endregion
    // #region - 神秘药水
    /** 本局的神秘药水的排布。
     * - 游戏一共有 5 种神秘药水。当玩家喝下神秘药水后，触发一个随机效果。
     * - 在本局游戏内，每种药水的效果是固定的，但在不同游戏内，相同药水的药效是不固定的。
     * - 神秘药水的 ID 为`murder_mystery:mystery_potion_(index)`，其中不同的`index`指代的即为不同的药效。
     */
    mysteryPotionData = lib.JSUtils.array.shuffle([
        { name: "失明", id: "blindness", weight: 4 },
        { name: "缓慢", id: "slowness", weight: 5 },
        { name: "迅捷", id: "speed", amplifier: 1, duration: 400, weight: 4 },
        { name: "隐身", id: "invisibility", duration: 280, weight: 5 },
        { name: "无敌", id: "resistance", amplifier: 4, duration: 400, weight: 2 },
    ]);
    /** 默认神秘药水的物品备注。 */
    static mysteryPotionDefaultLore = ["§r§7这是一瓶药水。天知道它会给你什么效果。"];
    /** 记录玩家当前是否处于神秘药水效果影响下。 */
    inPotionEffect = {};
    /** 从药水的 ID 获取索引。 */
    static getPotionIndex(potionId) {
        // 匹配完整格式，并捕获数字部分
        const match = potionId.match(/^murder_mystery:mystery_potion_(\d+)$/);
        if (!match)
            return undefined;
        // 将捕获的字符串转为数字
        return Number(match[1]);
    }
    /** 令玩家试图获取神秘药水。
     * @returns 返回是否成功获得了药水。
     */
    getMysteryPotion(getMysteryPotionEvent, playerData) {
        // ===== 条件检查 =====
        // 如果玩家不是 Player，终止运行
        const player = playerData.player;
        if (!isPlayer(player))
            return false;
        // 如果已有人在使用（附近有药水动画时），提示玩家后终止运行
        const animationLocation = getMysteryPotionEvent.animationLocation;
        const nearbyAnimationEntities = lib.EntityUtils.getNearby("murder_mystery:mystery_potion", animationLocation, 2);
        if (nearbyAnimationEntities.length !== 0) {
            lib.PlayerUtils.notify(player, {
                message: { translate: "chat.mysteryPotion.occupied" },
                sound: "random.anvil_land",
            });
            return false;
        }
        // 如果玩家拥有超过 3 瓶药水，提示玩家后终止运行
        if (!playerData.canGiveItem())
            return false;
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
        const mysteryPotionAnimationEntity = lib.EntityUtils.add("murder_mystery:mystery_potion", lib.Vector3Utils.add(animationLocation, 0.5, 0, 0.5), player.dimension, { initialRotation: player.getRotation().y + 180, spawnEvent: potionId });
        // 在 1.5 秒后，销毁动画实体并给予玩家药水
        minecraft.system.runTimeout(() => {
            playerData.giveItem(potionId, {
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
    drinkMysteryPotion(playerData, potionId) {
        // ===== 条件检查 =====
        // 获取药效信息，如果玩家喝下的不是有效药水，则终止运行
        const potionIndex = MurderMysteryEventManager.getPotionIndex(potionId);
        if (potionIndex === undefined)
            return false;
        const potionData = this.mysteryPotionData[potionIndex];
        if (!potionData)
            return false;
        // 如果玩家不是 Player，终止运行
        const player = playerData.player;
        if (!isPlayer(player))
            return false;
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
            if (!playerContainer)
                return;
            const containerSlot = playerContainer.getSlot(slot);
            const currentItem = containerSlot.getItem();
            if (!currentItem)
                return;
            if (currentItem.typeId !== potionId)
                return;
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
    setBlock(setBlockEvent) {
        // 如果该方块已放置过，则终止运行
        if (lib.BlockUtils.match(setBlockEvent))
            return false;
        // 放置方块
        // 这里 setBlockEvent 的类型是继承自 lib.BlockData 的，所以直接用了
        lib.BlockUtils.set(setBlockEvent, lib.DimensionUtils.getOverworld());
        return true;
    }
    /** 在特定位置试图填充方块。
     * @returns 返回是否成功填充了方块。
     */
    fillBlock(fillBlockEvent) {
        // 填充方块
        // 这里 fillBlockEvent 的类型是继承自 lib.BlockFillData 的，所以直接用了
        lib.BlockUtils.fill(fillBlockEvent, {}, lib.DimensionUtils.getOverworld());
        return true;
    }
    /** 在特定位置试图填充方块。
     * @returns 返回是否成功填充了方块。
     */
    setStructure(setStructureEvent) {
        const { structure, location, options } = setStructureEvent;
        lib.StructureUtils.placeAsync(structure, location, options);
        return true;
    }
    /** 在特定位置试图填充方块。
     * @returns 返回是否成功填充了方块。
     */
    setEntity(setEntityEvent) {
        const { id, location, options } = setEntityEvent;
        lib.EntityUtils.add(id, location, "overworld", options);
        return true;
    }
    /** 在特定位置试图填充方块。
     * @returns 返回是否成功填充了方块。
     */
    setText(setTextEvent) {
        const { text, location } = setTextEvent;
        minecraft.world.primitiveShapesManager.addText(new minecraft.TextPrimitive(lib.Vector3Utils.add(location, 0.5, 0, 0.5), text));
        return true;
    }
    // #endregion
    // #region - 处死玩家
    /** 设置玩家为死亡状态。
     * @returns 返回是否成功处死了玩家。
     */
    setPlayerDead(setPlayerDeadEvent, playerData) {
        const result = playerData.setDead(setPlayerDeadEvent.deathType);
        return result;
    }
    // #endregion
    // #region - 传送玩家
    /** 传送玩家到指定位置。
     * @returns 返回是否成功传送了玩家。
     */
    teleport(teleportEvent, playerData) {
        const { location, facingLocation } = teleportEvent;
        playerData.player.teleport(location, { facingLocation });
        return true;
    }
    // #endregion
    // #region - 鬼屋门
    intoHauntedHouseDoor(intoHauntedHouseDoorEvent, playerData) {
        // ===== 变量准备 =====
        const { doorLocation, voidGlassLocation, lavaCaveGlassLocation, voidBarrierLocation } = intoHauntedHouseDoorEvent;
        const player = playerData.player;
        // ===== 条件判断 =====
        // 如果没有方块，则终止运行
        const door = lib.BlockUtils.get(doorLocation);
        if (!door)
            return false;
        // 如果不是玩家，则终止运行
        if (!isPlayer(player))
            return false;
        // 如果玩家已在鬼屋门内，则终止运行
        if (playerData.isInHauntedHouseDoor)
            return false;
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
            const randomResult = lib.JSUtils.number.randomInt(1, 3);
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
    rideMinecart(rideMinecartEvent, playerData) {
        // ===== 变量准备&条件检查 =====
        const { from, to, initVelocity, onArrival } = rideMinecartEvent;
        // 如果不是玩家，阻止触发此事件
        const player = playerData.player;
        if (!isPlayer(player))
            return false;
        // 如果玩家正在乘坐矿车，阻止重复触发此事件
        if (playerData.isRidingMinecart) {
            lib.PlayerUtils.notify(player, {
                message: { translate: "chat.hypixelWorld.rideTwoMinecarts" },
                sound: "random.anvil_land",
            });
            return false;
        }
        // ===== 生成矿车并锁定玩家 =====
        // 生成矿车并施加初始速度
        let minecart = lib.EntityUtils.add("minecraft:minecart", from);
        minecart.applyImpulse(initVelocity);
        // 禁用玩家的下车权限
        player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Dismount, false);
        player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Jump, false);
        // 令玩家坐在矿车上
        const rideableComp = minecart.getComponent("rideable");
        if (!rideableComp)
            return false;
        rideableComp.addRider(player);
        // 标记玩家正在乘坐矿车
        playerData.isRidingMinecart = true;
        // 如果玩家的矿车坏掉了，则立刻补充一个新的矿车
        lib.gameSystem.subscribeEvent(`prevent${player.id}MinecartDestroyed`, minecraft.world.beforeEvents.entityRemove, event => {
            // 如果不是这辆矿车被破坏就不管它
            if (event.removedEntity.id !== minecart.id)
                return;
            // 获取旧矿车的信息
            const { typeId, location, dimension } = minecart;
            const rotation = minecart.getRotation().y;
            const velocity = minecart.getVelocity();
            minecraft.system.run(() => {
                // 移除矿车掉落物
                lib.ItemUtils.removeEntity("minecraft:minecart");
                // 补充新矿车，把记录的 minecart 改为新矿车，然后让玩家强制乘坐
                minecart = lib.EntityUtils.add(typeId, lib.Vector3Utils.add(location, 0, 0.5, 0), dimension, {
                    initialRotation: rotation,
                });
                minecart.applyImpulse(lib.Vector3Utils.scale(velocity, 8));
                minecart.getComponent("rideable")?.addRider(player);
            });
        });
        // 当矿车到达终点时，移除矿车，启用玩家的下车权限并终止时间线
        lib.gameSystem.subscribeTimeline(`${player.id}RideMinecart`, () => {
            if (!minecart.isValid)
                return; // 因为这里矿车可能会被移除，故而矿车可能会无效化
            const location = minecart.location;
            if (lib.Vector3Utils.distance(location, to, true) <= 1) {
                // 恢复玩家的权限
                player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Dismount, true);
                player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Jump, true);
                // 注销玩家乘坐中的矿车
                playerData.isRidingMinecart = false;
                // 先解除矿车无法被破坏的状态，再强制移除
                lib.gameSystem.unsubscribeEvent(`prevent${player.id}MinecartDestroyed`);
                minecart.remove();
                // 触发事件
                this.triggerEvent(onArrival, playerData);
                // 最后终止时间线
                return false;
            }
        });
        return true;
    }
}
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
    waiting = {
        minPlayerCount: 2,
        maxPlayerCount: 16,
        startCountdown: 16,
    };
    /** 游戏设置，控制地图在游戏期间的行为。 */
    gaming = {
        timePerGame: 270,
        getSpecialItemDelay: 15,
        detectiveBowCooldown: 5,
        pickupBowMethod: "nearby",
        showRoleInSpectatorTeleportUI: true,
        applyNightVision: false,
    };
    /** 金锭生成设置，控制如何生成金锭。 */
    goldSpawn = {
        spawnRadius: 6,
        maxGoldPointsPerTime: 8,
        spawnChance: 0.15,
        spawnInterval: 16,
    };
    /** 杀手刀剑设置，控制杀手的刀的表现。 */
    murdererSword = {
        knifeCooldown: 5,
        knifeCollideArrowDistance: 2.5,
        knifeSpeed: 1.0,
        knifeThrowTime: 10,
    };
    /** 杂项设置，控制游戏中一些其他内容的设置项。 */
    miscellaneous = {
        getGoldHint: true,
        infoboardLastLine: "YZBWDLT",
    };
    mapEnabled = {};
    // #region - 保存与加载设置
    /** 对系统保存设置。 */
    static saveSettings(system) {
        minecraft.world.setDynamicProperty("murder_mystery:settings", JSON.stringify(system.settings));
    }
    /** 加载设置。返回待加载的设置。 */
    static loadSettings() {
        const settings = new MurderMysterySettings();
        // 如果没有保存设置，则直接返回新生成的设置
        const savedSettingsStr = minecraft.world.getDynamicProperty("murder_mystery:settings");
        if (!savedSettingsStr)
            return settings;
        // 递归合并（只合并 settings 中已有的键），但如果 JSON 解析失败，则保留默认配置
        try {
            const parsed = JSON.parse(savedSettingsStr);
            this.mergeDeep(settings, parsed);
        }
        catch { }
        return settings;
    }
    /** 深度合并工具：将 source 对象中与 target 同名的键合并到 target。
     * - 只合并 target 已有的属性，忽略 source 中多余的键
     * - 嵌套对象递归合并，数组/基本类型直接覆盖
     *
     * （代码由 Deepseek 生成 =P）
     */
    static mergeDeep(target, source) {
        for (const key of Object.keys(source)) {
            if (Object.prototype.hasOwnProperty.call(target, key)) {
                const targetValue = target[key];
                const sourceValue = source[key];
                // 两者都是普通对象（非数组、非 null）时递归合并
                if (lib.JSUtils.isPlainObject(targetValue) && lib.JSUtils.isPlainObject(sourceValue))
                    this.mergeDeep(targetValue, sourceValue);
                // 否则直接覆盖（数组、基本类型、函数等）
                else
                    target[key] = sourceValue;
            }
            // 如果 target 没有该键，忽略
        }
    }
    // #endregion
    // #region - 设置 UI
    /** 对玩家显示设置界面。 */
    static showMainSettingsUI(system, player) {
        // ===== 变量准备 =====
        /** 旁观者选项。 */
        const spectatorSettings = [];
        const playerData = system.getPlayer(player);
        if (playerData && playerData.isDead)
            spectatorSettings.push({ type: "divider" }, { type: "label", text: { translate: "ui.settings.main.spectatorSettings" } }, {
                type: "button",
                text: { translate: "ui.settings.main.teleportTo" },
                icon: "textures/ui/dressing_room_skins",
                onClick: () => this.showTeleportToUI(system, player),
            }, {
                type: "button",
                text: { translate: "ui.settings.main.sendMessage" },
                icon: "textures/ui/chat_send",
                onClick: () => this.showSendMessageToSpectatorUI(system, player),
            });
        /** 玩家设置选项。 */
        const playerSettings = [
            { type: "divider" },
            { type: "label", text: { translate: "ui.settings.main.playerSettings" } },
            {
                type: "button",
                text: { translate: "ui.settings.main.optOutSpectate" },
                icon: "textures/items/ender_eye",
                onClick: () => this.showOptOutSpectateUI(system, player),
            },
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
        const operatorSettings = [];
        const permission = player.playerPermissionLevel;
        if (permission >= 2)
            operatorSettings.push({ type: "divider" }, { type: "label", text: { translate: "ui.settings.main.operatorSettings" } }, {
                type: "button",
                text: { translate: "ui.settings.main.selectMap" },
                icon: "textures/items/map_empty",
                onClick: () => this.showSelectMapUI(system, player),
            }, {
                type: "button",
                text: { translate: "ui.settings.main.enableMap" },
                icon: "textures/items/map_filled",
                onClick: () => this.showEnableMapUI(system, player),
            }, {
                type: "button",
                text: { translate: "ui.settings.main.waiting" },
                icon: "textures/items/clock_item",
                onClick: () => this.showWaitingUI(system, player),
            }, {
                type: "button",
                text: { translate: "ui.settings.main.gaming" },
                icon: "textures/items/bow_standby",
                onClick: () => this.showGamingUI(system, player),
            }, {
                type: "button",
                text: { translate: "ui.settings.main.goldSpawn" },
                icon: "textures/items/gold_ingot",
                onClick: () => this.showGoldSpawnUI(system, player),
            }, {
                type: "button",
                text: { translate: "ui.settings.main.murdererSword" },
                icon: "textures/items/iron_sword",
                onClick: () => this.showMurdererSwordUI(system, player),
            }, {
                type: "button",
                text: { translate: "ui.settings.main.miscellaneous" },
                icon: "textures/items/diamond_pickaxe",
                onClick: () => this.showMiscellaneousUI(system, player),
            });
        /** 开发者设置选项。 */
        const developerSettings = [];
        const isDeveloper = player.hasTag("developer");
        if (permission >= 2 && isDeveloper)
            developerSettings.push({ type: "divider" }, { type: "label", text: { translate: "ui.settings.main.developerSettings" } }, {
                type: "button",
                text: { translate: "ui.settings.main.fakePlayerManager" },
                onClick: () => this.showFakePlayerManagerUI(system, player),
            }, {
                type: "button",
                text: { translate: "ui.settings.main.restoreDefault" },
                onClick: () => {
                    const defaultSettings = new MurderMysterySettings();
                    system.settings.gaming = defaultSettings.gaming;
                    system.settings.goldSpawn = defaultSettings.goldSpawn;
                    system.settings.mapEnabled = defaultSettings.mapEnabled;
                    system.settings.miscellaneous = defaultSettings.miscellaneous;
                    system.settings.murdererSword = defaultSettings.murdererSword;
                    system.settings.waiting = defaultSettings.waiting;
                    this.saveSettings(system);
                    lib.PlayerUtils.notify(player, {
                        message: { translate: "chat.settings.restoreDefault" },
                        sound: "random.orb",
                    });
                },
            });
        // ===== 显示设置界面 =====
        lib.UIUtils.createAction(player, {
            type: "action",
            components: [
                { type: "header", text: { translate: "ui.settings.main.title" } },
                ...spectatorSettings,
                ...playerSettings,
                ...operatorSettings,
                ...developerSettings,
            ],
        });
    }
    /** 生成一个常规设置 UI。可以通过添加设置名称和组件来新增功能。 */
    static generateSettingsUI(system, player, settingsName, components, submitCallback) {
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
                        if (result)
                            system.settings[settingsName] = new MurderMysterySettings()[settingsName];
                    },
                },
            ],
            onSubmit: () => {
                if (submitCallback)
                    submitCallback();
                MurderMysterySettings.saveSettings(system);
                this.showMainSettingsUI(system, player); // 返回到上一级
            },
        });
    }
    /** 对玩家显示关于我们 UI。 */
    static showAboutUI(system, player) {
        const author = gameData.about.author.map(text => ({ type: "label", text: `§a${text}` }));
        const map = gameData.about.map.map(text => ({ type: "label", text: `§a${text}` }));
        const customHeadAdaption = gameData.about.customHeadAdaption.map(text => ({
            type: "label",
            text: `§a${text}`,
        }));
        const tester = gameData.about.tester.map(text => ({ type: "label", text: `§a${text}` }));
        const specialThanks = gameData.about.specialThanks.map(text => ({
            type: "label",
            text: `§a${text}`,
        }));
        lib.UIUtils.createAction(player, {
            type: "action",
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: "ui.settings.about.title" } },
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.author" } },
                ...author,
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.version" } },
                { type: "label", text: `§a${system.version}` },
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.map" } },
                ...map,
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.customHeadAdaption" } },
                ...customHeadAdaption,
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.tester" } },
                ...tester,
                { type: "divider" },
                { type: "label", text: { translate: "ui.settings.about.specialThanks" } },
                ...specialThanks,
            ],
        });
    }
    /** 对玩家显示更新日志 UI。 */
    static showUpdateLogUI(system, player) {
        const textComponent = gameData.updateLog.map(text => ({ type: "label", text: text }));
        lib.UIUtils.createAction(player, {
            type: "action",
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: "ui.settings.updateLog.title" } },
                { type: "label", text: { translate: "ui.settings.updateLog.line1" } },
                { type: "divider" },
                { type: "label", text: `§a§l${system.version}` },
                ...textComponent,
            ],
        });
    }
    /** 对玩家显示主动旁观 UI。 */
    static showOptOutSpectateUI(system, player) {
        const currentState = MurderMysterySystem.getState(player, "murder_mystery:optOutSpectate", "none");
        lib.UIUtils.createAction(player, {
            type: "action",
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: "ui.settings.optoutspectate.title" } },
                {
                    type: "label",
                    text: {
                        translate: "ui.settings.optoutspectate.description",
                        with: { rawtext: [{ translate: `ui.settings.optoutspectate.${currentState}` }] },
                    },
                },
                { type: "divider" },
                {
                    type: "button",
                    text: { translate: "ui.settings.optoutspectate.none" },
                    onClick: () => {
                        MurderMysterySystem.setState(player, "murder_mystery:optOutSpectate", "none");
                        lib.PlayerUtils.notify(player, {
                            message: {
                                translate: "chat.youChose",
                                with: { rawtext: [{ translate: "ui.settings.optoutspectate.none" }] },
                            },
                            sound: "random.orb",
                        });
                    },
                },
                {
                    type: "button",
                    text: { translate: "ui.settings.optoutspectate.nextGame" },
                    onClick: () => {
                        MurderMysterySystem.setState(player, "murder_mystery:optOutSpectate", "nextGame");
                        lib.PlayerUtils.notify(player, {
                            message: {
                                translate: "chat.youChose",
                                with: { rawtext: [{ translate: "ui.settings.optoutspectate.nextGame" }] },
                            },
                            sound: "random.orb",
                        });
                    },
                },
                {
                    type: "button",
                    text: { translate: "ui.settings.optoutspectate.always" },
                    onClick: () => {
                        MurderMysterySystem.setState(player, "murder_mystery:optOutSpectate", "always");
                        lib.PlayerUtils.notify(player, {
                            message: {
                                translate: "chat.youChose",
                                with: { rawtext: [{ translate: "ui.settings.optoutspectate.always" }] },
                            },
                            sound: "random.orb",
                        });
                    },
                },
            ],
        });
    }
    /** 对玩家显示选择地图 UI。
     * @description 不会显示已被禁用的地图。
     */
    static showSelectMapUI(system, player) {
        const mapNames = Object.keys(gameData.maps);
        const validMapNames = mapNames.filter(mapName => system.settings.mapEnabled[mapName]);
        const selectMapButtons = validMapNames.map(mapName => ({
            type: "button",
            text: { translate: `map.${mapName}` },
            onClick: () => {
                minecraft.world.setDynamicProperty("murder_mystery:nextMap", mapName);
            },
        }));
        lib.UIUtils.createAction(player, {
            type: "action",
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: "ui.settings.selectMap.title" } },
                { type: "divider" },
                {
                    type: "button",
                    text: { translate: `ui.settings.selectMap.randomMap` },
                    onClick: () => {
                        minecraft.world.setDynamicProperty("murder_mystery:nextMap");
                    },
                },
                ...selectMapButtons,
            ],
        });
    }
    /** 对玩家显示启用地图 UI。 */
    static showEnableMapUI(system, player) {
        const mapNames = Object.keys(gameData.maps);
        const currentMapEnabledSettings = { ...system.settings.mapEnabled };
        const enableMapButtons = mapNames.map(mapName => ({
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
    static showWaitingUI(system, player) {
        const { maxPlayerCount, minPlayerCount, startCountdown } = system.settings.waiting;
        this.generateSettingsUI(system, player, "waiting", [
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
        ], () => {
            // 立刻应用设置
            system.beforeGameInfo.startCountdown = system.settings.waiting.startCountdown;
            system.beforeGameInfo.minPlayerCount = system.settings.waiting.minPlayerCount;
            system.beforeGameInfo.maxPlayerCount = system.settings.waiting.maxPlayerCount;
        });
    }
    /** 对玩家显示游戏时 UI。 */
    static showGamingUI(system, player) {
        const { timePerGame, getSpecialItemDelay, detectiveBowCooldown, pickupBowMethod, showRoleInSpectatorTeleportUI, applyNightVision, } = system.settings.gaming;
        const pickupBowMethodList = {
            rightClick: 0,
            nearby: 1,
        };
        const pickupBowMethods = ["rightClick", "nearby"];
        this.generateSettingsUI(system, player, "gaming", [
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
                type: "slider",
                description: { translate: "ui.settings.gaming.detectiveBowCooldown.title" },
                tipText: { translate: "ui.settings.gaming.detectiveBowCooldown.description" },
                default: detectiveBowCooldown,
                min: 0,
                max: 10,
                step: 1,
                onSubmit: result => {
                    system.settings.gaming.detectiveBowCooldown = result;
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
        ], () => {
            // 如果要设置的游戏时间小于当前剩余的游戏时间，则直接改为待设置的游戏时间
            if (system.settings.gaming.timePerGame < system.timeLeft)
                system.timeLeft = system.settings.gaming.timePerGame;
            // 重新注册弓箭检测组件
            MurderMysteryComponents.playerPickupBowTest(system);
            // 若启用夜视，则立刻应用组件，否则立刻移除夜视效果
            if (system.settings.gaming.applyNightVision)
                MurderMysteryComponents.applyNightVision(system);
            else {
                lib.PlayerUtils.getAll().forEach(player => player.removeEffect("minecraft:night_vision"));
            }
        });
    }
    /** 对玩家显示金锭生成 UI。 */
    static showGoldSpawnUI(system, player) {
        const { spawnChance, spawnInterval, spawnRadius, maxGoldPointsPerTime } = system.settings.goldSpawn;
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
                description: { translate: "ui.settings.goldSpawn.maxGoldPointsPerTime.title" },
                tipText: { translate: "ui.settings.goldSpawn.maxGoldPointsPerTime.description" },
                default: maxGoldPointsPerTime,
                min: 0,
                max: 15,
                step: 1,
                onSubmit: result => {
                    system.settings.goldSpawn.maxGoldPointsPerTime = result;
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
    static showMurdererSwordUI(system, player) {
        const { knifeCooldown, knifeCollideArrowDistance, knifeSpeed, knifeThrowTime } = system.settings.murdererSword;
        this.generateSettingsUI(system, player, "murdererSword", [
            {
                type: "slider",
                description: { translate: "ui.settings.murdererSword.knifeCooldown.title" },
                tipText: { translate: "ui.settings.murdererSword.knifeCooldown.description" },
                default: knifeCooldown,
                min: 0,
                max: 10,
                step: 1,
                onSubmit: result => {
                    system.settings.murdererSword.knifeCooldown = result;
                },
            },
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
    static showMiscellaneousUI(system, player) {
        const { infoboardLastLine, getGoldHint } = system.settings.miscellaneous;
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
            {
                type: "toggle",
                description: { translate: "ui.settings.miscellaneous.getGoldHint.title" },
                tipText: { translate: "ui.settings.miscellaneous.getGoldHint.description" },
                default: getGoldHint,
                onSubmit: result => {
                    system.settings.miscellaneous.getGoldHint = result;
                },
            },
        ]);
    }
    /** 对玩家显示假玩家管理器 UI。 */
    static showFakePlayerManagerUI(system, player) {
        lib.UIUtils.createModal(player, {
            type: "modal",
            submitButton: { translate: "ui.settings.confirm" },
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: `ui.settings.fakePlayerManager.title` } },
                { type: "divider" },
                {
                    type: "slider",
                    default: 0,
                    description: { translate: "ui.settings.fakePlayerManager.addAmount.title" },
                    tipText: { translate: "ui.settings.fakePlayerManager.addAmount.description" },
                    max: 16,
                    min: -16,
                    step: 1,
                    onSubmit: result => {
                        if (result > 0) {
                            for (let i = 0; i < result; i++) {
                                lib.EntityUtils.add("murder_mystery:fake_player", player.location);
                            }
                        }
                        else if (result < 0) {
                            const removeAmount = Math.abs(result);
                            const fakePlayers = lib.EntityUtils.getType("murder_mystery:fake_player");
                            for (let i = 0; i < removeAmount; i++) {
                                const fakePlayer = fakePlayers[i];
                                if (!fakePlayer)
                                    break;
                                fakePlayer.remove();
                            }
                        }
                    },
                },
            ],
            onSubmit: () => {
                this.showMainSettingsUI(system, player); // 返回到上一级
            },
        });
    }
    /** 对玩家显示传送到 UI。 */
    static showTeleportToUI(system, player) {
        const showRole = system.settings.gaming.showRoleInSpectatorTeleportUI;
        let playerList = system.livingPlayers.allPlayers.map(playerData => ({
            type: "button",
            text: {
                translate: showRole ? "ui.spectatorTeleport.playerName" : "%%s",
                with: {
                    rawtext: [{ text: `${playerData.getName()}` }, { translate: `role.${playerData.role}WithColor` }],
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
                lib.PlayerUtils.notify(player, {
                    message: {
                        translate: "chat.spectatorTeleport.teleported",
                        with: [`${playerData.getName()}`],
                    },
                    sound: "random.orb",
                    soundDelay: 3,
                });
            },
        }));
        if (!showRole)
            playerList = lib.JSUtils.array.shuffle(playerList);
        lib.UIUtils.createAction(player, {
            type: "action",
            onCancel: () => this.showMainSettingsUI(system, player),
            components: [
                { type: "header", text: { translate: "ui.spectatorTeleport.title" } },
                { type: "label", text: { translate: "ui.spectatorTeleport.line1" } },
                { type: "divider" },
                ...playerList,
            ],
        });
    }
    /** 对玩家显示在旁观者频道发言 UI。 */
    static showSendMessageToSpectatorUI(system, player) {
        // 显示 UI
        lib.UIUtils.createModal(player, {
            type: "modal",
            components: [
                { type: "header", text: { translate: "ui.settings.sendMessage.title" } },
                { type: "label", text: { translate: "ui.settings.sendMessage.description" } },
                { type: "divider" },
                {
                    type: "textField",
                    description: "",
                    placeholderText: "",
                    onSubmit: message => {
                        system.getPlayer(player)?.sendMessageToSpectators(message.replace(/%/g, "%%"));
                    },
                },
                { type: "label", text: { translate: "ui.settings.sendMessage.tip" } },
            ],
        });
    }
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
    static infoboard(system) {
        lib.gameSystem.unsubscribeTimeline("infoboard");
        lib.gameSystem.subscribeTimeline("infoboard", () => {
            switch (system.gameStage) {
                case GameStage.ClearStage:
                case GameStage.LoadStage:
                case GameStage.WaitingStage:
                    lib.PlayerUtils.getAll().forEach(player => {
                        const texts = system.getBeforeGameInfoboard(player);
                        player.onScreenDisplay.setActionBar(lib.JSUtils.lineText(texts));
                    });
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
    static onPlayerHurt(system) {
        lib.gameSystem.subscribeEvent("onPlayerHurt", minecraft.world.beforeEvents.entityHurt, event => {
            // ===== 变量准备 & 取消游戏引擎事件 =====
            const thisCause = event.damageSource.cause;
            const eventManager = system.eventManager;
            event.cancel = true;
            // ===== 条件判断 =====
            // 如果不是玩家和假玩家受伤，则直接终止运行
            const player = event.hurtEntity;
            const playerData = system.getPlayer(player);
            if (!playerData)
                return;
            // 如果不是游戏状态，直接终止运行
            if (system.gameStage !== GameStage.GamingStage)
                return;
            // ===== 特殊伤害处理 =====
            minecraft.system.run(() => {
                // 如果受到岩浆伤害，立刻处死
                if (thisCause === minecraft.EntityDamageCause.lava)
                    eventManager.setPlayerDead({ deathType: gameData.MurderMysteryDeathType.Lava }, playerData);
                // 如果受到溺水伤害，立刻处死
                if (thisCause === minecraft.EntityDamageCause.drowning)
                    eventManager.setPlayerDead({ deathType: gameData.MurderMysteryDeathType.Drowned }, playerData);
            });
            // ===== 触发系统事件 =====
            const playerHurtComponent = system.mapData.components?.playerHurt;
            if (!playerHurtComponent)
                return;
            playerHurtComponent.forEach(({ cause, trigger }) => {
                if (cause !== thisCause)
                    return;
                minecraft.system.run(() => eventManager.triggerEvent(trigger, playerData));
            });
        });
    }
    /** 玩家和方块交互组件。
     * @description 阻止玩家和地图交互组件`interactions`、`pressButton`中指定之外的方块交互。
     * @description 触发具有交互组件的其他事件，例如门、获得神秘药水等。
     * @description 不会阻止创造模式玩家和方块交互。
     */
    static interaction(system) {
        /** 全部的交互组件。 */
        const interactionComponent = system.mapData.components?.interaction ?? [];
        /** 由玩家与方块交互前事件传递给玩家按下按钮后事件的所有信息集合。 */
        const pressedButtonEvent = new Map();
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
            if (player.getGameMode() === minecraft.GameMode.Creative)
                return;
            // 如果不是游戏阶段，取消事件并直接终止
            if (system.gameStage !== GameStage.GamingStage) {
                event.cancel = true;
                return;
            }
            // 如果不是有效玩家，直接终止
            const playerData = system.getPlayer(player);
            if (!playerData)
                return;
            // ===== 解析地图交互属性 =====
            /** 匹配到的交互属性。若没有匹配属性，则为 undefined。 */
            const matchedInteraction = interactionComponent.find(data => {
                // 如果有给定坐标或给定方块则返回
                if ("at" in data && data.at && lib.Vector3Utils.hasPosition(data.at, location))
                    return true;
                if ("blocks" in data && data.blocks && data.blocks.includes(blockId))
                    return true;
                // 否则不返回
                return false;
            });
            // 如果地图交互属性不存在，取消事件并直接终止运行
            if (!matchedInteraction) {
                event.cancel = true;
                return;
            }
            const { stillCancelEvent = false, trigger = "" } = matchedInteraction;
            // 如果触发的交互属性为按钮，则交给按下按钮后事件执行，然后终止，1 秒后销毁该事件信息
            // 这里是为了防止玩家在按钮按下后仍然能够触发事件
            if (matchedInteraction.type === "button") {
                pressedButtonEvent.set(player.id, { player, location, trigger });
                minecraft.system.runTimeout(() => pressedButtonEvent.delete(player.id), 20);
                return;
            }
            // ===== 执行交互属性的功能 =====
            if (stillCancelEvent)
                event.cancel = true;
            minecraft.system.run(() => system.eventManager.triggerEvent(trigger, playerData));
        });
        lib.gameSystem.subscribeEvent("playerPressButton", minecraft.world.afterEvents.buttonPush, event => {
            // ===== 条件检查 =====
            // 如果玩家未曾交互过按钮，或者出现其他问题时，终止运行
            const { block, source } = event;
            const eventInfo = pressedButtonEvent.get(source.id);
            if (!eventInfo)
                return;
            if (!lib.Vector3Utils.isEqual(block.location, eventInfo.location))
                return;
            const playerData = system.getPlayer(source);
            if (!playerData)
                return;
            // ===== 触发事件 =====
            system.eventManager.triggerEvent(eventInfo.trigger, playerData);
            pressedButtonEvent.delete(eventInfo.player.id);
        });
    }
    /** 玩家使用设置。
     * @description 为使用玩家开启一个设置界面。
     */
    static settings(system) {
        lib.gameSystem.subscribeEvent("settings", minecraft.world.afterEvents.itemUse, event => {
            if (event.itemStack.typeId === "murder_mystery:settings")
                MurderMysterySettings.showMainSettingsUI(system, event.source);
        });
    }
    /** 对所有玩家施加夜视效果。
     * @description 会自动判断系统的设置是否启用了`applyNightVision`，若未启用则不会注册该组件。
     * @description 会在游戏开始时尝试对所有玩家施加夜视效果。
     */
    static applyNightVision(system) {
        if (!system.settings.gaming.applyNightVision)
            return;
        lib.PlayerUtils.getAll().forEach(player => player.runCommand("effect @s night_vision infinite 0 true"));
    }
    // #endregion
    // #region - 开始前必选
    /** 游戏开始检测器。
     * @description 进行人数检测。
     * @description 当玩家人数达到最少人数时，开始倒计时。
     * @description 当玩家人数人数不足时，停止倒计时。
     */
    static gameStartTest(system) {
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
    static gameStartCountdown(system) {
        lib.gameSystem.subscribeTimeline("gameStartCountdown", () => {
            // 倒计时
            system.beforeGameInfo.startCountdown--;
            // 显示倒计时消息，当倒计时为 0 时进入游戏阶段
            const countdown = system.beforeGameInfo.startCountdown;
            /** 显示倒计时消息 */
            function countdownNotice(countdown, showTitle = true) {
                lib.PlayerUtils.broadcast({
                    message: {
                        translate: countdown === "§c1" ? "chat.beforeGameStart.countdown.1s" : "chat.beforeGameStart.countdown",
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
        }, 20);
    }
    /** 初始化刚进入的玩家。 */
    static initJoinedPlayer(system) {
        lib.gameSystem.subscribeEvent("initJoinedPlayer", minecraft.world.afterEvents.playerSpawn, event => {
            const { player, initialSpawn } = event;
            if (!initialSpawn)
                return;
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
    static gameTimer(system) {
        lib.gameSystem.subscribeTimeline("gameTimer", () => {
            system.timeLeft--;
            if (system.settings.gaming.timePerGame - system.timeLeft === 60)
                system.livingPlayers.murderer.forEach(murderer => {
                    if (!isPlayer(murderer.player))
                        return;
                    if (murderer.kills > 0)
                        return;
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
                system.livingPlayers.murderer.forEach(murderer => murderer.getLocator());
                system.livingPlayers.allPlayers.forEach(playerData => {
                    if (isPlayer(playerData.player))
                        lib.PlayerUtils.notify(playerData.player, {
                            message: { translate: `chat.murdererGetLocator.${playerData.role}` },
                            sound: "note.hat",
                        });
                });
            }
            if (system.timeLeft <= 0)
                system.enterGameOverStage(MurderMysteryGameOverReason.TimeOut);
        }, 20);
    }
    /** 杀手获得剑。
     * @description 剩余 0-5 秒时，对玩家公告杀手将拿到剑。
     * @description 剩余 0 秒时，杀手将拿到剑，侦探将拿到弓，并注销此组件。
     */
    static getSpecialItem(system) {
        /** 提醒所有玩家杀手即将拿到剑。 */
        function murdererGetSwordNotice(getSpecialItemTimeLeft) {
            system.livingPlayers.allPlayers.forEach(playerData => {
                // 检查是否为玩家，如果不是则终止
                if (!isPlayer(playerData.player))
                    return;
                // 获取消息
                let message = `chat.murderWillGetSword.${playerData.role}`;
                if (getSpecialItemTimeLeft === 1)
                    message = `chat.murderWillGetSword.${playerData.role}.1s`;
                else if (getSpecialItemTimeLeft <= 0)
                    message = `chat.murderGetSword.${playerData.role}`;
                // 发送消息
                lib.PlayerUtils.notify(playerData.player, {
                    message: { translate: message, with: [`§c${getSpecialItemTimeLeft}`] },
                    sound: "note.hat",
                });
            });
        }
        lib.gameSystem.subscribeTimeline("getSpecialItem", () => {
            const getSpecialItemTimeLeft = system.settings.gaming.getSpecialItemDelay - system.getGameStartedTime();
            // 对玩家提示
            if (getSpecialItemTimeLeft <= 5)
                murdererGetSwordNotice(getSpecialItemTimeLeft);
            // 当倒计时结束后，给予杀手和侦探道具并对所有玩家提示
            if (getSpecialItemTimeLeft <= 0) {
                system.livingPlayers.murderer.forEach(murderer => murderer.getSword());
                system.livingPlayers.detective.forEach(detective => detective.getBow());
                system.getSpecialItem = true;
                return false;
            }
        }, 20);
    }
    /** 金锭生成。
     * @description 根据 Hypixel 的实测数据，Hypixel 的金点行为更类似于大量定点 + 玩家附近生成，平均 2 分钟出弓。
     * @description 对每位玩家会尝试每隔 16s 在玩家附近 5 格的位置检索所有金点，并挑出其中的 15% 生成金锭。
     */
    static generateGold(system) {
        const goldPoints = lib.JSUtils.array.shuffle(system.mapData.description.goldPoints);
        lib.gameSystem.subscribeTimeline("generateGold", () => {
            const { spawnChance, spawnInterval, spawnRadius, maxGoldPointsPerTime } = system.settings.goldSpawn;
            // 1. 判断现在是不是时机生成
            // 默认来讲，平均每位玩家有 16s（spawnInterval）的生成时间，这 16s 中所有玩家依次轮流生成。
            // 因此，每 spawnInterval/alivePlayersCount 秒尝试生成一次。
            const alivePlayersCount = system.livingPlayers.allPlayers.length;
            if (alivePlayersCount === 0)
                return;
            const realSpawnInterval = Math.floor((20 * spawnInterval) / alivePlayersCount);
            if (minecraft.system.currentTick % realSpawnInterval !== 0)
                return;
            // 2. 确定生成时机后，判断对哪个玩家生成
            system.globalGoldSpawnTimes++;
            const index = system.globalGoldSpawnTimes % alivePlayersCount;
            const playerData = system.livingPlayers.allPlayers[index] ?? system.livingPlayers.allPlayers[0];
            // 3. 查找距离该玩家平面距离（xz）最近的可生成金点，并在选中的金点位置生成金锭
            goldPoints
                .filter((goldPoint, index) => {
                // 如果距离过远，则排除之
                if (lib.Vector3Utils.distance(playerData.player.location, goldPoint, true) > spawnRadius ** 2)
                    return false;
                // 如果不幸没随机到，则排除之
                if (Math.random() > spawnChance)
                    return false;
                return true;
            })
                .filter((goldPoint, index) => {
                // 默认情况下，最多取 8 个金点
                if (index > maxGoldPointsPerTime)
                    return false;
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
    static playerCollectGold(system) {
        lib.gameSystem.subscribeEvent("onPlayerCollectGold", minecraft.world.afterEvents.entityItemPickup, event => {
            const { entity: player, items: goldIngot } = event;
            if (!isPlayer(player))
                return;
            if (system.settings.miscellaneous.getGoldHint)
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
            if (inventoryUtils.getAmount(player, { includeTypeId: [goldId] }) < 10)
                return;
            const playerData = system.getPlayer(player);
            if (!playerData)
                return;
            if (playerData.role === MurderMysteryPlayerRole.Detective)
                return;
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
        }, { entityFilter: { type: "minecraft:player" }, itemFilter: { includeTypes: [goldId] } });
    }
    /** 玩家击杀检测。
     * @description 当杀手手持剑击打其他玩家时，将其他玩家标记为已死亡。
     * @description 当杀手被射中时，杀手死亡，游戏结束。
     * @description 当侦探或平民被射中时，标记死亡，并奖励杀手/惩罚误杀之人。
     */
    static playerKillTest(system) {
        // 击打检测，仅杀手拿剑时可以击杀其他玩家
        lib.gameSystem.subscribeEvent("playerKillTestHit", minecraft.world.afterEvents.entityHitEntity, event => {
            const { damagingEntity: attacker, hitEntity: victim } = event;
            const attackerData = system.getPlayer(attacker);
            if (!attackerData)
                return;
            const victimData = system.getPlayer(victim);
            if (!victimData)
                return;
            // 必须为杀手
            if (attackerData.role !== MurderMysteryPlayerRole.Murderer)
                return;
            // 杀手必须拿剑
            const attackerMainhandItem = lib.ItemUtils.equipment.getItem(attacker, minecraft.EquipmentSlot.Mainhand);
            if (attackerMainhandItem?.typeId !== "murder_mystery:iron_sword")
                return;
            // 记录击杀
            victimData.setDead(gameData.MurderMysteryDeathType.MurdererStab, attackerData);
        });
        // 弓箭射杀检测
        lib.gameSystem.subscribeEvent("playerKillTestArrow", minecraft.world.afterEvents.projectileHitEntity, event => {
            // ===== 变量准备 & 条件筛选 =====
            const { projectile, source: attacker } = event;
            if (projectile.typeId !== "minecraft:arrow")
                return;
            if (!attacker)
                return;
            const attackerData = system.getPlayer(attacker);
            if (!attackerData)
                return;
            const victim = event.getEntityHit().entity;
            if (!victim)
                return;
            const victimData = system.getPlayer(victim);
            if (!victimData)
                return;
            const killDistance = lib.Vector3Utils.distance(attacker.location, victim.location);
            // ===== 射中检查 =====
            // 考虑各个身份被射中时：
            switch (victimData.role) {
                // 杀手被击杀
                case MurderMysteryPlayerRole.Murderer:
                    victimData.setDead(gameData.MurderMysteryDeathType.Player, attackerData, killDistance);
                    break;
                // 平民或侦探被击杀
                case MurderMysteryPlayerRole.Innocent:
                case MurderMysteryPlayerRole.Detective:
                    // 被杀手杀死，则记录为杀手射杀
                    if (attackerData.role === MurderMysteryPlayerRole.Murderer)
                        victimData.setDead(gameData.MurderMysteryDeathType.MurdererShot, attackerData, killDistance);
                    // 被自己杀死，则记录为自杀
                    else if (attacker.id === victim.id)
                        victimData.setDead(gameData.MurderMysteryDeathType.ShotSelf, attackerData);
                    // 被其他人杀死，则记录为其他玩家射杀，并将射杀之人处死
                    else {
                        victimData.setDead(gameData.MurderMysteryDeathType.Player, attackerData, killDistance);
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
    static playerPickupBowTest(system) {
        // 仅当游戏阶段可注册
        if (system.gameStage !== GameStage.GamingStage)
            return;
        // 注销组件重注册
        lib.gameSystem.unsubscribeTimeline("playerGetBowTestNearby");
        lib.gameSystem.unsubscribeEvent("playerGetBowTestRightClick");
        const pickupBowMethod = system.settings.gaming.pickupBowMethod;
        const isAliveInnocentData = (playerData) => {
            if (!playerData)
                return false;
            if (playerData.role !== MurderMysteryPlayerRole.Innocent)
                return false;
            if (playerData.isDead)
                return false;
            return true;
        };
        if (pickupBowMethod === "nearby")
            lib.gameSystem.subscribeTimeline("playerGetBowTestNearby", () => {
                const bowEntity = lib.EntityUtils.getType(bowEntityId)[0];
                if (!bowEntity)
                    return;
                // 如果仍未给予道具，阻止玩家捡弓，终止运行
                if (!system.getSpecialItem)
                    return;
                // 获取拾取者（必须为存活的平民）
                const picker = [
                    ...lib.EntityUtils.getNearby("minecraft:player", bowEntity.location, 1.5),
                    ...lib.EntityUtils.getNearby("murder_mystery:fake_player", bowEntity.location, 1.5),
                ].find(player => isAliveInnocentData(system.getPlayer(player)));
                if (!picker)
                    return;
                // 令拾取者拾取弓
                system.getPlayer(picker)?.pickupBow(bowEntity);
            }, 3);
        if (pickupBowMethod === "rightClick")
            lib.gameSystem.subscribeEvent("playerGetBowTestRightClick", minecraft.world.afterEvents.playerInteractWithEntity, event => {
                const { player: picker, target: bowEntity } = event;
                if (bowEntity.typeId !== bowEntityId)
                    return;
                // 如果仍未给予道具，阻止玩家捡弓，终止运行
                if (!system.getSpecialItem)
                    return;
                // 获取拾取者（必须为存活的平民）
                const pickerData = system.getPlayer(picker);
                if (!isAliveInnocentData(pickerData))
                    return;
                // 令拾取者拾取弓
                pickerData.pickupBow(bowEntity);
            });
    }
    /** 旁观玩家出界检测。
     * @description 如果玩家是死亡玩家，则进行循环检查，检查玩家从哪个面出界，距离是多少，如果出界则拉回来。
     */
    static spectatorOutOfBorderTest(system) {
        const { from, to } = system.mapData.description.range;
        const gameVolume = new minecraft.BlockVolume(from, to);
        lib.gameSystem.subscribeTimeline("spectatorOutOfBorderTest", () => {
            system.players.allPlayers
                .filter(playerData => playerData.isDead)
                .forEach(spectator => {
                // 先判断玩家有没有出界，没有就直接终止
                const player = spectator.player;
                const location = player.location;
                const { direction: outOfDirection, distance: outOfDistance } = lib.Vector3Utils.getVolumeSector(location, gameVolume);
                if (!outOfDirection)
                    return;
                // 出界后，反向拉回玩家，拉回的距离为出界距离 + 10
                const teleportLocations = {
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
        }, 20);
    }
    /** 玩家离开游戏检测。
     * @description 当玩家离开时，将该玩家从玩家列表中除名。
     * @description 如果该玩家是存活的侦探，则标记首位侦探已死亡，并掉落弓。
     * @description 如果该玩家是杀手，则判断是否已给刀，若未给刀则重新分配一个平民为杀手，否则游戏结束。
     */
    static playerLeaveTest(system) {
        /** 退出主逻辑。 */
        function playerLeaveLogic(player) {
            const playerData = system.getPlayer(player);
            if (!playerData)
                return;
            system.removePlayer(playerData);
            const location = player.location;
            minecraft.system.run(() => {
                // 如果退出玩家是存活的侦探，掉落弓
                if (playerData.role === MurderMysteryPlayerRole.Detective && !playerData.isDead) {
                    playerData.dropBow(false, lib.Vector3Utils.getClosest(location, system.mapData.description.spawnPoints));
                    system.livingPlayers.innocent.forEach(innocent => {
                        if (!isPlayer(innocent.player))
                            return;
                        innocent.player.sendMessage({ translate: "chat.detectiveQuit" });
                    });
                    // 尝试检查游戏是否已结束
                    system.gameOverTest(MurderMysteryGameOverReason.AllPlayersDied);
                    return;
                }
                // 如果退出玩家是杀手：
                if (playerData.role === MurderMysteryPlayerRole.Murderer) {
                    // 如果已给刀，或者未给刀但只剩下侦探时，则游戏结束
                    if (system.getSpecialItem || system.livingPlayers.detective.length === system.livingPlayers.allPlayers.length) {
                        system.gameOverTest(MurderMysteryGameOverReason.MurdererQuit);
                        return;
                    }
                    // 否则，重新分配一个杀手
                    const innocents = system.livingPlayers.innocent;
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
        lib.gameSystem.subscribeEvent("playerLeaveTest", minecraft.world.beforeEvents.playerLeave, event => playerLeaveLogic(event.player));
        // 虚拟玩家退出
        lib.gameSystem.subscribeEvent("fakePlayerLeaveTest", minecraft.world.beforeEvents.entityRemove, event => {
            if (event.removedEntity.typeId !== "murder_mystery:fake_player")
                return;
            playerLeaveLogic(event.removedEntity);
        });
    }
    /** 玩家进入游戏检测。
     * @description 当玩家进入时，将玩家注册为旁观者。
     */
    static playerJoinTest(system) {
        lib.gameSystem.subscribeEvent("playerJoinTest", minecraft.world.afterEvents.playerSpawn, event => {
            const { player, initialSpawn } = event;
            if (!initialSpawn)
                return;
            system.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });
            player.setGameMode(minecraft.GameMode.Spectator);
            player.teleport(lib.JSUtils.array.randomElement(system.mapData.description.spawnPoints));
        });
        lib.gameSystem.subscribeEvent("fakePlayerJoinTest", minecraft.world.afterEvents.entitySpawn, event => {
            const player = event.entity;
            if (player.typeId !== "murder_mystery:fake_player")
                return;
            system.addPlayer({ player, role: MurderMysteryPlayerRole.Spectator });
            player.teleport(lib.JSUtils.array.randomElement(system.mapData.description.spawnPoints));
        });
    }
    /** 侦探使用弓组件。
     * @description 侦探使用弓箭时，开始冷却。
     */
    static detectiveUseBow(system) {
        lib.gameSystem.subscribeEvent("detectiveUseBow", minecraft.world.afterEvents.itemReleaseUse, event => {
            const { source: player, itemStack: bow } = event;
            if (!bow)
                return;
            if (bow.typeId !== "minecraft:bow")
                return;
            system.getPlayer(player)?.shootArrow();
        });
    }
    /** 防止玩家捡起射出的箭。
     * @description 将玩家射出的箭标记为非玩家的箭，并标记为已击中。
     */
    static preventPlayerPickupArrow() {
        lib.gameSystem.subscribeEvent("preventPlayerPickupArrow", minecraft.world.afterEvents.projectileHitBlock, event => {
            const arrow = event.projectile;
            if (!arrow.isValid)
                return;
            if (arrow.typeId !== "minecraft:arrow")
                return;
            arrow.triggerEvent("murder_mystery:remove_player_arrow");
            MurderMysterySystem.setState(arrow, "murder_mystery:hit", true);
        });
    }
    /** 杀手飞刀组件。
     * @description 当玩家尝试使用飞刀时，调用玩家数据的 throwingKnife 方法，以实现飞刀。
     */
    static murdererKnife(system) {
        lib.gameSystem.subscribeEvent("murdererKnifeTest", minecraft.world.afterEvents.itemUse, event => {
            const { itemStack: ironSword, source: murderer } = event;
            if (ironSword.typeId !== "murder_mystery:iron_sword")
                return;
            system.getPlayer(murderer)?.throwingKnife();
        });
    }
    /** 旁观玩家抬头打开设置组件。
     * @description 当旁观玩家或死亡玩家抬头时，调用设置 UI。
     */
    static spectatorTeleport(system) {
        lib.gameSystem.subscribeTimeline("spectatorTeleport", () => {
            system.players.allPlayers
                .filter(spectatorData => spectatorData.isDead)
                .forEach(spectatorData => {
                // 检查旁观者是否抬头，若未抬头则终止运行
                const player = spectatorData.player;
                const playerRotation = player.getRotation();
                if (playerRotation.x > -88)
                    return;
                // 抬头后，放平视角
                player.teleport(player.location, { rotation: { ...playerRotation, x: 0 } });
                // 调用设置 UI
                if (!isPlayer(player))
                    return;
                MurderMysterySettings.showMainSettingsUI(system, player);
            });
        }, 5);
    }
    /** 定位栏组件。
     * @description 控制游戏何时给予杀手和平民定位器。
     * @description 当玩家手持定位器时，对其显示定位栏。
     */
    static locator(system) {
        lib.gameSystem.subscribeEvent("locator", minecraft.world.afterEvents.playerHotbarSelectedSlotChange, event => {
            const { itemStack, player } = event;
            const playerData = system.getPlayer(player);
            if (!playerData)
                return;
            // 当玩家手持定位器时，显示定位栏
            if (itemStack?.typeId === "murder_mystery:locator") {
                playerData.showLocatorBar();
            }
            else {
                playerData.hideLocatorBar();
            }
        });
    }
    /** 杀手速度组件。
     * @description 在单挑模式下不生效。
     * @description 当最后仅剩 1 人时，为杀手提供速度效果，直到游戏结束。
     */
    static murdererGetSpeed(system) {
        if (system.isSolo)
            return;
        lib.gameSystem.subscribeTimeline("murdererGetSpeed", () => {
            // 如果没有杀手，直接终止
            const murdererData = system.livingPlayers.murderer[0];
            if (!murdererData)
                return;
            // 如果存活玩家不止 1 人，直接终止
            const alivePlayerCount = [...system.livingPlayers.innocent, ...system.livingPlayers.detective].length;
            if (alivePlayerCount !== 1)
                return;
            // 为杀手添加速度效果
            murdererData.player.addEffect("speed", 300, { showParticles: false });
        }, 21);
    }
    /** 旁观者在旁观者频道发送消息组件。
     * @description 当旁观者玩家使用`/s <message>`命令时，对所有旁观者发送消息。
     */
    static sendMessageToSpectator(system) {
        lib.gameSystem.subscribeEvent("sendMessageToSpectator", minecraft.system.afterEvents.scriptEventReceive, event => {
            // 条件筛选
            if (event.id !== "murder_mystery:sendSpectatorMessage")
                return;
            // 获取变量
            const player = event.sourceEntity;
            if (!player)
                return;
            if (!isPlayer(player))
                return;
            // 调用 UI
            MurderMysterySettings.showSendMessageToSpectatorUI(system, player);
        });
    }
    // #endregion
    // #region - 开始后可选
    /** 神秘药水组件。
     * @description 会自动判断系统的地图数据是否含有`enableMysteryPotion`组件，若不含该组件则不会注册该组件。
     * @description 会在游戏开始时尝试在规定的位置生成展示文本。
     * @description 当玩家喝下神秘药水时，会导致玩家拥有不同的药效。
     */
    static mysteryPotion(system) {
        // 检查是否有神秘药水组件
        const mysteryPotionComponent = system.mapData.components?.enableMysteryPotion;
        if (!mysteryPotionComponent)
            return;
        // 变量准备
        const eventManager = system.eventManager;
        // 喝下神秘药水
        lib.gameSystem.subscribeEvent("playerUseMysteryPotionTest", minecraft.world.afterEvents.itemCompleteUse, event => {
            const playerData = system.getPlayer(event.source);
            if (!playerData)
                return;
            eventManager.drinkMysteryPotion(playerData, event.itemStack.typeId);
        });
    }
    /** 玩家进入特定区域组件。
     * @description 会自动判断系统的地图数据是否含有`playerInArea`组件，若不含该组件则不会注册该组件。
     * @description 当玩家在特定区域时，触发事件。
     */
    static playerInArea(system) {
        // ===== 条件检查 & 变量准备 =====
        const component = system.mapData.components?.playerInArea;
        if (!component)
            return;
        const eventManager = system.eventManager;
        // ===== 主程序 =====
        lib.gameSystem.subscribeTimeline("playerInArea", () => {
            component.forEach(areaData => {
                const { area, trigger } = areaData;
                system.livingPlayers.allPlayers
                    .filter(playerData => {
                    const { x, y, z } = playerData.player.location;
                    // 判断玩家实体的位置，如果规定了条件且不满足条件的则返回 false
                    // 先判断坐标值是否大于最大值，若是则不在该区域内
                    if (area.xMax && x > area.xMax)
                        return false;
                    if (area.yMax && y > area.yMax)
                        return false;
                    if (area.zMax && z > area.zMax)
                        return false;
                    // 再判断坐标值是否小于最小值，若是则不在该区域内
                    if (area.xMin && x < area.xMin)
                        return false;
                    if (area.yMin && y < area.yMin)
                        return false;
                    if (area.zMin && z < area.zMin)
                        return false;
                    // 否则，实体在该区域内
                    return true;
                })
                    .forEach(playerData => {
                    eventManager.triggerEvent(trigger, playerData);
                });
            });
        }, 5);
    }
    // #endregion
    // #region - 游戏结束
    /** 阻止玩家在游戏结束后拾取金锭。 */
    static preventPlayerPickupGold() {
        lib.gameSystem.subscribeEvent("preventPlayerPickupItem", minecraft.world.beforeEvents.entityItemPickup, event => {
            event.cancel = true;
        }, {
            itemFilter: { includeTypes: [goldId] },
        });
    }
}
// #endregion
// #region 玩家
/** 代表一个密室杀手玩家，包含玩家的密室杀手信息和相关方法。 */
export class MurderMysteryPlayer {
    /** @remarks 这里的构造函数应当仅在游戏开始时执行。若要转换身份，应使用 {@link MurderMysterySystem} 的`transformRole`方法。 */
    constructor(system, playerData) {
        this.system = system;
        this.role = playerData.role;
        this.player = playerData.player;
        // 如果是旁观者，标记为已死亡
        if (this.role === MurderMysteryPlayerRole.Spectator) {
            this.isDead = true;
            if (isPlayer(this.player))
                this.player.setGameMode(minecraft.GameMode.Spectator);
        }
        // 如果是侦探，标记为首位侦探
        if (this.role === MurderMysteryPlayerRole.Detective) {
            this.isFirstDetective = true;
        }
        // 为玩家展示身份
        this.showRole();
    }
    /** 系统。 */
    system;
    /** 玩家身份。 */
    role;
    /** 是否已死亡。 */
    isDead = false;
    /** 是否为首位侦探。该选项只对侦探可用。
     *
     * 首位侦探指游戏刚开始时即分配到侦探身份的玩家。
     * 后来的平民捡起弓后也将成为侦探，但不会是首位侦探。
     */
    isFirstDetective = false;
    /** 该玩家信息对应的玩家 */
    player;
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
        if (!isPlayer(player))
            return;
        const sendMessage = (sound) => lib.PlayerUtils.notify(player, {
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
    setDead(deathType = gameData.MurderMysteryDeathType.Other, killer, killDistance = 0) {
        // 如果游戏已结束，直接终止
        if (this.system.gameStage !== GameStage.GamingStage)
            return false;
        // 若该玩家已死亡，则跳过之
        if (this.isDead)
            return false;
        // 若该玩家正处于无敌状态，并且死亡方式不是虚空等掉出地图的方式，则播放音效和粒子，阻止死亡，终止运行
        const isOutOfMap = gameData.deathTypeOutOfMap.includes(deathType);
        if (this.player.getEffect("resistance") && !isOutOfMap) {
            lib.PlayerUtils.getNearby(this.player.location, 10).forEach(player => player.playSound("mob.irongolem.death", { pitch: 2 }));
            this.player.dimension.spawnParticle("murder_mystery:invincible", this.player.location);
            return false;
        }
        // 标记为该玩家已死亡
        this.isDead = true;
        this.chargingTime = 0;
        this.system.removeLivingPlayer(this);
        // 若不是出图死亡方式，则生成尸体
        if (!isOutOfMap)
            lib.EntityUtils.add("murder_mystery:dead_player", this.player.location, this.player.dimension, {
                initialRotation: this.player.getRotation().y,
            });
        if (isPlayer(this.player)) {
            const player = this.player;
            // 这里，急眼版有一个非常幽默的 bug，如果玩家着火时设置旁观就会一直显示着火粒子，哪怕是其他玩家也能看见
            // 并且通过脚本直接设置 extinguishFire 也是无效的，脚本层也判定玩家未着火，但就是会显示着火粒子
            // 无敌了基岩版
            // 尝试了多种办法均无果，只能放弃修复。未来等天杀的 ojng 自己解决吧。
            player.setGameMode(minecraft.GameMode.Spectator);
            // 对玩家显示死因
            lib.PlayerUtils.notify(player, {
                title: { translate: "title.youDied" },
                subtitle: { translate: `deathMessage.${deathType}`, with: [killDistance.toFixed(2)] },
                titleOptions: instantTitleDisplay,
                message: {
                    translate: "chat.youDied",
                    with: { rawtext: [{ translate: `deathMessage.${deathType}`, with: [killDistance.toFixed(2)] }] },
                },
                sound: "mob.skeleton.death",
                soundDelay: 3,
            });
            player.sendMessage({ translate: "chat.spectatorTeleport.tip" });
            // 恢复玩家的输入权限
            player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Jump, true);
            player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Dismount, true);
            // 设置失明
            player.addEffect("minecraft:blindness", 60);
        }
        else {
            // 传送假玩家到出生点
            minecraft.system.run(() => this.player.teleport(this.system.mapData.description.waitHall.location));
        }
        // 对所有玩家播放音效
        this.system.livingPlayers.allPlayers.forEach(playerData => {
            if (!isPlayer(playerData.player))
                return;
            // 对自己播放骷髅死亡音效（上文已写，这里直接终止）
            if (playerData.player.id === this.player.id)
                return;
            // 对其他玩家播放受伤音效
            playerData.player.playSound("game.player.hurt");
        });
        // 如果是侦探死亡，则掉落弓
        if (this.role === MurderMysteryPlayerRole.Detective) {
            // 如果是掉到虚空或摔到地上等出图的死亡方法，把弓的位置强行设定到其中一个出生点上
            if (isOutOfMap) {
                const closestSpawnPoint = lib.Vector3Utils.getClosest(this.player.location, this.system.mapData.description.spawnPoints);
                this.dropBow(true, lib.Vector3Utils.up(closestSpawnPoint, 1));
            }
            // 否则就设置到侦探本身的位置上
            else
                this.dropBow();
        }
        // 为攻击者添加 1 个击杀数
        if (killer)
            killer.kills++;
        // 判断一次游戏有没有结束
        if (this.role === MurderMysteryPlayerRole.Murderer) {
            this.system.gameOverTest(MurderMysteryGameOverReason.MurdererDied, killer);
        }
        else {
            this.system.gameOverTest(MurderMysteryGameOverReason.AllPlayersDied);
        }
        return true;
    }
    /** 显示信息板。 */
    showInfoboard() {
        if (!isPlayer(this.player))
            return;
        const livingPlayers = this.system.livingPlayers;
        const bowLine = (() => {
            if (!this.system.firstDetectiveDied)
                return { translate: "infoboard.detectiveAlive" };
            if (livingPlayers.detective.length > 0)
                return { translate: "infoboard.bowNotDropped" };
            return { translate: "infoboard.bowDropped" };
        })();
        const killsLine = (() => {
            if (this.role !== MurderMysteryPlayerRole.Murderer)
                return [];
            return [{ translate: "infoboard.kills", with: [`${this.kills}`] }, { text: "" }];
        })();
        const role = (() => {
            if (this.role === MurderMysteryPlayerRole.Spectator)
                return this.role;
            if (this.isDead)
                return "dead";
            return this.role;
        })();
        const chargeLine = (() => {
            if (this.chargingTime <= 0)
                return [];
            const chargingTimeSecond = lib.JSUtils.timeDisplay.showSecondsByTick(this.chargingTime);
            return [{ translate: "infoboard.charging", with: [chargingTimeSecond] }, { text: "" }];
        })();
        const throwKnifeLine = (() => {
            if (this.throwingTime <= 0)
                return [];
            const throwingTimeSecond = lib.JSUtils.timeDisplay.showSecondsByTick(this.throwingTime);
            return [{ translate: "infoboard.throwing", with: [throwingTimeSecond] }, { text: "" }];
        })();
        const texts = [
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
                with: [`${livingPlayers.innocent.length + livingPlayers.detective.length}`],
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
        if (isPlayer(this.player))
            return this.player.name;
        return this.player.nameTag;
    }
    /** 获取弓箭。 */
    getBow(giveArrow = true) {
        // 新增箭并移除金锭，并提示玩家
        lib.ItemUtils.inventory.set(this.player, this.role === MurderMysteryPlayerRole.Murderer ? 2 : 1, "minecraft:bow", {
            unbreakable: true,
            itemLock: minecraft.ItemLockMode.slot,
        });
        if (giveArrow)
            lib.ItemUtils.inventory.addSlot(this.player, 3, 1, "minecraft:arrow", {
                itemLock: minecraft.ItemLockMode.slot,
            });
    }
    // #region - 平民
    /** 平民拾取弓。 */
    pickupBow(bowEntity) {
        this.system.transformRole(this, MurderMysteryPlayerRole.Detective);
        if (isPlayer(this.player))
            this.player.sendMessage({ translate: "chat.bowPicked.picker" });
        // 获取弓
        if (isPlayer(this.player)) {
            lib.ItemUtils.removeItem(this.player, "minecraft:bow");
            lib.ItemUtils.removeItem(this.player, "minecraft:arrow");
        }
        this.getBow();
        // 通知其他玩家
        this.system.livingPlayers.allPlayers.forEach(playerData => {
            const player = playerData.player;
            if (player.id === this.player.id)
                return;
            if (isPlayer(player))
                player.sendMessage({ translate: "chat.bowPicked" });
        });
        // 为所有平民禁用定位器
        [...this.system.livingPlayers.innocent, ...this.system.livingPlayers.detective].forEach(innocent => innocent.removeLocator());
        // 移除弓实体
        bowEntity.remove();
    }
    // #endregion
    // #region - 侦探
    /** 侦探射箭。如果不为侦探则不会触发任何效果。 */
    shootArrow() {
        // 如果不是侦探，则终止运行
        if (this.role !== MurderMysteryPlayerRole.Detective)
            return;
        // 设置侦探的冷却时间
        this.startCharging(20 * this.system.settings.gaming.detectiveBowCooldown);
    }
    /** 掉落弓。
     * @param shouldAnnounce 是否对其他玩家公告弓已掉落。 | 默认值：`true`。
     * @param forceLocation 强制在某个位置生成弓。
     */
    dropBow(shouldAnnounce = true, forceLocation) {
        if (this.role !== MurderMysteryPlayerRole.Detective)
            return;
        // 如果是首位侦探，则标记为首位侦探已死亡
        if (this.isFirstDetective)
            this.system.firstDetectiveDied = true;
        // 对其它玩家公告
        if (shouldAnnounce) {
            const message = this.isFirstDetective ? "detectiveKilled" : "bowDropped";
            this.system.livingPlayers.allPlayers.forEach(playerData => {
                if (!isPlayer(playerData.player))
                    return;
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
        this.system.livingPlayers.innocent.forEach(innocent => {
            if (isPlayer(innocent.player))
                innocent.player.sendMessage({ translate: "chat.innocentGetLocator" });
            innocent.getLocator();
        });
    }
    // #endregion
    // #region - 杀手 & 杀手飞刀
    /** 给予杀手剑。 */
    getSword() {
        if (this.role !== MurderMysteryPlayerRole.Murderer)
            return;
        if (!isPlayer(this.player))
            return;
        lib.ItemUtils.inventory.set(this.player, 1, "murder_mystery:iron_sword", {
            unbreakable: true,
            itemLock: minecraft.ItemLockMode.slot,
        });
        lib.PlayerUtils.notify(this.player, {
            title: "§1",
            subtitle: { translate: "subtitle.murderGetSword.murder" },
            titleOptions: instantTitleDisplay,
        });
    }
    /** 杀手正在蓄力飞刀。 */
    throwingKnife() {
        // 【备注】别问为什么不用原版组件了 QAQ
        //        因为原版不能通过`minecraft:throwable`自动到时间射出，所以不使用`minecraft:throwable`
        //        又因为原版试图使用就会触发`minecraft:cooldown`，而不是使用完毕后触发，所以不使用`minecraft:cooldown`
        //        又因为原版使用逻辑是长按触发，而 Hypixel 是短按触发，再次短按取消触发，所以不使用`minecraft:use_modifier`
        //        老臣的命苦啊！我苦的就像是车轮底下的野草，我苦的就像是石头缝里的黄连啊！
        // ===== 条件筛选 =====
        // 如果该玩家不是杀手，终止运行
        if (this.role !== MurderMysteryPlayerRole.Murderer)
            return;
        // 如果该玩家仍处于冷却期，终止运行
        if (this.chargingTime > 0)
            return;
        // 如果该玩家在投掷期内再次使用，终止运行
        if (this.throwingTime !== 0)
            return;
        // ===== 变量准备 =====
        const murderer = this.player;
        let pitch = 0.7;
        const knifeThrowTime = this.system.settings.murdererSword.knifeThrowTime;
        const stopThrowing = (shouldSendMessage = true) => {
            // 终止主程序
            lib.gameSystem.unsubscribeTimelines(`${murderer.id}ThrowingKnife`);
            // 终止辅助检测程序
            lib.gameSystem.unsubscribeEvents(`${murderer.id}ChangeHand`, `${murderer.id}UseItemAgain`);
            // 提示玩家已终止投刀
            if (shouldSendMessage && isPlayer(murderer))
                murderer.sendMessage({ translate: "chat.murdererThrowingKnife.stopped" });
            // 令投掷时间归零
            this.throwingTime = 0;
        };
        // ===== 投刀逻辑 =====
        // 玩家投刀主程序，当玩家蓄力时间超过一定时间时则飞刀
        lib.gameSystem.subscribeTimeline(`${murderer.id}ThrowingKnife`, () => {
            // 计时
            this.throwingTime++;
            // 每 3 刻播放音效
            if (this.throwingTime % 3 === 0 && isPlayer(murderer)) {
                murderer.playSound("note.hat", { pitch });
                pitch += 0.1;
            }
            // 若时间已到，则扔刀，监听相关事件，并终止该事件监听和时间线监听
            if (this.throwingTime < knifeThrowTime)
                return;
            this.knifeHitTest(this.throwKnife());
            stopThrowing(false);
        });
        // 如果玩家换手，终止投刀
        lib.gameSystem.subscribeEvent(`${murderer.id}ChangeHand`, minecraft.world.afterEvents.playerHotbarSelectedSlotChange, event => {
            if (event.player.id !== murderer.id)
                return;
            stopThrowing();
        });
        // 如果玩家再次使用刀，终止投刀
        lib.gameSystem.subscribeEvent(`${murderer.id}UseItemAgain`, minecraft.world.afterEvents.itemUse, event => {
            if (event.itemStack.typeId !== "murder_mystery:iron_sword")
                return;
            if (event.source.id !== murderer.id)
                return;
            stopThrowing();
        });
    }
    /** 杀手飞出刀。返回飞出的刀的信息。
     * @returns 如果该玩家不是杀手，则不能飞刀，返回`undefined`。
     */
    throwKnife() {
        // 如果不是杀手，不能飞刀
        if (this.role !== MurderMysteryPlayerRole.Murderer)
            return;
        // 生成飞刀
        const knife = lib.EntityUtils.add("murder_mystery:iron_sword", this.player.getHeadLocation());
        const projectileComp = knife.getComponent("projectile");
        projectileComp.owner = this.player;
        projectileComp.shoot(lib.Vector3Utils.scale(this.player.getViewDirection(), this.system.settings.murdererSword.knifeSpeed), {
            uncertainty: 0,
        });
        // 播放飞刀音效
        if (isPlayer(this.player))
            this.player.playSound("mob.enderdragon.flap");
        // 令杀手进入冷却
        this.startCharging(20 * this.system.settings.murdererSword.knifeCooldown);
        this.throwingTime = 0;
        // 返回飞刀信息
        return knife;
    }
    /** 杀手飞刀击中测试。在杀手飞出刀后，检查飞刀击中了哪些物体，并予以响应。 */
    knifeHitTest(knife) {
        // ===== 条件筛选 =====
        // 如果该玩家不是杀手，终止运行
        if (this.role !== MurderMysteryPlayerRole.Murderer)
            return;
        // ===== 变量准备 =====
        const murderer = this.player;
        const stopTesting = () => {
            if (knife.isValid)
                knife.remove();
            lib.gameSystem.unsubscribeTimelines(`${knife.id}OutOfBorder`, `${knife.id}HitArrow`);
            lib.gameSystem.unsubscribeEvents(`${knife.id}HitPlayer`, `${knife.id}HitBlock`);
        };
        /** 是否为给定的刀。如果不是则返回 false。如果这把刀已无效，则还移除该实体。 */
        const isThisKnife = (testKnife) => {
            if (!testKnife.isValid)
                return false;
            if (testKnife.id !== knife.id)
                return false;
            return true;
        };
        const { from, to } = this.system.mapData.description.range;
        const gameArea = new minecraft.BlockVolume(from, to);
        // ===== 刀碰撞检测逻辑 =====
        // --- 击中玩家 ---
        lib.gameSystem.subscribeEvent(`${knife.id}HitPlayer`, minecraft.world.afterEvents.projectileHitEntity, event => {
            // ===== 条件筛选 =====
            // 如果不是给定的刀，终止运行
            if (!isThisKnife(event.projectile))
                return;
            // ===== 变量准备 =====
            // 如果不是平民或侦探，终止运行，其中击中杀手直接终止全部事件
            const hitPlayer = event.getEntityHit().entity;
            if (!hitPlayer)
                return;
            const hitPlayerData = this.system.getPlayer(hitPlayer);
            if (!hitPlayerData)
                return;
            const hitPlayerRole = hitPlayerData.role;
            if (hitPlayerRole === MurderMysteryPlayerRole.Murderer)
                return stopTesting();
            if (hitPlayerRole === MurderMysteryPlayerRole.Spectator)
                return;
            // ===== 处死玩家 =====
            const distance = lib.Vector3Utils.distance(murderer.location, hitPlayer.location);
            hitPlayerData.setDead(gameData.MurderMysteryDeathType.MurdererKnife, this, distance);
            if (isPlayer(murderer)) {
                murderer.sendMessage({ translate: "chat.knifeKilledPlayer", with: [distance.toFixed(2)] });
            }
            stopTesting();
        });
        // --- 击中方块 ---
        lib.gameSystem.subscribeEvent(`${knife.id}HitBlock`, minecraft.world.afterEvents.projectileHitBlock, event => {
            // ===== 条件筛选 =====
            // 如果不是给定的刀，终止运行
            if (!isThisKnife(event.projectile))
                return;
            // ===== 变量准备 =====
            const block = event.getBlockHit().block;
            const blockId = block.typeId;
            const blockLocation = lib.Vector3Utils.add(block.location, 0.5, 0, 0.5);
            // ===== 击中玻璃板 =====
            // 允许飞刀穿过，并播放裂纹动画。
            if (blockId.includes("glass_pane")) {
                // 播放破碎音效
                lib.PlayerUtils.getNearby(blockLocation, 15).forEach(player => player.playSound("random.glass"));
                // 东西方向有方块连接时生成裂纹动画实体（旋转 90°）
                if (block.east()?.typeId !== "minecraft:air" && block.west()?.typeId !== "minecraft:air")
                    lib.EntityUtils.add("murder_mystery:glass_pane_crack", blockLocation, block.dimension, { initialRotation: 90 });
                // 南北方向有方块连接时生成裂纹动画实体
                if (block.south()?.typeId !== "minecraft:air" && block.north()?.typeId !== "minecraft:air")
                    lib.EntityUtils.add("murder_mystery:glass_pane_crack", blockLocation);
                return;
            }
            // ===== 击中屏障 =====
            // 允许飞刀穿过。
            if (block.typeId === "minecraft:barrier")
                return;
            // ===== 击中其他方块 =====
            // 移除飞刀并终止运行。
            stopTesting();
        });
        // --- 击中箭 ---
        lib.gameSystem.subscribeTimeline(`${knife.id}HitArrow`, () => {
            // ===== 条件筛选 =====
            // 如果刀无效，终止运行
            if (!knife.isValid)
                return stopTesting();
            // ===== 变量准备 =====
            const location = knife.location;
            const dimension = knife.dimension;
            const knifeCollideArrowDistance = this.system.settings.murdererSword.knifeCollideArrowDistance;
            const arrowNearby = lib.EntityUtils.getNearby("minecraft:arrow", location, knifeCollideArrowDistance).filter(arrow => !MurderMysterySystem.getState(arrow, "murder_mystery:hit", false))[0];
            // ===== 刀箭相碰逻辑 =====
            // 若刀和未射中的箭相距规定范围内，则直接销毁刀和箭，播放粒子和音效，结束事件检查后终止运行
            if (!arrowNearby)
                return;
            arrowNearby.remove();
            knife.remove();
            lib.PlayerUtils.getNearby(location, 10).forEach(player => player.playSound("random.break", { pitch: 2 }));
            dimension.spawnParticle("murder_mystery:knife_arrow_collide", location);
            stopTesting();
        });
        // --- 飞刀出界 ---
        lib.gameSystem.subscribeTimeline(`${knife.id}OutOfBorder`, () => {
            // ===== 条件筛选 =====
            // 如果刀无效，终止运行
            if (!knife.isValid)
                return stopTesting();
            // ===== 检查是否出界 =====
            // 若出界则销毁实体并终止运行
            const { direction } = lib.Vector3Utils.getVolumeSector(knife.location, gameArea);
            if (!direction)
                return;
            stopTesting();
        }, 20);
    }
    // #endregion
    // #region - 旁观者
    /** 当玩家为死亡玩家时，对其他玩家发送消息。 */
    sendMessageToSpectators(message) {
        // 如果不是玩家，终止运行
        const player = this.player;
        if (!isPlayer(player))
            return;
        // 如果不是旁观者，终止运行
        if (!this.isDead)
            return player.sendMessage({ translate: "command.s.error.notASpectator" });
        // 对所有旁观者&死亡玩家发送消息
        this.system.players.allPlayers.forEach(spectatorData => {
            if (!spectatorData.isDead)
                return;
            if (!isPlayer(spectatorData.player))
                return;
            spectatorData.player.sendMessage({ translate: "command.s.success", with: [`${player.name}`, `${message}`] });
        });
    }
    // #endregion
    // #region - 特殊物品冷却
    /** 特殊物品（可用于侦探的弓、或杀手的飞刀）开始冷却，并自动注册对应时间线。 */
    startCharging(time) {
        this.chargingTime = time;
        // 注册填充时间线
        const timelineId = `${this.player.id}Charging`; // 这里注册的时间线 ID 和玩家的 ID 相关，以防多个冷却时间线任务冲突
        lib.gameSystem.subscribeTimeline(timelineId, () => {
            // 开始冷却
            this.chargingTime--;
            if (this.chargingTime > 0)
                return;
            // 冷却结束后，播放音效，侦探给箭，停止冷却并终止时间线
            if (isPlayer(this.player))
                this.player.playSound("note.hat");
            if (this.role === MurderMysteryPlayerRole.Detective)
                this.getBow();
            this.chargingTime = 0;
            return false;
        });
    }
    // #endregion
    // #region - 定位栏
    /** 使玩家获取定位器。 */
    getLocator() {
        lib.ItemUtils.inventory.set(this.player, 4, "murder_mystery:locator", {
            itemLock: minecraft.ItemLockMode.slot,
        });
        // 如果玩家此时恰好手持 5 号位，则显示定位栏
        if (isPlayer(this.player) && this.player.selectedSlotIndex === 4)
            this.showLocatorBar();
    }
    /** 移除玩家的定位器。 */
    removeLocator() {
        lib.ItemUtils.inventory.remove(this.player, 4);
        this.hideLocatorBar();
    }
    /** 为玩家显示定位栏。 */
    showLocatorBar() {
        // 若正在显示定位栏，则直接终止运行
        if (this.isShowingLocatorBar)
            return;
        // 如果不是玩家，则直接终止运行
        const player = this.player;
        if (!isPlayer(player))
            return;
        // 杀手的定位栏，定位到其他所有存活的玩家
        if (this.role === MurderMysteryPlayerRole.Murderer) {
            player.locatorBar.removeAllWaypoints();
            this.system.livingPlayers.allPlayers.forEach(playerData => {
                // 不注册自己的定位栏
                if (player.id === playerData.player.id)
                    return;
                // 如果是杀手，注册红色的定位栏
                const locatesMurderer = playerData.role === MurderMysteryPlayerRole.Murderer;
                const waypoint = new minecraft.EntityWaypoint(playerData.player, {
                    textureBoundsList: [
                        { texture: minecraft.WaypointTexture.Square, lowerBound: 0, upperBound: 25 },
                        { texture: minecraft.WaypointTexture.Circle, lowerBound: 25, upperBound: 50 },
                        { texture: minecraft.WaypointTexture.SmallSquare, lowerBound: 50, upperBound: 75 },
                        { texture: minecraft.WaypointTexture.SmallStar, lowerBound: 75 },
                    ],
                }, { showDead: false, showInvisible: true, showSneaking: true }, locatesMurderer ? { red: 1, green: 0, blue: 0 } : { red: 1, green: 1, blue: 1 });
                player.locatorBar.addWaypoint(waypoint);
            });
            this.isShowingLocatorBar = true;
            return;
        }
        // 平民的定位栏，定位到弓的位置
        if (this.role === MurderMysteryPlayerRole.Innocent) {
            const bow = lib.EntityUtils.getType("murder_mystery:item_bow")[0];
            if (!bow)
                return;
            const { dimension, location } = bow;
            const waypoint = new minecraft.LocationWaypoint({ dimension, ...location }, {
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
            }, { red: 0.333, green: 1, blue: 1 });
            player.locatorBar.removeAllWaypoints();
            player.locatorBar.addWaypoint(waypoint);
            this.isShowingLocatorBar = true;
            return;
        }
    }
    /** 为玩家隐藏定位栏。 */
    hideLocatorBar() {
        // 若未在显示定位栏，则直接终止运行
        if (!this.isShowingLocatorBar)
            return;
        // 如果不是玩家，则直接终止运行
        const player = this.player;
        if (!isPlayer(player))
            return;
        // 隐藏定位栏
        player.locatorBar.removeAllWaypoints();
        this.isShowingLocatorBar = false;
    }
    // #endregion
    // #region - 事件冷却
    /** 事件冷却列表。触发了特定事件后可能会导致特定类型的事件冷却，在冷却期内可指定为无法再次触发事件。冷却单位：秒。 */
    eventCooldown = {};
    /** 对玩家设置事件冷却状态。 */
    setEventCooldown(type, duration) {
        // 设置冷却
        this.eventCooldown[type] = duration;
        // 注册每秒 -1 的冷却时间线
        lib.gameSystem.subscribeTimeline(`${this.player.id}${type}EventCooldown`, () => {
            const currentDuration = this.eventCooldown[type] ?? 0;
            if (currentDuration <= 1)
                delete this.eventCooldown[type];
            else
                this.eventCooldown[type] = currentDuration - 1;
        }, 20);
    }
    /** 返回玩家是否处于某个事件的冷却状态中。 */
    getEventCooldownCountdown(type, itemName) {
        const countdown = this.eventCooldown[type] ?? 0;
        if (countdown > 0 && isPlayer(this.player) && itemName)
            this.player.sendMessage({
                translate: "chat.cooldown",
                with: { rawtext: [{ translate: itemName }, { text: `${countdown}` }] },
            });
        return countdown;
    }
    // #endregion
    // #region - 设置物品
    /** 检查是否能给予玩家物品。 */
    canGiveItem(maxItemCount = 3) {
        // ===== 变量准备 =====
        const player = this.player;
        const playerContainer = player.getComponent("inventory")?.container;
        const itemInSlot0 = playerContainer?.getItem(0);
        const itemInSlot5 = playerContainer?.getItem(5);
        const itemInSlot7 = playerContainer?.getItem(7);
        /** 当前已有的物品数。 */
        let currentItemCount = 0;
        if (itemInSlot0)
            currentItemCount++;
        if (itemInSlot5)
            currentItemCount++;
        if (itemInSlot7)
            currentItemCount++;
        // ===== 检查玩家的背包是否已满 =====
        if (currentItemCount >= maxItemCount) {
            if (isPlayer(player))
                lib.PlayerUtils.notify(player, { message: { translate: "chat.inventoryFull" }, sound: "random.anvil_land" });
            return false;
        }
        return true;
    }
    /** 获取该玩家下一次将要放置物品的槽位。 */
    getNextItemSlot() {
        // ===== 变量准备 =====
        const player = this.player;
        const playerContainer = player.getComponent("inventory")?.container;
        const itemInSlot5 = playerContainer?.getItem(5);
        const itemInSlot7 = playerContainer?.getItem(7);
        /** 将要替换的槽位。替换槽位的顺序为 5 号位 -> 7 号位 -> 0 号位。 */
        let replaceSlot = 0;
        if (!itemInSlot5)
            replaceSlot = 5;
        else if (!itemInSlot7)
            replaceSlot = 7;
        return replaceSlot;
    }
    /** 给予玩家物品。
     * @remarks 请提前使用`canGiveItem()`方法判断是否应该给予玩家物品。
     */
    giveItem(itemId, options) {
        lib.ItemUtils.inventory.set(this.player, this.getNextItemSlot(), itemId, options);
    }
    // #endregion
    // #region - 特殊地图属性
    /** 神秘药水的解锁情况。 */
    mysteryPotionUnlocked = [false, false, false, false, false];
    /** 是否在鬼屋门内。 */
    isInHauntedHouseDoor = false;
    /** 是否正在乘坐矿车。 */
    isRidingMinecart = false;
}
// #endregion
// #region 创建系统实例
// 如果在 murder_mystery:nextMap 动态属性中指定了一张地图，或该属性不存在时，那么就立刻终止当前地图的运行，并新建一个新系统进行初始化
// 在初始化后，这个属性会变为 false，代表不生成地图
// 这个进程应该始终存在，不能受到各类 unsubscribe 的影响
minecraft.world.afterEvents.worldLoad.subscribe(() => {
    minecraft.world.setDynamicProperty("murder_mystery:nextMap"); // 进入地图时，随机生成一张地图
    minecraft.system.runInterval(() => {
        // ===== 条件判断 =====
        /** 下一张地图的名称，若为`false`则终止运行，若为`undefined`则为随机生成地图。 */
        const nextMapName = minecraft.world.getDynamicProperty("murder_mystery:nextMap");
        if (nextMapName === false)
            return;
        // ===== 创建新系统 =====
        // 立刻终止一切当前系统的进程
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        lib.gameSystem.unsubscribeAllDelays();
        // 清除已记载的新建地图
        minecraft.world.setDynamicProperty("murder_mystery:nextMap", false);
        // 获取地图数据
        let nextMap = MurderMysterySystem.getMapData(nextMapName);
        // 尝试添加常加载区域，如果没有成功加载则随机重置地图
        const { from, to } = nextMap.description.range;
        lib.TickingAreaUtils.remove("gamingArea");
        const tickingArea = lib.TickingAreaUtils.add("gamingArea", from, to);
        if (!tickingArea) {
            lib.PlayerUtils.broadcast({
                message: { translate: "chat.error.areaToLarge", with: { rawtext: [{ translate: `map.${nextMap.description.id}` }] } },
                sound: "random.anvil_land",
            });
            minecraft.world.setDynamicProperty("murder_mystery:nextMap");
            return;
        }
        // 在常加载区域加载完成后创立系统
        tickingArea.then(() => new MurderMysterySystem(nextMap));
    }, 20);
    lib.gameSystem.showDebugMessage = false;
});
// 创建一条新命令 /s <message>，使旁观者在旁观者频道发言
minecraft.system.beforeEvents.startup.subscribe(event => {
    event.customCommandRegistry.registerCommand({
        name: "murder_mystery:s",
        description: "在旁观者频道发言。",
        permissionLevel: minecraft.CommandPermissionLevel.Any,
    }, (origin, message) => {
        // 如果不是玩家执行，则报错
        const notAPlayerError = {
            message: "执行者必须为玩家",
            status: minecraft.CustomCommandStatus.Failure,
        };
        const player = origin.sourceEntity;
        if (!player)
            return notAPlayerError;
        if (!isPlayer(player))
            return notAPlayerError;
        // 令玩家发送脚本消息
        minecraft.system.run(() => player.runCommand(`scriptevent murder_mystery:sendSpectatorMessage ${message}`));
    });
});
// #endregion
