import * as fs from 'fs';
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

class System {
  public static jsonData: { solarSystems: SolarSystem[]; jumps: Jump[] } | null = null;    // systems data cache

  private static loadData(): void {
    if (!System.jsonData) {
      const jsonFilePath: string = AppConfig.config!.universeDataPath;
      const jsonData: Buffer = fs.readFileSync(jsonFilePath);
      System.jsonData = JSON.parse(jsonData.toString());
    }
  }

  static findSystemsWithinRange(startingSystemName: string, jumps: number): string[] {
    // Load data if not already loaded
    System.loadData();

    // Find the starting system by name
    const startingSystem: SolarSystem | undefined = System.jsonData!.solarSystems.find(
      system => system.name === startingSystemName
    );

    if (!startingSystem) {
      console.log(`Starting system with name ${startingSystemName} not found.`);
      return [];
    }

    // Find systems within the specified number of jumps
    const reachableSystems: number[] = [];

    function findReachableSystems(currentSystemId: number, jumpsLeft: number): void {
      if (jumpsLeft === 0) {
        return;
      }

      const connectedSystems: number[] = System.jsonData!.jumps
        .filter(jump => jump.from === currentSystemId)
        .map(jump => jump.to);

      connectedSystems.forEach(systemId => {
        if (!reachableSystems.includes(systemId)) {
          reachableSystems.push(systemId);
          findReachableSystems(systemId, jumpsLeft - 1);
        }
      });
    }

    findReachableSystems(startingSystem.id, jumps);

    // Map system IDs to actual system objects
    const systemsInJumps: SolarSystem[] = System.jsonData!.solarSystems.filter(system =>
      reachableSystems.includes(system.id)
    );

    // Extract system names
    const systemNamesInJumps: string[] = systemsInJumps.map(system => system.name);


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
      } else {
        console.log(`System with name ${systemName} not found.`);
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
}

export default System;