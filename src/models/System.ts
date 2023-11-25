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
  private static jsonData: { solarSystems: SolarSystem[]; jumps: Jump[] } | null = null;    // systems data cache

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

    return systemNamesInJumps;
  }
}

export default System;