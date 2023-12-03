/* eslint-disable @typescript-eslint/no-var-requires */
import bodyParser from 'body-parser';
import RedisStore from "connect-redis";
import cors, { CorsOptions } from 'cors';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { createClient } from 'redis';
import AppConfig from './config';
import logger from './logger';
import ESI from './models/ESI';
import routes from './routes';

AppConfig.getConfig();


const app = express();

const corsOptions: CorsOptions = {
    origin: AppConfig.config?.frontend,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    preflightContinue: true,
}

app.use(cors(corsOptions));

app.set('trust proxy', 1) // trust first proxy

// Initialize client.
const redisClient = createClient({
    url: `redis://${AppConfig.config?.redisHost}:${AppConfig.config?.redisPort}`,
})
redisClient.connect().catch(console.error)

// Initialize store.
const redisStore = new RedisStore({
    client: redisClient,
    prefix: "myapp:",
})


app.use(session({
    store: redisStore,
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());

ESI.getSystemData();

setInterval(() => {
    ESI.getSystemData();
}, 600000);



app.listen(AppConfig.config?.port, () => {
    logger.info(`Server online on port ${AppConfig.config?.port}`);
});

app.use(routes);