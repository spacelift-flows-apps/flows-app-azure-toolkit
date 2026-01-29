import { AppBlock, EntityInput, events, lifecycle } from "@slflows/sdk/v1";
import {
  ServiceBusClient,
  ServiceBusReceivedMessage,
} from "@azure/service-bus";
import { createServiceBusClient, AppConfig } from "./auth";

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
        "Maximum number of messages to receive per poll cycle (default: 10, max: 2047)",
      type: "number",
      required: false,
      default: 10,
    },
    receiveTimeoutSeconds: {
      name: "Receive Timeout (seconds)",
      description:
        "How long to wait for messages before returning (default: 5)",
      type: "number",
      required: false,
    },
  },

  async onSync(input: EntityInput) {
    const queueName = input.block.config.queueName as string;
    const maxMessages = input.block.config.maxMessages as number | undefined;

    if (maxMessages !== undefined && maxMessages > 2047) {
      console.log(
        `Max messages per poll (${maxMessages}) exceeds the limit and will be truncated to 2047`,
      );
    }

    let client: ServiceBusClient | null = null;

    try {
      client = createServiceBusClient(input.app.config as AppConfig);
      const receiver = client.createReceiver(queueName);

      // Peek to validate connection without consuming messages
      await receiver.peekMessages(1);
      await receiver.close();

      return {
        newStatus: "ready",
      };
    } catch (error) {
      let errorMessage = "Connection failed";
      if (error instanceof AggregateError) {
        const messages = error.errors.map((e) =>
          e instanceof Error ? e.message : String(e),
        );
        errorMessage = `AggregateError: ${messages.join("; ")}`;
        console.error("AggregateError details:", messages);
      } else if (error instanceof Error) {
        errorMessage = error.message;
        console.error("Error:", errorMessage);
      }

      return {
        newStatus: "failed",
        customStatusDescription: errorMessage,
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
    return {
      newStatus: "drained",
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

        const queueName = input.block.config.queueName as string;
        const maxMessages = Math.min(
          (input.block.config.maxMessages as number) || 10,
          2047,
        );
        const receiveTimeoutSeconds =
          (input.block.config.receiveTimeoutSeconds as number) || 5;

        let client: ServiceBusClient | null = null;

        try {
          client = createServiceBusClient(input.app.config as AppConfig);
          const receiver = client.createReceiver(queueName);

          const receivedMessages = await receiver.receiveMessages(maxMessages, {
            maxWaitTimeInMs: receiveTimeoutSeconds * 1000,
          });

          for (const message of receivedMessages) {
            const parsedMessage = parseMessage(message);
            await receiver.completeMessage(message);
            await events.emit(parsedMessage);
          }

          await receiver.close();
        } catch (error) {
          // Trigger sync to update status to failed
          await lifecycle.sync();
          throw error;
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
            description: "Message body",
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
  let body: unknown;
  if (Buffer.isBuffer(message.body)) {
    body = message.body.toString("utf-8");
  } else {
    body = message.body;
  }

  return {
    body: body,
    messageId: message.messageId || "",
    enqueuedTime: message.enqueuedTimeUtc?.toISOString() || "",
    sequenceNumber: message.sequenceNumber?.toString() || "",
    contentType: message.contentType || "",
    correlationId: message.correlationId || "",
    applicationProperties: message.applicationProperties || {},
  };
}
