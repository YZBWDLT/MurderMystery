// *-*-*-*-*-*-* 库函数 *-*-*-*-*-*-*
// 实现原版相关功能，并在其他文件中调用。

// #region 导入部分

import * as minecraft from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

// #endregion
// #region 系统

/** 游戏原生的 XXXEventSignal。 */
type GameEventSignal = { subscribe: (...args: any) => (callback: any) => void; unsubscribe: (callback: any) => void };

/** 从 EventSignal 获取对应 Event。 */
type gameEvent<S> = S extends { subscribe: (callback: (arg0: infer E) => void) => void } ? E : never; // S = EventSignal, E = Event

/** 从 EventSignal 获取对应 Options。 */
type gameEventOptions<S> = S extends { subscribe: (callback: any, options: infer O) => void } ? O : undefined; // S = EventSignal, O = EventOptions

/** 代表一个游戏系统，负责订阅或取消订阅一个事件或时间线。 */
class GameSystem {
    constructor() {}

    /** 所有时间线对应的数字 ID。 */
    private readonly gameTimeline: Record<string, number> = {};

    /** 所有延迟对应的数字 ID。 */
    private readonly gameDelay: Record<string, number> = {};

    /** 所有事件对应的 EventSignal 和 gameEventCallback 函数。 */
    private readonly gameEvent: Record<
        string,
        { gameEventSignal: GameEventSignal; gameEventCallback: (callback: any) => void }
    > = {};

    /** 是否显示调试信息，若显示则在注册时间线或事件时显示。 */
    showDebugMessage = false;

    // ===== 时间线管理器 =====

    /** 订阅特定 ID 的时间线。
     * @param callback 若为 false 则终止时间线的运行
     * @returns 返回是否成功订阅时间线。
     */
    subscribeTimeline(id: string, callback: () => boolean | void, interval = 1) {
        // 检查时间线是否重叠，若存在重叠则阻止运行
        if (this.getAllTimelineIds().includes(id)) return false;
        // 订阅时间线，并记录到时间线列表中，同时追踪该时间线
        const numberId = minecraft.system.runInterval(() => {
            const shouldExist = callback();
            if (shouldExist === false) this.unsubscribeTimeline(id);
        }, interval);
        this.gameTimeline[id] = numberId;
        if (this.showDebugMessage) minecraft.world.sendMessage(`§a+ 时间线 ${id}`);
        return true;
    }

    /** 取消订阅特定 ID 的时间线。
     * @returns 返回是否成功取消订阅时间线。
     */
    unsubscribeTimeline(id: string) {
        // 检查时间线是否存在，若不存在则终止运行
        const numberId = this.gameTimeline[id];
        if (!numberId) return false;
        // 取消时间线
        minecraft.system.clearRun(numberId);
        delete this.gameTimeline[id];
        if (this.showDebugMessage) minecraft.world.sendMessage(`§c- 时间线 ${id}`);
        return true;
    }

    /** 获取所有时间线的 ID。 */
    getAllTimelineIds() {
        return Object.keys(this.gameTimeline);
    }

    /** 取消订阅所有时间线。 */
    unsubscribeAllTimelines() {
        this.getAllTimelineIds().forEach(timelineId => this.unsubscribeTimeline(timelineId));
    }

    // ===== 延迟管理器 =====

    /** 订阅特定 ID 的延迟。
     * @param callback 若为 false 则终止延迟的运行
     * @returns 返回是否成功订阅延迟。
     */
    subscribeDelay(id: string, callback: () => boolean | void, tickDelay = 1) {
        // 检查延迟是否重叠，若存在重叠则阻止运行
        if (this.getAllDelayIds().includes(id)) return false;
        // 订阅延迟，并记录到延迟列表中，同时追踪该延迟
        const numberId = minecraft.system.runTimeout(() => {
            const shouldExist = callback();
            if (shouldExist === false) this.unsubscribeDelay(id);
        }, tickDelay);
        this.gameDelay[id] = numberId;
        if (this.showDebugMessage) minecraft.world.sendMessage(`§a+ 延迟 ${id}`);
        return true;
    }

    /** 取消订阅特定 ID 的延迟。
     * @returns 返回是否成功取消订阅延迟。
     */
    unsubscribeDelay(id: string) {
        // 检查延迟是否存在，若不存在则终止运行
        const numberId = this.gameDelay[id];
        if (!numberId) return false;
        // 取消延迟
        minecraft.system.clearRun(numberId);
        delete this.gameDelay[id];
        if (this.showDebugMessage) minecraft.world.sendMessage(`§c- 延迟 ${id}`);
        return true;
    }

    /** 获取所有延迟的 ID。 */
    getAllDelayIds() {
        return Object.keys(this.gameDelay);
    }

    /** 取消订阅所有延迟。 */
    unsubscribeAllDelays() {
        this.getAllDelayIds().forEach(delayId => this.unsubscribeDelay(delayId));
    }

    // ===== 事件管理器 =====

    /** 订阅特定 ID 的游戏事件。
     * @param callback 若为 false 则终止事件的运行。
     * @returns 返回是否成功添加事件。
     */
    subscribeEvent<S extends GameEventSignal>(
        id: string,
        event: S,
        callback: (arg0: gameEvent<S>) => void | boolean,
        options?: gameEventOptions<S>
    ) {
        // 检查事件是否重叠，若存在重叠则阻止运行
        if (this.getAllEventIds().includes(id)) return false;
        // 添加事件，并记录到事件列表中，同时追踪该事件
        /** 实际在subscribe函数内执行的回调函数 */
        const subscribeCallback = (event: any) => {
            const shouldExist = callback(event);
            if (shouldExist === false) this.unsubscribeEvent(id);
        };
        /** 游戏返回的回调函数，用于unsubscribe */
        const eventCallback = options
            ? event.subscribe(subscribeCallback, options)
            : event.subscribe(subscribeCallback);
        this.gameEvent[id] = { gameEventSignal: event, gameEventCallback: eventCallback };
        if (this.showDebugMessage) minecraft.world.sendMessage(`§a+ 事件 ${id}`);

        return true;
    }

    /** 取消订阅游戏事件、
     * @returns 返回是否成功取消订阅事件。
     */
    unsubscribeEvent(id: string) {
        // 检查事件是否存在，若不存在则终止运行
        const event = this.gameEvent[id];
        if (!event) return false;
        // 取消事件
        event.gameEventSignal.unsubscribe(event.gameEventCallback);
        delete this.gameEvent[id];
        if (this.showDebugMessage) minecraft.world.sendMessage(`§c- 事件 ${id}`);
        return true;
    }

    /** 获取所有事件 ID。 */
    getAllEventIds() {
        return Object.keys(this.gameEvent);
    }

    /** 取消订阅所有事件。 */
    unsubscribeAllEvents() {
        this.getAllEventIds().forEach(eventId => this.unsubscribeEvent(eventId));
    }
}
export const gameSystem = new GameSystem();

// #endregion
// #region 结构

/** 结构操作工具。 */
export class StructureUtils {
    /** 放置结构（支持异步）。 */
    static placeAsync(
        structure: string,
        dimensionId: string,
        location: minecraft.Vector3,
        options: minecraft.StructurePlaceOptions
    ) {
        minecraft.world.structureManager.place(structure, minecraft.world.getDimension(dimensionId), location, options);
        let animationSeconds = options?.animationSeconds ? options.animationSeconds : 0;
        return minecraft.system.waitTicks(animationSeconds * 20);
    }

    /** 创建特定 ID 的结构。 */
    static add(
        structureId: string,
        dimension: string | minecraft.Dimension,
        from: minecraft.Vector3,
        to: minecraft.Vector3,
        options?: minecraft.StructureCreateOptions
    ) {
        return minecraft.world.structureManager.createFromWorld(
            structureId,
            DimensionUtils.getDefault(dimension),
            from,
            to,
            options
        );
    }

    /** 获取特定 ID 的结构。
     * @param structureId 结构 ID，需包含命名空间。
     */
    static get(structureId: string) {
        return minecraft.world.structureManager.get(structureId);
    }

    /** 获取所有结构 ID。 */
    static getAll() {
        return minecraft.world.structureManager.getWorldStructureIds();
    }

    /** 移除特定 ID 的结构。
     * @param structureId 结构 ID，包含命名空间
     */
    static remove(structureId: string) {
        let executed = true;
        try {
            minecraft.world.structureManager.delete(structureId);
        } catch {
            executed = false;
        }
        return executed;
    }

    /** 移除所有结构。 */
    static removeAll() {
        this.getAll().forEach(id => this.remove(id));
    }
}

// #endregion
// #region 常加载区域
export class TickingAreaUtils {
    /** 添加特定 ID 的常加载区域。
     * @returns 若常加载区域已添加，则返回`undefined`。
     */
    static add(id: string, from: minecraft.Vector3, to: minecraft.Vector3, dimension?: string | minecraft.Dimension) {
        try {
            return minecraft.world.tickingAreaManager.createTickingArea(id, {
                from,
                to,
                dimension: DimensionUtils.getDefault(dimension),
            });
        } catch {
            return;
        }
    }

    /** 获取特定 ID 的常加载区域。 */
    static get(id: string) {
        return minecraft.world.tickingAreaManager.getTickingArea(id);
    }

    /** 移除特定 ID 的常加载区域。
     * @returns 返回是否成功移除常加载区域。
     */
    static remove(id: string) {
        try {
            minecraft.world.tickingAreaManager.removeTickingArea(id);
            return true;
        } catch {
            return false;
        }
    }
}

// #endregion
// #region 记分板

/** 记分板的记分项操作工具。 */
class ScoreboardObjectiveUtils {
    /** 添加特定 ID 的记分项。 */
    static add(id: string, displayName?: string) {
        return this.get(id) ?? minecraft.world.scoreboard.addObjective(id, displayName);
    }

    /** 获取特定 ID 的记分项。 */
    static get(id: string) {
        return minecraft.world.scoreboard.getObjective(id);
    }

    /** 获取所有记分项。 */
    static getAll() {
        return minecraft.world.scoreboard.getObjectives();
    }

