import * as fs from 'fs';
import * as fuzzy from 'fuzzy';
import AppConfig from '../config';
import ESI from './ESI';

interface SolarSystem {
  name: string;
  id: number;
  security: number;
  region: string;
  x: number;
  y: number;
  z: number;
}

interface Jump {
  from: number;
  to: number;
}

interface SystemData {
  system_id: number;
  npc_kills: number;
  ship_kills: number;
  pod_kills: number;
  ship_jumps: number;
}
class System {
  public static jsonData: { solarSystems: SolarSystem[]; jumps: Jump[] } | null = null; // systems data cache
  public static systemsData: SystemData[] | null = null; // systems data cache

  private static loadData(): void {
    try {
      if (!System.jsonData) {
        const jsonFilePath: string = AppConfig.config!.universeDataPath;
        const jsonData: Buffer = fs.readFileSync(jsonFilePath);
        System.jsonData = JSON.parse(jsonData.toString());

        const systemsDataJsonFilePath: string = AppConfig.config!.systemsData;
        const systemsDataJsonData: Buffer = fs.readFileSync(systemsDataJsonFilePath);
        System.systemsData = JSON.parse(systemsDataJsonData.toString());
      }
    } catch (error: any) {
      console.error('Error loading data:', error.message);
      throw new Error('Failed to load system data.');
    }
  }

  static fuzzySearchSystemByName(query: string): string[] {
    // Load data if not already loaded
    System.loadData();

    const systemNames: string[] = System.jsonData!.solarSystems.map((system) => system.name);

    // Use fuzzy matching to find similar system names
    const results = fuzzy.filter(query, systemNames);

    // Extract system names from fuzzy search results
    const fuzzyMatchedSystemNames: string[] = results.map((result) => result.original);

    return fuzzyMatchedSystemNames;
  }

  private static calculateDistance(system1: SolarSystem, system2: SolarSystem): number {
    const distance = Math.sqrt(
      Math.pow(system2.x - system1.x, 2) +
      Math.pow(system2.y - system1.y, 2) +
      Math.pow(system2.z - system1.z, 2)
    );

    return distance;
  }

  private static async getJumps(systemIds: number[], originId: number): Promise<{ system: string, jumps: number }[]> {
    if (originId === undefined) {
      return [];
    }

    System.loadData();

    const result: { system: string, jumps: number }[] = [];
    const processedSystems: { [key: number]: boolean } = {};

    const getRouteForSystem = async (systemId: number): Promise<void> => {
      if (processedSystems[systemId]) {
        return;
      }

      const route = await ESI.getRoute(originId, systemId);

      const namedRoute = route.map((s) => {
        const systemData = this.jsonData?.solarSystems.find((system) => system.id === s);
        return systemData?.name || '';
      });

      namedRoute.forEach((namedSystem, index) => {
        result.push({
          system: namedSystem,
          jumps: index
        });
      });

      processedSystems[systemId] = true;
    };

    const concurrencyLimit = 20;
    const batches = Math.ceil(systemIds.length / concurrencyLimit);

    // Use Promise.all for parallelizing the fetching of routes within each batch
    await Promise.all(
      Array.from({ length: batches }, (_, i) => {
        const start = i * concurrencyLimit;
        const end = Math.min((i + 1) * concurrencyLimit, systemIds.length);
        const batch = systemIds.slice(start, end);
        return Promise.all(batch.map(getRouteForSystem));
      })
    );

    return result;
  }

  private static async getJumpsCustom(systemIds: number[], originId: number): Promise<{ system: string, jumps: number }[]> {
    System.loadData();

    const { solarSystems, jumps } = System.jsonData!;

    const distances: { [systemId: number]: number } = {};
    const visited: Set<number> = new Set();
    const queue: number[] = [];

    // Initialize distances with Infinity for all systems
    for (const system of solarSystems) {
      distances[system.id] = Infinity;
    }

    // Set distance to origin system as 0
    distances[originId] = 0;
    queue.push(originId);

    while (queue.length > 0) {
      const currentSystemId = queue.shift() as number;

      if (visited.has(currentSystemId)) {
        continue;
      }

      visited.add(currentSystemId);

      for (const jump of jumps) {
        if (jump.from === currentSystemId && !visited.has(jump.to)) {
          const newDistance = distances[currentSystemId] + 1;
          if (newDistance < distances[jump.to]) {
            distances[jump.to] = newDistance;
            queue.push(jump.to);
          }
        }
      }
    }

    // Build the result array
    const result: { system: string, jumps: number }[] = [];

    for (const systemId of systemIds) {
      const system = solarSystems.find((s) => s.id === systemId);

      if (system) {
        const jumps = distances[systemId] !== Infinity ? distances[systemId] : -1;
        result.push({ system: system.name, jumps });
      }
    }

    return result;
  }


  static findSystemsInRegion(regionName: string): string[] {
    // Load data if not already loaded
    System.loadData();

    const systemsInRegion: string[] = System.jsonData!.solarSystems.filter(
      (system) => system.region.toLowerCase() === regionName.toLowerCase()
    ).map(system => system.name);

    return systemsInRegion;
  }

  static findSystemsWithinRange(startingSystemName: string, lightyears: number): string[] {
    // Load data if not already loaded
    System.loadData();

    const startingSystem: SolarSystem | undefined = System.jsonData!.solarSystems.find(
      (system) => system.name === startingSystemName
    );

    if (!startingSystem) {
      return [];
    }

    const reachableSystems: SolarSystem[] = System.jsonData!.solarSystems.filter((system) => {
      if (system.id === startingSystem.id) {
        return true; // Include the starting system itself
      }

      if (system.security > 0.4) {
        return false;
      }

      const distance = System.calculateDistance(startingSystem, system);
      const distanceInLightyears = distance * (3.26 / 0.0635);

      return distanceInLightyears <= lightyears;
    });

    const systemNamesInJumps: string[] = reachableSystems.map((system) => system.name);
    return systemNamesInJumps;
  }

