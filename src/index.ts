/* eslint-disable @typescript-eslint/no-var-requires */
import bodyParser from 'body-parser';
import RedisStore from "connect-redis";
import cors, { CorsOptions } from 'cors';
import express, { Request, Response } from 'express';
import session from 'express-session';
import * as schedule from 'node-schedule';
import passport from 'passport';
import { createClient } from 'redis';
import {AppConfig} from './config';
import logger from './logger';
import ESI from './models/ESI';
import routes from './routes';

const config = AppConfig.getConfig();

const app = express();

const corsOptions: CorsOptions = {
    origin: config.frontend,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    preflightContinue: true,
}

app.use(cors(corsOptions));

app.set('trust proxy', 1) // trust first proxy

// Initialize session store based on environment
let sessionStore;
if (process.env.NODE_ENV === 'production') {
    // Initialize Redis client and store for production
    const redisClient = createClient({
        url: `redis://${config.redisHost}:${config.redisPort}`,
    });
    redisClient.connect().catch(console.error);

    sessionStore = new RedisStore({
        client: redisClient,
        prefix: "myapp:",
    });
} else {
    // Use default MemoryStore for local development
    logger.warn('Using MemoryStore for sessions - not suitable for production use');
}

app.use(session({
    store: sessionStore, // Will be undefined in development, defaulting to MemoryStore
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 28080000000 }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());

ESI.getSystemData();

schedule.scheduleJob('5 * * * *', ESI.getSystemData);

app.listen(config.port, () => {
    logger.info(`Server online on port ${config.port}`);
});

app.use(routes);

