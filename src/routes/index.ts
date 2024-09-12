/* eslint-disable @typescript-eslint/no-var-requires */
import axios from 'axios';
import express, { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { Worker } from 'worker_threads';
import path from 'path';
import client, { Registry } from 'prom-client';

import { AppConfig } from '../config';
import ESI from '../models/ESI';
import System from '../models/System';

const EveOnlineSsoStrategy = require('passport-eveonline-sso');
const refresh = require('passport-oauth2-refresh');


const app = express();
const config = AppConfig.getConfig();

// Prometheus metrics

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ gcDurationBuckets: [0.1, 0.2, 0.3] });

const routeExecutionTimeHistogram = new client.Histogram({
    name: 'route_execution_time_seconds',
    help: 'Runtime of route calculation',
});

const recordRouteExecutionTime = (executionTime: number) => {
    routeExecutionTimeHistogram.observe(executionTime / 1000);
};

const workerGauge = new client.Gauge({
    name: 'spawned_worker_threads',
    help: 'Number of spawned worker threads',
    collect() {
        this.set(spawnedWorkerThreads);
    }
});

let routeExecutionTimes: number[] = [];
let spawnedWorkerThreads = 0;

// Passport configuration
const strategy = new EveOnlineSsoStrategy({
    clientID: config.clientId,
    secretKey: config.secretKey,
    callbackURL: config.callback,
    scope: 'esi-ui.write_waypoint.v1 esi-location.read_location.v1'
},
    function (accessToken: string, refreshToken: string, params: any, profile: any, done: (error: any, user?: any) => void) {
        return done(null, { accessToken, refreshToken, params, profile });
    }
);

passport.use(strategy);
refresh.use(strategy);

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user: any, done) => {
    done(null, user);
});

// Middleware
const checkForToken = async (req: Request, res: Response, next: NextFunction) => {
    if (req.user === undefined) {
        return res.sendStatus(401);
    }

    try {
        const response = await axios.post(
            'https://login.eveonline.com/v2/oauth/token',
            `grant_type=refresh_token&refresh_token=${encodeURIComponent((req.user as any).refreshToken)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.secretKey}`).toString('base64')}`
                },
            }
        );

        (req.user as any).accessToken = response.data.access_token;
        next();
    } catch (error: any) {
        console.error('Error refreshing token:', error.response ? error.response.data : error.message);
        res.sendStatus(401);
    }
};

// Routes
app.get('/profile', (req, res) => {
    if (!req.user) {
        return res.send({ user: null });
    }
    res.send({ user: (req.user as any).profile });
});

app.get('/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) console.log(err);
        res.sendStatus(200);
    });
});

app.get('/auth', passport.authenticate('eveonline-sso'));

app.get('/auth/callback', passport.authenticate('eveonline-sso', {
    successReturnToOrRedirect: AppConfig.getConfig().frontend,
    failureRedirect: '/auth'
}));

app.post('/route', async (req: Request, res: Response) => {
    const startTime = process.hrtime();
    const { destination, origin, waypoints, keepWaypointsOrder, useThera, useTurnur, minWhSize } = req.body;
    
    const resolvedPath = path.join(__dirname, '..', process.env.NODE_ENV === 'production' ? 'routeWorker.js' : 'routeWorker.ts');
    const worker = new Worker(resolvedPath, {
        workerData: { origin, destination, waypoints, useThera, useTurnur, keepWaypointsOrder, minWhSize },
        execArgv: /\.ts$/.test(resolvedPath) ? ["--require", "ts-node/register"] : undefined,
    });

    spawnedWorkerThreads++;

    worker.on('message', async (result) => {
        const { route } = result;
        const systemsWithData = await System.getData(route);
        
        const endTime = process.hrtime(startTime);
        const executionTime = endTime[0] * 1000 + endTime[1] / 1000000;
        routeExecutionTimes.push(executionTime);
        recordRouteExecutionTime(executionTime); // Add this line

        res.send({ jumps: route.length, route: systemsWithData, executionTime });
    });

    worker.on('error', (error) => {
        console.error(error);
        res.status(500).send('An error occurred while calculating the route');
    });
});

app.post('/search', async (req: Request, res: Response) => {
    const { query } = req.body;
    const matchedSystemNames = await System.fuzzySearchSystemByName(query);
    res.send({ data: { matchedSystemNames } });
});

app.post('/set-destination', checkForToken, async (req: Request, res: Response) => {
    const { system, addToEnd } = req.body;
    const success = await ESI.setRoute(system, addToEnd, (req.user as any).accessToken);
    res.sendStatus(success ? 200 : 401);
});

app.post('/set-waypoints', checkForToken, async (req: Request, res: Response) => {
    const { waypoints } = req.body;
    const waypointIDs = await System.resolveNamesToIDs(waypoints);
    await ESI.setWaypoints(waypointIDs, (req.user as any).accessToken);
    res.sendStatus(200);
});

app.get('/current-location', checkForToken, async (req: Request, res: Response) => {
    const location = await ESI.getCurrentLocation((req.user as any).profile.CharacterID, (req.user as any).accessToken);
    const systemName = await System.resolveIDToName(location);
    res.send({ location: systemName === 'N/A' ? 'Unknown' : systemName });
});

app.get('/metrics', async (req: Request, res: Response) => {
    res.set('Content-Type', client.register.contentType);
    res.send(await client.register.metrics());
});

export default app;