import { AppBlock, EntityInput, events } from "@slflows/sdk/v1";
import {
  ServiceBusClient,
  ServiceBusReceivedMessage,
} from "@azure/service-bus";

export const serviceBusQueue: AppBlock = {
  name: "Service Bus Queue Reader",
  description:
    "Reads messages from an Azure Service Bus queue on demand. When triggered, receives and completes pending messages.",
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
      description:
        "Trigger message retrieval. Any incoming event initiates reading from the queue.",
      config: {},
      async onEvent(input: EntityInput) {
        const connectionString = input.app.config.connectionString as string;
        const queueName = input.block.config.queueName as string;
        const checkedAt = new Date().toISOString();

        let client: ServiceBusClient | null = null;

        try {
          client = new ServiceBusClient(connectionString);
          const receiver = client.createReceiver(queueName);

          // Read one message per received event.
          const receivedMessages = await receiver.receiveMessages(1, {
            maxWaitTimeInMs: 1000,
          });

          // Parse and complete the message if present
          let parsedMessage: Record<string, unknown> | null = null;
          if (receivedMessages.length > 0) {
            parsedMessage = parseMessage(receivedMessages[0]);
            await receiver.completeMessage(receivedMessages[0]);
          }

          await receiver.close();

          await events.emit({
            status: "connected",
            checkedAt,
            message: parsedMessage,
          });
        } catch (error) {
          await events.emit({
            status: "error",
            checkedAt,
            message: null,
          });
        } finally {
          if (client) {
            await client.close().catch(() => {});
          }
        }
      },
    },
  },

  outputs: {
    default: {
      name: "Queue Message",
      description: "Result of the read operation with the received message",
      default: true,
      type: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["connected", "error"],
            description: "Connection status",
          },
          checkedAt: {
            type: "string",
            description: "ISO timestamp of when check was performed",
          },
          message: {
            type: ["object", "null"],
            description: "Message received from the queue, or null if none",
            properties: {
              body: {
                type: "any",
                description:
                  "Message body (parsed JSON if valid, otherwise raw)",
              },
              rawBody: {
                type: "string",
                description: "Original message body as string",
              },
              messageId: {
                type: "string",
                description: "Unique message identifier",
              },
              enqueuedTime: {
                type: "string",
                description: "ISO timestamp when message was enqueued",
              },
              sequenceNumber: {
                type: "string",
                description: "Sequence number in the queue",
              },
              contentType: {
                type: "string",
                description: "Content type of the message",
              },
              correlationId: {
                type: "string",
                description: "Correlation ID for request-response patterns",
              },
              applicationProperties: {
                type: "object",
                description: "Custom application properties",
              },
            },
            required: ["body", "messageId"],
          },
        },
        required: ["status", "checkedAt", "message"],
      },
    },
  },
};

/**
 * Parse a Service Bus message into the output event format
 */
function parseMessage(
  message: ServiceBusReceivedMessage,
): Record<string, unknown> {
  // Get the raw body as string
  let rawBody: string;
  if (typeof message.body === "string") {
    rawBody = message.body;
  } else if (Buffer.isBuffer(message.body)) {
    rawBody = message.body.toString("utf-8");
  } else {
    rawBody = JSON.stringify(message.body);
  }

  // Try to parse as JSON
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = rawBody;
  }

  return {
    body,
    rawBody,
    messageId: message.messageId || "",
    enqueuedTime: message.enqueuedTimeUtc?.toISOString() || "",
    sequenceNumber: message.sequenceNumber?.toString() || "",
    contentType: message.contentType || "",
    correlationId: message.correlationId || "",
    applicationProperties: message.applicationProperties || {},
  };
}
