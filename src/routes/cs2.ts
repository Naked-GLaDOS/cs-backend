import { z } from 'zod';
import { rconService } from '../services/RconService.js';
import { k8sService } from '../services/K8sService.js';

export default async function cs2Routes(fastify) {
  const typedFastify = fastify.withTypeProvider();

  typedFastify.addHook('preHandler', async (request, reply) => {
    try {
      const payload = await request.jwtVerify();
      const hasCs2Permission = payload.scope === 'admin' || payload.permissions?.includes('cs2');
      if (!hasCs2Permission) {
        return reply.status(403).send({ error: 'Forbidden: Requires CS2 access permission' });
      }
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  typedFastify.get('/status', async () => {
    const [rconStatus, podStatus] = await Promise.all([
      rconService.getStatus(),
      k8sService.getPodStatus(),
    ]);
    return { ...rconStatus, pod: podStatus };
  });

  typedFastify.get('/players', async () => {
    const players = await rconService.getPlayers();
    return { players, count: players.length };
  });

  typedFastify.post('/players/:userId/kick', {
    schema: {
      params: z.object({ userId: z.coerce.number() }),
      body: z.object({ reason: z.string().optional() }),
    },
  }, async (request) => {
    const { userId } = request.params;
    const { reason } = request.body;
    const result = await rconService.kickPlayer(userId, reason);
    return { success: true, message: result };
  });

  typedFastify.post('/players/:userId/ban', {
    schema: {
      params: z.object({ userId: z.coerce.number() }),
      body: z.object({ duration: z.number().default(0), reason: z.string().optional() }),
    },
  }, async (request) => {
    const { userId } = request.params;
    const { duration, reason } = request.body;
    const result = await rconService.banPlayer(userId, duration, reason);
    return { success: true, message: result };
  });

  typedFastify.get('/maps', async () => {
    const maps = [
      'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 'de_overpass',
      'de_vertigo', 'de_ancient', 'de_anubis', 'de_mills', 'de_thera',
      'de_palais', 'de_basalt', 'cs_italy', 'cs_office',
    ];
    return { maps };
  });

  typedFastify.post('/maps/change', {
    schema: {
      body: z.object({ map: z.string() }),
    },
  }, async (request) => {
    const { map } = request.body;
    const result = await rconService.changeMap(map);
    return { success: true, message: result };
  });

  typedFastify.get('/gamemodes', async () => {
    return {
      modes: [
        { id: 'competitive', name: 'Competitive', description: '5v5 competitive matchmaking' },
        { id: 'casual', name: 'Casual', description: '10v10 casual gameplay' },
        { id: 'deathmatch', name: 'Deathmatch', description: 'Free-for-all deathmatch' },
        { id: 'armsrace', name: 'Arms Race', description: 'Progressive weapon elimination' },
        { id: 'demolition', name: 'Demolition', description: 'Team-based demolition' },
        { id: 'wingman', name: 'Wingman', description: '2v2 competitive on smaller maps' },
      ],
    };
  });

  typedFastify.post('/gamemodes/set', {
    schema: {
      body: z.object({ mode: z.string() }),
    },
  }, async (request) => {
    const { mode } = request.body;
    const result = await rconService.setGameMode(mode);
    return { success: true, message: result };
  });

  typedFastify.get('/settings', async () => {
    const cvars = await rconService.getCVars([
      'mp_maxrounds', 'mp_roundtime', 'mp_roundtime_defuse',
      'mp_freezetime', 'mp_buytime', 'mp_startmoney',
      'mp_maxmoney', 'mp_teamcashawards', 'mp_playercashawards',
      'mp_friendlyfire', 'mp_autokick', 'mp_solid_teammates',
      'sv_cheats', 'hostname', 'sv_password',
    ]);
    return { settings: cvars };
  });

  typedFastify.put('/settings', {
    schema: {
      body: z.object({
        settings: z.record(z.string(), z.string()),
      }),
    },
  }, async (request) => {
    const { settings } = request.body;
    const results = await rconService.setCVars(settings);
    return { success: true, results };
  });

  typedFastify.post('/console', {
    schema: {
      body: z.object({ command: z.string().min(1) }),
    },
  }, async (request) => {
    const { command } = request.body;
    const result = await rconService.send(command);
    return { command, result };
  });

  typedFastify.get('/logs', {
    schema: {
      querystring: z.object({
        tail: z.coerce.number().default(500),
      }),
    },
  }, async (request) => {
    const { tail } = request.query;
    const logs = await k8sService.getPodLogs(tail);
    return { logs };
  });

  typedFastify.post('/server/restart', async () => {
    const result = await k8sService.restartServer();
    return result;
  });

  typedFastify.post('/server/stop', async () => {
    const result = await k8sService.stopServer();
    return result;
  });

  typedFastify.post('/server/start', async () => {
    const result = await k8sService.startServer();
    return result;
  });

  typedFastify.post('/server/say', {
    schema: {
      body: z.object({ message: z.string().min(1).max(200) }),
    },
  }, async (request) => {
    const { message } = request.body;
    const result = await rconService.say(message);
    return { success: true, message: result };
  });

  typedFastify.post('/server/restartgame', async () => {
    const result = await rconService.restartGame();
    return { success: true, message: result };
  });

  typedFastify.get('/config', async () => {
    const podStatus = await k8sService.getPodStatus();
    return {
      rconHost: process.env.CS2_RCON_HOST || 'cs2-server.apps.svc.cluster.local',
      rconPort: parseInt(process.env.CS2_RCON_PORT || '27015'),
      serverPort: parseInt(process.env.CS2_SERVER_PORT || '27015'),
      serverIp: process.env.CS2_SERVER_IP || '',
      podStatus,
    };
  });
}
