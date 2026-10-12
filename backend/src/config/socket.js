import { createServer } from 'node:http';

import { Server } from 'socket.io';

export const configureSocket = (app) => {
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_ORIGIN, credentials: true },
  });

  io.on('connection', (socket) => {
    socket.on('queue:join', (queueId) => socket.join(`queue:${queueId}`));
  });

  app.set('io', io);
  return server;
};
