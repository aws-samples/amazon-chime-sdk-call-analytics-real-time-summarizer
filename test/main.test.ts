import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AmazonChimeSDKCallAnalyticsRealTimeSummarizer } from '../src/amazon-chime-sdk-call-analytics-real-time-summarizer';

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

test('Snapshot', () => {
  const app = new App();
  const stack = new AmazonChimeSDKCallAnalyticsRealTimeSummarizer(app, 'test', {
    ...summarizerProps,
  });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
