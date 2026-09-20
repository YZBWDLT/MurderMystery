// @ts-check

import * as minecraft from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
import * as info from "./info";

// #region 常用方法

/** 获取和方块交互后，实际放置的方块位置。
 * @description 专门适用于 interactWithBlock 的前事件和后事件。
 * @param {minecraft.Block} block
 * @param {minecraft.Direction} blockFace
 */
function getPlaceLocation(block, blockFace) {
    const location = block.location;
    const placeLocation = {
        Up: { ...location, y: location.y + 1 },
        Down: { ...location, y: location.y - 1 },
        North: { ...location, z: location.z - 1 },
        South: { ...location, z: location.z + 1 },
        West: { ...location, x: location.x - 1 },
        East: { ...location, x: location.x + 1 },
    };
    return placeLocation[blockFace];
}

/** 返回实体是否为玩家。
 * @param {minecraft.Entity} entity
 * @returns {entity is minecraft.Player}
 */
function isPlayer(entity) {
    if (!entity.isValid) return false;
    return entity.typeId === "minecraft:player";
}

/** 将一个形式为`"x y z"`的字符串输出为`Vector3`格式。
 * @param {string} location
 * @returns {minecraft.Vector3}
 */
function parseString(location) {
    const parts = location.trim().split(" ");
    if (parts.length !== 3) throw new Error(`Invalid location format: expected "X Y Z", got "${location}"`);

    const [xStr, yStr, zStr] = parts;
    const x = Number(xStr);
    const y = Number(yStr);
    const z = Number(zStr);
    if (isNaN(x) || isNaN(y) || isNaN(z)) throw new Error(`Invalid numeric value in location string: "${location}"`);

    return { x, y, z };
}

/**
 * @typedef BlockData 表示一个方块的信息。
 * @property {string} id 方块 ID。
 * @property {minecraft.Vector3} location 方块位置。
 * @property {Record<string, boolean | number | string | undefined>} [states] 方块状态。
 */

/** 在某个位置放置方块。
 * @param {BlockData} blockData
 * @param {minecraft.Dimension} dimension
 * @throws 当试图在未加载区块放置方块时会报错。
 * @throws 在指定方块状态时，请确保该方块存在这个方块状态！
 */
function setBlock(blockData, dimension) {
    const { id, location, states } = blockData;
    dimension.setBlockType(location, id);
    // 设定方块的方块状态
    const placedBlock = dimension.getBlock(location);
    if (states && placedBlock) setState(placedBlock, states);
    return dimension.getBlock(location);
}

/** 将方块设定为特定的方块状态。
 * @param {minecraft.Block} block
 * @param {Record<string, boolean | number | string | undefined>} states
 */
function setState(block, states) {
    Object.entries(states).forEach(([state, value]) => {
        // @ts-ignore 因为原版的补全文件发疯，没有考虑附加包自定义的状态，所以这里必须忽略报错
        block.setPermutation(block.permutation.withState(state, value));
    });
}

/** @type {minecraft.CustomCommandResult} */
const executedByNotPlayer = {
    status: minecraft.CustomCommandStatus.Failure,
    message: "不能由非玩家执行此命令",
};

// #endregion
// #region 自定义画

/**
 * @typedef PaintingPlacerComponent
 * @property {string} id 画使用的 ID。
 * @property {number} [width] 画的宽度。
 * @property {number} [height] 画的高度。
 */

