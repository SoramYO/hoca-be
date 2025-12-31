const buildApp = require('./app');
const connectDatabase = require('./config/database');
const { PORT } = require('./config/env');
const { Server } = require('socket.io');

const startServer = async () => {
  try {
    // 1. Connect to Database
    await connectDatabase();

    // 2. Build Fastify App
    const app = await buildApp();

    // 3. Start Listening
    await app.listen({ port: PORT, host: '0.0.0.0' });
    // 4. Setup Socket.io
    const io = new Server(app.server, {
      cors: {
        origin: '*', // Adjust in production
        methods: ['GET', 'POST']
      }
    });
    
    require('./socket')(io);

    // 5. Init Jobs
    require('./jobs/streak.job')();

    global.io = io; 


  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

startServer();
