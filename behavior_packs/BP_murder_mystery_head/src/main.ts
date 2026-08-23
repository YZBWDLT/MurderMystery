import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as info from "./info";

function showSetHeadUI(player: minecraft.Player, showDebugInfo: boolean) {
    const mapButtons: lib.FormButtonComponent[] = Object.keys(info.headData).map(mapName => ({
        type: "button",
        text: mapName,
        onClick: () => setHead(mapName, showDebugInfo, player),
    }));
    lib.UIUtils.createAction(player, {
        type: "action",
        components: [
            { type: "header", text: "放置头颅" },
            { type: "label", text: `显示调试性信息：§a${showDebugInfo}` },
            { type: "divider" },
            ...mapButtons,
        ],
    });
}

function setHead(mapName: string, showDebugInfo: boolean, showPlayer: minecraft.Player) {
    const mapHeadData = info.headData[mapName];
    if (!mapHeadData) {
        showPlayer.sendMessage("§c无法找到此地图。");
        return;
    }

    function sendMessage(message: string) {
        if (showDebugInfo) showPlayer.sendMessage(message);
    }

    async function tryPlace(mapHeadData: (info.GroundHeadData | info.WallHeadData)[]) {
        let index = 0;
        for (let head of mapHeadData) {
            // ===== 变量准备 =====
            const { id: idWithoutNamespace, location: locationStr } = head;
            const id = `player_head:${idWithoutNamespace}`;
            let location = lib.Vector3Utils.parseString(locationStr);
            if (mapName === "archivesTopFloor") location = lib.Vector3Utils.add(location, 646, -1, 495); // 档案馆顶层比较特殊，需要做坐标变换
            const tickingAreaName = `head${index}`;

            // 添加常加载区域
            await lib.TickingAreaUtils.add(tickingAreaName, location, location);

            // 放置头颅
            sendMessage(`正在尝试放置位于§a${locationStr}§r的头颅：§a${id}`);
            try {
                const states: Record<string, string | number | boolean | undefined> =
                    "rotation" in head
                        ? { "minecraft:block_face": "up", "minecraft:sixteen_way_rotation": head.rotation }
                        : { "minecraft:block_face": head.facing };
                lib.BlockUtils.set({ id, location, states });
            } catch (error) {
                if (error instanceof Error)
                    sendMessage(
                        `§c在放置位于${locationStr}的头颅${id}时遇到了错误，请将下面的错误原因汇报给开发者：\n${error.message}`,
                    );
            }

            // 移除常加载区域
            lib.TickingAreaUtils.remove(tickingAreaName);
            index++;
        }
    }

    tryPlace(mapHeadData);
}

const executedByNotPlayer: minecraft.CustomCommandResult = {
    status: minecraft.CustomCommandStatus.Failure,
    message: "不能由非玩家执行此命令",
};

minecraft.system.beforeEvents.startup.subscribe(event => {
    // 命令声明
    event.customCommandRegistry.registerCommand(
        {
            description: "放置一张地图的头颅。",
            name: "murder_mystery:placehead",
            permissionLevel: minecraft.CommandPermissionLevel.GameDirectors,
            optionalParameters: [{ name: "显示调试性信息", type: minecraft.CustomCommandParamType.Boolean }],
        },
        (origin, showDebugInfo: boolean = true) => {
            const player = origin.sourceEntity;
            if (!player) return executedByNotPlayer;
            if (!lib.PlayerUtils.isPlayer(player)) return executedByNotPlayer;
            minecraft.system.run(() => showSetHeadUI(player, showDebugInfo));
        },
    );
});
