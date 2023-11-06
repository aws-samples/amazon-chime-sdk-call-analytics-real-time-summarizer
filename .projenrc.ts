const { awscdk } = require('projen');
const { JobPermission } = require('projen/lib/github/workflows-model');
const { UpgradeDependenciesSchedule } = require('projen/lib/javascript');

const AUTOMATION_TOKEN = 'PROJEN_GITHUB_TOKEN';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.70.0',
  defaultReleaseBranch: 'main',
  name: 'amazon-chime-sdk-call-analytics-real-time-summarizer',
  license: 'MIT-0',
  projenrcTs: true,
  author: 'Court Schuett',
  jest: false,
  copyrightOwner: 'Amazon.com, Inc.',
  authorAddress: 'https://aws.amazon.com',
  appEntrypoint: 'amazon-chime-sdk-call-analytics-real-time-summarizer.ts',
  eslintOptions: { ignorePatterns: ['src/resources/server/assets/site/**'] },
  depsUpgradeOptions: {
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      schedule: UpgradeDependenciesSchedule.WEEKLY,
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
});

const common_exclude = [
  '.yalc',
  'cdk.out',
  'cdk.context.json',
  'yarn-error.log',
  'dependabot.yml',
  '.DS_Store',
  '.venv',
  '.env',
];

const upgradeSite = project.github.addWorkflow('upgrade-site');
upgradeSite.on({ schedule: [{ cron: '0 5 * * 1' }], workflowDispatch: {} });
upgradeSite.addJobs({
  upgradeSite: {
    runsOn: ['ubuntu-latest'],
    name: 'upgrade-site',
    permissions: {
      actions: JobPermission.WRITE,
      contents: JobPermission.READ,
      idToken: JobPermission.WRITE,
    },
    steps: [
      { uses: 'actions/checkout@v3' },
      {
        name: 'Setup Node.js',
        uses: 'actions/setup-node@v3',
        with: {
          'node-version': '16',
        },
      },
      {
        run: 'yarn install --check-files --frozen-lockfile',
        workingDirectory: 'src/resources/server/assets/site',
      },
      {
        run: 'yarn upgrade',
        workingDirectory: 'src/resources/server/assets/site',
      },
      {
        name: 'Create Pull Request',
        uses: 'peter-evans/create-pull-request@v4',
        with: {
          'token': '${{ secrets.' + AUTOMATION_TOKEN + ' }}',
          'commit-message': 'chore: upgrade site',
          'branch': 'auto/projen-upgrade',
          'title': 'chore: upgrade site',
          'body': 'This PR upgrades site',
          'labels': 'auto-merge, auto-approve',
          'author': 'github-actions <github-actions@github.com>',
          'committer': 'github-actions <github-actions@github.com>',
          'signoff': true,
        },
      },
    ],
  },
});

const upgradePython = project.github.addWorkflow('upgrade-python');
upgradePython.on({ schedule: [{ cron: '0 5 * * 1' }], workflowDispatch: {} });
upgradePython.addJobs({
  upgradeSite: {
    runsOn: ['ubuntu-latest'],
    name: 'upgrade-python',
    permissions: {
      actions: JobPermission.WRITE,
      contents: JobPermission.READ,
      idToken: JobPermission.WRITE,
    },
    steps: [
      { uses: 'actions/checkout@v3' },
      {
        name: 'Setup Python',
        uses: 'actions/setup-python@v4',
        with: {
          'python-version': '3.11',
        },
      },
      {
        uses: 'snok/install-poetry@v1',
      },
      {
        run: 'poetry install',
        workingDirectory: 'src/resources/summarizer',
      },
      {
        run: 'poetry update',
        workingDirectory: 'src/resources/summarizer',
      },
      {
        run: 'pip freeze > requirements.txt',
        workingDirectory: 'src/resources/summarizer',
      },
      {
        name: 'Create Pull Request',
        uses: 'peter-evans/create-pull-request@v4',
        with: {
          'token': '${{ secrets.' + AUTOMATION_TOKEN + ' }}',
          'commit-message': 'chore: upgrade python',
          'branch': 'auto/projen-upgrade',
          'title': 'chore: upgrade python',
          'body': 'This PR upgrades python',
          'labels': 'auto-merge, auto-approve',
          'author': 'github-actions <github-actions@github.com>',
          'committer': 'github-actions <github-actions@github.com>',
          'signoff': true,
        },
      },
    ],
  },
});

project.addTask('launch', {
  exec: 'yarn && yarn projen && yarn build && yarn cdk bootstrap && yarn cdk deploy --require-approval never',
});

project.gitignore.exclude(...common_exclude);
project.synth();