minecraft.system.beforeEvents.startup.subscribe(event => {
    event.itemComponentRegistry.registerCustomComponent("painting:placer", {
        onUseOn: (event, param) => {
            /** @type {PaintingPlacerComponent} */ // @ts-ignore
            const params = param.params;
            const { id, width = 1, height = 1 } = params;
            const { block, blockFace } = event;

            // 如果玩家在上面或下面放置，则终止运行
            if (blockFace === minecraft.Direction.Up || blockFace === minecraft.Direction.Down) return;
            const dimension = block.dimension;
            const location = getPlaceLocation(block, blockFace);

            // 放置方块，从 00 开始一直到 [width-1][height-1]，例如：
            // 03 13 23
            // 02 12 22
            // 01 11 21
            // 00 10 20
            // 会依次在对应位置进行放置。放置的画的位置、朝向都会随着玩家的朝向而发生变化。
            for (let widthIndex = 0; widthIndex < width; widthIndex++) {
                for (let heightIndex = 0; heightIndex < height; heightIndex++) {
                    /** 待放置的画的 ID。 */
                    const placeBlockId = `${id}_${widthIndex}${heightIndex}`;

                    /** @type {Record<typeof blockFace, minecraft.Vector3>} */
                    const placeLocations = {
                        East: { ...location, z: location.z - widthIndex, y: location.y + heightIndex },
                        West: { ...location, z: location.z + widthIndex, y: location.y + heightIndex },
                        North: { ...location, x: location.x - widthIndex, y: location.y + heightIndex },
                        South: { ...location, x: location.x + widthIndex, y: location.y + heightIndex },
                    };
                    /** 待放置的画的位置。该位置会随着玩家放置的朝向而发生变化。 */
                    const placeLocation = placeLocations[blockFace];

                    /** @type {Record<typeof blockFace, string>} */
                    const placeDirections = { East: "west", West: "east", North: "south", South: "north" };
                    /** 待放置的画的朝向。该位置会随着玩家放置的朝向而发生变化。 */
                    const placeDirection = placeDirections[blockFace];

                    // 如果该位置已有方块，则跳过之
                    if (dimension.getBlock(placeLocation)?.typeId !== "minecraft:air") continue;
                    dimension.setBlockPermutation(
                        placeLocation,
                        minecraft.BlockPermutation.resolve(placeBlockId, { "minecraft:cardinal_direction": placeDirection }),
                    );
                }
            }
        },
    });
});

// #endregion
// #region 冻结方块

minecraft.system.beforeEvents.startup.subscribe(event => {
    // 命令声明
    event.customCommandRegistry.registerCommand(
        {
            description: "放置一张地图的冻结方块。",
            name: "murder_mystery:placefreezeblock",
            permissionLevel: minecraft.CommandPermissionLevel.GameDirectors,
            optionalParameters: [{ name: "显示调试性信息", type: minecraft.CustomCommandParamType.Boolean }],
        },
        (origin, showDebugInfo = true) => {
            const player = origin.sourceEntity;
            if (!player) return executedByNotPlayer;
            if (!isPlayer(player)) return executedByNotPlayer;
            minecraft.system.run(() => showSetFreezeBlockUI(player, showDebugInfo));
        },
    );
});

/**
 * @param {minecraft.Player} player
 * @param {boolean} showDebugInfo
 */
function showSetFreezeBlockUI(player, showDebugInfo) {
    const form = new ui.CustomForm(player, "放置冻结方块").label(`显示调试性信息：§a${showDebugInfo}`).spacer();
    Object.keys(info.freezeBlockData).map(mapName => {
        form.button({ translate: `map.${mapName}` }, () => setFreezeBlock(mapName, showDebugInfo, player)).spacer();
    });
    form.show();
}

/**
 * @param {string} mapName
 * @param {boolean} showDebugInfo
 * @param {minecraft.Player} showPlayer
 */
function setFreezeBlock(mapName, showDebugInfo, showPlayer) {
    const freezeBlockDatas = info.freezeBlockData[mapName];
    if (!freezeBlockDatas) {
        showPlayer.sendMessage("§c无法找到此地图。");
        return;
    }
    /** @param {string} message */
    function sendMessage(message) {
        if (showDebugInfo) showPlayer.sendMessage(message);
    }
    freezeBlockDatas.forEach((freezeBlockData, index) => {
        // ===== 变量准备 =====
        const overworld = minecraft.world.getDimension("overworld");
        const tickingAreaName = `freezeBlock${index}`;
        let { id, from, to } = freezeBlockData;
        // 坐标变换
        const offsetData = info.freezeBlockMapOffset[mapName];
        if (offsetData) {
            const { x: originX, y: originY, z: originZ } = offsetData.origin;
            const { x: realX, y: realY, z: realZ } = offsetData.real;
            from = { x: from.x + realX - originX, y: from.y + realY - originY, z: from.z + realZ - originZ };
            to = { x: to.x + realX - originX, y: to.y + realY - originY, z: to.z + realZ - originZ };
        }
        // 添加常加载区域
        minecraft.world.tickingAreaManager.createTickingArea(tickingAreaName, { from, to, dimension: overworld }).then(() => {
            // 放置冻结方块
            const fromString = `${from.x} ${from.y} ${from.z}`;
            const toString = `${to.x} ${to.y} ${to.z}`;
            sendMessage(`正在尝试放置位于§a${fromString} - ${toString}§r的冻结方块：§a${id}`);
            try {
                overworld.fillBlocks(new minecraft.BlockVolume(from, to), id);
            } catch (error) {
                if (error instanceof Error)
                    sendMessage(
                        `§c在放置位于${fromString} - ${toString}的冻结方块${id}时遇到了错误，请将下面的错误原因汇报给开发者：\n${error.message}`,
                    );
            }
            // 移除常加载区域
            minecraft.world.tickingAreaManager.removeTickingArea(tickingAreaName);
        });
    });
}

