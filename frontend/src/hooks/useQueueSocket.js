import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') || 'http://localhost:5000';

export const useQueueSocket = (providerId, branchCode, serviceCode, queueDate, initialQueue = null) => {
  const [queue, setQueue] = useState(initialQueue);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!providerId) {
      setQueue(null);
      return undefined;
    }
    const socket = io(SOCKET_URL, { withCredentials: true, transports: ['websocket', 'polling'] });
    
    // Use UTC date to match backend's beginningOfDay() function
    const date = queueDate ? new Date(queueDate) : new Date();
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dateStr = utcDate.toISOString().slice(0, 10);
    
    const roomId = `${providerId}:${String(branchCode || '').toUpperCase()}:${String(serviceCode || '').toUpperCase()}:${dateStr}`;
    
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('queue:join', roomId);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('queue:update', (data) => {
      setQueue(data);
      // Update initialQueue state when receiving updates
      if (initialQueue) {
        setQueue(prev => ({ ...prev, ...data }));
      } else {
        setQueue(data);
      }
    });
    return () => {
      socket.off('queue:update');
      socket.disconnect();
    };
  }, [providerId, branchCode, serviceCode, queueDate]);

  useEffect(() => {
    if (initialQueue) setQueue(initialQueue);
  }, [initialQueue]);

  return { queue, setQueue, connected };
};
