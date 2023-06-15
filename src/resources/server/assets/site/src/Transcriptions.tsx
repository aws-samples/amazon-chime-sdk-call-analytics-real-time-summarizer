import React from 'react';
import { useWebSocket } from './WebSocketContext';
import {
  Table,
  Container,
  Button,
  Header,
  SpaceBetween,
} from '@cloudscape-design/components';

const Transcriptions: React.FC = () => {
  const { transcriptions, currentLine, clearMessages } = useWebSocket();

  const items = [
    ...transcriptions.map((transcription) => ({
      speaker:
        transcription.TranscriptEvent.ChannelId === 'ch_0'
          ? 'Agent'
          : 'Customer',
      transcript: transcription.TranscriptEvent.Alternatives[0].Transcript,
    })),
    ...(currentLine.length > 0
      ? [
          {
            speaker:
              currentLine[0].TranscriptEvent.ChannelId === 'ch_0'
                ? 'Agent'
                : 'Customer',
            transcript:
              currentLine[0].TranscriptEvent.Alternatives[0].Transcript,
          },
        ]
      : []),
  ];
  return (
    <div>
      <Table
        header={
          <Header
            variant='h3'
            actions={
              <SpaceBetween direction='horizontal' size='xs'>
                <Button variant='primary' onClick={clearMessages}>
                  Clear
                </Button>
              </SpaceBetween>
            }
          >
            Transcription
          </Header>
        }
        columnDefinitions={[
          {
            id: 'speaker',
            header: 'Speaker',
            cell: (item) => item.speaker,
            sortingField: 'speaker',
            isRowHeader: true,
            width: 100,
          },
          {
            id: 'transcript',
            header: 'Transcript',
            cell: (item) => item.transcript,
            sortingField: 'transcript',
            isRowHeader: true,
          },
        ]}
        items={items}
        sortingDisabled
        stickyHeader
        wrapLines
        variant='container'
        contentDensity='compact'
      />
    </div>
  );
};

export default Transcriptions;
