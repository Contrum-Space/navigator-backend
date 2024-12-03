import axios from "axios";
import System, { Jump, MaxShipSize, Wormhole } from "./System";
import ESI from "./ESI";
import logger from "../logger";

export default class Metro {
    static basePath = "https://api.evemetro.com";
    static apiKey = "b1ad6513-4645-4ca3-9ea0-2ca387a258cc";

    static async checkSubscription(characterId: number, corporationId: number, allianceId: number): Promise<boolean> {
        try {
            const apiResponse = await axios.post(`${Metro.basePath}/connections`, 
                {
                    character_id: characterId,  
                    corporation_id: corporationId,
                    alliance_id: allianceId
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": Metro.apiKey
                    }
                }
            );
            return apiResponse.data.access;
        } catch (error: any) {
            console.error(error.data);
            return false;
        }
    }

    static async getConnections(characterId: number, mock?: boolean): Promise<Jump[]> {
        const { corporationId, allianceId } = await ESI.getCorporationAndAlliance(characterId);
        const subscription = await Metro.checkSubscription(characterId, corporationId, allianceId);
        if (!subscription) {
            return [];
        }
        let apiResponse: any;
        try {
            apiResponse = await axios.post(`${Metro.basePath}/connections`, 
                {
                    character_id: characterId,  
                    corporation_id: corporationId,
                    alliance_id: allianceId
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": Metro.apiKey
                    }
                }
            );
                        
        } catch (error: any) {
            console.error(error);
            return [];
        }

        const jumps: Jump[] = [];

        await System.loadData();
        
        for (const system of apiResponse.data.connections) {
            for (const edge of system.systemEdges) {
                const wormholeType = edge.wormholeTypeDst === 'K162' ? edge.wormholeTypeSrc : edge.wormholeTypeDst;
                const maxJumpMass = Number(System.wormholesData?.find((wormhole: Wormhole) => wormhole.Name === wormholeType)?.maxJumpMass);
                let maxShipSize: MaxShipSize = 'small';
                if (maxJumpMass <= 50000) maxShipSize = "small";
                else if (maxJumpMass <= 620000) maxShipSize = "medium";
                else if (maxJumpMass <= 1000000) maxShipSize = "large";
                else maxShipSize = "xlarge";
                jumps.push({
                    from: system.systemId,
                    to: edge.solarSystemIdDst,
                    max_ship_size: maxShipSize
                });
                jumps.push({
                    from: edge.solarSystemIdDst,
                    to: system.systemId,
                    max_ship_size: maxShipSize
                });
            }
        }
        return jumps;
    }   
}