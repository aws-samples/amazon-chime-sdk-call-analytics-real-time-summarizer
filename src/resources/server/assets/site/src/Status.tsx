import React from 'react';
import {
  Box,
  ColumnLayout,
  Container,
  Header,
  StatusIndicator,
} from '@cloudscape-design/components';
import { useWebSocket } from './WebSocketContext';

const PHONE_NUMBER = process.env.PHONE_NUMBER || '+1 (555) 555-5555';

export const Status = () => {
  const { connected } = useWebSocket();

  return (
    <Container header={<Header variant='h3'>Status</Header>}>
      <ColumnLayout columns={2} variant='text-grid'>
        <Box variant='awsui-key-label'>Phone Number</Box>
        {PHONE_NUMBER}
        <Box variant='awsui-key-label'>Websocket Status</Box>
        <StatusIndicator type={connected ? 'success' : 'error'}>
          {connected ? 'Connected' : 'Disconnected'}
        </StatusIndicator>
      </ColumnLayout>
    </Container>
  );
};
