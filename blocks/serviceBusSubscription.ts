import { AppBlock, EntityInput, events, kv, lifecycle } from "@slflows/sdk/v1";
import {
  ServiceBusClient,
  ServiceBusReceivedMessage,
} from "@azure/service-bus";

// KV keys for tracking
const KV_LAST_CHECK_TIME = "lastCheckTime";
const KV_LAST_MESSAGE_RECEIVED_TIME = "lastMessageReceivedTime";

export const serviceBusSubscription: AppBlock = {
  name: "Service Bus Subscription",
  description:
    "Subscribes to an Azure Service Bus queue and polls for messages on a schedule.",
  category: "Azure",

  config: {
    queueName: {
      name: "Queue Name",
      description: "Name of the Service Bus queue to subscribe to",
      type: "string",
      required: true,
    },
    maxMessages: {
      name: "Max Messages per Poll",
      description:
        "Maximum number of messages to receive per poll cycle (default: 10)",
      type: "number",
      required: false,
    },
    receiveTimeoutSeconds: {
      name: "Receive Timeout (seconds)",
      description:
        "How long to wait for messages before returning (default: 5)",
      type: "number",
      required: false,
    },
  },

  signals: {
    lastCheckTime: {
      name: "Last Check Time",
      description: "ISO timestamp of the last poll attempt",
    },
    lastMessageReceivedTime: {
      name: "Last Message Received",
      description: "ISO timestamp of when a message was last received",
    },
  },

  async onSync(input: EntityInput) {
    const connectionString = input.app.config.connectionString as string;
    const queueName = input.block.config.queueName as string;

    let client: ServiceBusClient | null = null;

    try {
      client = new ServiceBusClient(connectionString);
      const receiver = client.createReceiver(queueName);

      // Peek to validate connection without consuming messages
      await receiver.peekMessages(1);
      await receiver.close();
      await client.close();

      // Read stored timestamps
      const [lastCheck, lastReceived] = await kv.block.getMany([
        KV_LAST_CHECK_TIME,
        KV_LAST_MESSAGE_RECEIVED_TIME,
      ]);

      return {
        newStatus: "ready",
        signalUpdates: {
          lastCheckTime: lastCheck?.value || null,
          lastMessageReceivedTime: lastReceived?.value || null,
        },
      };
    } catch (error) {
      return {
        newStatus: "failed",
        customStatusDescription:
          error instanceof Error ? error.message : "Connection failed",
      };
    } finally {
      if (client) {
        await client.close().catch((err) => {
          console.error(`Failed to close client: ${err.message}`);
        });
      }
    }
  },

  async onDrain() {
    await kv.block.delete([KV_LAST_CHECK_TIME, KV_LAST_MESSAGE_RECEIVED_TIME]);

    return {
      newStatus: "drained",
      signalUpdates: {
        lastCheckTime: null,
        lastMessageReceivedTime: null,
      },
    };
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
        const status = input.block.lifecycle?.status;

        // If failed, attempt recovery by triggering sync (validates connection)
        if (status === "failed") {
          await lifecycle.sync();
          return;
        }

        // Skip polling if block is not ready
        if (status !== "ready") {
          return;
        }

        const connectionString = input.app.config.connectionString as string;
        const queueName = input.block.config.queueName as string;
        const maxMessages = (input.block.config.maxMessages as number) || 10;
        const receiveTimeoutSeconds =
          (input.block.config.receiveTimeoutSeconds as number) || 5;

        const checkTime = new Date().toISOString();
        let client: ServiceBusClient | null = null;

        try {
          client = new ServiceBusClient(connectionString);
          const receiver = client.createReceiver(queueName);

          const receivedMessages = await receiver.receiveMessages(maxMessages, {
            maxWaitTimeInMs: receiveTimeoutSeconds * 1000,
          });

          // Update last check time
          await kv.block.set({ key: KV_LAST_CHECK_TIME, value: checkTime });

          // Emit one event per message, complete each after processing
          if (receivedMessages.length > 0) {
            const receiveTime = new Date().toISOString();
            await kv.block.set({
              key: KV_LAST_MESSAGE_RECEIVED_TIME,
              value: receiveTime,
            });

            for (const message of receivedMessages) {
              const parsedMessage = parseMessage(message);
              await receiver.completeMessage(message);
              await events.emit(parsedMessage);
            }
          }

          await receiver.close();
        } catch (error) {
          console.error(
            `Failed to poll: ${error instanceof Error ? error.message : "Unknown error"}`,
          );

          // Update last check time even on error
          await kv.block.set({ key: KV_LAST_CHECK_TIME, value: checkTime });

          // Trigger sync to update status to failed
          await lifecycle.sync();
        } finally {
          if (client) {
            await client.close().catch((err) => {
              console.error(`Failed to close client: ${err.message}`);
            });
          }
        }
      },
    },
  },

  outputs: {
    default: {
      name: "Queue Message",
      description: "Message received from the Service Bus queue",
      default: true,
      type: {
        type: "object",
        properties: {
          body: {
            type: "any",
            description: "Message body (parsed JSON if valid, otherwise raw)",
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
  },
};

/**
 * Parse a Service Bus message into the output event format
 */
function parseMessage(
  message: ServiceBusReceivedMessage,
): Record<string, unknown> {
  let rawBody: string;
  if (typeof message.body === "string") {
    rawBody = message.body;
  } else if (Buffer.isBuffer(message.body)) {
    rawBody = message.body.toString("utf-8");
  } else {
    rawBody = JSON.stringify(message.body);
  }

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
