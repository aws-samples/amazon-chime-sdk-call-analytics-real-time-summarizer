/* eslint-disable import/no-extraneous-dependencies */
import { TextEncoder } from 'util';
import {
  ApiGatewayManagementApi,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { KinesisStreamRecord, APIGatewayProxyEvent } from 'aws-lambda';

const apiGatewayManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: process.env.API_GATEWAY_ENDPOINT,
});

interface AttributeValue {
  S?: string;
  N?: string;
}

interface Connection extends Record<string, AttributeValue> {
  connectionId: {
    S: string;
  };
}
const dynamoDBClient = new DynamoDBClient({});

interface Metadata {
  callId: string;
  fromNumber: string;
  voiceConnectorId: string;
  toNumber: string;
  transactionId: string;
  direction: string;
}

interface KinesisRecord {
  'time': string;
  'service-type': string;
  'detail-type': string;
  'mediaInsightsPipelineId': string;
  'TranscriptEvent': {
    ResultId: string;
    StartTime: number;
    EndTime: number;
    IsPartial: boolean;
    Alternatives: {
      Transcript: string;
      Items: Array<{
        StartTime: number;
        EndTime: number;
        ItemType: string;
        Content: string;
        VocabularyFilterMatch: boolean;
        Speaker: null | string;
        Confidence: null | number;
        Stable: null | boolean;
      }>;
      Entities: null;
    }[];
    ChannelId: string;
  };
  'metadata': string;
}

exports.handler = async (
  event: APIGatewayProxyEvent | { Records: KinesisStreamRecord[] },
) => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  // API Gateway handling
  if ('requestContext' in event) {
    const apiGatewayEvent = event as APIGatewayProxyEvent;

    if (apiGatewayEvent.requestContext.connectionId === undefined) {
      console.error('connectionId is undefined');
      return { statusCode: 500 };
    }
    const connectionId: string = apiGatewayEvent.requestContext.connectionId;

    if (apiGatewayEvent.requestContext.eventType === 'CONNECT') {
      const putParams = {
        TableName: process.env.CONNECTION_TABLE,
        Item: { connectionId: { S: connectionId } },
      };

      await dynamoDBClient.send(new PutItemCommand(putParams));

      return { statusCode: 200 };
    } else if (apiGatewayEvent.requestContext.eventType === 'DISCONNECT') {
      const deleteParams = {
        TableName: process.env.CONNECTION_TABLE,
        Key: { connectionId: { S: connectionId } },
      };

      await dynamoDBClient.send(new DeleteItemCommand(deleteParams));

      return { statusCode: 200 };
    }
  } else {
    for (const record of event.Records) {
      const kinesisData = Buffer.from(record.kinesis.data, 'base64').toString(
        'utf8',
      );
      console.debug('Decoded payload:', kinesisData);
      const postData: KinesisRecord = JSON.parse(kinesisData);
      console.debug('Post Data:', postData);
      if (postData['detail-type'] == 'Transcribe') {
        if (!postData.TranscriptEvent.IsPartial) {
          const metadata: Metadata = JSON.parse(postData.metadata);
          console.info('Inserting record into DynamoDB');
          console.debug('Record:', postData);
          console.debug('Metadata:', postData.metadata);
          console.debug('TransactionId:', metadata.transactionId);
          console.debug('Timestamp:', postData.time);
          console.debug('ChannelId:', postData.TranscriptEvent.ChannelId);
          console.info(
            'Transcript:',
            postData.TranscriptEvent.Alternatives[0].Transcript,
          );

          const date = new Date(postData.time);
          const epochTime = date.getTime().toString();
          try {
            const putCommand = new PutItemCommand({
              TableName: process.env.TRANSCRIBE_TABLE,
              Item: {
                transactionId: { S: metadata.transactionId },
                timestamp: { N: epochTime },
                channelId: { S: postData.TranscriptEvent.ChannelId },
                startTime: { N: postData.TranscriptEvent.StartTime.toString() },
                endTime: { N: postData.TranscriptEvent.EndTime.toString() },
                transcript: {
                  S: postData.TranscriptEvent.Alternatives[0].Transcript,
                },
              },
            });
            await dynamoDBClient.send(putCommand);
          } catch (error) {
            console.error('Failed to insert record into DynamoDB:', error);
          }
        }
        const scanResult = await dynamoDBClient.send(
          new ScanCommand({
            TableName: process.env.CONNECTION_TABLE as string,
          }),
        );

        if (scanResult.Items) {
          const connections: Connection[] = scanResult.Items as Connection[];

          console.log('Connections: ' + JSON.stringify(connections));
          for (const connection of connections) {
            try {
              console.log(`Connection: ${connection.connectionId.S}`);
              console.log(`Post Data: ${JSON.stringify(postData)}`);
              await apiGatewayManagementApi.send(
                new PostToConnectionCommand({
                  ConnectionId: connection.connectionId.S,
                  Data: new TextEncoder().encode(JSON.stringify(postData)),
                }),
              );
            } catch (error) {
              if (error && typeof error === 'object' && 'statusCode' in error) {
                if (error.statusCode === 410) {
                  // Remove stale connections
                  await dynamoDBClient.send(
                    new DeleteItemCommand({
                      TableName: process.env.CONNECTION_TABLE as string,
                      Key: { connectionId: { S: connection.connectionId.S } },
                    }),
                  );
                }
              } else {
                console.error('An error occurred: ', error);
              }
            }
          }
        }
      }
    }
  }
  return {
    statusCode: 200,
  };
};
