import { defineApp } from "@slflows/sdk/v1";
import { blocks } from "./blocks/index";

export const app = defineApp({
  name: "Azure Toolkit",

  blocks,

  config: {
    connectionString: {
      name: "Connection String",
      description: "Azure Service Bus namespace connection string",
      type: "string",
      required: true,
      sensitive: true,
    },

    // NOTE in a future phase we'll switch to passwordless and read from Azure OIDC app.
    // accessToken: {
    //   name: "Azure Access Token",
    //   description: "Access token from Azure OIDC app",
    //   type: "string",
    //   required: true,
    //   sensitive: true,
    // },
  },

  installationInstructions: `Get the connection string from the *Service Bus Namespace Settings*, under the *Shared Access Policies* tab.`,
  // NOTE in a future phase we'll switch to passwordless and read from Azure OIDC app.
  // installationInstructions: `Get the token from the Azure OIDC app for the \`management\` service using a signal reference like \`ref("signal.azureOidc.accessTokens").management\`.`,
});