    /** 移除特定 ID 的记分项。
     * @returns 返回是否成功执行。
     */
    static remove(id: minecraft.ScoreboardObjective | string) {
        try {
            minecraft.world.scoreboard.removeObjective(id);
            return true;
        } catch {
            return false;
        }
    }

    /** 移除所有记分项。 */
    static removeAll() {
        this.getAll().forEach(obj => this.remove(obj));
    }

    /** 在特定位置显示特定 ID 的记分项。
     * @returns 返回上一个在该位置显示的记分项数据。
     */
    static display(
        displaySlot: minecraft.DisplaySlotId,
        id: string,
        order: minecraft.ObjectiveSortOrder = minecraft.ObjectiveSortOrder.Descending
    ) {
        const objective = this.get(id);
        /** 上一个记分项 */
        let lastObjective = minecraft.world.scoreboard.getObjectiveAtDisplaySlot(displaySlot)?.objective;
        // 当待显示的记分项为无效记分项时，直接返回上一个记分项的信息
        if (!objective) return lastObjective;
        // 尝试显示新记分项，如果报错则返回上一个记分项
        return minecraft.world.scoreboard.setObjectiveAtDisplaySlot(displaySlot, {
            objective: objective,
            sortOrder: order,
        });
    }

    /** 添加特定 ID 的记分项，并在特定位置显示该记分项。
     * @returns 返回该记分项和上一个在该位置显示的记分项数据。
     */
    static addThenDisplay(
        id: string,
        displaySlot: minecraft.DisplaySlotId,
        displayName?: string,
        order: minecraft.ObjectiveSortOrder = minecraft.ObjectiveSortOrder.Descending
    ) {
        let newObjective = this.add(id, displayName);
        let lastDisplayed = this.display(displaySlot, id, order);
        return { newObjective, lastDisplayed };
    }

    /** 隐藏特定显示位置的记分项。
     * @returns 返回上一个在该位置显示的记分项数据。
     */
    static hide(displaySlot: minecraft.DisplaySlotId) {
        return minecraft.world.scoreboard.clearObjectiveAtDisplaySlot(displaySlot);
    }
}

/** 记分板的玩家操作工具 */
class ScoreboardPlayerUtils {
    /** 为特定的追踪对象添加分数。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static add(
        objectiveId: string,
        participant: minecraft.Entity | minecraft.ScoreboardIdentity | string,
        score: number
    ) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective) return;
        return objective.addScore(participant, score);
    }

    /** 为追踪对象设置分数。
     * @param score 设置为 boolean 时，false = 0 分，true = 1 分。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static set(
        objectiveId: string,
        participant: minecraft.Entity | minecraft.ScoreboardIdentity | string,
        score: number | boolean
    ) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective) return;
        if (typeof score === "boolean") score = score ? 1 : 0;
        objective.setScore(participant, score);
        return score;
    }

    /** 获取追踪对象的分数。
     * @returns 如果指定的记分项不存在，或指定的对象未在追踪状态，则返回 undefined。
     */
    static get(objectiveId: string, participant: minecraft.Entity | minecraft.ScoreboardIdentity | string) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective) return;
        try {
            return objective.getScore(participant);
        } catch {
            return;
        }
    }

    /** 获取正在追踪特定追踪对象的所有记分项。 */
    static getObjective(participantName: string) {
        return ScoreboardObjectiveUtils.getAll().filter(obj =>
            obj.getScores().some(info => info.participant.displayName === participantName)
        );
    }

    /** 获取分数，若获取不到则设置为默认值。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static getOrSetDefault(
        objectiveId: string,
        participant: minecraft.Entity | minecraft.ScoreboardIdentity | string,
        defaultScore: number
    ) {
        return this.get(objectiveId, participant) ?? this.set(objectiveId, participant, defaultScore);
    }

    /** 移除追踪对象的分数。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static remove(objectiveId: string, participant: minecraft.Entity | minecraft.ScoreboardIdentity | string) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective) return;
        return objective.removeParticipant(participant);
    }

    /** 获取拥有特定分数的追踪对象。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static getPlayerWithScore(objectiveId: string, score: number) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective) return;
        return objective.getParticipants().filter(player => this.get(objectiveId, player) === score);
    }

    /** 获取已离线的玩家。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static getOfflinePlayers(objectiveId: string) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective) return;
        return objective.getParticipants().filter(player => {
            if (player.type !== "Player") {
                return false;
            } else {
                try {
                    player.getEntity();
                } catch {
                    return true;
                }
                return false;
            }
        });
    }
}

/** 记分板操作工具。 */
export class ScoreboardUtils {
    /** 记分板的记分项操作工具。 */
    static objective = ScoreboardObjectiveUtils;

    /** 记分板的追踪对象操作工具。 */
    static player = ScoreboardPlayerUtils;
}

// #endregion
// #region 维度

/** 维度操作工具。 */
export class DimensionUtils {
    /** 获取维度信息。
     * @returns 若指定的维度不存在，返回 undefined。
     */
    static get(dimension: string | minecraft.Dimension) {
        if (typeof dimension === "string") {
            try {
                return minecraft.world.getDimension(dimension);
            } catch {
                return void 0;
            }
        } else return dimension;
    }

    /** 获取存在默认值的维度信息。
     * @param dimension 若未给定维度信息，或给定的维度 ID 无效，则返回主世界的维度。
     */
    static getDefault(dimension?: string | minecraft.Dimension): minecraft.Dimension {
        const overworld = this.get("overworld") as minecraft.Dimension;
        if (!dimension) return overworld;
        return this.get(dimension) ?? overworld;
    }

    /** 获取主世界。 */
    static getOverworld(): minecraft.Dimension {
        return minecraft.world.getDimension("overworld");
    }

    /** 将一个大区域分割成多个小的子区域。
     * @param maxCapacity 每个子区域允许的最大体积。 | 默认值：32768。
     */
    static divideVolume(volume: minecraft.BlockVolume, maxCapacity = 32768) {
        // 如果区域容量小于最大容量，直接返回该区域
        const volumeCapacity = volume.getCapacity();
        if (volumeCapacity <= maxCapacity) return [volume];

        // 【整体思路】
        // 1. 先对 *最长轴* 按 *非最长轴的截面积* 均分，得到最长轴上的 *子区域高度*。这个高度至少为 1。
        // 2. 通过最长轴高度和子区域高度得到应拆分的 *子区域数量*。
        // 3. 对第 n 个子区域，在非最长轴上的坐标直接使用最小值和最大值，
        //    而在最长轴上的坐标分别使用 (min+子区域高度*(n-1))~(min+子区域高度*(n-1)+(子区域高度-1))，
        //    即 (min+子区域高度*(n-1))~(min+子区域高度*n-1)。
        //    考虑到通常是使用索引，对索引为 i 的子区域的坐标分别使用(min+子区域高度*i)~(min+子区域高度*(i+1)-1)
        //    特别地，考虑到最后一个子区域的高度可能不足，坐标应使用 (min+子区域高度*(n-1))~max。
        // 4. 如果每个子区域的容量仍然大于最大容量（这可能是由于截面积过大引起的），则应做递归处理。

        // --- 获取基础信息 ---
        const { x: minX, y: minY, z: minZ } = volume.getMin();
        const { x: maxX, y: maxY, z: maxZ } = volume.getMax();
        const { x: lengthX, y: lengthY, z: lengthZ } = volume.getSpan();
        type AxisInfo = {
            /** 在该轴上的方块长度。 */ length: number;
            /** 在该轴上的坐标最小值。 */ min: number;
            /** 在该轴上的坐标最大值。 */ max: number;
        };
        type Axes = "x" | "y" | "z";
        const axisInfo: Record<Axes, AxisInfo> = {
            x: { length: lengthX, min: minX, max: maxX },
            y: { length: lengthY, min: minY, max: maxY },
            z: { length: lengthZ, min: minZ, max: maxZ },
        };
        /** 最长轴 */
        const longestAxis = Object.keys(axisInfo).sort(
            (axis1, axis2) => axisInfo[axis2 as Axes].length - axisInfo[axis1 as Axes].length
        )[0] as Axes;
        const longestAxisInfo = axisInfo[longestAxis];
        /** 非最长轴的截面积 */
        const subVolumeArea = {
            x: lengthY * lengthZ,
            y: lengthZ * lengthX,
            z: lengthX * lengthY,
        }[longestAxis];
        /** 子区域高度 */
        const subVolumeHeight = Math.max(Math.floor(maxCapacity / subVolumeArea), 1);
        /** 子区域数量 */
        const subVolumeAmount = Math.ceil(longestAxisInfo.length / subVolumeHeight);

        // --- 拆分区域（参见【整体思路】第 3 步） ---
        /** 所有子区域 */
        const subVolumes: minecraft.BlockVolume[] = [];
        for (let i = 0; i < subVolumeAmount; i++) {
            const thisVolumeLongestAxisMin = longestAxisInfo.min + subVolumeHeight * i;
            const thisVolumeLongestAxisMax = Math.min(
                longestAxisInfo.min + subVolumeHeight * (i + 1) - 1,
                longestAxisInfo.max
            );

            const thisVolumeFrom: minecraft.Vector3 = { ...volume.from };
            thisVolumeFrom[longestAxis] = thisVolumeLongestAxisMin;

            const thisVolumeTo: minecraft.Vector3 = { ...volume.to };
            thisVolumeTo[longestAxis] = thisVolumeLongestAxisMax;

            const thisVolume = new minecraft.BlockVolume(thisVolumeFrom, thisVolumeTo);
            subVolumes.push(...this.divideVolume(thisVolume));
        }
        return subVolumes;
    }

