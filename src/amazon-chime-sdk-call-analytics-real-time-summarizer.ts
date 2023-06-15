/* eslint-disable import/no-extraneous-dependencies */
import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { config } from 'dotenv';
import {
  DatabaseResources,
  SageMakerLambdaResources,
  EventBridgeLambdaResources,
  VPCResources,
  VCResources,
  ServerResources,
  KinesisResources,
  ApiGatewayResources,
  MediaPipelineResources,
  DistributionResources,
} from './';

config();

export interface AmazonChimeSDKCallAnalyticsRecordingStackProps
  extends StackProps {
  buildAsterisk: string;
  sipRecCidrs: string;
  logLevel: string;
  removalPolicy: string;
  endpointName: string;
  cohereInstanceType: string;
  modelPackageArn: string;
  modelName: string;
  createSageMakerOnStart: string;
}
export class AmazonChimeSDKCallAnalyticsRealTimeSummarizer extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: AmazonChimeSDKCallAnalyticsRecordingStackProps,
  ) {
    super(scope, id, props);

    const databaseResources = new DatabaseResources(this, 'DatabaseResources', {
      removalPolicy: props.removalPolicy,
    });

    const kinesisResources = new KinesisResources(this, 'KinesisResources');

    const sagerMakerLambdaResources = new SageMakerLambdaResources(
      this,
      'LambdaResources',
      {
        transcribeTable: databaseResources.transcribeTable,
        logLevel: props.logLevel,
        endpointName: props.endpointName,
        modelPackageArn: props.modelPackageArn,
        cohereInstanceType: props.cohereInstanceType,
        modelName: props.modelName,
        kinesisDataStream: kinesisResources.kinesisDataStream,
        createSageMakerOnStart: props.createSageMakerOnStart,
      },
    );

    const mediaPipelineResources = new MediaPipelineResources(
      this,
      'MediaPipelineResources',
      {
        kinesisDataStream: kinesisResources.kinesisDataStream,
      },
    );

    const apiGatewayResources = new ApiGatewayResources(
      this,
      'apiGatewayResources',
      {
        kinesisDataStream: kinesisResources.kinesisDataStream,
        connectionTable: databaseResources.connectionTable,
        transcribeTable: databaseResources.transcribeTable,
        logLevel: props.logLevel,
        controlSageMakerLambda:
          sagerMakerLambdaResources.controlSageMakerLambda,
      },
    );

    new EventBridgeLambdaResources(this, 'EventBridgeLambdaResources', {
      transcribeTable: databaseResources.transcribeTable,
      logLevel: props.logLevel,
      endpointName: props.endpointName,
      modelPackageArn: props.modelPackageArn,
      cohereInstanceType: props.cohereInstanceType,
      modelName: props.modelName,
      kinesisDataStream: kinesisResources.kinesisDataStream,
      webSocketApi: apiGatewayResources.webSocketApi,
      webSocketStage: apiGatewayResources.webSocketStage,
      sageMakerRole: sagerMakerLambdaResources.sageMakerRole,
      connectionTable: databaseResources.connectionTable,
    });

    const vcResources = new VCResources(this, 'VCResources', {
      buildAsterisk: props.buildAsterisk,
      sipRecCidrs: props.sipRecCidrs,
      mediaInsightsConfiguration:
        mediaPipelineResources.transcribeMediaInsightsPipeline,
    });

    const vpcResources = new VPCResources(this, 'VPCResources');

    new ServerResources(this, 'ServerResources', {
      vpc: vpcResources.vpc,
      serverEip: vpcResources.serverEip,
      voiceSecurityGroup: vpcResources.voiceSecurityGroup,
      albSecurityGroup: vpcResources.albSecurityGroup,
      sshSecurityGroup: vpcResources.sshSecurityGroup,
      applicationLoadBalancer: vpcResources.applicationLoadBalancer,
      phoneNumber: vcResources.phoneNumber!,
      voiceConnector: vcResources.voiceConnector,
      webSocketApi: apiGatewayResources.webSocketApi,
      webSocketStage: apiGatewayResources.webSocketStage,
      logLevel: props.logLevel,
      controlSageMakerApi: apiGatewayResources.controlSageMakerApi,
    });

    const distributionResources = new DistributionResources(
      this,
      'DistributionResources',
      {
        applicationLoadBalancer: vpcResources.applicationLoadBalancer,
      },
    );

    new CfnOutput(this, 'PhoneNumber', {
      value: vcResources!.phoneNumber!.phoneNumber!,
    });

    new CfnOutput(this, 'DistributionUrl', {
      value: distributionResources.distribution.domainName,
    });
  }
}

const app = new App();

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const summarizerProps = {
  buildAsterisk: process.env.BUILD_ASTERISK || 'true',
  createSageMakerOnStart: process.env.CREATE_SAGEMAKER_ON_START || 'false',
  sipRecCidrs: process.env.SIPREC_CIDRS || '',
  logLevel: process.env.LOG_LEVEL || 'INFO',
  removalPolicy: process.env.REMOVAL_POLICY || 'DESTROY',
  modelName: process.env.MODEL_NAME || 'deployed-cohere-gpt-medium',
  endpointName: process.env.ENDPOINT_NAME || 'deployed-cohere-gpt-medium',
  cohereInstanceType: process.env.COHERE_INSTANCE_TYPE || 'ml.g5.xlarge',
  modelPackageArn:
    process.env.MODEL_PACKAGE_ARN ||
    'arn:aws:sagemaker:us-east-1:865070037744:model-package/cohere-gpt-medium-v1-5-15e34931a06235b7bac32dca396a970a',
};

new AmazonChimeSDKCallAnalyticsRealTimeSummarizer(
  app,
  'amazon-chime-sdk-call-analytics-real-time-summarizer',
  { ...summarizerProps, env: devEnv },
);

app.synth();
