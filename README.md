# Azure Toolkit App

This Flows app provides blocks for interacting with Azure services.

## Features

- **Service Bus Queue Message Reading**: Connect to Azure Service Bus and read messages from queues on demand.

## Quick Start

1. **Configure Azure Credentials**:
   - `connectionString`: Your Azure Service Bus connection string (secret)

2. **Use the Service Bus Queue Reader Block**:
   - Configure the `queueName` for the queue you want to read from
   - Trigger the block to read pending messages
   - Receive operation status and any retrieved messages

## Blocks

### Service Bus Queue Reader

Reads messages from an Azure Service Bus queue on demand. When triggered by any event, receives and completes pending messages.

**Block Configuration**:

- `queueName`: Name of the Service Bus queue to read messages from

**Input**: Any event triggers message retrieval from the queue

**Output**:

- `connectionSuccess`: Boolean indicating if the operation succeeded
- `message`: Status message or error description
- `checkedAt`: ISO timestamp of when the operation was performed
- `messages`: Array of received messages (empty if none available)

## How It Works

- **Connection String Authentication**: Uses Azure Service Bus connection string for authentication
- **Non-Blocking Reads**: Receive one message with a short timeout, returning immediately if no messages are available
- **Message Completion**: Successfully read messages are completed (removed from queue) automatically
- **Error Handling**: Connection failures are reported gracefully without throwing exceptions

## Next Steps

- Connect with the Azure OIDC app for **passwordless authentication**.
- Implement a **Service Bus Queue Subscription** block that emits events as messages are received in the queue.
- Support **Service Bus Topics**.