    /** 镂空一个大区域。 */
    static hollowVolume(volume: minecraft.BlockVolume) {
        const { x: minX, y: minY, z: minZ } = volume.getMin();
        const { x: maxX, y: maxY, z: maxZ } = volume.getMax();

        const hollowedVolume = new minecraft.BlockVolume(
            { x: minX + 1, y: minY + 1, z: minZ + 1 },
            { x: maxX - 1, y: maxY - 1, z: maxZ - 1 }
        );
        const borderVolume = [
            new minecraft.BlockVolume({ x: minX, y: minY, z: minZ }, { x: minX, y: maxY, z: maxZ }),
            new minecraft.BlockVolume({ x: minX, y: minY, z: minZ }, { x: maxX, y: minY, z: maxZ }),
            new minecraft.BlockVolume({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: minZ }),
            new minecraft.BlockVolume({ x: maxX, y: maxY, z: maxZ }, { x: maxX, y: minY, z: minZ }),
            new minecraft.BlockVolume({ x: maxX, y: maxY, z: maxZ }, { x: minX, y: maxY, z: minZ }),
            new minecraft.BlockVolume({ x: maxX, y: maxY, z: maxZ }, { x: minX, y: minY, z: maxZ }),
        ];
        return {
            /** 边界区域，由该区域的六面组成。 */
            borderVolume,
            /** 被镂空的区域。 */
            hollowedVolume,
        };
    }

    /** 获取一个区域内的所有位置。 */
    static getLocationsFromVolume(volume: minecraft.BlockVolumeBase) {
        const iterator = volume.getBlockLocationIterator();
        const locations: minecraft.Vector3[] = [];
        while (true) {
            const { value: location, done } = iterator.next() as {
                value: minecraft.Vector3 | undefined;
                done: boolean;
            };
            if (done) break;
            if (!location) continue;
            locations.push(location);
        }
        return locations;
    }
}

// #endregion
// #region 方块

/** 方块操作工具。 */
export class BlockUtils {
    /** 获取某个位置的方块。
     * @returns 当试图获取未加载区块时，返回 undefined。
     */
    static get(location: minecraft.Vector3, dimension?: string | minecraft.Dimension) {
        return DimensionUtils.getDefault(dimension).getBlock(location);
    }

    /** 在两个坐标间填充方块。 */
    static fill(
        dimension: string | minecraft.Dimension,
        from: minecraft.Vector3,
        to: minecraft.Vector3,
        blockId: string,
        options?: minecraft.BlockFillOptions,
        states?: { name: string; value?: number | boolean | string }[]
    ) {
        const volumes: minecraft.ListBlockVolume[] = [];
        DimensionUtils.divideVolume(new minecraft.BlockVolume(from, to)).forEach(volume =>
            volumes.push(DimensionUtils.getDefault(dimension).fillBlocks(volume, blockId, options))
        );
        if (states) {
            volumes
                .flatMap(volume => DimensionUtils.getLocationsFromVolume(volume))
                .forEach(location => {
                    const block = DimensionUtils.getOverworld().getBlock(location);
                    if (!block) return;
                    let permutation = block.permutation;
                    // @ts-ignore
                    states.forEach(({ name, value }) => (permutation = permutation.withState(name, value)));
                    block.setPermutation(permutation);
                });
        }

        return volumes;
    }

    /** 在两个坐标间以镂空的形式填充方块。 */
    static fillHollow(
        dimension: string | minecraft.Dimension,
        from: minecraft.Vector3,
        to: minecraft.Vector3,
        blockId: string
    ) {
        const volumeInfo = DimensionUtils.hollowVolume(new minecraft.BlockVolume(from, to));
        this.fill(dimension, volumeInfo.hollowedVolume.from, volumeInfo.hollowedVolume.to, "minecraft:air");
        volumeInfo.borderVolume.forEach(volume => {
            this.fill(dimension, volume.from, volume.to, blockId);
        });
    }

    /** 在某个位置放置方块。
     * @throws 当试图在未加载区块放置方块时会报错。
     */
    static set(dimension: string | minecraft.Dimension, location: minecraft.Vector3, blockId: string) {
        DimensionUtils.getDefault(dimension).setBlockType(location, blockId);
        return this.get(location, dimension);
    }

    /** 获取和方块交互后，实际放置的方块位置。
     * @description 专门适用于 interactWithBlock 的前事件和后事件。
     */
    static getPlaceLocation(
        event: minecraft.PlayerInteractWithBlockAfterEvent | minecraft.PlayerInteractWithBlockBeforeEvent
    ) {
        const { block, blockFace } = event;
        const location = block.location;
        const placeLocation: Record<minecraft.Direction, minecraft.Vector3> = {
            Up: Vector3Utils.up(location),
            Down: Vector3Utils.down(location),
            North: Vector3Utils.north(location),
            South: Vector3Utils.south(location),
            West: Vector3Utils.west(location),
            East: Vector3Utils.east(location),
        };
        return placeLocation[blockFace];
    }
}

// #endregion
// #region 坐标

/** 代表一个坐标与一个区域相对位置的关系。 */
type VolumeSector = {
    /** 是否超出这个区域。如果超出，代表超出的方位。 */
    direction?: minecraft.Direction;
    /** 超出区域的距离。若未超出则为 0。 */
    distance: number;
};

/** Vector2 的操作方法 */
export class Vector2Utils {
    /** 返回两个坐标是否相同。 */
    static isEqual(location1: minecraft.Vector2, location2: minecraft.Vector2) {
        return location1.x === location2.x && location1.y === location2.y;
    }
}

/** Vector3 的操作方法 */
export class Vector3Utils {
    /** 返回复制后的坐标。 */
    static copy(location: minecraft.Vector3): minecraft.Vector3 {
        return { x: location.x, y: location.y, z: location.z };
    }

    /** 将某个轴的坐标添加某个特定的值。 */
    static add(location: minecraft.Vector3, xAdder = 0, yAdder = 0, zAdder = 0): minecraft.Vector3 {
        return { x: location.x + xAdder, y: location.y + yAdder, z: location.z + zAdder };
    }

    /** 返回将输入坐标中心化的坐标。 */
    static center(location: minecraft.Vector3) {
        return this.add(location, 0.5, 0.5, 0.5);
    }

    /** 返回两个坐标是否相同。 */
    static isEqual(location1: minecraft.Vector3, location2: minecraft.Vector3) {
        return location1.x === location2.x && location1.y === location2.y && location1.z === location2.z;
    }

    /** 检查在多个坐标下是否存在特定的坐标。 */
    static hasPosition(locationList: minecraft.Vector3[], testLocation: minecraft.Vector3) {
        return locationList.some(position => this.isEqual(testLocation, position));
    }

    /** 返回两个坐标之间的距离。
     * @param squared 是否返回模长的平方值以避免运算根号。| 默认值：`false`
     */
    static distance(location1: minecraft.Vector3, location2: minecraft.Vector3, squared = false) {
        const { x: x1, y: y1, z: z1 } = location1;
        const { x: x2, y: y2, z: z2 } = location2;
        return this.magnitude({ x: x2 - x1, y: y2 - y1, z: z2 - z1 }, squared);
    }

    /** 返回向量模长。
     * @param squared 是否返回模长的平方值以避免运算根号。| 默认值：`false`
     */
    static magnitude(location: minecraft.Vector3, squared = false) {
        const lengthSquared = location.x ** 2 + location.y ** 2 + location.z ** 2;
        if (squared) return lengthSquared;
        return Math.sqrt(lengthSquared);
    }

    /** 返回归一化的向量。 */
    static normalize(location: minecraft.Vector3): minecraft.Vector3 {
        return {
            x: location.x / this.magnitude(location),
            y: location.y / this.magnitude(location),
            z: location.z / this.magnitude(location),
        };
    }

    /** 返回北方的向量。 */
    static north(location: minecraft.Vector3, length = 1) {
        return this.add(location, 0, 0, -length);
    }

    /** 返回南方的向量。 */
    static south(location: minecraft.Vector3, length = 1) {
        return this.add(location, 0, 0, length);
    }

    /** 返回西方的向量。 */
    static west(location: minecraft.Vector3, length = 1) {
        return this.add(location, -length, 0, 0);
    }

    /** 返回东方的向量。 */
    static east(location: minecraft.Vector3, length = 1) {
        return this.add(location, length, 0, 0);
    }

    /** 返回上方的向量。 */
    static up(location: minecraft.Vector3, length = 1) {
        return this.add(location, 0, length, 0);
    }

    /** 返回下方的向量。 */
    static down(location: minecraft.Vector3, length = 1) {
        return this.add(location, 0, -length, 0);
    }

    /** 返回两向量的点乘（内积）。 */
    static dotProduct(location1: minecraft.Vector3, location2: minecraft.Vector3) {
        const { x: x1, y: y1, z: z1 } = location1;
        const { x: x2, y: y2, z: z2 } = location2;
        return x1 * x2 + y1 * y2 + z1 * z2;
    }

    /** 返回两向量的叉乘（向量积）。 */
    static crossProduct(location1: minecraft.Vector3, location2: minecraft.Vector3): minecraft.Vector3 {
        const { x: x1, y: y1, z: z1 } = location1;
        const { x: x2, y: y2, z: z2 } = location2;
        return { x: y1 * z2 - y2 * z1, y: z1 * x2 - z2 * x1, z: x1 * y2 - x2 * y1 };
    }

    /** 返回两向量所成的角度（rad） */
    static angle(location1: minecraft.Vector3, location2: minecraft.Vector3) {
        const cosAlpha = this.dotProduct(location1, location2) / this.magnitude(location1) / this.magnitude(location2);
        return Math.acos(cosAlpha);
    }

    /** 返回`locationArray`中距离`location`最近的坐标。
     * @remarks 不要对`locationArray`传入一个空数组，否则会报错。
     */
    static getClosest(location: minecraft.Vector3, locationArray: minecraft.Vector3[]) {
        let closestLocation = locationArray[0] as minecraft.Vector3;
        let closestDistance = this.distance(location, closestLocation, true);
        locationArray.forEach(thisLocation => {
            const thisDistance = this.distance(location, thisLocation);
            if (thisDistance < closestDistance) {
                closestDistance = thisDistance;
                closestLocation = thisLocation;
            }
        });
        return closestLocation;
    }

