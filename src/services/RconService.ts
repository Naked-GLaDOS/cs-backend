import { Rcon } from 'rcon-client';

export class RconService {
  private rcon: Rcon | null = null;
  private host: string;
  private port: number;
  private password: string;
  private reconnecting = false;

  constructor() {
    this.host = process.env.CS2_RCON_HOST || 'cs2-server.apps.svc.cluster.local';
    this.port = parseInt(process.env.CS2_RCON_PORT || '27015');
    this.password = process.env.CS2_RCON_PASSWORD || 'changeme';
  }

  async connect(): Promise<Rcon> {
    if (this.rcon && this.rcon.connected) {
      return this.rcon;
    }

    try {
      this.rcon = await Rcon.connect({
        host: this.host,
        port: this.port,
        password: this.password,
      });
      console.log('[RCON] Connected to CS2 server');
      return this.rcon;
    } catch (error) {
      console.error('[RCON] Connection failed:', error);
      throw error;
    }
  }

  async send(command: string): Promise<string> {
    try {
      const client = await this.connect();
      const response = await client.send(command);
      return response || '';
    } catch (error) {
      console.error('[RCON] Command failed:', error);
      this.rcon = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.rcon) {
      await this.rcon.end();
      this.rcon = null;
    }
  }

  async getStatus(): Promise<{ online: boolean; players?: number; maxPlayers?: number; map?: string; gameMode?: string }> {
    try {
      const status = await this.send('status');
      const players = await this.send('players');

      const playerMatch = status.match(/(\d+) humans?/);
      const maxMatch = status.match(/max\s+(\d+)/i);
      const mapMatch = status.match(/map:\s+(\S+)/i);

      return {
        online: true,
        players: playerMatch ? parseInt(playerMatch[1]) : 0,
        maxPlayers: maxMatch ? parseInt(maxMatch[1]) : 0,
        map: mapMatch ? mapMatch[1] : 'unknown',
      };
    } catch {
      return { online: false };
    }
  }

  async getPlayers(): Promise<Array<{ id: number; name: string; steamId: string; score: number; time: string }>> {
    try {
      const response = await this.send('players');
      const players: Array<{ id: number; name: string; steamId: string; score: number; time: string }> = [];

      const lines = response.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(\d+)\s+"(.+?)"\s+\[(STEAM_\S+)\]\s+(\d+)\s+(\d+:\d+)/);
        if (match) {
          players.push({
            id: parseInt(match[1]),
            name: match[2],
            steamId: match[3],
            score: parseInt(match[4]),
            time: match[5],
          });
        }
      }

      return players;
    } catch {
      return [];
    }
  }

  async kickPlayer(userId: number, reason?: string): Promise<string> {
    return this.send(`kick ${userId}${reason ? ` "${reason}"` : ''}`);
  }

  async banPlayer(userId: number, durationMinutes: number = 0, reason?: string): Promise<string> {
    return this.send(`banid ${durationMinutes} ${userId}${reason ? ` "${reason}"` : ''}`);
  }

  async changeMap(mapName: string): Promise<string> {
    return this.send(`changelevel ${mapName}`);
  }

  async setGameMode(mode: string): Promise<string> {
    const modeMap: Record<string, { game_mode: number; game_type: number }> = {
      competitive: { game_mode: 1, game_type: 0 },
      casual: { game_mode: 0, game_type: 0 },
      deathmatch: { game_mode: 2, game_type: 0 },
      armsrace: { game_mode: 1, game_type: 0 },
      demolition: { game_mode: 2, game_type: 0 },
      wingman: { game_mode: 2, game_type: 0 },
      dangerzone: { game_mode: 0, game_type: 0 },
    };

    const config = modeMap[mode.toLowerCase()];
    if (!config) {
      throw new Error(`Unknown game mode: ${mode}`);
    }

    await this.send(`game_mode ${config.game_mode}`);
    await this.send(`game_type ${config.game_type}`);
    return `Game mode set to ${mode}`;
  }

  async setCVars(cvars: Record<string, string>): Promise<string[]> {
    const results: string[] = [];
    for (const [key, value] of Object.entries(cvars)) {
      const result = await this.send(`${key} ${value}`);
      results.push(result);
    }
    return results;
  }

  async getCVars(cvarNames: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const name of cvarNames) {
      try {
        const response = await this.send(name);
        result[name] = response.trim();
      } catch {
        result[name] = 'error';
      }
    }
    return result;
  }

  async say(message: string): Promise<string> {
    return this.send(`say "${message}"`);
  }

  async restartGame(): Promise<string> {
    return this.send('mp_restartgame 1');
  }
}

export const rconService = new RconService();
