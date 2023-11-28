import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Request, Response } from 'express';
import AppConfig from './config';
import logger from './logger';
import Graph from './models/Graph';
import System from './models/System';

AppConfig.getConfig();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.listen(AppConfig.config?.port, () => {
    logger.info(`Server online on port ${AppConfig.config?.port}`);
});

app.get('/', (req: Request, res: Response) => {
    res.send("Hello");
})

app.post('/systems', (req: Request, res: Response) => {
    const { system, jumps } = req.body;
    const systems = System.findSystemsWithinRange(system, parseInt(jumps));
    res.send({ data: { systems } });
})

app.post('/graph', (req: Request, res: Response) => {
    const { systems } = req.body;
    const systemsData = System.getConnectedSystems(systems);
    const graph = Graph.applyForceDirectedLayout(systemsData);
    res.send({ data: { graph } });
})