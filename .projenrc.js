const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.70.0',
  defaultReleaseBranch: 'main',
  name: 'amazon-chime-sdk-call-analytics-real-time-summarizer',
  license: 'MIT-0',
  author: 'Court Schuett',
  copyrightOwner: 'Amazon.com, Inc.',
  authorAddress: 'https://aws.amazon.com',
  defaultReleaseBranch: 'main',
  appEntrypoint: 'amazon-chime-sdk-call-analytics-real-time-summarizer.ts',
  eslintOptions: { ignorePatterns: ['src/resources/server/assets/site/**'] },
  depsUpgradeOptions: {
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
    },
  },
  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['schuettc'],
  },
  deps: [
    'dotenv',
    'cdk-amazon-chime-resources',
    '@aws-sdk/client-dynamodb',
    'aws-lambda',
    '@types/aws-lambda',
    '@aws-cdk/aws-apigatewayv2-alpha',
    '@aws-cdk/aws-apigatewayv2-integrations-alpha',
    '@aws-sdk/client-apigatewaymanagementapi',
    '@aws-sdk/util-dynamodb',
    '@aws-sdk/client-sagemaker',
  ],
  autoApproveUpgrades: true,
  projenUpgradeSecret: 'PROJEN_GITHUB_TOKEN',
  defaultReleaseBranch: 'main',
});

const common_exclude = [
  '.yalc',
  'cdk.out',
  'cdk.context.json',
  'yarn-error.log',
  'dependabot.yml',
  '.DS_Store',
];

project.addTask('launch', {
  exec: 'yarn && yarn projen && yarn build && yarn cdk bootstrap && yarn cdk deploy --no-rollback --require-approval never',
});

project.gitignore.exclude(...common_exclude);
project.synth();
