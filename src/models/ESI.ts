import axios from 'axios';
import * as fs from 'fs';
import AppConfig from '../config';

interface GetUniverseSystemKillsOk {
    npc_kills: number;
    pod_kills: number;
    ship_kills: number;
    system_id: number;
}

interface GetUniverseSystemJumpsOk {
    ship_jumps: number;
    system_id: number;
}

class ESI {
    private static basePath: string = 'https://esi.evetech.net/latest/';

    static async getSystemData(): Promise<void> {
        try {
            // Fetch system kills data
            const killsResponse = await axios.get<GetUniverseSystemKillsOk[]>(
                `${ESI.basePath}universe/system_kills/`
            );

            // Fetch system jumps data
            const jumpsResponse = await axios.get<GetUniverseSystemJumpsOk[]>(
                `${ESI.basePath}universe/system_jumps/`
            );

            // Create maps for kills and jumps data for efficient lookup
            const killsMap = new Map<number, GetUniverseSystemKillsOk>();
            killsResponse.data.forEach((killsItem) => {
                killsMap.set(killsItem.system_id, killsItem);
            });

            const jumpsMap = new Map<number, GetUniverseSystemJumpsOk>();
            jumpsResponse.data.forEach((jumpsItem) => {
                jumpsMap.set(jumpsItem.system_id, jumpsItem);
            });

            const allSystems = new Set<number>();

            killsMap.forEach((_, system_id) => allSystems.add(system_id));
            jumpsMap.forEach((_, system_id) => allSystems.add(system_id));

            const combinedData = Array.from(allSystems).map((system_id) => {
                const killsItem = killsMap.get(system_id);
                const jumpsItem = jumpsMap.get(system_id);

                return {
                    npc_kills: killsItem ? killsItem.npc_kills : 0,
                    pod_kills: killsItem ? killsItem.pod_kills : 0,
                    ship_kills: killsItem ? killsItem.ship_kills : 0,
                    ship_jumps: jumpsItem ? jumpsItem.ship_jumps : 0,
                    system_id,
                };
            });

            // Store the combined data in a JSON file
            const jsonOutput = JSON.stringify(combinedData, null, 2);
            fs.writeFileSync(AppConfig.config!.systemsData, jsonOutput);

            console.log('System data stored in systems_data.json');
        } catch (error: any) {
            console.error('Error fetching or storing system data:', error.message);
        }
    }
}

export default ESI;