    /** 返回给定坐标与给定区域相对位置的关系。
     * @returns 若返回`Direction`，代表给定坐标在给定区域外侧，偏向何方。若返回`undefined`，代表给定坐标在给定区域内侧。
     */
    static getVolumeSector(location: minecraft.Vector3, volume: minecraft.BlockVolume): VolumeSector {
        const { x: xMax, y: yMax, z: zMax } = volume.getMax();
        const { x: xMin, y: yMin, z: zMin } = volume.getMin();
        // 北 ↑
        // <- O -> X
        //    ↓ Z
        if (location.x > xMax) return { direction: minecraft.Direction.East, distance: location.x - xMax };
        if (location.x < xMin) return { direction: minecraft.Direction.West, distance: xMin - location.x };
        if (location.z > zMax) return { direction: minecraft.Direction.South, distance: location.z - zMax };
        if (location.z < zMin) return { direction: minecraft.Direction.North, distance: zMin - location.z };
        if (location.y > yMax) return { direction: minecraft.Direction.Up, distance: location.y - yMax };
        if (location.y < yMin) return { direction: minecraft.Direction.Down, distance: yMin - location.y };
        return { distance: 0 };
    }

    /** 将向量等比例延长。 */
    static scale(vector: minecraft.Vector3, scale: number): minecraft.Vector3 {
        const { x, y, z } = vector;
        return { x: x * scale, y: y * scale, z: z * scale };
    }
}

// #endregion
// #region 实体 & 玩家

/** 对玩家发送的消息信息。 */
export interface MessageOptions {
    /** 显示在聊天栏中的信息。 */
    readonly message?: string | minecraft.RawMessage | (string | minecraft.RawMessage)[];

    /** 播放的音效。 */
    readonly sound?: string;

    /** 播放音效的可选项。
     * @remarks 必须通过 sound 指定一个音频。
     */
    readonly soundOptions?: minecraft.PlayerSoundOptions;

    /** 延迟播放音效的时间。单位：游戏刻。
     * @remarks 必须通过 sound 指定一个音频。
     */
    readonly soundDelay?: number;

    /** 播放的标题。 */
    readonly title?: string | minecraft.RawMessage | (string | minecraft.RawMessage)[];

    /** 播放的副标题。
     * @remarks 必须通过 title 指定一个标题。
     */
    readonly subtitle?: string | minecraft.RawMessage;

    /** 播放标题的可选项
     * @remarks 必须通过 title 指定一个标题。
     * @remarks 要指定副标题时请直接在 subtitle 属性中指定。
     */
    readonly titleOptions?: minecraft.TitleDisplayOptions;
}

/** 实体操作工具。
 * @remarks 在该工具中的多数方法都接收一个可选的 dimension。在未额外声明的前提下，若不指定则默认使用主世界。
 */
export class EntityUtils {
    /** 生成实体。 */
    static add(
        typeId: string,
        location: minecraft.Vector3,
        dimension?: string | minecraft.Dimension,
        options?: minecraft.SpawnEntityOptions
    ) {
        return DimensionUtils.getDefault(dimension).spawnEntity(typeId, location, options);
    }

    /** 获取实体。 */
    static get(dimension?: string | minecraft.Dimension, options?: minecraft.EntityQueryOptions) {
        return DimensionUtils.getDefault(dimension).getEntities(options);
    }

    /** 获取特定类型的实体。 */
    static getType(typeId: string, dimension?: string | minecraft.Dimension) {
        return DimensionUtils.getDefault(dimension).getEntities({ type: typeId });
    }

    /** 获取附近的实体 */
    static getNearby(
        typeId: string,
        location: minecraft.Vector3,
        distance: number,
        dimension?: string | minecraft.Dimension
    ) {
        return DimensionUtils.getDefault(dimension).getEntities({
            type: typeId,
            location: location,
            maxDistance: distance,
        });
    }

    /** 检查实体是否在特定位置周围。
     * @param dimension 如果不指定，则默认在实体所在的维度执行。
     */
    static isNearby(
        entity: minecraft.Entity,
        location: minecraft.Vector3,
        distance: number,
        dimension?: string | minecraft.Dimension
    ) {
        const executeDimension = dimension ? DimensionUtils.getDefault(dimension) : entity.dimension;
        return executeDimension
            .getEntities({ location: location, maxDistance: distance })
            .some(nearbyEntity => nearbyEntity.id === entity.id);
    }

    /** 检查实体是否在特定长方体区域内。
     * @param dimension 如果不指定，则默认在实体所在的维度执行。
     */
    static isInVolume(
        entity: minecraft.Entity,
        volume: minecraft.BlockVolume,
        dimension?: string | minecraft.Dimension
    ) {
        const executeDimension = dimension ? DimensionUtils.getDefault(dimension) : entity.dimension;
        return executeDimension
            .getEntities({ location: volume.getMin(), volume: Vector3Utils.add(volume.getSpan(), -1, -1, -1) })
            .some(nearbyEntity => nearbyEntity.id === entity.id);
    }

    /** 移除其他除玩家之外的实体
     * @param options 要移除的实体满足的条件，若不填写则选定全部玩家之外的实体
     */
    static removeAll(options?: minecraft.EntityQueryOptions, dimension?: string | minecraft.Dimension) {
        DimensionUtils.getDefault(dimension)
            .getEntities(options)
            .filter(entity => entity.typeId != "minecraft:player")
            .forEach(entity => entity.remove());
    }
}

/** 玩家操作工具。 */
export class PlayerUtils {
    /** 判断实体是否为有效玩家。 */
    static isPlayer(entity: minecraft.Entity): entity is minecraft.Player {
        if (!entity.isValid) return false;
        return entity.typeId === "minecraft:player";
    }

    /** 获取全部玩家。 */
    static getAll(options?: minecraft.EntityQueryOptions) {
        return minecraft.world.getPlayers(options);
    }

    /** 获取玩家数目。 */
    static getAmount() {
        return this.getAll().length;
    }

    /** 获取离特定位置较接近的玩家。 */
    static getNearby(location: minecraft.Vector3, distance: number, dimension?: string | minecraft.Dimension) {
        return DimensionUtils.getDefault(dimension).getPlayers({ location: location, maxDistance: distance });
    }

    /** 对全体玩家广播消息。 */
    static broadcast(message: string | minecraft.RawMessage | (string | minecraft.RawMessage)[]) {
        this.getAll().forEach(player => player.sendMessage(message));
    }

    /** 发送消息。 */
    static sendMessage(player: minecraft.Player, options: MessageOptions) {
        const {
            message,
            title,
            subtitle,
            titleOptions = { fadeInDuration: 10, stayDuration: 70, fadeOutDuration: 20 },
            sound,
            soundOptions,
            soundDelay,
        } = options;
        if (message) player.sendMessage(message);
        if (title) player.onScreenDisplay.setTitle(title, { ...titleOptions, subtitle });
        if (sound) {
            if (soundDelay) minecraft.system.runTimeout(() => player.playSound(sound, soundOptions), soundDelay);
            else player.playSound(sound, soundOptions);
        }
    }
}

// #endregion
// #region 物品

/** 附魔信息。 */
export interface EnchantmentInfo {
    /** 附魔 ID。 */
    readonly id: string;

    /** 附魔等级。
     * @remarks 允许输入 0，但它什么也不会做
     * @default 1
     */
    readonly level?: number;
}

/** 物品栏物品信息。 */
export type InventoryItemData = {
    /** 物品信息。 */
    item?: minecraft.ItemStack;

    /** 物品所处的位置。 */
    slot: number;
};

/** 物品栏有效物品信息。 */
export type InventoryValidItemData = {
    /** 物品信息。 */
    item: minecraft.ItemStack;

    /** 物品所处的位置。 */
    slot: number;
};

/** 物品信息可选项。 */
export interface ItemOptions {
    /** 物品数量。 */
    readonly amount?: number;

    /** 物品附魔。 */
    readonly enchantments?: EnchantmentInfo[];

    /** 物品是否锁定。 */
    readonly itemLock?: minecraft.ItemLockMode;

    /** 物品备注。 */
    readonly lore?: string[];

    /** 物品名称。 */
    readonly name?: string;

    /** 物品可放置于何方块上。 */
    readonly canPlaceOn?: string[];

    /** 物品可破坏何方块。 */
    readonly canDestroy?: string[];

    /** 物品是否在玩家死亡后保留。 */
    readonly keepOnDeath?: boolean;

    /** 物品是否不可破坏。 */
    readonly unbreakable?: boolean;
}

/** 物品信息匹配可选项。代表一个物品是否同时匹配给定的信息。
 * @remarks 暂时不支持附魔查询。
 */
export interface ItemMatchOptions {
    /** 包含的物品 ID。 */
    readonly includeTypeId?: string[];

    /** 物品数量。
     * @remarks 指定为数组形式时，应为一个二元数组，第一个元素为最小值，第二个元素为最大值。
     */
    readonly amount?: number | [number, number];

    /** 物品是否锁定。 */
    readonly itemLock?: minecraft.ItemLockMode;

    /** 物品备注。 */
    readonly lore?: string[];

    /** 物品名称。 */
    readonly name?: string;

    /** 物品可放置于何方块上。 */
    readonly canPlaceOn?: string[];

    /** 物品可破坏何方块。 */
    readonly canDestroy?: string[];

    /** 物品是否在玩家死亡后保留。 */
    readonly keepOnDeath?: boolean;

    /** 物品是否不可破坏。 */
    readonly unbreakable?: boolean;
}

/** 检索物品时，检索哪些位置。 */
export interface ItemSearchInventoryOptions {
    /** 是否检索物品栏。 @default true */
    inventory?: boolean;

    /** 是否检索装备栏。 @default true */
    equipment?: boolean;

    /** 是否检索鼠标物品栏。 @default true */
    cursorInventory?: boolean;

    /** 是否检索末影箱。 @default false */
    enderChest?: boolean;
}

/** 物品栏操作工具。 */
class InventoryUtils {
    /** 获取实体物品栏组件。 */
    static get(entity: minecraft.Entity) {
        return entity.getComponent("minecraft:inventory");
    }

