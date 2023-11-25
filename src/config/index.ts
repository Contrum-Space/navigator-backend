import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..' ,'..', '.env') });

interface Config {
  universeDataPath: string;
  port: string;
}

class AppConfig {
  public static config: Config | null = null;

  private static loadConfig(): void {
    // Load configuration from environment variables or use default values
    const universeDataPath = process.env.UNIVERSE_DATA_JSON || path.join(__dirname, '..' , '..' ,'universe-pretty.json');
    const port = process.env.PORT || '8000';

    AppConfig.config = {
      universeDataPath,
      port,
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