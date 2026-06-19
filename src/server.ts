import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import cs2Routes from './routes/cs2.js';

const server = Fastify({
  logger: true,
}).withTypeProvider();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.setErrorHandler((error, request, reply) => {
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

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'super-secret-key-change-me') {
  console.error('[SECURITY FATAL] JWT_SECRET is not set or is using the insecure default. Set a strong random value and restart.');
  process.exit(1);
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

server.register(cs2Routes, { prefix: '/cs2' });

server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

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
