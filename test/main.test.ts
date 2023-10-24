import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AmazonChimeSDKCallAnalyticsRealTimeSummarizer } from '../src/amazon-chime-sdk-call-analytics-real-time-summarizer';

const summarizerProps = {
  buildAsterisk: process.env.BUILD_ASTERISK || 'true',
  sipRecCidrs: process.env.SIPREC_CIDRS || '',
  logLevel: process.env.LOG_LEVEL || 'INFO',
  removalPolicy: process.env.REMOVAL_POLICY || 'DESTROY',
};

test('Snapshot', () => {
  const app = new App();
  const stack = new AmazonChimeSDKCallAnalyticsRealTimeSummarizer(app, 'test', {
    ...summarizerProps,
  });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
