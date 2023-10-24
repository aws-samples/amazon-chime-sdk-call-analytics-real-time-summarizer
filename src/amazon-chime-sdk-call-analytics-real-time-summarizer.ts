/* eslint-disable import/no-extraneous-dependencies */
import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { config } from 'dotenv';
import {
  DatabaseResources,
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
      },
    );

    new EventBridgeLambdaResources(this, 'EventBridgeLambdaResources', {
      transcribeTable: databaseResources.transcribeTable,
      logLevel: props.logLevel,
      kinesisDataStream: kinesisResources.kinesisDataStream,
      webSocketApi: apiGatewayResources.webSocketApi,
      webSocketStage: apiGatewayResources.webSocketStage,
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
  sipRecCidrs: process.env.SIPREC_CIDRS || '',
  logLevel: process.env.LOG_LEVEL || 'INFO',
  removalPolicy: process.env.REMOVAL_POLICY || 'DESTROY',
};

new AmazonChimeSDKCallAnalyticsRealTimeSummarizer(
  app,
  'amazon-chime-sdk-call-analytics-real-time-summarizer',
  { ...summarizerProps, env: devEnv },
);

app.synth();
