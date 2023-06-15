import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AttributeType,
  Table,
  BillingMode,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

interface DatabaseResourcesProps {
  removalPolicy: string;
}
export class DatabaseResources extends Construct {
  public transcribeTable: Table;
  public connectionTable: Table;

  constructor(scope: Construct, id: string, props: DatabaseResourcesProps) {
    super(scope, id);
    let removalPolicy: RemovalPolicy;
    switch (props.removalPolicy.toLowerCase()) {
      case 'retain':
        removalPolicy = RemovalPolicy.RETAIN;
        break;
      case 'destroy':
        removalPolicy = RemovalPolicy.DESTROY;
        break;
      case 'snapshot':
        removalPolicy = RemovalPolicy.SNAPSHOT;
        break;
      default:
        removalPolicy = RemovalPolicy.DESTROY;
    }

    this.transcribeTable = new Table(this, 'callTable', {
      partitionKey: {
        name: 'transactionId',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: AttributeType.NUMBER,
      },
      removalPolicy: removalPolicy,
      encryption: TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'TTL',
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.connectionTable = new Table(this, 'connectionTable', {
      partitionKey: {
        name: 'connectionId',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'TTL',
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
  }
}