    // ===== 物品栏物品 =====
    /** 获取实体物品栏内的全部物品及对应槽位。 */
    static getItems(entity: minecraft.Entity): InventoryItemData[] {
        const inventory = this.get(entity);
        if (!inventory) return [];
        let inventoryItems = [];
        for (let i = 0; i < inventory.inventorySize; i++) {
            inventoryItems.push({ item: inventory.container.getItem(i), slot: i });
        }
        return inventoryItems;
    }

    /** 获取实体物品栏内的有效物品及对应槽位。 */
    static getValidItems(entity: minecraft.Entity): InventoryValidItemData[] {
        return this.getItems(entity).filter(
            (itemInfo): itemInfo is InventoryValidItemData => itemInfo.item !== undefined
        );
    }

    /** 获取实体物品栏的某个槽位是否符合给定的信息。 */
    static isItem(entity: minecraft.Entity, slot: number, options: ItemMatchOptions) {
        const slotItem = this.get(entity)?.container.getItem(slot);
        if (!slotItem) return false;
        return ItemUtils.match(slotItem, options);
    }

    /** 给予实体物品，多出的物品将会溢出生成掉落物。
     * @param playSound 给予物品是否会播放拾取物品的音效。设置为`"player"`时会在给定实体为玩家时对玩家播放音效；
     * 设置为`"world"`时会在实体位置全局播放音效；设置为`"no"`时不播放音效。 | 默认值：`"player"`。
     * @param spawnItemWhenOverflow 对于无法塞入物品栏中的物品，是否溢出为掉落物。若不溢出则不再尝试生成。 | 默认值：`true`。
     */
    static add(
        entity: minecraft.Entity,
        itemId: string,
        options?: ItemOptions,
        playSound: "no" | "player" | "world" = "player",
        spawnItemWhenOverflow = true
    ) {
        // 如果该实体不存在物品栏，终止运行
        const inventory = this.get(entity);
        if (!inventory) return;
        // 生成物品堆叠，并给予玩家物品
        const itemStacks = ItemUtils.generate(itemId, options);
        itemStacks.forEach(itemStack => {
            const leftItemStack = inventory.container.addItem(itemStack);
            if (!leftItemStack) return;
            if (!spawnItemWhenOverflow) return;
            minecraft.world.getDimension(entity.dimension.id).spawnItem(leftItemStack, entity.location).clearVelocity();
        });
        // 播放音效
        if (playSound === "player" && PlayerUtils.isPlayer(entity))
            entity.playSound("random.pop", {
                location: entity.location,
                pitch: JSUtils.number.limitDecimal(JSUtils.number.random(0.6, 2.2), 2),
                volume: 0.25,
            });
        else if (playSound === "world")
            entity.dimension.playSound("random.pop", entity.location, {
                pitch: JSUtils.number.limitDecimal(JSUtils.number.random(0.6, 2.2), 2),
                volume: 0.25,
            });
        return itemStacks;
    }

    /** 设置实体物品栏特定位置的物品。
     * @remarks 超出一组的物品将会自动忽略。
     */
    static set(entity: minecraft.Entity, slot: number, itemId: string, options?: ItemOptions) {
        const inventory = this.get(entity);
        if (!inventory) return;
        const item = ItemUtils.generate(itemId, options)[0];
        inventory.container.setItem(slot, item);
        return item;
    }

    /** 移除实体物品栏特定位置特定数量的物品。
     * @returns 返回已清除的物品数量。
     */
    static remove(entity: minecraft.Entity, slot: number, amount?: number): number {
        // 如果实体不存在物品栏，直接终止程序
        const inventory = this.get(entity);
        if (!inventory) return 0;
        // 如果该槽位本来就没有物品，直接终止程序
        const oldItem = inventory.container.getItem(slot);
        if (!oldItem) return 0;
        // 如果未指定物品数目，或者如果要清除的数量大于该物品原本的物品数量，返回旧物品堆叠的总数并全部清除
        if (!amount || oldItem.amount <= amount) {
            inventory.container.setItem(slot);
            return oldItem.amount;
        }
        // 其余情况，返回已清除过数目的物品堆叠
        const newItem = oldItem.clone();
        newItem.amount = oldItem.amount - amount;
        inventory.container.setItem(slot, newItem);
        return amount;
    }

    /** 对实体物品栏特定位置新增特定数量的物品。
     * @param itemId 当指定的位置不存在物品时，新增该物品，否则不会新增任何物品。
     * @param options 若新增物品，新增何种物品。
     * @returns 返回已添加的物品数量。
     */
    static addSlot(
        entity: minecraft.Entity,
        slot: number,
        amount: number,
        itemId?: string,
        options?: ItemOptions
    ): number {
        // 如果实体不存在物品栏，直接终止程序
        const inventory = this.get(entity);
        if (!inventory) return 0;
        // 获取原本的物品，如果不存在则……
        const oldItem = inventory.container.getItem(slot);
        if (!oldItem) {
            // 如果没有设定默认物品，直接终止
            if (!itemId) return 0;
            // 如果设定了默认物品，则设定之，返回成功设定的数量
            return this.set(entity, slot, itemId, { ...options, amount })?.amount ?? 0;
        }
        // 在原本的基础上添加特定数量的物品
        const newItem = oldItem.clone();
        newItem.amount = JSUtils.number.clamp(oldItem.amount + amount, 1, oldItem.maxAmount);
        inventory.container.setItem(slot, newItem);
        return newItem.amount - oldItem.amount;
    }

    // ===== 物品栏槽位 =====
    /** 获取实体物品栏内的全部槽位。 */
    static getSlots(entity: minecraft.Entity) {
        const inventory = this.get(entity);
        if (!inventory) return [];
        let inventorySlots = [];
        for (let i = 0; i < inventory.inventorySize; i++) {
            inventorySlots.push({ containerSlot: inventory.container.getSlot(i), slot: i });
        }
        return inventorySlots;
    }

    /** 获取实体物品栏内拥有有效物品的槽位及对应位置。 */
    static getValidSlots(entity: minecraft.Entity) {
        return this.getSlots(entity).filter(slotInfo => slotInfo.containerSlot.hasItem());
    }

    /** 将物品栏内的所有物品都设置锁定状态。 */
    static lockAllItems(entity: minecraft.Entity, mode: minecraft.ItemLockMode) {
        this.getValidSlots(entity)?.forEach(itemData => (itemData.containerSlot.lockMode = mode));
    }

    /** 获取物品数目 */
    static getAmount(entity: minecraft.Entity, options: ItemMatchOptions) {
        return JSUtils.number.sum(
            this.getValidItems(entity)
                .filter(itemData => ItemUtils.match(itemData.item, options))
                .map(itemData => itemData.item.amount)
        );
    }
}

/** 装备栏操作工具。 */
class EquipmentUtils {
    /** 获取实体装备栏组件。 */
    static get(entity: minecraft.Entity) {
        return entity.getComponent("minecraft:equippable");
    }

    /** 获取实体装备栏内对应槽位的物品。 */
    static getItem(entity: minecraft.Entity, equipmentSlot: minecraft.EquipmentSlot) {
        return this.get(entity)?.getEquipment(equipmentSlot);
    }

    /** 获取实体装备栏内的全部物品及对应槽位。 */
    static getItems(entity: minecraft.Entity) {
        return {
            /** 主手物品。 */
            "slot.weapon.mainhand": this.getItem(entity, minecraft.EquipmentSlot.Mainhand),

            /** 副手物品。 */
            "slot.weapon.offhand": this.getItem(entity, minecraft.EquipmentSlot.Offhand),

            /** 头部物品。 */
            "slot.armor.head": this.getItem(entity, minecraft.EquipmentSlot.Head),

            /** 胸部物品。 */
            "slot.armor.chest": this.getItem(entity, minecraft.EquipmentSlot.Chest),

            /** 腿部物品。 */
            "slot.armor.legs": this.getItem(entity, minecraft.EquipmentSlot.Legs),

            /** 脚部物品。 */
            "slot.armor.feet": this.getItem(entity, minecraft.EquipmentSlot.Feet),
        };
    }

    /** 获取实体装备栏的某个槽位是否符合给定的信息。 */
    static isItem(entity: minecraft.Entity, equipmentSlot: minecraft.EquipmentSlot, options: ItemMatchOptions) {
        const slotItem = this.get(entity)?.getEquipment(equipmentSlot);
        if (!slotItem) return false;
        return ItemUtils.match(slotItem, options);
    }

    /** 设置玩家的装备栏。
     * @remarks 超出一组的装备将会自动忽略。
     */
    static set(player: minecraft.Player, itemId: string, slot: minecraft.EquipmentSlot, options: ItemOptions = {}) {
        const item = ItemUtils.generate(itemId, options)[0];
        this.get(player)?.setEquipment(slot, item);
        return item;
    }

    /** 移除玩家的装备栏。 */
    static remove(player: minecraft.Player, slot: minecraft.EquipmentSlot) {
        this.get(player)?.setEquipment(slot);
    }
}

/** 末影箱操作工具。 */
class EnderChestUtils {
    /** 移除玩家的末影箱物品（命令写法）。 */
    static removeAll(player: minecraft.Player) {
        for (let i = 0; i < 27; i++) player.runCommand(`replaceitem entity @s slot.enderchest ${i} air`);
    }
}

/** 玩家鼠标物品栏操作工具。 */
class CursorInventoryUtils {
    /** 获取鼠标物品栏组件。 */
    static get(player: minecraft.Player) {
        return player.getComponent("cursor_inventory");
    }

    /** 移除玩家的鼠标物品栏。 */
    static remove(player: minecraft.Player) {
        this.get(player)?.clear();
    }

    /** 获取实体鼠标物品栏选择的物品是否符合给定的信息。 */
    static isItem(entity: minecraft.Player, options: ItemMatchOptions) {
        const slotItem = this.get(entity)?.item;
        if (!slotItem) return false;
        return ItemUtils.match(slotItem, options);
    }
}

