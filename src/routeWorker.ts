const { parentPort, workerData } = require('worker_threads');
import System from './models/System';

async function performRouteCalculation() {
  const { origin, destination, waypoints, useThera, useTurnur, keepWaypointsOrder, minWhSize } = workerData;
  console.log('Input parameters:', origin, destination, waypoints, useThera, useTurnur, keepWaypointsOrder, minWhSize);
  try {
    const route = await System.getRoute(origin, destination, waypoints, useThera, useTurnur, keepWaypointsOrder, minWhSize);
    parentPort.postMessage({ route });
  } catch (error: any) {
    console.error('Error in route calculation:', error);
    parentPort.postMessage({ error: error.message });
  }
}

performRouteCalculation();