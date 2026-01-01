const fastify = require('fastify');
const cors = require('@fastify/cors');
const jwt = require('@fastify/jwt');
const { JWT_SECRET, CLIENT_URL } = require('./config/env');

// Register Models
require('./models/User');
require('./models/Badge');
require('./models/Room');
require('./models/RoomCategory');
require('./models/Transaction');
require('./models/Report');
require('./models/SystemConfig');
require('./models/Message');

const buildApp = async () => {
  // Configure logger based on environment
  const loggerConfig = process.env.NODE_ENV === 'production'
    ? true // Use default Pino logger in production
    : {
      transport: {
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    };

  const app = fastify({
    logger: loggerConfig
  });

  // Register Middleware
  await app.register(cors, {
    origin: (origin, cb) => {
      const allowedOrigins = [
        'http://localhost:3000',
        CLIENT_URL
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });


  await app.register(jwt, {
    secret: JWT_SECRET
  });

  // Health Check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date() };
  });

  // Register Routes
  app.register(require('./routes/auth.routes'), { prefix: '/api/auth' });
  app.register(require('./routes/user.routes'), { prefix: '/api/users' });
  app.register(require('./routes/room.routes'), { prefix: '/api/rooms' });
  app.register(require('./routes/payment.routes'), { prefix: '/api/payment' });
  app.register(require('./routes/pricing.routes'), { prefix: '/api/pricing' });
  app.register(require('./routes/report.routes'), { prefix: '/api/reports' });
  app.register(require('./routes/admin.routes'), { prefix: '/api/admin' });
  app.register(require('./routes/ads.routes'), { prefix: '/api/ads' });
  app.register(require('./routes/badge.routes'), { prefix: '/api/badges' });
  app.register(require('./routes/chat.routes'), { prefix: '/api/chat' });
  app.register(require('./routes/quote.routes'), { prefix: '/api/quotes' });


  return app;
};

module.exports = buildApp;
