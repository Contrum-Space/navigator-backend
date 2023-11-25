import bodyParser from 'body-parser';
import express, { Request, Response } from 'express';
import AppConfig from './config';
import logger from './logger';
import System from './models/System';

AppConfig.getConfig();

const app = express();
app.use(bodyParser.json());

app.listen(AppConfig.config?.port, () => {
    logger.info(`Server online on port ${AppConfig.config?.port}`);
});

app.get('/', (req: Request, res: Response) => {
    res.send("Hello");
})

app.get('/systems', (req: Request, res: Response) => {
    const { system, jumps } = req.body;
    const systems = System.findSystemsWithinRange(system, parseInt(jumps));
    res.send({ data: {systems} });
})