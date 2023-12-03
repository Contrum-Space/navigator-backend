import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

interface Config {
  universeDataPath: string;
  systemsData: string;
  port: string;
  clientId: string;
  secretKey: string;
  callback: string;
  frontend: string;
  redisHost: string;
  redisPort: number;
}

class AppConfig {
  public static config: Config | null = null;

  private static loadConfig(): void {
    // Load configuration from environment variables or use default values
    const universeDataPath = process.env.UNIVERSE_DATA_JSON || path.join(__dirname, '..', '..', 'universe-pretty.json');
    const systemsData = process.env.UNIVERSE_DATA_JSON || path.join(__dirname, '..', '..', 'systems-data.json');
    const port = process.env.PORT || '8000';
    const clientId = process.env.CLIENTID || '';
    const secretKey = process.env.SECRETKEY || '';
    const callback = process.env.CALLBACK || '';
    const frontend = process.env.FRONTEND || '';
    const redisHost = process.env.REDISHOST || '';
    const redisPort = parseInt(process.env.REDISPORT!) || 6379;

    AppConfig.config = {
      universeDataPath,
      systemsData,
      port,
      clientId,
      secretKey,
      callback,
      frontend,
      redisHost,
      redisPort
    };
  }

  public static getConfig(): Config {
    if (!AppConfig.config) {
      AppConfig.loadConfig();
    }
    return AppConfig.config!;
  }
}

export default AppConfig;