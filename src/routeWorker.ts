const { parentPort, workerData } = require('worker_threads');
import logger from './logger';
import System from './models/System';

async function performRouteCalculation() {
  const routeId = Math.random().toString(36).substring(2, 15);
  const startTime = performance.now();
  
  const { origin, destination, waypoints, useThera, useTurnur, keepWaypointsOrder, minWhSize, avoidSystems, avoidEdencom, avoidTrig } = workerData;
  logger.info(`Starting route calculation [${routeId}]`, {
    origin,
    destination,
    waypoints: waypoints.join(', '),
    options: {
      useThera,
      useTurnur,
      keepWaypointsOrder,
      minWhSize,
      avoidSystems,
      avoidEdencom,
      avoidTrig
    }
  });
  
  try {
    const route = await System.getRoute(origin, destination, waypoints, useThera, useTurnur, keepWaypointsOrder,avoidSystems, avoidEdencom, avoidTrig, minWhSize);
    
    const duration = (performance.now() - startTime).toFixed(2);
    logger.info(`Route calculation completed [${routeId}] in ${duration}ms`);
    
    parentPort.postMessage({ route });
  } catch (error: any) {
    const duration = (performance.now() - startTime).toFixed(2);
    logger.error(`Route calculation failed [${routeId}] after ${duration}ms:`, error);
    parentPort.postMessage({ error: error.message });
  }
}

performRouteCalculation();