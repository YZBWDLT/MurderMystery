// *-*-*-*-*-*-* 数据文件 *-*-*-*-*-*-*
// 存储所有的地图数据。

import * as minecraft from "@minecraft/server";

// #region 地图数据类型声明

/** 地图数据。 */
export type MurderMysteryMapData = {
    /** 地图描述，包括地图的基础信息。 */
    readonly description: MurderMysteryMapDataDescription;
    /** 地图组件，代表地图使用的功能。 */
    readonly components: MurderMysteryMapDataComponent;
};

type MurderMysteryMapDataDescription = {
    /** 地图 ID，用于地图名称的显示等。 */
    readonly id: string;
    /** 地图模式。 */
    readonly mode: "classic";
    /** 地图等待大厅信息。 */
    readonly waitHall: MurderMysteryWaitHallDescription;
    /** 地图范围。地图范围将会决定读取什么范围内的金锭点和重生点，并限制旁观模式玩家的活动范围。 */
    readonly range: {
        from: minecraft.Vector3;
        to: minecraft.Vector3;
    };
};

type MurderMysteryWaitHallDescription = {
    /** 等待大厅的位置，在开始前玩家将出生在这里。 */
    readonly location: minecraft.Vector3;
    /** 等待大厅的朝向位置，在开始前玩家出生时将面向这里。 */
    readonly facingLocation?: minecraft.Vector3;
};

type MurderMysteryMapDataComponent = {
    /** 玩家进入虚空组件，如果玩家落入虚空，则直接杀死之。 */
    readonly playerIntoVoid?: MurderMysteryPlayerIntoVoidComponent;
    /** 禁止与方块交互组件，阻止玩家与方块交互。若不指定则默认取消所有方块的交互。 */
    readonly allowInteractingWithBlock?: MurderMysteryAllowInteractingWithBlockComponent;
    /** 神秘药水组件，当玩家和特定位置的炼药锅交互后为玩家添加药水。 */
    readonly mysteryPotion?: MurderMysteryMysteryPotionComponent;
};

type MurderMysteryAllowInteractingWithBlockComponent = {
    /** 允许交互的方块。 */
    blocks?: string[];
    /** 允许交互的方块坐标。 */
    location?: minecraft.Vector3[];
};

type MurderMysteryPlayerIntoVoidComponent = {
    /** 判定虚空高度，当玩家的高度低于此高度时即认定为落入虚空。 | 默认值：0 */
    readonly voidHeight?: number;
};

type MurderMysteryMysteryPotionComponent = {
    /** 可触发神秘药水的酿造台的坐标。 */
    location?: minecraft.Vector3[];
};

// #endregion
// #region 地图数据

/** 地图数据。 */
export const maps: Record<string, MurderMysteryMapData> = {
    library: {
        description: {
            id: "library",
            mode: "classic",
            waitHall: {
                location: { x: -864, y: 112, z: 1868 },
                facingLocation: { x: -864, y: 112, z: 1884 },
            },
            range: {
                from: { x: -1000, y: 0, z: 1990 },
                to: { x: -840, y: 240, z: 1850 },
            },
        },
        components: {
            playerIntoVoid: { voidHeight: 40 },
            allowInteractingWithBlock: { blocks: ["minecraft:cauldron"] },
        },
    },
};

// #endregion
