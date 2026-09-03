import * as minecraft from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
import * as info from "./info";

// ===== 来自 lib 的函数 =====

function isPlayer(entity: minecraft.Entity): entity is minecraft.Player {
    if (!entity.isValid) return false;
    return entity.typeId === "minecraft:player";
}

// ===== 主程序 =====

const executedByNotPlayer: minecraft.CustomCommandResult = {
    status: minecraft.CustomCommandStatus.Failure,
    message: "不能由非玩家执行此命令",
};

minecraft.system.beforeEvents.startup.subscribe(event => {
    // 命令声明
    event.customCommandRegistry.registerCommand(
        {
            description: "放置一张地图的冻结方块。",
            name: "murder_mystery:placefreezeblock",
            permissionLevel: minecraft.CommandPermissionLevel.GameDirectors,
            optionalParameters: [{ name: "显示调试性信息", type: minecraft.CustomCommandParamType.Boolean }],
        },
        (origin, showDebugInfo: boolean = true) => {
            const player = origin.sourceEntity;
            if (!player) return executedByNotPlayer;
            if (!isPlayer(player)) return executedByNotPlayer;
            minecraft.system.run(() => showSetFreezeBlockUI(player, showDebugInfo));
        },
    );
});

function showSetFreezeBlockUI(player: minecraft.Player, showDebugInfo: boolean) {
    const form = new ui.CustomForm(player, "放置冻结方块").label(`显示调试性信息：§a${showDebugInfo}`).spacer();
    Object.keys(info.freezeBlockData).map(mapName => {
        form.button({ translate: `map.${mapName}` }, () => setHead(mapName, showDebugInfo, player)).spacer();
    });
    form.show();
}

function setHead(mapName: string, showDebugInfo: boolean, showPlayer: minecraft.Player) {
    const freezeBlockDatas = info.freezeBlockData[mapName];
    if (!freezeBlockDatas) {
        showPlayer.sendMessage("§c无法找到此地图。");
        return;
    }
    function sendMessage(message: string) {
        if (showDebugInfo) showPlayer.sendMessage(message);
    }
    freezeBlockDatas.forEach((freezeBlockData, index) => {
        // ===== 变量准备 =====
        const overworld = minecraft.world.getDimension("overworld");
        const tickingAreaName = `freezeBlock${index}`;
        let { id, from, to } = freezeBlockData;
        // 坐标变换
        const offsetData = info.mapOffset[mapName];
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
