import { ServiceBusClient } from "@azure/service-bus";
import {
  AccessToken,
  TokenCredential,
  GetTokenOptions,
} from "@azure/core-auth";

/**
 * A TokenCredential that wraps a pre-fetched access token.
 */
class StaticTokenCredential implements TokenCredential {
  constructor(
    private token: string,
    private expiresOnTimestamp: number,
  ) {}

  async getToken(
    _scopes: string | string[],
    _options?: GetTokenOptions,
  ): Promise<AccessToken> {
    return {
      token: this.token,
      expiresOnTimestamp: this.expiresOnTimestamp,
    };
  }
}

/**
 * App configuration for authentication.
 */
export interface AppConfig {
  namespace: string;
  accessToken: string;
  accessTokenExpiry?: number;
}

/**
 * Creates a ServiceBusClient using access token authentication.
 */
export function createServiceBusClient(config: AppConfig): ServiceBusClient {
  const { namespace, accessToken, accessTokenExpiry } = config;

  // Use provided expiry or default to 1 hour from now
  const expiresOnTimestamp = accessTokenExpiry ?? Date.now() + 3600000;

  const credential = new StaticTokenCredential(accessToken, expiresOnTimestamp);

  return new ServiceBusClient(namespace, credential);
}
