import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

interface Config {
  universeDataPath: string;
  systemsData: string;
  port: number;
  clientId: string;
  secretKey: string;
  callback: string;
  frontend: string;
  redisHost: string;
  redisPort: number;
  trigDataPath: string;
}

export class AppConfig {
  private static instance: Config;

  private constructor() {}

  public static getConfig(): Config {
    if (!AppConfig.instance) {
      AppConfig.instance = {
        universeDataPath: process.env.UNIVERSE_DATA_JSON || path.join(__dirname, '..', '..', 'universe-pretty.json'),
        systemsData: process.env.SYSTEMS_DATA_JSON || path.join(__dirname, '..', '..', 'systems-data.json'),
        trigDataPath: process.env.TRIG_DATA_JSON || path.join(__dirname, '..', '..', 'trig.json'),
        port: parseInt(process.env.PORT || '8000', 10),
        clientId: process.env.CLIENTID || 'fd3204e02fb84bcdb49003ee97fb75e2 ',
        secretKey: process.env.SECRETKEY || 'VNrf4ZOTIdOeNQFmwaxDZlKyRzS9QsOTi7DT0zt8',
        callback: process.env.CALLBACK || 'http://localhost:8000/auth/callback',
        frontend: process.env.FRONTEND || 'http://localhost:5173',
        redisHost: process.env.REDISHOST || 'localhost',
        redisPort: parseInt(process.env.REDISPORT || '6379', 10)
      };
    }
    return AppConfig.instance;
  }
}