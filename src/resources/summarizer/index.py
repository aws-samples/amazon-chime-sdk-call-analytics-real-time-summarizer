import logging
import os
import json
import boto3
from botocore.exceptions import ClientError
from boto3.dynamodb.types import TypeDeserializer

logger = logging.getLogger()
try:
    LOG_LEVEL = os.environ['LOG_LEVEL']
    if LOG_LEVEL not in ['INFO', 'DEBUG', 'WARN', 'ERROR']:
        LOG_LEVEL = 'INFO'
except BaseException:
    LOG_LEVEL = 'INFO'
logger.setLevel(LOG_LEVEL)

try:
    SUMMARY_QUESTION = os.environ['SUMMARY_QUESTION']
except BaseException:
    SUMMARY_QUESTION = "In a few sentences, tell me what the customer is calling about and what the next steps are."

KINESIS_DATA_STREAM = os.environ['KINESIS_DATA_STREAM']
API_GATEWAY_ENDPOINT = os.environ['API_GATEWAY_ENDPOINT']
CONNECTION_TABLE = os.environ['CONNECTION_TABLE']
TRANSCRIBE_TABLE = os.environ['TRANSCRIBE_TABLE']
MODEL_ID = 'anthropic.claude-instant-v1'

dynamodb = boto3.client('dynamodb', region_name='us-east-1')
kinesis = boto3.client('kinesis')
api_gateway = boto3.client("apigatewaymanagementapi", endpoint_url=API_GATEWAY_ENDPOINT)
bedrock_runtime = boto3.client('bedrock-runtime')
deserializer = TypeDeserializer()


def create_prompt(conversation):
    return f'\n\nHuman: This is a conversation between two people, a caller and an agent.\n\n{conversation}\n\n{SUMMARY_QUESTION}\n\nAssistant:'


def get_response(prompt):

    body = json.dumps({
        "prompt": prompt,
        "temperature": 0,
        "max_tokens_to_sample": 4000,
    })

    try:
        bedrock_response = bedrock_runtime.invoke_model(
            body=body,
            modelId=MODEL_ID
        )
        logger.info("%s Bedrock Response: %s", LOG_PREFIX, bedrock_response)
        response_body = json.loads(bedrock_response.get("body").read())
        return response_body.get("completion")

    except ClientError as error:

        if error.response['Error']['Code'] == 'AccessDeniedException':
            print(f"\x1b[41m{error.response['Error']['Message']}\
                    \nTo troubeshoot this issue please refer to the following resources.\
                    \nhttps://docs.aws.amazon.com/IAM/latest/UserGuide/troubleshoot_access-denied.html\
                    \nhttps://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html\x1b[0m\n")

        else:
            raise error


def write_to_websocket(bedrock_response):
    logger.info('%s Writing to websocket', LOG_PREFIX)
    payload = {
        'summarization': bedrock_response
    }
    payload_json = json.dumps(payload)
    connections = dynamodb.scan(TableName=CONNECTION_TABLE)
    connection_ids = [item["connectionId"]["S"] for item in connections["Items"]]

    try:
        for connection_id in connection_ids:
            api_gateway.post_to_connection(
                ConnectionId=connection_id,
                Data=payload_json
            )
            print("Payload sent to WebSocket API for connection ID:", connection_id)

    except api_gateway.exceptions.GoneException:
        print("A connection is no longer available.")


def handler(event, context):
    global LOG_PREFIX
    LOG_PREFIX = 'StartSummarization Notification: '

    logger.info('%s Event: %s', LOG_PREFIX, event)

    event_type = event.get('detail', {}).get('eventType')

    if event_type == 'chime:MediaInsightsInProgress':
        logger.info('Media Insights In Progress')
    elif event_type == 'chime:MediaInsightsStopped':
        logger.info('Media Insights Stopped')

        transaction_id = event['detail']['transactionId']

        params = {
            'TableName': TRANSCRIBE_TABLE,
            'FilterExpression': '#tid = :tid',
            'ExpressionAttributeNames': {
                '#tid': 'transactionId',
            },
            'ExpressionAttributeValues': {
                ':tid': {'S': transaction_id},
            },
        }

        try:
            response = dynamodb.scan(**params)
        except ClientError as error:
            logger.error('%s DynamoDB scan failed: %s ', LOG_PREFIX, error)
            raise error

        items = [
            {k: deserializer.deserialize(v) for k, v in item.items()}
            for item in response.get('Items', [])
        ]

        items.sort(key=lambda item: item.get('timestamp'))

        conversation = ''
        for item in items:
            speaker = 'Agent' if item.get('channelId') == 'ch_0' else 'Caller'
            conversation += f'{speaker}: {item.get("transcript")}\n'

        logger.info('%s Conversation: %s', LOG_PREFIX, conversation)
        prompt = create_prompt(conversation)
        logger.info('%s Prompt: %s', LOG_PREFIX, prompt)
        bedrock_response = get_response(prompt)
        write_to_websocket(bedrock_response)

    return {
        'statusCode': 200,
    }
