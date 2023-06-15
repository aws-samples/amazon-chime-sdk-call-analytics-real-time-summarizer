import { Stream, StreamEncryption } from 'aws-cdk-lib/aws-kinesis';
import { Construct } from 'constructs';

export class KinesisResources extends Construct {
  public kinesisDataStream: Stream;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.kinesisDataStream = new Stream(this, 'kinesisDataStream', {
      encryption: StreamEncryption.UNENCRYPTED,
      shardCount: 1,
    });
  }
}
