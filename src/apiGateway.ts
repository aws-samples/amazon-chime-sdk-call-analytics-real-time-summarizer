/* eslint-disable import/no-extraneous-dependencies */
import { WebSocketApi, WebSocketStage } from '@aws-cdk/aws-apigatewayv2-alpha';
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { Duration } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Stream } from 'aws-cdk-lib/aws-kinesis';
import {
  Runtime,
  Function,
  Architecture,
  EventSourceMapping,
  StartingPosition,
} from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

interface ApiGatewayResourcesProps {
  kinesisDataStream: Stream;
  connectionTable: Table;
  transcribeTable: Table;
  logLevel: string;
}

export class ApiGatewayResources extends Construct {
  public kdsConsumerLambda: Function;
  public webSocketApi: WebSocketApi;
  public webSocketStage: WebSocketStage;

  constructor(scope: Construct, id: string, props: ApiGatewayResourcesProps) {
    super(scope, id);

    this.webSocketApi = new WebSocketApi(this, 'webSocketApi', {
      apiName: 'summarizerWebSocketApi',
    });

    this.webSocketStage = new WebSocketStage(this, 'webSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'dev',
      autoDeploy: true,
    });

    const kdsConsumerRole = new Role(this, 'kdsConsumerRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    this.kdsConsumerLambda = new NodejsFunction(this, 'kdsConsumerLambda', {
      handler: 'index.handler',
      entry: 'src/resources/kdsConsumer/index.ts',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      runtime: Runtime.NODEJS_18_X,
      role: kdsConsumerRole,
      environment: {
        STREAM_NAME: props.kinesisDataStream.streamName,
        CONNECTION_TABLE: props.connectionTable.tableName,
        API_GATEWAY_ENDPOINT: `https://${this.webSocketApi.apiId}.execute-api.${this.webSocketApi.stack.region}.amazonaws.com/${this.webSocketStage.stageName}`,
        TRANSCRIBE_TABLE: props.transcribeTable.tableName,
        LOG_LEVEL: props.logLevel,
      },
    });

    props.transcribeTable.grantReadWriteData(this.kdsConsumerLambda);
    props.connectionTable.grantReadWriteData(this.kdsConsumerLambda);
    props.kinesisDataStream.grantReadWrite(this.kdsConsumerLambda);

    new EventSourceMapping(this, 'eventSourceMapping', {
      target: this.kdsConsumerLambda,
      eventSourceArn: props.kinesisDataStream.streamArn,
      startingPosition: StartingPosition.LATEST,
    });

    this.webSocketApi.addRoute('$connect', {
      integration: new WebSocketLambdaIntegration(
        'ConnectIntegration',
        this.kdsConsumerLambda,
      ),
    });
    this.webSocketApi.addRoute('$disconnect', {
      integration: new WebSocketLambdaIntegration(
        'DisconnectIntegration',
        this.kdsConsumerLambda,
      ),
    });
    this.webSocketApi.addRoute('$default', {
      integration: new WebSocketLambdaIntegration(
        'DefaultIntegration',
        this.kdsConsumerLambda,
      ),
    });

    this.webSocketStage.grantManagementApiAccess(this.kdsConsumerLambda);
    this.webSocketApi.grantManageConnections(this.kdsConsumerLambda);
  }
}
