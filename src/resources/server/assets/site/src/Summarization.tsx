import React from 'react';
import { useWebSocket } from './WebSocketContext';
import { Container, Header } from '@cloudscape-design/components';

const Summarization: React.FC = () => {
  const { summarization } = useWebSocket();
  console.log('Received Summarization: ', summarization);
  return (
    <div>
      {summarization && (
        <Container header={<Header variant='h3'>Summarization</Header>}>
          {summarization}
        </Container>
      )}
    </div>
  );
};

export default Summarization;
