import * as minecraft from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
import * as info from "./info";
// ===== 来自 lib 的函数 =====
function isPlayer(entity) {
    if (!entity.isValid)
        return false;
    return entity.typeId === "minecraft:player";
}
/** 将一个形式为`"x y z"`的字符串输出为`Vector3`格式。 */
function parseString(location) {
    const parts = location.trim().split(" ");
    if (parts.length !== 3)
        throw new Error(`Invalid location format: expected "X Y Z", got "${location}"`);
    const [xStr, yStr, zStr] = parts;
    const x = Number(xStr);
    const y = Number(yStr);
    const z = Number(zStr);
    if (isNaN(x) || isNaN(y) || isNaN(z))
        throw new Error(`Invalid numeric value in location string: "${location}"`);
    return { x, y, z };
}
/** 在某个位置放置方块。
 * @throws 当试图在未加载区块放置方块时会报错。
 * @throws 在指定方块状态时，请确保该方块存在这个方块状态！
 */
function setBlock(blockData, dimension) {
    const { id, location, states } = blockData;
    dimension.setBlockType(location, id);
    // 设定方块的方块状态
    const placedBlock = dimension.getBlock(location);
    if (states && placedBlock)
        setState(placedBlock, states);
    return dimension.getBlock(location);
}
/** 将方块设定为特定的方块状态。 */
function setState(block, states) {
    Object.entries(states).forEach(([state, value]) => {
        // @ts-ignore 因为原版的补全文件发疯，没有考虑附加包自定义的状态，所以这里必须忽略报错
        block.setPermutation(block.permutation.withState(state, value));
    });
}
// ===== 主程序 =====
const executedByNotPlayer = {
    status: minecraft.CustomCommandStatus.Failure,
    message: "不能由非玩家执行此命令",
};
minecraft.system.beforeEvents.startup.subscribe(event => {
    // 命令声明
    event.customCommandRegistry.registerCommand({
        description: "放置一张地图的头颅。",
        name: "murder_mystery:placehead",
        permissionLevel: minecraft.CommandPermissionLevel.GameDirectors,
        optionalParameters: [{ name: "显示调试性信息", type: minecraft.CustomCommandParamType.Boolean }],
    }, (origin, showDebugInfo = true) => {
        const player = origin.sourceEntity;
        if (!player)
            return executedByNotPlayer;
        if (!isPlayer(player))
            return executedByNotPlayer;
        minecraft.system.run(() => showSetHeadUI(player, showDebugInfo));
    });
});
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
function setHead(mapName, showDebugInfo, showPlayer) {
    const mapHeadDatas = info.headData[mapName];
    if (!mapHeadDatas) {
        showPlayer.sendMessage("§c无法找到此地图。");
        return;
    }
    function sendMessage(message) {
        if (showDebugInfo)
            showPlayer.sendMessage(message);
    }
    mapHeadDatas.forEach((mapHeadData, index) => {
        // ===== 变量准备 =====
        const overworld = minecraft.world.getDimension("overworld");
        const tickingAreaName = `head${index}`;
        let { id: idWithoutNamespace, location: locationString } = mapHeadData;
        const id = `player_head:${idWithoutNamespace}`;
        let location = parseString(locationString);
        // 坐标变换
        const offsetData = info.mapOffset[mapName];
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
                const states = "rotation" in mapHeadData
                    ? { "minecraft:block_face": "up", "minecraft:sixteen_way_rotation": mapHeadData.rotation }
                    : { "minecraft:block_face": mapHeadData.facing };
                setBlock({ id, location, states }, overworld);
            }
            catch (error) {
                if (error instanceof Error)
                    sendMessage(`§c在放置位于${locationString}的头颅${id}时遇到了错误，请将下面的错误原因汇报给开发者：\n${error.message}`);
            }
            // 移除常加载区域
            minecraft.world.tickingAreaManager.removeTickingArea(tickingAreaName);
        });
    });
}
