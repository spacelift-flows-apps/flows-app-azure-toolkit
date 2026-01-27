# Azure Toolkit App

This Flows app provides blocks for interacting with Azure services using passwordless OIDC authentication.

## Features

- **Service Bus Queue Subscription**: Continuously poll queues for messages on a customizable schedule
- **Passwordless Authentication**: Uses access tokens from the Azure OIDC app (no connection strings)

## Prerequisites

### Azure RBAC Permissions

You must assign the appropriate Azure RBAC role to your app registration's service principal:

**Azure Service Bus Data Receiver** - Required for reading messages from queues.

You can assign this role at:

- **Namespace level**: Grants access to all queues in the namespace
- **Queue level**: Grants access to a specific queue only

To assign the role via Azure Portal:

1. Navigate to your Service Bus namespace (or specific queue)
2. Go to **Access control (IAM)** > **Add role assignment**
3. Select **Azure Service Bus Data Receiver**
4. Assign to your app registration's service principal

Or via Azure CLI:

```bash
az role assignment create \
  --assignee <app-client-id> \
  --role "Azure Service Bus Data Receiver" \
  --scope /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ServiceBus/namespaces/<namespace>
```

### Azure OIDC App

This app requires the **Azure OIDC** app to be installed and configured with the `sb` (Service Bus) service enabled. The OIDC app provides the access tokens needed for authentication.

## Quick Start

1. **Install the Azure OIDC App** and configure it with `sb` in the Services array

2. **Install this App** with the following configuration:
   - `Namespace`: Your fully qualified namespace (e.g., `my-namespace.servicebus.windows.net`)
   - `Access Token`: Reference the OIDC app's token: `=signals.azureOidc.accessTokens.sb`
   - `Access Token Expiry`: Reference the OIDC app's expiry: `signals.azureOidc.expiresAt`

3. **Add a Service Bus Queue Subscription Block**:
   - Configure the `queueName` for the queue you want to subscribe to
   - Optionally configure `maxMessages` and `receiveTimeoutSeconds`
   - Messages are polled on a customizable schedule and emitted as events

## App Configuration

| Field                   | Description                                                      | Required |
| ----------------------- | ---------------------------------------------------------------- | -------- |
| **Namespace**           | Fully qualified namespace (e.g., `my-ns.servicebus.windows.net`) | Yes      |
| **Access Token**        | Access token with scope `https://servicebus.azure.net/.default`  | Yes      |
| **Access Token Expiry** | Unix timestamp in milliseconds when the token expires            | No       |

## Blocks

### Service Bus Queue Subscription

Subscribes to an Azure Service Bus queue and polls for messages on a customizable schedule. Emits one event per message received.

**Block Configuration**:

- `queueName`: Name of the Service Bus queue to subscribe to
- `maxMessages`: Maximum messages to receive per poll (default: 10, max: 2047)
- `receiveTimeoutSeconds`: How long to wait for messages before returning (default: 5)

**Schedule**: Polls every 30 seconds by default (customizable via UI)

**Signals**:

- `lastCheckTime`: ISO timestamp of the last poll attempt
- `lastMessageReceivedTime`: ISO timestamp of when a message was last received

**Output**: One event emitted per message received (no events if queue is empty)

- `body`: Message body (parsed JSON if valid, otherwise raw string)
- `messageId`: Unique message identifier
- `enqueuedTime`: ISO timestamp when message was enqueued
- `sequenceNumber`: Sequence number in the queue
- `contentType`: Content type of the message
- `correlationId`: Correlation ID for request-response patterns
- `applicationProperties`: Custom application properties

## How It Works

- **OIDC Token Authentication**: Uses access tokens from the Azure OIDC app for passwordless authentication
- **Lifecycle Status**: Block status reflects connection health (`ready` or `failed`)
- **Message Completion**: Successfully read messages are completed (removed from queue) automatically
- **Token Refresh**: When using expressions to reference OIDC app signals, tokens are automatically kept up to date

## Next Steps

- Support **Service Bus Topics**
