/* eslint-disable import/no-extraneous-dependencies */
import path from 'path';
import { WebSocketApi, WebSocketStage } from '@aws-cdk/aws-apigatewayv2-alpha';
import { Duration } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import {
  ManagedPolicy,
  Role,
  ServicePrincipal,
  PolicyDocument,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { Stream } from 'aws-cdk-lib/aws-kinesis';
import { Architecture, Runtime, Function, Code } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface EventBridgeLambdaResourcesProps {
  transcribeTable: Table;
  logLevel: string;
  kinesisDataStream: Stream;
  webSocketApi: WebSocketApi;
  webSocketStage: WebSocketStage;
  connectionTable: Table;
}

export class EventBridgeLambdaResources extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: EventBridgeLambdaResourcesProps,
  ) {
    super(scope, id);

    const summarizerLambdaRole = new Role(this, 'summarizerLambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['sagemakerPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['bedrock:InvokeModel'],
            }),
          ],
        }),
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const summarizerLambda = new Function(this, 'summarizerLambda', {
      code: Code.fromAsset(path.join(__dirname, 'resources/summarizer'), {
        bundling: {
          image: Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      handler: 'index.handler',
      runtime: Runtime.PYTHON_3_11,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      role: summarizerLambdaRole,
      environment: {
        KINESIS_DATA_STREAM: props.kinesisDataStream.streamName,
        CONNECTION_TABLE: props.connectionTable.tableName,
        TRANSCRIBE_TABLE: props.transcribeTable.tableName,
        API_GATEWAY_ENDPOINT: `https://${props.webSocketApi.apiId}.execute-api.${props.webSocketApi.stack.region}.amazonaws.com/${props.webSocketStage.stageName}`,
      },
    });

    props.transcribeTable.grantReadWriteData(summarizerLambda);
    props.kinesisDataStream.grantReadWrite(summarizerLambda);
    props.connectionTable.grantReadWriteData(summarizerLambda);
    props.webSocketStage.grantManagementApiAccess(summarizerLambda);
    props.webSocketApi.grantManageConnections(summarizerLambda);

    const chimeSdkRule = new Rule(this, 'chimeSdkRule', {
      eventPattern: {
        source: ['aws.chime'],
        detailType: ['Media Insights State Change'],
      },
    });
    chimeSdkRule.addTarget(new LambdaFunction(summarizerLambda));
  }
}
