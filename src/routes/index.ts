/* eslint-disable @typescript-eslint/no-var-requires */
import axios from 'axios';
import express, { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import AppConfig from '../config';
import ESI from '../models/ESI';
import Graph from '../models/Graph';
import System from '../models/System';

AppConfig.getConfig();

const EveOnlineSsoStrategy = require('passport-eveonline-sso');
const refresh = require('passport-oauth2-refresh');

const app = express();

const strategy = new EveOnlineSsoStrategy({
    clientID: AppConfig.config?.clientId,
    secretKey: AppConfig.config?.secretKey,
    callbackURL: AppConfig.config?.callback,
    scope: 'esi-ui.write_waypoint.v1'
},
    function (accessToken: any, refreshToken: any, profile: any, done: any) {
        return done(null, { accessToken, refreshToken, profile });
    }
)

passport.use(strategy);
refresh.use(strategy);


passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (user: any, done) {
    done(null, user);
});


const checkForToken = async (req: Request, res: Response, next: NextFunction) => {
    if (req.user === undefined) {
        res.sendStatus(401);
        return;
    }

    // refresh token

    try {
        const response = await axios.post(
            'https://login.eveonline.com/v2/oauth/token',
            `grant_type=refresh_token&refresh_token=${encodeURIComponent((req.user as any).refreshToken)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${AppConfig.config?.clientId}:${AppConfig.config?.secretKey}`).toString('base64')}`
                },
            }
        );

        // Update the user object with the new access token
        (req.user as any).accessToken = response.data.access_token;
        next();
    } catch (error: any) {
        console.error('Error refreshing token:', error.response ? error.response.data : error.message);
        res.sendStatus(401);
    }

}

app.get('/profile',
    function (req, res) {
        res.send({ user: req.user });
    });

app.get('/auth', passport.authenticate('eveonline-sso'));

app.get('/auth/callback',
    passport.authenticate('eveonline-sso', { successReturnToOrRedirect: AppConfig.config?.frontend, failureRedirect: '/auth' }));

app.post('/systems', (req: Request, res: Response) => {
    const { system, stargateJumps, lightyears, jumpDriveRange, mode } = req.body;
    let systems: string[] = [];
    if (mode === 'stargate') {
        systems = System.findSystemsWithStargateJumps(system, parseInt(stargateJumps));
    }
    else if (mode === 'lightyears') {
        systems = System.findSystemsWithinRange(system, parseFloat(lightyears));
    }
    else if (mode === 'jump drive') {
        systems = System.findSystemsWithinRange(system, parseFloat(jumpDriveRange));
    }
    res.send({ data: { systems } });
});

app.post('/graph', (req: Request, res: Response) => {
    const { systems } = req.body;
    const systemsData = System.getConnectedSystems(systems);
    const graph = Graph.generateGraph(systemsData);
    res.send({ data: { graph } });
});

app.post('/data', async (req: Request, res: Response) => {
    const { systems, origin } = req.body;
    const systemsData = await System.getKillsAndJumpsForSystems(systems, origin);
    res.send({ data: { systemsData } });
});

app.post('/jumps', async (req: Request, res: Response) => {
    const { systems, origin } = req.body;
    const jumpsData = await System.getJumpsFromOrigin(systems, origin);
    res.send({ data: { jumpsData } });
});

app.post('/search', (req: Request, res: Response) => {
    const { query } = req.body;
    const matchedSystemNames = System.fuzzySearchSystemByName(query);
    res.send({ data: { matchedSystemNames } });
});

app.post('/set-destination', checkForToken, async (req: Request, res: Response) => {
    const { system, addToEnd } = req.body;
    const success = await ESI.setRoute(system, addToEnd, (req.user as any).accessToken);
    res.sendStatus(success ? 200 : 401);
});

export default app;