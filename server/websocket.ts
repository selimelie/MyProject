import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { ServerResponse } from 'http';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  shopId?: number;
  isAlive?: boolean;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, Set<AuthenticatedWebSocket>> = new Map();

  initialize(server: Server, sessionMiddleware: any, passportInitialize: any, passportSession: any) {
    this.wss = new WebSocketServer({ 
      noServer: true,
    });

    // Handle WebSocket upgrade with session parsing
    server.on('upgrade', (req, socket, head) => {
      const pathname = new URL(req.url || '', `http://${req.headers.host}`).pathname;
      
      // Only handle /ws path
      if (pathname !== '/ws') {
        return;
      }

      // Create a minimal response object for middleware compatibility
      const res = new ServerResponse(req) as any;
      res.writeHead = () => res;
      res.end = () => res;

      // Parse session and passport before WebSocket upgrade
      sessionMiddleware(req, res, () => {
        passportInitialize(req, res, () => {
          passportSession(req, res, () => {
            const user = (req as any).user;
            
            if (!user?.id || !user?.shopId) {
              console.log('WebSocket upgrade rejected: no valid session');
              socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
              socket.destroy();
              return;
            }

            console.log(`WebSocket upgrade approved: userId=${user.id}, shopId=${user.shopId}`);
            
            // Complete the WebSocket handshake
            this.wss?.handleUpgrade(req, socket, head, (ws) => {
              this.wss?.emit('connection', ws, req);
            });
          });
        });
      });
    });

    this.wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      console.log('New WebSocket connection established');
      
      // Get authenticated user from session (already verified during upgrade)
      const user = (req as any).user;
      const userId = user?.id;
      const shopId = user?.shopId;

      if (!userId || !shopId) {
        console.log('WebSocket connection rejected: missing credentials after verification');
        ws.close(1008, 'Authentication required');
        return;
      }

      ws.userId = userId;
      ws.shopId = shopId;
      ws.isAlive = true;

      // Add to clients map
      if (!this.clients.has(shopId)) {
        this.clients.set(shopId, new Set());
      }
      this.clients.get(shopId)?.add(ws);

      console.log(`WebSocket connected: userId=${userId}, shopId=${shopId}`);

      // Set up ping/pong for connection health check
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received WebSocket message:', message);
          
          // Handle different message types
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket disconnected: userId=${userId}, shopId=${shopId}`);
        if (shopId) {
          this.clients.get(shopId)?.delete(ws);
          if (this.clients.get(shopId)?.size === 0) {
            this.clients.delete(shopId);
          }
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Send welcome message
      ws.send(JSON.stringify({ 
        type: 'connected', 
        message: 'WebSocket connection established',
        timestamp: Date.now(),
      }));
    });

    // Set up heartbeat interval to check for dead connections
    const heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocket) => {
        const client = ws as AuthenticatedWebSocket;
        if (client.isAlive === false) {
          return client.terminate();
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30000); // Check every 30 seconds

    this.wss.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    console.log('WebSocket server initialized');
  }

  // Broadcast to all clients in a shop
  broadcastToShop(shopId: number, data: any) {
    const clients = this.clients.get(shopId);
    if (!clients) return;

    const message = JSON.stringify(data);
    let sentCount = 0;

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });

    console.log(`Broadcast to shop ${shopId}: ${sentCount} clients received message`);
  }

  // Broadcast to all connected clients
  broadcastToAll(data: any) {
    if (!this.wss) return;

    const message = JSON.stringify(data);
    let sentCount = 0;

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });

    console.log(`Broadcast to all: ${sentCount} clients received message`);
  }

  // Send to specific user
  sendToUser(userId: number, shopId: number, data: any) {
    const clients = this.clients.get(shopId);
    if (!clients) return;

    const message = JSON.stringify(data);

    clients.forEach((client) => {
      if (client.userId === userId && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Get connection stats
  getStats() {
    const stats = {
      totalClients: 0,
      shopConnections: {} as Record<number, number>,
    };

    this.clients.forEach((clients, shopId) => {
      const activeClients = Array.from(clients).filter(
        (client) => client.readyState === WebSocket.OPEN
      ).length;
      stats.shopConnections[shopId] = activeClients;
      stats.totalClients += activeClients;
    });

    return stats;
  }
}

export const wsManager = new WebSocketManager();

// Event types for broadcasting
export const WS_EVENTS = {
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  APPOINTMENT_CREATED: 'appointment:created',
  APPOINTMENT_UPDATED: 'appointment:updated',
  MESSAGE_RECEIVED: 'message:received',
  PAYMENT_COMPLETED: 'payment:completed',
  SUBSCRIPTION_UPDATED: 'subscription:updated',
} as const;