// #endregion
// #region 自定义头颅

minecraft.system.beforeEvents.startup.subscribe(event => {
    // 命令声明
    event.customCommandRegistry.registerCommand(
        {
            description: "放置一张地图的头颅。",
            name: "murder_mystery:placehead",
            permissionLevel: minecraft.CommandPermissionLevel.GameDirectors,
            optionalParameters: [{ name: "显示调试性信息", type: minecraft.CustomCommandParamType.Boolean }],
        },
        (origin, showDebugInfo = true) => {
            const player = origin.sourceEntity;
            if (!player) return executedByNotPlayer;
            if (!isPlayer(player)) return executedByNotPlayer;
            minecraft.system.run(() => showSetHeadUI(player, showDebugInfo));
        },
    );
});

/**
 * @param {minecraft.Player} player
 * @param {boolean} showDebugInfo
 */
function showSetHeadUI(player, showDebugInfo) {
    const form = new ui.CustomForm(player, "放置头颅").label(`显示调试性信息：§a${showDebugInfo}`);
    Object.keys(info.headData).map(mapName => {
        form.spacer().button({ translate: `map.${mapName}` }, () => {
            setHead(mapName, showDebugInfo, player);
            form.close();
        });
    });
    form.show();
}

/**
 * @param {string} mapName
 * @param {boolean} showDebugInfo
 * @param {minecraft.Player} showPlayer
 */
function setHead(mapName, showDebugInfo, showPlayer) {
    const mapHeadDatas = info.headData[mapName];
    if (!mapHeadDatas) {
        showPlayer.sendMessage("§c无法找到此地图。");
        return;
    }
    /** @param {string} message */
    function sendMessage(message) {
        if (showDebugInfo) showPlayer.sendMessage(message);
    }
    mapHeadDatas.forEach((mapHeadData, index) => {
        // ===== 变量准备 =====
        const overworld = minecraft.world.getDimension("overworld");
        const tickingAreaName = `head${index}`;
        let { id: idWithoutNamespace, location: locationString } = mapHeadData;
        const id = `player_head:${idWithoutNamespace}`;
        let location = parseString(locationString);
        // 坐标变换
        const offsetData = info.headMapOffset[mapName];
        if (offsetData) {
            const { x: originX, y: originY, z: originZ } = parseString(offsetData.origin);
            const { x: realX, y: realY, z: realZ } = parseString(offsetData.real);
            location = { x: location.x + realX - originX, y: location.y + realY - originY, z: location.z + realZ - originZ };
            locationString = `${location.x} ${location.y} ${location.z}`;
        }
        // 添加常加载区域
        minecraft.world.tickingAreaManager
            .createTickingArea(tickingAreaName, { from: location, to: location, dimension: overworld })
            .then(() => {
                // 放置冻结方块
                sendMessage(`正在尝试放置位于§a${locationString}§r的头颅：§a${id}`);
                try {
                    /** @type {Record<string, string | number | boolean | undefined>} */
                    const states =
                        "rotation" in mapHeadData
                            ? { "minecraft:block_face": "up", "minecraft:sixteen_way_rotation": mapHeadData.rotation }
                            : { "minecraft:block_face": mapHeadData.facing };
                    setBlock({ id, location, states }, overworld);
                } catch (error) {
                    if (error instanceof Error)
                        sendMessage(
                            `§c在放置位于${locationString}的头颅${id}时遇到了错误，请将下面的错误原因汇报给开发者：\n${error.message}`,
                        );
                }
                // 移除常加载区域
                minecraft.world.tickingAreaManager.removeTickingArea(tickingAreaName);
            });
    });
}
