import { defineApp } from "@slflows/sdk/v1";
import { blocks } from "./blocks/index";

export const app = defineApp({
  name: "Azure Toolkit",
  installationInstructions: `Provide the fully qualified namespace (e.g., \`my-namespace.servicebus.windows.net\`) and an access token with scope \`https://servicebus.azure.net/.default\`.`,

  blocks,

  config: {
    namespace: {
      name: "Namespace",
      description:
        "Fully qualified namespace (e.g., my-namespace.servicebus.windows.net)",
      type: "string",
      required: true,
    },
    accessToken: {
      name: "Access Token",
      description:
        "Access token with scope https://servicebus.azure.net/.default",
      type: "string",
      required: true,
      sensitive: true,
    },
    accessTokenExpiry: {
      name: "Access Token Expiry",
      description:
        "Unix timestamp in milliseconds when the access token expires (e.g., 1737981296789)",
      type: "number",
      required: false,
    },
  },

  async onSync() {
    return {
      newStatus: "ready",
    };
  },
});