/** 物品操作工具。 */
export class ItemUtils {
    // ===== 内置工具 =====
    /** 物品栏操作工具。 */
    static inventory = InventoryUtils;

    /** 装备栏操作工具。 */
    static equipment = EquipmentUtils;

    /** 末影箱操作工具。 */
    static enderChest = EnderChestUtils;

    /** 鼠标选中物品操作工具。 */
    static cursorInventory = CursorInventoryUtils;

    // ===== 通用 =====

    /** 按照给定条件生成 ItemStacks。 */
    static generate(itemId: string, options: ItemOptions = {}) {
        // 解构参数
        const { enchantments, itemLock, lore, name, canPlaceOn, canDestroy, keepOnDeath, unbreakable } = options;
        let { amount = 1 } = options;
        let itemStacks: minecraft.ItemStack[] = [];

        // 按组进行计算
        while (amount > 0) {
            // 检查要添加的物品的数量最大值，防止数值溢出
            const maxStackSize = new minecraft.ItemStack(itemId).maxAmount;
            const thisStackSize = amount > maxStackSize ? maxStackSize : amount;
            amount = amount - maxStackSize;

            const itemStack = new minecraft.ItemStack(itemId, thisStackSize);
            if (enchantments) enchantments.forEach(enchantment => this.addEnchantment(itemStack, enchantment));
            if (itemLock) itemStack.lockMode = itemLock;
            if (lore) itemStack.setLore(lore);
            if (name) itemStack.nameTag = name;
            if (canPlaceOn) itemStack.setCanPlaceOn(canPlaceOn);
            if (canDestroy) itemStack.setCanDestroy(canDestroy);
            if (keepOnDeath) itemStack.keepOnDeath = keepOnDeath;
            if (unbreakable) {
                const durabilityComponent = itemStack.getComponent("minecraft:durability");
                if (durabilityComponent) durabilityComponent.unbreakable = unbreakable;
            }

            itemStacks.push(itemStack);
        }

        return itemStacks;
    }

    /** 判断给定的物品是否完全匹配给定的信息。
     * @param options 目前暂时不支持附魔的检查。
     */
    static match(itemStack: minecraft.ItemStack, options: ItemMatchOptions) {
        // 获取选项信息和物品相关信息
        const {
            includeTypeId: optionsTypeId,
            name: optionsName,
            itemLock: optionsItemLock,
            keepOnDeath: optionsKeepOnDeath,
            lore: optionsLore,
            canDestroy: optionsCanDestroy,
            canPlaceOn: optionsCanPlaceOn,
            unbreakable: optionsUnbreakable,
        } = options;
        const optionsAmountRange: [number, number] | undefined = (() => {
            if (typeof options.amount === "number") return [options.amount, options.amount];
            return options.amount;
        })();
        const {
            typeId: itemTypeId,
            amount: itemAmount,
            nameTag: itemName,
            lockMode: itemItemLock,
            keepOnDeath: itemKeepOnDeath,
        } = itemStack;
        const itemLore = itemStack.getLore();
        const itemCanDestroy = itemStack.getCanDestroy();
        const itemCanPlaceOn = itemStack.getCanPlaceOn();
        const itemUnbreakable = itemStack.getComponent("durability")?.unbreakable ?? false;
        // 如果指定了筛选某变量 var，当某变量 var 无法匹配时返回 false
        if (optionsTypeId && !optionsTypeId.includes(itemTypeId)) return false;
        if (optionsAmountRange && (optionsAmountRange[0] > itemAmount || optionsAmountRange[1] < itemAmount))
            return false;
        if (optionsName && optionsName !== itemName) return false;
        if (optionsItemLock && optionsItemLock !== itemItemLock) return false;
        if (optionsKeepOnDeath && optionsKeepOnDeath !== itemKeepOnDeath) return false;
        if (optionsLore && !JSUtils.array.isSameRestrict(optionsLore, itemLore)) return false;
        if (optionsCanDestroy && !JSUtils.array.isSame(optionsCanDestroy, itemCanDestroy)) return false;
        if (optionsCanPlaceOn && !JSUtils.array.isSame(optionsCanPlaceOn, itemCanPlaceOn)) return false;
        if (optionsUnbreakable && optionsUnbreakable !== itemUnbreakable) return false;
        // 其余情况均认为可筛选
        return true;
    }

    /** 判断实体是否拥有物品。
     * @param entity 仅当实体为玩家时才会检查鼠标物品栏。
     * @param matchOptions 这里的物品数量会检查单组的数量需求。若需要检查物品数量总和，请使用 {@link InventoryUtils} 的 hasItemAmount 方法。
     */
    static hasItem(
        entity: minecraft.Entity,
        matchOptions: ItemMatchOptions,
        searchOptions: ItemSearchInventoryOptions = {}
    ) {
        const { inventory = true, cursorInventory = true, equipment = true } = searchOptions;

        // 检查物品栏的物品
        if (inventory && InventoryUtils.getValidItems(entity).some(itemData => this.match(itemData.item, matchOptions)))
            return true;
        // 检查鼠标物品栏的物品
        if (cursorInventory && entity.typeId === "minecraft:player") {
            const cursorItem = CursorInventoryUtils.get(entity as minecraft.Player)?.item;
            if (cursorItem && this.match(cursorItem, matchOptions)) return true;
        }
        // 检查装备栏的物品
        if (
            equipment &&
            Object.values(EquipmentUtils.getItems(entity)).some(item => item && this.match(item, matchOptions))
        )
            return true;

        return false;
    }

    /** 获取实体是否拥有物品（命令写法）。 */
    static hasItemCommand(
        entity: minecraft.Entity,
        itemId: string,
        quantity?: number | string,
        location?: string,
        slot?: number | string,
        data?: number
    ) {
        const quantityStr = quantity ? `,quantity=${quantity}` : ``;
        const locationStr = location ? `,location=${location}` : ``;
        const slotStr = slot ? `,slot=${slot}` : ``;
        const dataStr = data ? `,data=${data}` : ``;
        // 检测物品
        return (
            entity.runCommand(
                `execute if entity @s[hasitem={item=${itemId}${quantityStr}${locationStr}${slotStr}${dataStr} }]`
            ).successCount !== 0
        );
    }

    /** 清除物品（命令写法）。 */
    static removeItem(player: minecraft.Player, itemId: string = "", data: number = -1, maxCount: number = -1) {
        player.runCommand(`clear @s ${itemId} ${data} ${maxCount}`);
    }

    // ===== 物品掉落物 =====
    /** 在特定位置生成物品掉落物。
     * @param clearVelocity 是否清除掉落物生成时的向量，若不清除则掉落物会随机存在一个向量。 | 默认值：`false`
     */
    static addEntity(
        location: minecraft.Vector3,
        itemId: string,
        options: ItemOptions = {},
        clearVelocity: boolean = false,
        dimension?: string | minecraft.Dimension
    ) {
        return this.generate(itemId, options).map(itemStack => {
            const item = DimensionUtils.getDefault(dimension).spawnItem(itemStack, location);
            if (clearVelocity) item.clearVelocity();
            return item;
        });
    }

    /** 获取物品掉落物。 */
    static getEntity(itemId?: string, dimension?: string | minecraft.Dimension) {
        const allItems = DimensionUtils.getDefault(dimension).getEntities({ type: "minecraft:item" });
        if (itemId) return allItems.filter(item => item.getComponent("item")?.itemStack.typeId === itemId);
        return allItems;
    }

    /** 清除物品掉落物。 */
    static removeEntity(itemId?: string, dimension?: string | minecraft.Dimension) {
        this.getEntity(itemId, dimension).forEach(item => item.remove());
    }

    // ===== 附魔 =====
    /** 尝试为物品添加附魔，无法添加的附魔将不会添加。 */
    static addEnchantment(item: minecraft.ItemStack, enchantment: EnchantmentInfo) {
        // 如果附魔等级为小于等于 0 级，终止运行
        const { id, level = 1 } = enchantment;
        if (level <= 0) return item;
        // 如果无法附魔，终止运行
        const comp = item.getComponent("minecraft:enchantable");
        if (!comp) return item;
        // 如果附魔不能添加，终止运行
        const enchantmentData: minecraft.Enchantment = { type: new minecraft.EnchantmentType(id), level: level };
        if (!comp.canAddEnchantment(enchantmentData)) return item;
        // 添加附魔
        comp.addEnchantment(enchantmentData);
        return item;
    }

    /** 获取物品的附魔信息。
     * @returns 若物品无法附魔，返回 undefined。
     */
    static getEnchantment(item: minecraft.ItemStack): EnchantmentInfo[] | undefined {
        const comp = item.getComponent("minecraft:enchantable");
        if (!comp) return void 0;
        return comp.getEnchantments().flatMap(enchantment => ({ id: enchantment.type.id, level: enchantment.level }));
    }
}

// #endregion
// #region UI

// --- UI 数据 ---

/** UI 数据。 */
interface UIDataBase {
    /** UI 类型 */ type: "action" | "message" | "modal";
    /** UI 标题 */ title?: string | minecraft.RawMessage;
    /** UI 的父表单，在此表单关闭后显示的表单 @remarks 通常来说该参数无需额外定义，在启动子界面时会自动注册父界面 */ parentForm?: UIData;
}

/** ActionUI 数据。 */
export interface ActionUIData extends UIDataBase {
    type: "action";
    /** UI 内部的文字简介信息 */ body?: string | minecraft.RawMessage;
    /** UI 使用的表单组件 */ components?: ActionUIComponent[];
    /** UI 被取消时执行的事件 */ onCancel?: (
        reason?: ui.FormCancelationReason,
        thisForm?: ActionUIData | ModalUIData
    ) => void | OpenNewFormOptions;
}

/** MessageUI 数据。 */
export interface MessageUIData extends UIDataBase {
    type: "message";
    /** UI 内部的文字简介信息 */ body?: string | minecraft.RawMessage;
    /** UI 的第一个按钮 */ button1: FormButtonComponent;
    /** UI 的第二个按钮 */ button2: FormButtonComponent;
}

