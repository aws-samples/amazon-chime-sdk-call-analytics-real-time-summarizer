/* eslint-disable import/no-extraneous-dependencies */
import { WebSocketApi, WebSocketStage } from '@aws-cdk/aws-apigatewayv2-alpha';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
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
import {
  Architecture,
  Runtime,
  DockerImageFunction,
  DockerImageCode,
  IFunction,
} from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface SageMakerLambdaResourcesProps {
  transcribeTable: Table;
  logLevel: string;
  endpointName: string;
  modelPackageArn: string;
  cohereInstanceType: string;
  modelName: string;
  kinesisDataStream: Stream;
  createSageMakerOnStart: string;
}

export class SageMakerLambdaResources extends Construct {
  controlSageMakerLambda: IFunction;
  sageMakerRole: Role;

  constructor(
    scope: Construct,
    id: string,
    props: SageMakerLambdaResourcesProps,
  ) {
    super(scope, id);

    const sageMakerLambdaRole = new Role(this, 'controlSageMakerLambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
      ],
    });

    const sageMakerCustomResourceRole = new Role(
      this,
      'sageMakerCustomResourceRole',
      {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole',
          ),
          ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
        ],
      },
    );

    this.sageMakerRole = new Role(this, 'sageMakerRole', {
      assumedBy: new ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
      ],
    });

    this.controlSageMakerLambda = new NodejsFunction(
      this,
      'controlSageMakerLambda',
      {
        handler: 'index.handler',
        entry: 'src/resources/controlSageMaker/index.ts',
        architecture: Architecture.ARM_64,
        timeout: Duration.minutes(1),
        runtime: Runtime.NODEJS_18_X,
        role: sageMakerLambdaRole,
        environment: {
          LOG_LEVEL: props.logLevel,
          ENDPOINT_NAME: props.endpointName,
          MODEL_PACKAGE_ARN: props.modelPackageArn,
          SAGEMAKER_ROLE: this.sageMakerRole.roleArn,
          COHERE_INSTANCE_TYPE: props.cohereInstanceType,
          MODEL_NAME: props.modelName,
        },
      },
    );

    const sageMakerCustomResource = new NodejsFunction(
      this,
      'sageMakerCustomResourceLambda',
      {
        handler: 'index.handler',
        entry: 'src/resources/sageMakerCustomResource/index.ts',
        architecture: Architecture.ARM_64,
        timeout: Duration.minutes(1),
        runtime: Runtime.NODEJS_18_X,
        role: sageMakerLambdaRole,
        environment: {
          LOG_LEVEL: props.logLevel,
          ENDPOINT_NAME: props.endpointName,
          MODEL_PACKAGE_ARN: props.modelPackageArn,
          SAGEMAKER_ROLE: this.sageMakerRole.roleArn,
          COHERE_INSTANCE_TYPE: props.cohereInstanceType,
          MODEL_NAME: props.modelName,
        },
      },
    );

    const sageMakerCustomResourceProvider = new Provider(
      this,
      'sageMakerCustomResourceProvider',
      {
        onEventHandler: sageMakerCustomResource,
        logRetention: RetentionDays.ONE_WEEK,
        role: sageMakerCustomResourceRole,
      },
    );

    new CustomResource(this, 'sageMakerCustomResource', {
      serviceToken: sageMakerCustomResourceProvider.serviceToken,
      properties: {
        CreateOnStart: props.createSageMakerOnStart,
      },
    });
  }
}

interface EventBridgeLambdaResourcesProps {
  transcribeTable: Table;
  logLevel: string;
  endpointName: string;
  modelPackageArn: string;
  cohereInstanceType: string;
  modelName: string;
  kinesisDataStream: Stream;
  sageMakerRole: Role;
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
    const eventBridgeLambdaRole = new Role(this, 'startSummarizationRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['sagemakerPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: [
                `arn:aws:sagemaker:${Stack.of(this).region}:${
                  Stack.of(this).account
                }:endpoint/${props.endpointName}`,
              ],
              actions: ['sagemaker:InvokeEndpoint'],
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

    const eventBridgeLambda = new DockerImageFunction(
      this,
      'startSummarizationLambda',
      {
        code: DockerImageCode.fromImageAsset('src/resources/eventBridge'),
        role: eventBridgeLambdaRole,
        timeout: Duration.minutes(15),
        environment: {
          LOG_LEVEL: props.logLevel,
          MODEL_NAME: props.modelName,
          TRANSCRIBE_TABLE: props.transcribeTable.tableName,
          ENDPOINT_NAME: props.endpointName,
          MODEL_PACKAGE_ARN: props.modelPackageArn,
          SAGEMAKER_ROLE: props.sageMakerRole.roleArn,
          KINESIS_DATA_STREAM: props.kinesisDataStream.streamName,
          CONNECTION_TABLE: props.connectionTable.tableName,
          API_GATEWAY_ENDPOINT: `https://${props.webSocketApi.apiId}.execute-api.${props.webSocketApi.stack.region}.amazonaws.com/${props.webSocketStage.stageName}`,
        },
      },
    );

    props.transcribeTable.grantReadWriteData(eventBridgeLambda);
    props.kinesisDataStream.grantReadWrite(eventBridgeLambda);
    props.connectionTable.grantReadWriteData(eventBridgeLambda);
    props.webSocketStage.grantManagementApiAccess(eventBridgeLambda);
    props.webSocketApi.grantManageConnections(eventBridgeLambda);

    const chimeSdkRule = new Rule(this, 'chimeSdkRule', {
      eventPattern: {
        source: ['aws.chime'],
        detailType: ['Media Insights State Change'],
      },
    });
    chimeSdkRule.addTarget(new LambdaFunction(eventBridgeLambda));
  }
}
