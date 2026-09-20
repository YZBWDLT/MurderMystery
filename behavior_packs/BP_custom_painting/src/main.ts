import * as minecraft from "@minecraft/server";

interface PaintingPlacerComponent {
    /** 画使用的 ID。 */
    id: string;

    /** 画的长度。 */
    length?: number;

    /** 画的宽度。 */
    height?: number;
}

/** 获取和方块交互后，实际放置的方块位置。
 * @description 专门适用于 interactWithBlock 的前事件和后事件。
 */
function getPlaceLocation(block: minecraft.Block, blockFace: minecraft.Direction) {
    const location = block.location;
    const placeLocation: Record<minecraft.Direction, minecraft.Vector3> = {
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
            const { id, length = 1, height = 1 } = param.params as PaintingPlacerComponent;
            const { block, blockFace } = event;
            // 如果玩家在上面或下面放置，则终止运行
            if (blockFace === minecraft.Direction.Up || blockFace === minecraft.Direction.Down) return;
            const dimension = block.dimension;
            const location = getPlaceLocation(block, blockFace);

            // ===== 放置方块 =====
            for (let lengthIndex = 0; lengthIndex < length; lengthIndex++) {
                for (let heightIndex = 0; heightIndex < height; heightIndex++) {
                    const placeBlockId = `${id}_${lengthIndex}${heightIndex}`;
                    const placeLocations: Record<typeof blockFace, minecraft.Vector3> = {
                        East: { ...location, z: location.z - lengthIndex, y: location.y + heightIndex },
                        West: { ...location, z: location.z + lengthIndex, y: location.y + heightIndex },
                        North: { ...location, x: location.x - lengthIndex, y: location.y + heightIndex },
                        South: { ...location, x: location.x + lengthIndex, y: location.y + heightIndex },
                    };
                    const placeLocation = placeLocations[blockFace];

                    const placeDirections: Record<typeof blockFace, string> = {
                        East: "west",
                        West: "east",
                        North: "south",
                        South: "north",
                    };

                    const previousBlock = dimension.getBlock(placeLocation);
                    // 如果原位置不是空气，则跳过
                    if (previousBlock?.typeId !== "minecraft:air") continue;
                    dimension.setBlockPermutation(
                        placeLocation,
                        minecraft.BlockPermutation.resolve(placeBlockId, {
                            "minecraft:cardinal_direction": placeDirections[blockFace],
                        }),
                    );
                }
            }
        },
    });
});
