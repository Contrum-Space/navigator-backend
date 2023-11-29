import * as fs from 'fs';
import * as fuzzy from 'fuzzy';
import AppConfig from '../config';

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
    if (!System.jsonData) {
      const jsonFilePath: string = AppConfig.config!.universeDataPath;
      const jsonData: Buffer = fs.readFileSync(jsonFilePath);
      System.jsonData = JSON.parse(jsonData.toString());

      const systemsDataJsonFilePath: string = AppConfig.config!.systemsData;
      const systemsDataJsonData: Buffer = fs.readFileSync(systemsDataJsonFilePath);
      System.systemsData = JSON.parse(systemsDataJsonData.toString());

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

  private static findShortestPath(
    currentSystemId: number,
    targetSystemId: number,
    jumpsLeft: number,
    visited: Set<number>,
    path: number[],
  ): number | null {
    if (jumpsLeft < 0 || visited.has(currentSystemId)) {
      return null; // No valid path found
    }

    visited.add(currentSystemId);
    path.push(currentSystemId);

    if (currentSystemId === targetSystemId) {
      return path.length - 1; // Number of jumps is the length of the path minus 1
    }

    const connectedSystems: number[] = System.jsonData!.jumps
      .filter((jump) => jump.from === currentSystemId)
      .map((jump) => jump.to);

    let shortestPath: number | null = null;

    connectedSystems.forEach((nextSystemId) => {
      if (!path.includes(nextSystemId)) {
        const jumpsToTarget = System.findShortestPath(nextSystemId, targetSystemId, jumpsLeft - 1, visited, [...path]);
        if (jumpsToTarget !== null && (shortestPath === null || jumpsToTarget < shortestPath)) {
          shortestPath = jumpsToTarget;
        }
      }
    });

    return shortestPath;
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

  static getKillsAndJumpsForSystems(systemNames: string[], originSystem: string): {
    systemId: number;
    systemName: string;
    npcKills: number;
    podShipKills: number;
    jumps: number;
    distance: number,
    stargateJumps: number,
  }[] {

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
          stargateJumps: 0,
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
          stargateJumps: 0,
        });
      }
    });

    return result;
  }
}

export default System;