/** ModalUI 数据。 */
export interface ModalUIData extends UIDataBase {
    type: "modal";
    /** UI 的提交信息 */ submitButton?: string | minecraft.RawMessage;
    /** UI 使用的表单组件 */ components?: ModalUIComponent[];
    /** UI 被取消时执行的事件，该事件会在各组件的数据处理完后执行 */ onCancel?: (
        reason?: ui.FormCancelationReason,
        thisForm?: ActionUIData | ModalUIData
    ) => void | OpenNewFormOptions;
    /** UI 被提交后执行的事件，该事件会在各组件的数据处理完后执行 */ onSubmit?: (
        result?: (string | number | boolean | undefined)[],
        thisForm?: ActionUIData | ModalUIData
    ) => void | OpenNewFormOptions;
}

export type UIData = ActionUIData | MessageUIData | ModalUIData;

// --- UI 组件 ---

/** 表单组件。 */
interface FormComponentBase {
    /** 是否可见 @remarks 对 MessageUI 无效，因为该 UI 固定使用两个按钮 @default true */ visible?: boolean;
}

/** ModalUI 表单组件。 */
interface ModalFormComponentBase extends FormComponentBase {
    /** 描述。 */
    description: string | minecraft.RawMessage;

    /** 默认值。 */
    default?: number | boolean | string;

    /** 旁侧提示文本。 */
    tipText?: string | minecraft.RawMessage;
}

/** 标题表单组件。 */
export interface FormHeaderComponent extends FormComponentBase {
    type: "header";

    /** 标题文本。 */
    text: string | minecraft.RawMessage;
}

/** 文本表单组件。 */
export interface FormLabelComponent extends FormComponentBase {
    type: "label";

    /** 文本。 */
    text: string | minecraft.RawMessage;
}

/** 分割线表单组件。 */
export interface FormDividerComponent extends FormComponentBase {
    type: "divider";
}

/** 按钮表单组件。 */
export interface FormButtonComponent extends FormComponentBase {
    type: "button";
    /** 按钮文本 */ text: string | minecraft.RawMessage;
    /** 按钮图标 @remarks 仅限 ActionUI 可用 @example "textures/items/apple" */ icon?: string;
    /** 按钮被选中后的设置 */ onClick: () => void | OpenNewFormOptions;
}

/** 下拉栏表单组件。 */
export interface FormDropdownComponent extends ModalFormComponentBase {
    type: "dropdown";
    default?: number;
    /** 下拉栏全部可用选项 */ items: (minecraft.RawMessage | string)[];
    /** 在此下拉栏选择特定值提交后执行的函数 */ onSubmit: (
        result: number,
        items: (minecraft.RawMessage | string)[]
    ) => void;
}

/** 滑块表单组件。 */
export interface FormSliderComponent extends ModalFormComponentBase {
    type: "slider";
    default?: number;
    /** 滑块范围最小值 */ min: number;
    /** 滑块范围最大值 */ max: number;
    /** 每次滑动滑块时的步长 @default 1 */ step?: number;
    /** 在此滑块选择特定值提交后执行的函数 */ onSubmit: (result: number) => void;
}

/** 文字输入框表单组件。 */
export interface FormTextFieldComponent extends ModalFormComponentBase {
    type: "textField";

    default?: string;

    /** 文本输入框背景字。 */
    placeholderText: string | minecraft.RawMessage;

    /** 在此文本输入框输入特定值提交后执行的函数。 */
    onSubmit: (result: string) => void;
}

/** 开关表单组件。 */
export interface FormToggleComponent extends ModalFormComponentBase {
    type: "toggle";
    default?: boolean;

    /** 在此开关选择特定值提交后执行的函数。 */
    onSubmit: (result: boolean) => void;
}

export type ActionUIComponent = FormHeaderComponent | FormLabelComponent | FormDividerComponent | FormButtonComponent;
export type ModalUIComponent =
    | FormHeaderComponent
    | FormLabelComponent
    | FormDividerComponent
    | FormDropdownComponent
    | FormSliderComponent
    | FormTextFieldComponent
    | FormToggleComponent;

/** 打开新表单选项。 */
export interface OpenNewFormOptions {
    /** 子界面。
     * @remarks 在该子界面打开后会自动为该子界面注册父界面。
     */
    childForm?: UIData;

    /** 在关闭该界面后打开何界面，在不存在对应界面时直接跳过。 */
    openForm: "childForm" | "parentForm";
}

export class UIUtils {
    /** 当玩家选择特定按钮、提交特定表单或关闭特定表单后，显示的新 UI。 */
    private static handleNewFormData(
        thisFormData: UIData,
        showPlayer: minecraft.Player,
        parentForm: UIData | undefined,
        newFormData: void | OpenNewFormOptions
    ) {
        // 如果没有指定新界面，则直接终止
        if (!newFormData) return;
        // 如果指定显示子界面，在子界面存在的情况下打开子界面，并注册本界面为子界面的父界面
        const { childForm, openForm } = newFormData;
        if (openForm == "childForm" && childForm) {
            childForm.parentForm = thisFormData;
            this.createAutomatically(showPlayer, childForm);
        }
        // 如果指定显示父界面，打开父界面
        else if (parentForm) {
            this.createAutomatically(showPlayer, parentForm);
        }
    }
    /** 添加一个 ActionUI，并对玩家显示。 */
    static createAction(showPlayer: minecraft.Player, formData: ActionUIData) {
        // 表单创建
        const form = new ui.ActionFormData();
        if (formData.title) form.title(formData.title);
        if (formData.body) form.body(formData.body);
        if (formData.components)
            formData.components.forEach(component => {
                if (component.visible === false) return;
                switch (component.type) {
                    case "header":
                        form.header(component.text);
                        return;
                    case "label":
                        form.label(component.text);
                        return;
                    case "divider":
                        form.divider();
                        return;
                    case "button":
                        form.button(component.text, component.icon);
                        return;
                    default:
                        return;
                }
            });

        // 显示设置
        // 筛选出所有的 button 组件
        const buttons =
            formData.components
                ?.filter(component => component.type === "button")
                .filter(buttonComponent => buttonComponent.visible !== false) ?? [];
        form.show(showPlayer)
            .then(response => {
                const { selection, canceled, cancelationReason } = response;
                const parentForm = formData.parentForm;
                // 当玩家进行特定操作后，立刻执行对应事件，并获取返回值以确认是否要打开一个新的界面
                const newFormData = (() => {
                    // 选择了特定按钮后
                    if (selection !== undefined) return buttons[selection]?.onClick();
                    // 取消表单后
                    else if (canceled && formData.onCancel) return formData.onCancel(cancelationReason, formData);
                })();
                UIUtils.handleNewFormData(formData, showPlayer, parentForm, newFormData);
            })
            .catch(() => {});

        return form;
    }

    /** 添加一个 MessageFormUI，并对玩家显示。 */
    static createMessage(showPlayer: minecraft.Player, formData: MessageUIData) {
        // 表单创建
        const form = new ui.MessageFormData();
        if (formData.title) form.title(formData.title);
        if (formData.body) form.body(formData.body);
        form.button1(formData.button1.text);
        form.button2(formData.button2.text);

        // 显示设置
        // 筛选出所有的 button 组件
        const buttons = [formData.button1, formData.button2];
        form.show(showPlayer)
            .then(response => {
                const { selection } = response;
                const parentForm = formData.parentForm;
                // 当玩家选择了特定按钮后，立刻执行对应事件，并获取返回值以确认是否要打开一个新的界面
                const newFormData = buttons[selection ?? 0]?.onClick();
                UIUtils.handleNewFormData(formData, showPlayer, parentForm, newFormData);
            })
            .catch(() => {});

        return form;
    }

    /** 添加一个 ModalFormUI，并对玩家显示。 */
    static createModal(showPlayer: minecraft.Player, formData: ModalUIData) {
        // 表单创建
        const form = new ui.ModalFormData();
        if (formData.title) form.title(formData.title);
        if (formData.submitButton) form.submitButton(formData.submitButton);
        if (formData.components)
            formData.components.forEach(component => {
                if (component.visible === false) return;
                switch (component.type) {
                    case "header":
                        form.header(component.text);
                        break;
                    case "label":
                        form.label(component.text);
                        break;
                    case "divider":
                        form.divider();
                        break;
                    case "dropdown":
                        form.dropdown(component.description, component.items, {
                            defaultValueIndex: component.default,
                            tooltip: component.tipText,
                        });
                        break;
                    case "slider":
                        form.slider(component.description, component.min, component.max, {
                            defaultValue: component.default,
                            tooltip: component.tipText,
                            valueStep: component.step,
                        });
                        break;
                    case "textField":
                        form.textField(component.description, component.placeholderText, {
                            defaultValue: component.default,
                            tooltip: component.tipText,
                        });
                        break;
                    case "toggle":
                        form.toggle(component.description, {
                            defaultValue: component.default,
                            tooltip: component.tipText,
                        });
                        break;
                    default:
                        break;
                }
            });

        // 显示设置
        // 筛选出所有有效组件
        form.show(showPlayer)
            .then(response => {
                const { formValues, canceled, cancelationReason } = response;
                const parentForm = formData.parentForm;
                // 玩家提交后
                if (formValues !== undefined) {
                    // 处理提交事件

                    /** 所有能提供数值的有效组件 */
                    const valueComponents: (
                        | FormDropdownComponent
                        | FormSliderComponent
                        | FormTextFieldComponent
                        | FormToggleComponent
                    )[] = [];
                    /** 所有数值 */
                    const values: (string | number | boolean | undefined)[] = [];
                    formData.components
                        ?.filter(component => component.visible !== false)
                        .forEach((component, index) => {
                            if (["dropdown", "toggle", "textField", "slider"].includes(component.type)) {
                                valueComponents.push(
                                    component as
                                        | FormDropdownComponent
                                        | FormSliderComponent
                                        | FormTextFieldComponent
                                        | FormToggleComponent
                                );
                                values.push(formValues[index]);
                            }
                        });
                    // 对每个选项执行事件
                    valueComponents.forEach((component, index) => {
                        switch (component.type) {
                            case "dropdown":
                                component.onSubmit(values[index] as number, component.items);
                                break;
                            case "slider":
                                component.onSubmit(values[index] as number);
                                break;
                            case "textField":
                                component.onSubmit(values[index] as string);
                                break;
                            case "toggle":
                                component.onSubmit(values[index] as boolean);
                                break;
                            default:
                                break;
                        }
                    });
                }
                // 当玩家进行特定操作后，立刻执行对应事件，并获取返回值以确认是否要打开一个新的界面
                const newFormData = (() => {
                    // 提交后
                    if (formValues !== undefined && formData.onSubmit) return formData.onSubmit(formValues, formData);
                    // 取消表单后
                    else if (canceled && formData.onCancel) return formData.onCancel(cancelationReason, formData);
                })();
                UIUtils.handleNewFormData(formData, showPlayer, parentForm, newFormData);
            })
            .catch(() => {});

        return form;
    }

