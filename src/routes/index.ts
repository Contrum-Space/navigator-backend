/* eslint-disable @typescript-eslint/no-var-requires */
import axios from 'axios';
import express, { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { Worker } from 'worker_threads';
import path from 'path';
import client, { Registry } from 'prom-client';
import nodeHtmlToImage from 'node-html-to-image';
import fs from 'fs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

import { AppConfig } from '../config';
import ESI from '../models/ESI';
import System from '../models/System';
import Metro from '../models/Metro';
import logger from '../logger';

const EveOnlineSsoStrategy = require('passport-eveonline-sso');
const refresh = require('passport-oauth2-refresh');

const CACHE_TTL = 1000 * 60 * 60; // 1 hour in milliseconds
const routeCache = new Map<string, {
    data: any,
    timestamp: number
}>();

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

// Update rate limiters with different limits
const routeCalculationLimiterWithWaypoints = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // Limit each IP to 5 requests per minute when using waypoints
    message: 'Too many route calculations with waypoints, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

const routeCalculationLimiterNoWaypoints = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 15, // Limit each IP to 15 requests per minute for direct routes
    message: 'Too many route calculations, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Add middleware to choose the appropriate rate limiter
const selectRateLimiter = (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting in local environment
    if (process.env.NODE_ENV === 'development') {
        return next();
    }

    const { waypoints } = req.body;
    if (waypoints && waypoints.length > 0) {
        routeCalculationLimiterWithWaypoints(req, res, next);
    } else {
        routeCalculationLimiterNoWaypoints(req, res, next);
    }
};

// Add this before app.use(generalLimiter)
const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // Limit each IP to 60 requests per minute
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply general rate limiting to all routes
app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting in local environment
    if (process.env.NODE_ENV === 'development') {
        return next();
    }
    generalLimiter(req, res, next);
});

// Add this middleware function before the routes
const skipRateLimitForCache = (req: Request, res: Response, next: NextFunction) => {
    const { destination, origin, waypoints, keepWaypointsOrder, useThera, useTurnur, minWhSize, avoidSystems } = req.body;
    
    const cacheKey = crypto.createHash('md5').update(
        JSON.stringify({ origin, destination, waypoints, keepWaypointsOrder, useThera, useTurnur, minWhSize, avoidSystems })
    ).digest('hex');

    const cached = routeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return next();
    }
    next();
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
        if (err) logger.error(err);
        res.sendStatus(200);
    });
});

app.get('/auth', passport.authenticate('eveonline-sso'));

app.get('/auth/callback', passport.authenticate('eveonline-sso', {
    successReturnToOrRedirect: AppConfig.getConfig().frontend,
    failureRedirect: '/auth'
}));

app.get('/pochven-connection-count', async (req: Request, res: Response) => {
    const count = (await Metro.getConnections(2116460876)).length/2;
    res.send({ count });
});

