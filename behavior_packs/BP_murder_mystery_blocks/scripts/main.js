// @ts-check

import * as minecraft from "@minecraft/server";

/**
 * @typedef PaintingPlacerComponent
 * @property {string} id 画使用的 ID。
 * @property {number} [width] 画的宽度。
 * @property {number} [height] 画的高度。
 */

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
