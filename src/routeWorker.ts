const { parentPort, workerData } = require('worker_threads');
import logger from './logger';
import System from './models/System';

async function performRouteCalculation() {
  const { origin, destination, waypoints, useThera, useTurnur, keepWaypointsOrder, minWhSize, avoidSystems, avoidEdencom, avoidTrig } = workerData;
  logger.info(`Performing route calculation for ${origin} to ${destination} with waypoints ${waypoints.join(', ')} and options ${useThera}, ${useTurnur}, ${keepWaypointsOrder}, ${minWhSize}, ${avoidSystems}, ${avoidEdencom}, ${avoidTrig}`);
  try {
    const route = await System.getRoute(origin, destination, waypoints, useThera, useTurnur, keepWaypointsOrder,avoidSystems, avoidEdencom, avoidTrig, minWhSize);
    parentPort.postMessage({ route });
  } catch (error: any) {
    console.error('Error in route calculation:', error);
    parentPort.postMessage({ error: error.message });
  }
}

performRouteCalculation();