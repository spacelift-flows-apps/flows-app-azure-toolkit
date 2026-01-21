# Azure Toolkit - Flows App

For general app development guidance, see @../CLAUDE.md

## Overview

This Flows app provides blocks to interact with Azure services. It exposes:

- **Service Bus Queue Subscription** - Polls for messages on a customizable schedule

The app uses a connection string to authenticate with Azure Service Bus. The
long-term plan is to move to a passwordless approach using Azure OIDC.

Reference: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dotnet-get-started-with-queues?tabs=connection-string

## Architecture

### App Structure

```text
flows-app-azure-toolkit/
├── blocks/                                 # Block implementations
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

The app requires one configuration value:

- `connectionString` (secret) - Azure Service Bus namespace connection string

#### Block: Service Bus Queue Subscription (`blocks/serviceBusSubscription.ts`)

Polls an Azure Service Bus queue on a customizable schedule. Emits one event per message.

**Block Configuration:**

- `queueName` - Name of the queue to subscribe to
- `maxMessages` - Max messages per poll (default: 10)
- `receiveTimeoutSeconds` - How long to wait for messages (default: 5)

**Schedule:** Polls every 30 seconds by default (customizable via UI)

**Lifecycle:**

- `onSync` - Validates connection by peeking messages, returns `ready` or `failed` status
- `onDrain` - Cleans up KV storage

**Signals:**

- `lastCheckTime` - ISO timestamp of the last poll attempt
- `lastMessageReceivedTime` - ISO timestamp of when a message was last received

**Output:** Message object (one event emitted per message)

- `body`, `rawBody`, `messageId`, `enqueuedTime`, `sequenceNumber`, `contentType`, `correlationId`, `applicationProperties`

**Behavior:**

- Polls on a configurable schedule (default 30s)
- Receives up to `maxMessages` per poll cycle
- Emits one event per message received
- No events emitted if queue is empty
- Completes (acknowledges) each message after processing
- Triggers lifecycle sync when connection status changes

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

  signals: {
    lastCheckTime: {
      /* ... */
    },
    lastMessageReceivedTime: {
      /* ... */
    },
  },

  async onSync(input: EntityInput) {
    // Validate connection, return ready/failed status
    // Read timestamps from KV and return as signalUpdates
  },

  async onDrain() {
    // Clean up KV storage
    // Return drained status with null signals
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
        // Receive messages, update KV timestamps
        // Emit events, trigger lifecycle.sync() on status change
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
let client: ServiceBusClient | null = null;

try {
  client = new ServiceBusClient(connectionString);
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

### Lifecycle Status Updates from Scheduled Triggers

The scheduled `onTrigger` cannot directly return lifecycle status. Instead:

1. Store state in KV during `onTrigger`
2. Call `lifecycle.sync()` to trigger `onSync`
3. `onSync` reads KV and returns appropriate `newStatus` and `signalUpdates`

```typescript
// In onTrigger - trigger sync when connection status changes
if (input.block.lifecycle?.status === "failed") {
  await lifecycle.sync(); // Will run onSync to update to ready
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

1. Configure app with a valid connection string
2. Configure block with a queue name
3. Use `cmd/sender` to send test messages
4. Verify messages are polled and emitted as events

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