app.post('/route', 
    skipRateLimitForCache,
    selectRateLimiter, 
    async (req: Request, res: Response) => {
    const startTime = process.hrtime();
    const { destination, origin, waypoints, keepWaypointsOrder, useThera, useTurnur, usePochven, minWhSize, avoidSystems, avoidEdencom, avoidTrig } = req.body;

    if (waypoints && waypoints.length > 3) {
        return res.status(400).send('Waypoints limit reached');
    }
    
    const cacheKey = crypto.createHash('md5').update(
        JSON.stringify({ origin, destination, waypoints, keepWaypointsOrder, useThera, useTurnur, usePochven, minWhSize, avoidSystems, avoidEdencom, avoidTrig })
    ).digest('hex');

    const cached = routeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        const endTime = process.hrtime(startTime);
        const executionTime = endTime[0] * 1000 + endTime[1] / 1000000;
        return res.send({ ...cached.data, executionTime, cached: true });
    }
    
    const resolvedPath = path.join(__dirname, '..', process.env.NODE_ENV === 'production' ? 'routeWorker.js' : 'routeWorker.ts');
    const worker = new Worker(resolvedPath, {
        workerData: { characterID: req.user ? (req.user as any).profile?.CharacterID : undefined, origin, destination, waypoints, useThera, useTurnur, usePochven, keepWaypointsOrder, minWhSize, avoidSystems, avoidEdencom, avoidTrig },
        execArgv: /\.ts$/.test(resolvedPath) ? ["--require", "ts-node/register"] : undefined,
    });

    spawnedWorkerThreads+=1;
    workerGauge.set(spawnedWorkerThreads);

    // Set a timeout to terminate the worker after 30 seconds
    const timeout = setTimeout(() => {
        worker.terminate();
        spawnedWorkerThreads-=1;
        workerGauge.set(spawnedWorkerThreads);
        res.status(504).send('Route calculation timed out');
    }, 45000);

    worker.on('message', async (result) => {
        clearTimeout(timeout);
        spawnedWorkerThreads-=1;
        workerGauge.set(spawnedWorkerThreads);
        
        const { route } = result;
        const systemsWithData = await System.getData(route);
        
        const endTime = process.hrtime(startTime);
        const executionTime = endTime[0] * 1000 + endTime[1] / 1000000;
        routeExecutionTimes.push(executionTime);
        recordRouteExecutionTime(executionTime);

        const responseData = { jumps: route.length, route: systemsWithData, executionTime };
        
        routeCache.set(cacheKey, {
            data: responseData,
            timestamp: Date.now()
        });

        res.send(responseData);
    });

    worker.on('error', (error) => {
        clearTimeout(timeout);
        spawnedWorkerThreads--;
        workerGauge.set(spawnedWorkerThreads);
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

app.get('/og', async (req: Request, res: Response) => {
    const { from, to, waypoints, thera, turnur, size } = req.query;
    
    if (!from || !to) {
        return res.status(400).send('Missing parameters');
    }

    try {
        // Calculate current route with user's preferences
        const routeResponse = await axios.post(`http://localhost:${config.port}/route`, {
            origin: from,
            destination: to,
            waypoints: waypoints ? String(waypoints).split(',') : [],
            useThera: thera === 'true',
            useTurnur: turnur === 'true',
            minWhSize: size
        });
        const jumps = routeResponse.data.jumps;

        // Calculate old route without Thera/Turnur
        const oldRouteResponse = await axios.post(`http://localhost:${config.port}/route`, {
            origin: from,
            destination: to,
            waypoints: waypoints ? String(waypoints).split(',') : [],
            useThera: false,
            useTurnur: false
        });
        const oldJumps = oldRouteResponse.data.jumps;

        const bgPath = path.join(__dirname, '../../public/Starfield.png');
        const bgBase64 = fs.readFileSync(bgPath).toString('base64');
        const bgDataUri = `data:image/png;base64,${bgBase64}`;

        // Format waypoints display
        let waypointsDisplay = '';
        if (waypoints) {
            const waypointsList = String(waypoints).split(',');
            const displayWaypoints = waypointsList.slice(0, 2);
            const remainingCount = waypointsList.length - 2;
            waypointsDisplay = `
                <div class="waypoints">
                    via ${displayWaypoints.join(', ')}
                    ${remainingCount > 0 ? `<span class="more">+${remainingCount} more</span>` : ''}
                </div>`;
        }

        const image = await nodeHtmlToImage({
            html: `
                <html>
                    <head>
                        <style>
                            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;700&display=swap');
                            body {
                                width: 1200px;
                                height: 630px;
                                margin: 0;
                                padding: 0;
                                font-family: 'Inter', system-ui, sans-serif;
                                background-image: url('{{{bg}}}');
                                background-size: cover;
                                color: white;
                                display: flex;
                                flex-direction: column;
                            }
                            .logo {
                                position: absolute;
                                top: 40px;
                                left: 40px;
                                width: 64px;
                                height: 64px;
                                border-radius: 8px;
                            }
                            .container {
                                flex: 1;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            }
                            .content {
                                text-align: center;
                                background: rgba(0, 0, 0, 0.4);
                                backdrop-filter: blur(10px);
                                padding: 40px 60px;
                                border-radius: 16px;
                                border: 1px solid rgba(255, 255, 255, 0.1);
                            }
                            .route {
                                font-size: 84px;
                                font-weight: 700;
                                margin-bottom: 8px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 24px;
                            }
                            .arrow {
                                color: #3B82F6;
                            }
                            .details {
                                font-size: 42px;
                                color: #94A3B8;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 16px;
                            }
                            .accent {
                                color: #3B82F6;
                                font-weight: 500;
                            }
                            .waypoints {
                                font-size: 32px;
                                color: #94A3B8;
                                margin-bottom: 16px;
                                text-align: center;
                            }
                            .more {
                                color: #64748B;
                                font-style: italic;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="content">
                                <div class="route">
                                    ${from} <span class="arrow">→</span> ${to}
                                </div>
                                ${waypointsDisplay}
                                <div class="details">
                                    <span class="accent">${jumps}</span> jumps 
                                    ${jumps !== oldJumps ? `<span style="color: #64748B">(was ${oldJumps})</span>` : ''}
                                </div>
                            </div>
                        </div>
                    </body>
                </html>
            `,
            type: 'png',
            content: {
                bg: bgDataUri
            },
            puppeteerArgs: {
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(image);
    } catch (e) {
        console.error(e);
        return res.status(500).send('Failed to generate image');
    }
});

app.get('/subscription', checkForToken, async (req: Request, res: Response) => {
    const { corporationId, allianceId } = await ESI.getCorporationAndAlliance((req.user as any).profile.CharacterID);
    const subscription = await Metro.checkSubscription((req.user as any).profile.CharacterID, corporationId, allianceId);
    res.send({ subscription });
});

const cleanupCache = () => {
    const now = Date.now();
    for (const [key, value] of routeCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            routeCache.delete(key);
        }
    }
};

setInterval(cleanupCache, CACHE_TTL);

export default app;