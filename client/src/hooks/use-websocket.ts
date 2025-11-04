import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onOrderCreated?: (order: any) => void;
  onAppointmentCreated?: (appointment: any) => void;
  onMessageReceived?: (data: { conversationId: number; message: any }) => void;
  onPaymentCompleted?: (data: any) => void;
  onSubscriptionUpdated?: (data: any) => void;
  reconnectInterval?: number;
  enabled?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onOrderCreated,
    onAppointmentCreated,
    onMessageReceived,
    onPaymentCompleted,
    onSubscriptionUpdated,
    reconnectInterval = 5000,
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnect = useRef(enabled);

  // Get current user to establish authenticated connection
  const { data: user } = useQuery<any>({
    queryKey: ['/api/auth/me'],
    enabled,
  });

  const connect = useCallback(() => {
    if (!enabled || !user?.id || !user?.shopId) {
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      console.log('Connecting to WebSocket (session-authenticated)');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        
        // Clear any pending reconnect attempts
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          
          setLastMessage(message);
          
          // Call general message handler
          onMessage?.(message);
          
          // Call specific handlers based on message type
          switch (message.type) {
            case 'order:created':
              onOrderCreated?.(message.data);
              break;
            case 'appointment:created':
              onAppointmentCreated?.(message.data);
              break;
            case 'message:received':
              onMessageReceived?.(message.data);
              break;
            case 'payment:completed':
              onPaymentCompleted?.(message.data);
              break;
            case 'subscription:updated':
              onSubscriptionUpdated?.(message.data);
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if enabled
        if (shouldReconnect.current && enabled) {
          console.log(`Reconnecting in ${reconnectInterval}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, [enabled, user, reconnectInterval, onMessage, onOrderCreated, onAppointmentCreated, onMessageReceived, onPaymentCompleted, onSubscriptionUpdated]);

  const disconnect = useCallback(() => {
    shouldReconnect.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  // Initialize connection
  useEffect(() => {
    if (enabled && user?.id && user?.shopId) {
      shouldReconnect.current = true;
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, user?.id, user?.shopId, connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    disconnect,
  };
}
