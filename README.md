# Azure Toolkit App

This Flows app provides blocks for interacting with Azure services.

## Features

- **Service Bus Queue Subscription**: Continuously poll queues for messages on a customizable schedule

## Quick Start

1. **Configure Azure Credentials**:
   - `connectionString`: Your Azure Service Bus connection string (secret)

2. **Use the Service Bus Queue Subscription Block**:
   - Configure the `queueName` for the queue you want to subscribe to
   - Optionally configure `maxMessages` and `receiveTimeoutSeconds`
   - Messages are polled on a customizable schedule and emitted as events

## Blocks

### Service Bus Queue Subscription

Subscribes to an Azure Service Bus queue and polls for messages on a customizable schedule. Emits one event per message received.

**Block Configuration**:

- `queueName`: Name of the Service Bus queue to subscribe to
- `maxMessages`: Maximum messages to receive per poll (default: 10)
- `receiveTimeoutSeconds`: How long to wait for messages before returning (default: 5)

**Schedule**: Polls every 30 seconds by default (customizable via UI)

**Signals**:

- `lastCheckTime`: ISO timestamp of the last poll attempt
- `lastMessageReceivedTime`: ISO timestamp of when a message was last received

**Output**: One event emitted per message received (no events if queue is empty)

- `body`: Message body (parsed JSON if valid, otherwise raw string)
- `rawBody`: Original message body as string
- `messageId`: Unique message identifier
- `enqueuedTime`: ISO timestamp when message was enqueued
- `sequenceNumber`: Sequence number in the queue
- `contentType`: Content type of the message
- `correlationId`: Correlation ID for request-response patterns
- `applicationProperties`: Custom application properties

## How It Works

- **Connection String Authentication**: Uses Azure Service Bus connection string for authentication
- **Lifecycle Status**: Block status reflects connection health (`ready` or `failed`)
- **Message Completion**: Successfully read messages are completed (removed from queue) automatically

## Next Steps

- Connect with the Azure OIDC app for **passwordless authentication**
- Support **Service Bus Topics**
