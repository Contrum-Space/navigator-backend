import * as fs from 'fs/promises';
import * as fuzzy from 'fuzzy';
import { AppConfig } from '../config';
import EVEScout from './Eve-Scout';
import Metro from './Metro';
import logger from '../logger';

interface SolarSystem {
  name: string;
  id: number;
  security: number;
  region: string;
  x: number;
  y: number;
  z: number;
}

export type MaxShipSize = 'small' | 'medium' | 'large' | 'xlarge' | 'capital' | 'unknown';

export interface Jump {
  from: number;
  to: number;
  max_ship_size?: MaxShipSize;
}

interface SystemData {
  system_id: number;
  npc_kills: number;
  ship_kills: number;
  pod_kills: number;
  ship_jumps: number;
}

export interface RouteSystem {
  id: number;
  system: string;
  security: number;
  region: string;
  jumps: number;
}

export interface ExtendedRouteSystem extends RouteSystem {
  npc_kills: number;
  pod_kills: number;
  ship_kills: number;
  ship_jumps: number;
}

export interface TrigData {
  system_id: number;
  status: string;
}

export interface Wormhole {
  Class: number;
  Name: string;
  Lifetime: string;
  maxStableMass: string;
  massRegenerationPerHour: number;
  maxJumpMass: string;
}

type ShipSize = 'small' | 'medium' | 'large' | 'xlarge' | 'capital' | 'unknown';

class System {
  public static jsonData: { solarSystems: SolarSystem[]; jumps: Jump[] } | null = null; // systems data cache
  public static systemsData: SystemData[] | null = null; // systems data cache
  public static trigData: TrigData[] | null = null; // trig data cache
  public static wormholesData: Wormhole[] | null = null; // wormholes data cache

  public static async loadData(): Promise<void> {
    if (System.jsonData) return;

    const config = AppConfig.getConfig();

    try {
      const [universeData, systemsData, trigData, wormholesData] = await Promise.all([
        fs.readFile(config.universeDataPath, 'utf-8'),
        fs.readFile(config.systemsData, 'utf-8'),
        fs.readFile(config.trigDataPath, 'utf-8'),
        fs.readFile(config.wormholesPath, 'utf-8')
      ]);

      System.jsonData = JSON.parse(universeData);
      System.systemsData = JSON.parse(systemsData);
      System.trigData = JSON.parse(trigData);
      System.wormholesData = JSON.parse(wormholesData);
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
    characterID: number | undefined,
    origin: string,
    destination: string,
    waypoints: string[],
    useThera: boolean,
    useTurnur: boolean,
    usePochven: boolean,
    keepWaypointOrder: boolean,
    avoidSystems: string[],
    avoidEdencom: boolean,
    avoidTrig: boolean,
    min_wh_size?: ShipSize,
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
    if (characterID && usePochven) {
      logger.info(`Getting pochven connections for character ${characterID}`, {
        characterID,
        usePochven
      });
      const pochvenConnections = await Metro.getConnections(characterID);
      jumps.push(...pochvenConnections);
    }
  
    const getSystemId = (name: string) =>
      solarSystems.find((system) => system.name.toLowerCase() === name.toLowerCase())?.id;
  
    const originId = getSystemId(origin);
    const destinationId = getSystemId(destination);
    const waypointIds = waypoints.map(getSystemId).filter((id): id is number => id !== undefined);
  
    if (!originId || !destinationId || waypointIds.length !== waypoints.length) {
      return [];
    }
  
    const avoidSystemIds = avoidSystems
      .map(getSystemId)
      .filter((id): id is number => id !== undefined);
  
    if (avoidEdencom || avoidTrig) {
      const trigSystemsToAvoid = System.trigData!.filter(system => {
        if (avoidEdencom && ['edencom_minor_victory', 'fortress'].includes(system.status)) {
          return true;
        }
        if (avoidTrig && ['final_liminality', 'triglavian_minor_victory'].includes(system.status)) {
          return true;
        }
        return false;
      }).map(system => system.system_id);
      
      avoidSystemIds.push(...trigSystemsToAvoid);
    }
  
    const findShortestPath = (startId: number, endId: number): RouteSystem[] => {
      const distances: { [systemId: number]: number } = {};
      const gScores: { [systemId: number]: number } = {};
      const predecessors: { [systemId: number]: number | null } = {};
      const openSet = new Set<number>([startId]);
      
      // Calculate heuristic (straight-line distance)
      const getHeuristic = (fromId: number, toId: number): number => {
        const from = solarSystems.find(s => s.id === fromId)!;
        const to = solarSystems.find(s => s.id === toId)!;
        return Math.sqrt(
          Math.pow(to.x - from.x, 2) + 
          Math.pow(to.y - from.y, 2) + 
          Math.pow(to.z - from.z, 2)
        ) / 10000000; // Scale down the distance to be comparable to jump counts
      };

      solarSystems.forEach(system => {
        distances[system.id] = Infinity;
        gScores[system.id] = Infinity;
        predecessors[system.id] = null;
      });
      
      distances[startId] = getHeuristic(startId, endId);
      gScores[startId] = 0;

      while (openSet.size > 0) {
        const currentSystemId = Array.from(openSet).reduce((a, b) => 
          distances[a] < distances[b] ? a : b
        );

        if (currentSystemId === endId) {
          break;
        }

        openSet.delete(currentSystemId);

        jumps.forEach(jump => {
          if (avoidSystemIds.includes(jump.to)) {
            return;
          }

          if (
            jump.from === currentSystemId &&
            (!jump.max_ship_size || whSizeOrder.indexOf(jump.max_ship_size) >= whSizeOrder.indexOf(allowedMinWhSize))
          ) {
            const tentativeGScore = gScores[currentSystemId] + 1;

            if (tentativeGScore < gScores[jump.to]) {
              predecessors[jump.to] = currentSystemId;
              gScores[jump.to] = tentativeGScore;
              distances[jump.to] = tentativeGScore + getHeuristic(jump.to, endId);
              openSet.add(jump.to);
            }
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
