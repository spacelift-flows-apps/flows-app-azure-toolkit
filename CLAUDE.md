# Azure Toolkit - Flows App

For general app development guidance, see @../CLAUDE.md

## Overview

This Flows app provides blocks to interact with Azure services. It exposes:

- **Service Bus Subscription** - Polls for messages on a customizable schedule

The app uses **passwordless OIDC authentication** via access tokens from the Azure OIDC app.
It requires the service principal to have the **Azure Service Bus Data Receiver** role
assigned on the namespace or specific queue.

References:

- https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dotnet-get-started-with-queues?tabs=passwordless
- https://learn.microsoft.com/en-us/azure/service-bus-messaging/authenticate-application#overview

## Architecture

### App Structure

```text
flows-app-azure-toolkit/
├── blocks/                                 # Block implementations
│   ├── auth.ts                             # Authentication utilities (StaticTokenCredential)
│   ├── index.ts                            # Block registry and exports
│   └── serviceBusSubscription.ts           # Service Bus Queue Subscription
├── cmd/                                    # Go test utilities
│   ├── sender/                             # Test message sender
│   └── listener/                           # Test message listener
├── .github/workflows/ci.yml                # CI/CD pipeline
├── main.ts                                 # App definition and configuration
├── package.json                            # Dependencies and scripts
├── tsconfig.json                           # TypeScript configuration
└── README.md                               # User documentation
```

### Key Components

#### App Configuration (`main.ts`)

The app requires the following configuration values:

- `namespace` - Fully qualified Service Bus namespace (e.g., `my-namespace.servicebus.windows.net`)
- `accessToken` (secret) - Access token with scope `https://servicebus.azure.net/.default`
- `accessTokenExpiry` (optional) - Unix timestamp in milliseconds when the token expires

**Typical configuration using Azure OIDC app signals:**

- Namespace: `my-namespace.servicebus.windows.net`
- Access Token: `=signals.azureOidc.accessTokens.servicebus`
- Access Token Expiry: `signals.azureOidc.expiresAt`

#### Authentication (`blocks/auth.ts`)

Provides a `StaticTokenCredential` that wraps pre-fetched access tokens for use with Azure SDK clients.
The `createServiceBusClient` function creates a `ServiceBusClient` using token-based authentication.

#### Block: Service Bus Subscription (`blocks/serviceBusSubscription.ts`)

Polls an Azure Service Bus queue on a customizable schedule. Emits one event per message.

**Block Configuration:**

- `queueName` - Name of the queue to subscribe to
- `maxMessages` - Max messages per poll (default: 10)
- `receiveTimeoutSeconds` - How long to wait for messages (default: 5)

**Schedule:** Polls every 30 seconds by default (customizable via UI)

**Lifecycle:**

- `onSync` - Validates connection by peeking messages, returns `ready` or `failed` status
- `onDrain` - Returns `drained` status

**Output:** Message object (one event emitted per message)

- `body`, `messageId`, `enqueuedTime`, `sequenceNumber`, `contentType`, `correlationId`, `applicationProperties`

**Behavior:**

- Polls on a configurable schedule (default 30s)
- Receives up to `maxMessages` per poll cycle
- Emits one event per message received
- No events emitted if queue is empty
- Completes (acknowledges) each message after processing
- Triggers lifecycle sync on error or when recovering from failed status

## Implementation Patterns

### Scheduled Block with Lifecycle

```typescript
export const serviceBusSubscription: AppBlock = {
  name: "Service Bus Queue Subscription",
  description: "Polls for messages on a schedule.",
  category: "Azure",

  config: {
    queueName: {
      /* ... */
    },
    maxMessages: {
      /* ... */
    },
    receiveTimeoutSeconds: {
      /* ... */
    },
  },

  async onSync(input: EntityInput) {
    // Validate connection, return ready/failed status
  },

  async onDrain() {
    // Return drained status
  },

  schedules: {
    poll: {
      description: "Poll Service Bus queue for new messages",
      customizable: true,
      definition: {
        type: "frequency",
        frequency: { interval: 30, unit: "seconds" },
      },
      async onTrigger(input: EntityInput) {
        // Receive messages, emit events
        // Trigger lifecycle.sync() on error or when recovering
      },
    },
  },

  outputs: {
    default: {
      /* ... */
    },
  },
};
```

### Service Bus Client Pattern

```typescript
import { createServiceBusClient, AppConfig } from "./auth";

let client: ServiceBusClient | null = null;

try {
  // Create client using token-based authentication
  client = createServiceBusClient(input.app.config as AppConfig);
  const receiver = client.createReceiver(queueName);

  const messages = await receiver.receiveMessages(maxMessages, {
    maxWaitTimeInMs: receiveTimeoutSeconds * 1000,
  });

  for (const message of messages) {
    const parsed = parseMessage(message);
    await receiver.completeMessage(message);
    await events.emit(parsed);
  }

  await receiver.close();
} catch (error) {
  console.error(`Failed to poll: ${error.message}`);
} finally {
  if (client) {
    await client.close().catch((err) => {
      console.error(`Failed to close client: ${err.message}`);
    });
  }
}
```

### Static Token Credential Pattern

The app uses a custom `TokenCredential` implementation that wraps pre-fetched access tokens:

```typescript
class StaticTokenCredential implements TokenCredential {
  constructor(
    private token: string,
    private expiresOnTimestamp: number,
  ) {}

  async getToken(): Promise<AccessToken> {
    return {
      token: this.token,
      expiresOnTimestamp: this.expiresOnTimestamp,
    };
  }
}
```

This allows using access tokens obtained from the Azure OIDC app with Azure SDK clients.

### Lifecycle Status Updates from Scheduled Triggers

The scheduled `onTrigger` cannot directly return lifecycle status. Instead, call `lifecycle.sync()` to trigger `onSync` which validates the connection and returns the appropriate status.

```typescript
// In onTrigger - trigger sync when recovering from failed status
if (input.block.lifecycle?.status === "failed") {
  await lifecycle.sync(); // Will run onSync to validate and update status
}
```

## Development Workflow

### Local Development

1. **Setup**: `npm install`
2. **Type Check**: `npm run typecheck`
3. **Format**: `npm run format`
4. **Bundle**: `npm run bundle`

### Testing with flowctl

Use `flowctl` watch mode to test the app:

1. Install and configure the Azure OIDC app with `servicebus` service enabled
2. Configure this app with:
   - Namespace: `my-namespace.servicebus.windows.net`
   - Access Token: `=signals.azureOidc.accessTokens.servicebus`
   - Access Token Expiry: `signals.azureOidc.expiresAt`
3. Ensure the service principal has **Azure Service Bus Data Receiver** role on the namespace
4. Configure block with a queue name
5. Use `cmd/sender` to send test messages
6. Verify messages are polled and emitted as events

## Extension Guidelines

### Adding New Blocks

1. Create block file in `blocks/` directory (e.g., `blocks/myBlock.ts`)
2. Import and add to `blocks` dictionary in `blocks/index.ts`
3. Test with `npm run typecheck`

```typescript
// blocks/myBlock.ts
export const myBlock: AppBlock = {
  /* block definition */
};

// blocks/index.ts
import { myBlock } from "./myBlock";
export const blocks = {
  serviceBusSubscription: serviceBusSubscription,
  myBlock: myBlock,
} as const;
```

### Adding App Configuration

1. Update config schema in `main.ts`
2. Access via `input.app.config.fieldName`

### Dependencies

The app uses `@azure/service-bus` for Service Bus operations. Add new Azure SDK
packages to `package.json` as needed.