    /** 按照 formData 所给信息自动创建表单。 */
    static createAutomatically(showPlayer: minecraft.Player, formData: UIData) {
        switch (formData.type) {
            case "action":
                return this.createAction(showPlayer, formData);
            case "message":
                return this.createMessage(showPlayer, formData);
            case "modal":
                return this.createModal(showPlayer, formData);
        }
    }

    /** 关闭所有 UI。 */
    static close(player: minecraft.Player) {
        ui.uiManager.closeAllForms(player);
    }
}

// #endregion
// #region JS 基本工具

/** 时间信息。 */
export interface TimeInfo {
    minute?: number;
    second: number;
    tick?: number;
}

/** 数值工具。 */
class NumberUtils {
    /** 在[a, b]取随机整数。 */
    static randomInt(min: number, max: number) {
        // 确保 min <= max
        if (min > max) {
            [min, max] = [max, min];
        }
        return Math.floor(Math.random() * (max - min + 1)) + min; // 生成 [min, max] 之间的随机整数
    }

    /** 在[a, b]取随机数。 */
    static random(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    /** 将数值限制到[a, b]内。 */
    static clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(value, max));
    }

    /** 计算数字数组的和。 */
    static sum(values: number[]) {
        return Array.isArray(values) ? values.reduce((acc, curr) => acc + curr, 0) : 0;
    }

    /** 限定一个浮点数的位数。 */
    static limitDecimal(num: number, digits: number) {
        if (digits < 0 || digits > 20) {
            throw new RangeError("只能保留 0 - 20 位有效数字。");
        }
        return parseFloat(num.toFixed(digits));
    }
}

/** 数组工具。 */
class ArrayUtils {
    /** 打乱一个数组。
     * @remarks 这个方法不会修改原数组。
     */
    static shuffle<T>(array: T[]): T[] {
        return [...array].sort(() => Math.random() - 0.5);
    }

    /** 删除数组的特定元素。
     * @remarks 这个方法将会修改原数组。
     */
    static removeElement<T>(array: T[], element: T) {
        // 使用循环和splice方法删除所有匹配的元素
        for (let i = array.length - 1; i >= 0; i--) {
            if (array[i] === element) {
                array.splice(i, 1);
            }
        }
    }

    /** 判断两数组的元素是否严格相同（对应索引的元素也必须相同）。 */
    static isSameRestrict<T>(array1: T[], array2: T[]) {
        if (array1.length !== array2.length) return false;
        return array1.every((element, index) => element === array2[index]);
    }

    /** 判断两数组的元素是否相同（只要求两数组拥有相同的元素）。 */
    static isSame<T>(array1: T[], array2: T[]) {
        if (array1.length !== array2.length) return false;
        const set2 = new Set(array2);
        return array1.every(element => set2.has(element));
    }

    /** 判断一个数组有多少个相同的数字 `num`。 */
    static countSameNumbers(numberList: number[], num: number) {
        let map = new Map();
        numberList.forEach(num => {
            map.set(num, (map.get(num) || 0) + 1);
        }); // 统计每个数字出现的次数
        let count = 0;
        map.forEach(value => {
            if (value === num) {
                count++;
            }
        }); // 遍历 map，找出有多少个相同的数字 num
        return count;
    }

    /** 获取一个数组中的随机元素。
     * @remarks 这个方法在数组为空时会返回`undefined`。
     */
    static randomElement<T>(array: T[]) {
        return array[NumberUtils.randomInt(0, array.length - 1)] as T;
    }
}

/** 时间显示工具。 */
class TimeDisplayUtils {
    /** 根据游戏刻显示多少秒，保留两位数字，不显示单位。例：230 → 11.50。 */
    static showSecondsByTick(tick: number): string {
        const seconds = tick / 20;
        return seconds.toFixed(2);
    }

    /** 根据游戏刻显示多少分钟多少秒。例：1230 → 1:01.50。 */
    static showMinuteAndSecondsByTick(tick: number): string {
        const totalSeconds = tick / 20;
        const sign = totalSeconds < 0 ? "-" : "";
        const absSeconds = Math.abs(totalSeconds);

        const minutes = Math.floor(absSeconds / 60);
        const seconds = absSeconds % 60;

        // 格式化秒部分：两位整数 + 两位小数
        const [intPart, fracPart] = seconds.toFixed(2).split(".") as [string, string];
        const formattedSeconds = `${intPart.padStart(2, "0")}.${fracPart}`;

        return `${sign}${minutes}:${formattedSeconds}`;
    }

    /** 根据秒数显示多少分钟多少秒。例：61.5 → 1:01。 */
    static showMinuteAndSecondsBySecond(second: number): string {
        const sign = second < 0 ? "-" : "";
        const absSecond = Math.abs(second);
        const minutes = Math.floor(absSecond / 60);
        const seconds = Math.floor(absSecond % 60);
        const formattedSeconds = seconds.toString().padStart(2, "0");
        return `${sign}${minutes}:${formattedSeconds}`;
    }

    /** 返回 YY/MM/DD 形式的日期字符串。例：26/06/28。 */
    static formatDateToYYMMDD(date?: Date): string {
        const d = date ? new Date(date) : new Date(); // 确保传入的值也能转为有效Date
        const year = d.getFullYear().toString().slice(-2); // 取年份后两位
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        return `${year}/${month}/${day}`;
    }
}

/** JavaScript 通用工具。 */
export class JSUtils {
    /** 数值相关方法。 */
    static number = NumberUtils;

    /** 数组相关方法。 */
    static array = ArrayUtils;

    /** 时间显示相关方法。 */
    static timeDisplay = TimeDisplayUtils;

    // ===== 其他方法 =====
    /** 显示换行消息，为数组内每个元素中间添加 "§r\n"，以弥补 Minecraft 原生方法不能换行显示消息的不足 */
    static lineText(message: (minecraft.RawMessage | string)[]) {
        return message
            .slice(0, -1)
            .flatMap(msg => [msg, "§r\n"])
            .concat(message.slice(-1));
    }

    /** 将数字转换为罗马数字的字符串 */
    static intToRoman(num: number) {
        if (num <= 0) {
            return "";
        }
        const romanNumerals = [
            // { value: 1000, symbol: 'M' },
            // { value: 900, symbol: 'CM' },
            // { value: 500, symbol: 'D' },
            // { value: 400, symbol: 'CD' },
            // { value: 100, symbol: 'C' },
            // { value: 90, symbol: 'XC' },
            // { value: 50, symbol: 'L' },
            // { value: 40, symbol: 'XL' },
            { value: 10, symbol: "X" },
            { value: 9, symbol: "IX" },
            { value: 5, symbol: "V" },
            { value: 4, symbol: "IV" },
            { value: 1, symbol: "I" },
        ];
        let result = "";
        for (const { value, symbol } of romanNumerals) {
            while (num >= value) {
                result += symbol;
                num -= value;
            }
        }
        return result;
    }

    /** 在输入的对象中，输出值所对应的键
     * @remark 如果对象所有的值中有重复的，那么会返回第一个对应的键
     */
    static getKeyByValue(obj: object, value: any) {
        for (const [key, val] of Object.entries(obj)) {
            if (val === value) {
                return key;
            }
        }
    }

    /** 判断传入的对象是否为空对象
     * @param {object} obj
     */
    static isEmptyObject(obj: object) {
        return Object.keys(obj).length === 0 && obj.constructor === Object;
    }
}

// #endregion
// #region 调试方法

export class Debug {
    /** 发送一个调试性消息 */
    static sendMessage(message: any) {
        minecraft.world.sendMessage(`${message}`);
    }

    /** 打印数组 */
    static printArray(array: any[], arrayName: string) {
        minecraft.world.sendMessage(`§a${arrayName} = §r§f[§b${array.join(", ")}§r§f]`);
    }

    /** 打印对象 */
    static printObject(
        object: Record<string, any> | undefined,
        mode: "chat" | "actionbar" = "chat",
        hasFunction = true
    ) {
        /** 待打印的字符串数组 */ let printString: string[] = [];
        // 设置打印的字符串
        if (object == undefined) {
            printString = [`<§6undefined§f>`];
        } else {
            printString.push(`<§6Object ${object.constructor.name}`);
            // 遍历对象中的每个对象
            for (let key in object) {
                let value = object[key];
                let valueName = `§b${value}`; // 如果是普通类型，蓝色，原样显示
                if (value instanceof Function) {
                    // 如果是函数类型，黄色，显示为() => {}
                    if (!hasFunction) continue;
                    valueName = `§e() => {}`;
                } else if (value instanceof Object) {
                    // 如果是对象类型，显示为构建器类型
                    valueName = `§6<Object ${value.constructor.name}>`;
                }
                printString.push(`    §a${key} : ${valueName}`);
            }
            printString.push(`§r>`);
        }
        // 打印模式
        if (mode === "chat") {
            minecraft.world.sendMessage(printString.join("\n"));
        } else {
            minecraft.world.getAllPlayers().forEach(player => {
                player.onScreenDisplay.setActionBar(printString.join("\n"));
            });
        }
    }
}

// #endregion
