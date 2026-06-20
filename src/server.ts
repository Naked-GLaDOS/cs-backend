import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import cs2Routes from './routes/cs2.js';
import { rconService } from './services/RconService.js';

const server = Fastify({
  logger: true,
}).withTypeProvider();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.setErrorHandler((error, request, reply) => {
  if (error.statusCode === 401 || error.statusCode === 403) {
    server.log.warn(`[${error.statusCode}] Unauthorized: ${error.message}`);
    return reply.status(error.statusCode).send({ error: 'Unauthorized' });
  }
  if (error.statusCode === 400) {
    server.log.warn(`[400] Validation Error: ${error.message}`);
  } else {
    server.log.error(error);
  }
  reply.status(error.statusCode || 500).send(error);
});

server.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
});

const WEAK_JWT_DEFAULTS = [
  'super-secret-key-change-me',
  'secret',
  'changeme',
  'password',
  'jwt-secret',
  'your-secret-key',
];

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32 || WEAK_JWT_DEFAULTS.includes(jwtSecret)) {
  throw new Error('JWT_SECRET must be at least 32 characters and not a default value');
}
server.register(jwt, {
  secret: jwtSecret,
});

const allowedOrigins = (process.env.CORS_ORIGINS || 'https://naked-glados.com,https://cs.naked-glados.com').split(',');
server.register(cors, {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

server.get('/health', async () => {
  let rconOk = false;
  try {
    await rconService.send('status');
    rconOk = true;
  } catch {
    rconOk = false;
  }
  return { status: 'ok', rcon: rconOk, uptime: process.uptime() };
});

server.register(cs2Routes, { prefix: '/cs2' });

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`CS Backend listening on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
