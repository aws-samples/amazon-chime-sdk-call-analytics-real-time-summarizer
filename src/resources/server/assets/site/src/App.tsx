import React from 'react';
import Transcriptions from './Transcriptions';
import Summarization from './Summarization';
import { Status } from './Status';
import {
  ContentLayout,
  Header,
  SpaceBetween,
  AppLayout,
} from '@cloudscape-design/components';
import '@cloudscape-design/global-styles/index.css';

const App: React.FC = () => {
  return (
    <AppLayout
      content={
        <ContentLayout
          header={
            <Header variant='h1'>
              Amazon Chime SDK Call Analytics - Near Real-Time Summarizer
            </Header>
          }
        >
          <SpaceBetween size='l'>
            <Status />
            <Summarization />
            <Transcriptions />
          </SpaceBetween>
        </ContentLayout>
      }
      navigationHide={true}
      toolsHide={true}
    />
  );
};

export default App;
