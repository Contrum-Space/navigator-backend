import * as fs from 'fs/promises';
import * as fuzzy from 'fuzzy';
import { AppConfig } from '../config';
import EVEScout from './Eve-Scout';

interface SolarSystem {
  name: string;
  id: number;
  security: number;
  region: string;
  x: number;
  y: number;
  z: number;
}

export interface Jump {
  from: number;
  to: number;
  max_ship_size?: 'small' | 'medium' | 'large' | 'xlarge' | 'capital' | 'unknown';
}

interface SystemData {
  system_id: number;
  npc_kills: number;
  ship_kills: number;
  pod_kills: number;
  ship_jumps: number;
}

interface RouteSystem {
  id: number;
  system: string;
  security: number;
  region: string;
  jumps: number;
}

interface ExtendedRouteSystem extends RouteSystem {
  npc_kills: number;
  pod_kills: number;
  ship_kills: number;
  ship_jumps: number;
}

type ShipSize = 'small' | 'medium' | 'large' | 'xlarge' | 'capital' | 'unknown';

class System {
  public static jsonData: { solarSystems: SolarSystem[]; jumps: Jump[] } | null = null; // systems data cache
  public static systemsData: SystemData[] | null = null; // systems data cache

  private static async loadData(): Promise<void> {
    if (System.jsonData) return;

    const config = AppConfig.getConfig();

    try {
      const [universeData, systemsData] = await Promise.all([
        fs.readFile(config.universeDataPath, 'utf-8'),
        fs.readFile(config.systemsData, 'utf-8')
      ]);

      System.jsonData = JSON.parse(universeData);
      System.systemsData = JSON.parse(systemsData);
    } catch (error) {
      throw new Error('Failed to load system data: ' + (error as Error).message);
    }
  }

  static async resolveNamesToIDs(names: string[]): Promise<number[]> {
    await System.loadData();
    // for each name, find the system in the jsonData and return the id
    return names.map((name) => {
      const system = System.jsonData!.solarSystems.find((system) => system.name === name);
      if (system) {
        return system.id;
      }
      throw new Error(`System not found: ${name}`);
    });
  }

  static async resolveIDToName(id: number): Promise<string> {
    await System.loadData();
    const system = System.jsonData!.solarSystems.find((system) => system.id === id);
    if (system) {
      return system.name;
    }
    return 'N/A';
  }

  static async fuzzySearchSystemByName(query: string): Promise<string[]> {
    await System.loadData();

    if (!System.jsonData) {
      throw new Error('System data not loaded');
    }

    const systemNames: string[] = System.jsonData.solarSystems.map((system) => system.name);

    // Perform fuzzy search
    const results = fuzzy.filter(query, systemNames, {
      extract: (el) => el
    });

    // Sort results by score (descending) and limit to top 10
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((result) => result.string);
  }

  public static async getRoute(
    origin: string,
    destination: string,
    waypoints: string[],
    useThera: boolean,
    useTurnur: boolean,
    keepWaypointOrder: boolean,
    min_wh_size?: ShipSize
  ): Promise<RouteSystem[]> {
    await System.loadData();
    const { solarSystems } = System.jsonData!;
    let { jumps } = System.jsonData!;
  
    jumps = JSON.parse(JSON.stringify(jumps));
  
    const allowedMinWhSize = min_wh_size || 'capital';
    const whSizeOrder: ShipSize[] = ['small', 'medium', 'large', 'xlarge', 'capital', 'unknown'];
  
    if (useThera || useTurnur) {
      jumps.push(...await EVEScout.getConnections(useThera, useTurnur));
    }
  
    const getSystemId = (name: string) =>
      solarSystems.find((system) => system.name.toLowerCase() === name.toLowerCase())?.id;
  
    const originId = getSystemId(origin);
    const destinationId = getSystemId(destination);
    const waypointIds = waypoints.map(getSystemId).filter((id): id is number => id !== undefined);
  
    if (!originId || !destinationId || waypointIds.length !== waypoints.length) {
      return [];
    }
  
    const findShortestPath = (startId: number, endId: number): RouteSystem[] => {
      const distances: { [systemId: number]: number } = {};
      const predecessors: { [systemId: number]: number | null } = {};
      const queue: number[] = [startId];
  
      solarSystems.forEach(system => {
        distances[system.id] = Infinity;
        predecessors[system.id] = null;
      });
      distances[startId] = 0;
  
      while (queue.length > 0) {
        const currentSystemId = queue.shift()!;
  
        jumps.forEach(jump => {
          if (
            jump.from === currentSystemId &&
            distances[jump.to] === Infinity &&
            (!jump.max_ship_size || whSizeOrder.indexOf(jump.max_ship_size) >= whSizeOrder.indexOf(allowedMinWhSize))
          ) {
            distances[jump.to] = distances[currentSystemId] + 1;
            predecessors[jump.to] = currentSystemId;
            queue.push(jump.to);
          }
        });
      }
  
      const path: RouteSystem[] = [];
      let currentId: number | null = endId;
      while (currentId !== null) {
        const system = solarSystems.find(s => s.id === currentId);
        if (system) {
          path.unshift({
            id: system.id,
            system: system.name,
            security: system.security,
            region: system.region,
            jumps: distances[currentId],
          });
        }
        currentId = predecessors[currentId];
      }
  
      return path;
    };
  
    const calculateRoute = (systemIds: number[]): RouteSystem[] => {
      let fullRoute: RouteSystem[] = [];
      for (let i = 0; i < systemIds.length - 1; i++) {
        const subRoute = findShortestPath(systemIds[i], systemIds[i + 1]);
        if (subRoute.length === 0) return [];
        fullRoute = fullRoute.concat(i === 0 ? subRoute : subRoute.slice(1));
      }
      return fullRoute;
    };
  
    if (keepWaypointOrder) {
      return calculateRoute([originId, ...waypointIds.filter((id): id is number => id !== undefined), destinationId]);
    } else {
      const permute = (arr: number[]): number[][] => {
        if (arr.length <= 1) return [arr];
        return arr.flatMap((current, i) => 
          permute([...arr.slice(0, i), ...arr.slice(i + 1)])
            .map(perm => [current, ...perm])
        );
      };
  
      return permute(waypointIds)
        .map(perm => calculateRoute([originId, ...perm, destinationId]))
        .reduce((shortest, current) => 
          (current.length && (!shortest.length || current.length < shortest.length)) ? current : shortest
        , []);
    }
  }
  
  public static async getData(systems: RouteSystem[]): Promise<ExtendedRouteSystem[]> {
    const systemsWithData: ExtendedRouteSystem[] = [];

    const config = AppConfig.getConfig();

    const systemsData = JSON.parse(await fs.readFile(config.systemsData, { encoding: 'utf-8'}));

    for(const system of systems){
      const systemData = systemsData.find((s: SystemData) => system.id === s.system_id);
      systemsWithData.push({
          ...system,
          npc_kills: systemData ? systemData.npc_kills : -1,
          pod_kills: systemData ? systemData.pod_kills : -1,
          ship_kills: systemData ? systemData.ship_kills : -1,
          ship_jumps: systemData ? systemData.ship_jumps : -1,
      });
    }

    return systemsWithData;
  }
}

export default System;
