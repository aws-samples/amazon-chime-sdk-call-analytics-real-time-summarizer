import React, { useState, useEffect } from 'react';
import { Message } from './Message';
import { WebSocketContext } from './WebSocketContext';

const WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:8080';

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [transcriptions, setTranscriptions] = useState<Message[]>([]);
  const [currentLine, setCurrentLine] = useState<Message[]>([]);
  const [summarization, setSummarization] = useState('');

  useEffect(() => {
    const ws = new WebSocket(WEBSOCKET_URL);

    ws.onopen = () => {
      console.debug('Connected to WebSocket');
      setSocket(ws);
      setConnected(true);
      console.log('connected state in WebSocketProvider:', connected);
    };

    ws.onmessage = (event) => {
      console.debug('Received message:', event.data);
      const data: Message = JSON.parse(event.data);
      setMessages((prevMessages) => [...prevMessages, data]);
      if (data['detail-type'] === 'Transcribe') {
        if (data.TranscriptEvent && data.TranscriptEvent.Alternatives) {
          if (data.TranscriptEvent.IsPartial) {
            console.debug('Partial transcription:', data);
            setCurrentLine([data]);
          } else {
            console.debug('Full transcription:', data);
            setTranscriptions((prevTranscriptions) => [
              ...prevTranscriptions,
              data,
            ]);
            setCurrentLine([]);
          }
        }
      } else if (data.summarization) {
        console.debug('Received summarization:', data.summarization);
        setSummarization(data.summarization);
      }
    };

    ws.onerror = (error: Event) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.debug('WebSocket connection closed');
      setSocket(null);
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const clearMessages = () => {
    setMessages([]);
    setTranscriptions([]);
    setCurrentLine([]);
    setSummarization('');
  };

  const value = {
    connected,
    socket,
    messages,
    transcriptions,
    currentLine,
    summarization,
    clearMessages,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