  static findSystemsWithStargateJumps(startingSystemName: string, jumps: number): string[] {
    // Load data if not already loaded
    System.loadData();

    const startingSystem: SolarSystem | undefined = System.jsonData!.solarSystems.find(
      (system) => system.name === startingSystemName
    );

    if (!startingSystem) {
      return [];
    }

    function findReachableSystems(
      currentSystemId: number,
      jumpsLeft: number,
      visited: Set<number>,
      path: number[],
      reachableSystems: number[]
    ): void {
      if (jumpsLeft === 0 || visited.has(currentSystemId)) {
        return;
      }

      visited.add(currentSystemId);
      path.push(currentSystemId);

      const connectedSystems: number[] = System.jsonData!.jumps
        .filter((jump) => jump.from === currentSystemId)
        .map((jump) => jump.to);

      connectedSystems.forEach((systemId) => {
        if (!path.includes(systemId)) {
          reachableSystems.push(systemId);
          findReachableSystems(systemId, jumpsLeft - 1, visited, [...path], reachableSystems);
        }
      });
    }

    const reachableSystems: number[] = [];
    const visited = new Set<number>();
    const path: number[] = [];
    findReachableSystems(startingSystem.id, jumps, visited, path, reachableSystems);

    const systemsInJumps: SolarSystem[] = System.jsonData!.solarSystems.filter((system) =>
      reachableSystems.includes(system.id)
    );

    const systemNamesInJumps: string[] = systemsInJumps.map((system) => system.name);

    if (!systemNamesInJumps.includes(startingSystemName)) {
      systemNamesInJumps.push(startingSystemName);
    }

    return systemNamesInJumps;
  }

  static getConnectedSystems(systemNames: string[]): { systemId: number; systemName: string; connectedTo: string[] }[] {
    // Load data if not already loaded
    System.loadData();

    const result: { systemId: number; systemName: string; connectedTo: string[] }[] = [];

    systemNames.forEach((systemName) => {
      const system = System.jsonData!.solarSystems.find((solarSystem) => solarSystem.name === systemName);

      if (system) {
        const connectedTo = System.getConnectedTo(system.id);
        result.push({ systemId: system.id, systemName, connectedTo });
      }
    });

    return result;
  }

  private static getConnectedTo(systemId: number): string[] {
    const connectedSystems = System.jsonData!.jumps
      .filter((jump) => jump.from === systemId)
      .map((jump) => {
        const connectedSystem = System.jsonData!.solarSystems.find((system) => system.id === jump.to);
        return connectedSystem ? connectedSystem.name : '';
      });

    return connectedSystems.filter(Boolean) as string[];
  }

  static async getKillsAndJumpsForSystems(systemNames: string[], originSystem: string): Promise<{
    systemId: number;
    systemName: string;
    npcKills: number;
    podShipKills: number;
    jumps: number;
    distance: number,
    stargateJumps: number;
  }[]> {

    System.loadData();

    const result: Array<{
      systemId: number;
      systemName: string;
      npcKills: number;
      podShipKills: number;
      jumps: number;
      distance: number;
      stargateJumps: number;
    }> = [];

    const originSystemData = System.jsonData!.solarSystems.find((solarSystem) => solarSystem.name === originSystem);

    systemNames.forEach((systemName) => {
      const targetSystem = System.jsonData!.solarSystems.find((solarSystem) => solarSystem.name === systemName);
      const systemData = System.systemsData!.find((solarSystem) => solarSystem.system_id === targetSystem?.id);

      if (targetSystem && systemData) {
        const distance = System.calculateDistance(originSystemData!, targetSystem);
        const distanceInLightyears = distance * (3.26 / 0.0635);

        result.push({
          systemId: systemData.system_id,
          systemName: targetSystem.name,
          npcKills: systemData.npc_kills,
          podShipKills: systemData.pod_kills + systemData.ship_kills,
          jumps: systemData.ship_jumps,
          distance: distanceInLightyears,
          stargateJumps: -2,
        });
      }
      else if (systemData === undefined) {
        const distance = System.calculateDistance(originSystemData!, targetSystem!);
        const distanceInLightyears = distance * (3.26 / 0.0635);


        result.push({
          systemId: targetSystem!.id,
          systemName: targetSystem!.name,
          npcKills: 0,
          podShipKills: 0,
          jumps: 0,
          distance: distanceInLightyears,
          stargateJumps: -2,
        });
      }
    });

    return result;
  }

  static async getJumpsFromOrigin(systemNames: string[], originSystem: string): Promise<{
    system: string;
    jumps: number;
  }[]> {
    try {
      if (originSystem === '') {
        return [];
      }

      const systemIds: number[] = [];
      const solarSystems = System.jsonData?.solarSystems;

      if (!solarSystems) {
        throw new Error('Solar system data not available.');
      }

      for (const system of systemNames) {
        const systemData = solarSystems.find((solarSystem) => solarSystem.name === system);

        if (!systemData) {
          throw new Error(`System data not found for ${system}`);
        }

        systemIds.push(systemData.id);
      }

      const originSystemData = solarSystems.find((solarSystem) => solarSystem.name === originSystem);

      if (!originSystemData) {
        throw new Error(`System data not found for ${originSystem}`);
      }

      const jumps = await System.getJumpsCustom(systemIds, originSystemData.id);

      return jumps;
    } catch (error: any) {
      console.error('Error in getJumpsFromOrigin:', error.message);
      // Handle the error appropriately, e.g., return a default value or rethrow the error.
      return [];
    }
  }

}

export default System;
