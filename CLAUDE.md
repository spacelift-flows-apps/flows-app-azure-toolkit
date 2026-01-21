# Azure Toolkit - Flows App

For general app development guidance, see @../CLAUDE.md

## Overview

This Flows app provides blocks to interact with Azure services. Currently, it
exposes a **Service Bus Queue Reader** block that reads messages from an Azure
Service Bus queue on demand.

The app uses a connection string to authenticate with Azure Service Bus. The
long-term plan is to move to a passwordless approach using Azure OIDC.

Reference: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dotnet-get-started-with-queues?tabs=connection-string

## Architecture

### App Structure

```text
flows-app-azure-toolkit/
├── blocks/                   # Block implementations
│   ├── index.ts              # Block registry and exports
│   └── serviceBusQueue.ts    # Service Bus Queue Reader block
├── .github/workflows/ci.yml  # CI/CD pipeline
├── main.ts                   # App definition and configuration
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # User documentation
```

### Key Components

#### App Configuration (`main.ts`)

The app requires one configuration value:

- `connectionString` (secret) - Azure Service Bus namespace connection string

#### Block: Service Bus Queue Reader (`blocks/serviceBusQueue.ts`)

Reads messages from an Azure Service Bus queue when triggered.

**Block Configuration:**

- `queueName` - Name of the queue to read from

**Input:** Any event triggers message retrieval

**Output:**

- `status` - "connected" or "error"
- `checkedAt` - ISO timestamp
- `message` - Received message object or null if queue is empty

**Behavior:**

- Reads one message per trigger event
- Completes (acknowledges) the message after reading
- Returns null for message if queue is empty
- Gracefully handles connection errors

## Implementation Patterns

### Block Structure

```typescript
export const serviceBusQueue: AppBlock = {
  name: "Service Bus Queue Reader",
  description: "Reads messages from an Azure Service Bus queue on demand.",
  category: "Azure",

  config: {
    queueName: {
      name: "Queue Name",
      description: "Name of the Service Bus queue to read messages from",
      type: "string",
      required: true,
    },
  },

  inputs: {
    default: {
      name: "Read Messages",
      description: "Trigger message retrieval.",
      config: {},
      async onEvent(input: EntityInput) {
        // Access app config
        const connectionString = input.app.config.connectionString as string;
        // Access block config
        const queueName = input.block.config.queueName as string;

        // ... implementation
        await events.emit({ status, checkedAt, message });
      },
    },
  },

  outputs: {
    default: {
      name: "Queue Message",
      description: "Result of the read operation",
      default: true,
      type: {
        /* JSON Schema */
      },
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

  const messages = await receiver.receiveMessages(1, {
    maxWaitTimeInMs: 1000,
  });

  if (messages.length > 0) {
    // Process message
    await receiver.completeMessage(messages[0]);
  }

  await receiver.close();
} finally {
  if (client) {
    await client.close().catch(() => {});
  }
}
```

### Error Handling

The block emits events for both success and error cases rather than throwing:

```typescript
try {
  // ... operations
  await events.emit({ status: "connected", checkedAt, message });
} catch (error) {
  await events.emit({ status: "error", checkedAt, message: null });
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
3. Send trigger events and verify output

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
  serviceBusQueue: serviceBusQueue,
  myBlock: myBlock,
} as const;
```

### Adding App Configuration

1. Update config schema in `main.ts`
2. Access via `input.app.config.fieldName`

### Dependencies

The app uses `@azure/service-bus` for Service Bus operations. Add new Azure SDK
packages to `package.json` as needed.
