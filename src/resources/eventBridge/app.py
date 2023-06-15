import logging
import os
import json
import boto3
from botocore.exceptions import ClientError
from cohere_sagemaker import Client
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
    SUMMARY_QUESTION = "What is the customer calling about and what are the next steps?"
ENDPOINT_NAME = os.environ['ENDPOINT_NAME']
MODEL_PACKAGE_ARN = os.environ['MODEL_PACKAGE_ARN']
MODEL_NAME = os.environ['MODEL_NAME']
SAGEMAKER_ROLE = os.environ['SAGEMAKER_ROLE']
KINESIS_DATA_STREAM = os.environ['KINESIS_DATA_STREAM']
API_GATEWAY_ENDPOINT = os.environ['API_GATEWAY_ENDPOINT']
CONNECTION_TABLE = os.environ['CONNECTION_TABLE']

dynamodb = boto3.client('dynamodb', region_name='us-east-1')
kinesis = boto3.client('kinesis')
api_gateway = boto3.client("apigatewaymanagementapi", endpoint_url=API_GATEWAY_ENDPOINT)
deserializer = TypeDeserializer()
co = Client(endpoint_name=ENDPOINT_NAME)


def create_prompt(conversation):
    return f'{conversation}\n\n{SUMMARY_QUESTION}'


def get_response(prompt):
    cohere_response = co.generate(prompt=prompt, max_tokens=200, temperature=0, return_likelihoods='GENERATION')
    cohere_text = cohere_response.generations[0].text
    cohere_text = '.'.join(cohere_text.split('.')[:-1]) + '.'
    return cohere_text


def write_to_websocket(cohere_response):
    logger.info('%s Writing to websocket: %s', LOG_PREFIX, cohere_response)
    payload = {
        'summarization': cohere_response
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
            'TableName': os.getenv('TRANSCRIBE_TABLE'),
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
        cohere_response = get_response(prompt)

        logger.info('%s Cohere Response: %s', LOG_PREFIX, cohere_response)

        write_to_websocket(cohere_response)

    return {
        'statusCode': 200,
    }
