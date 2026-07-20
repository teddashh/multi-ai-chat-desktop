import type { AIProvider } from '../../shared/types';

const PROVIDER_ERROR_PATTERN = /^\[Error:\s*([\s\S]*?)\]$/;
const SEND_NOT_ACCEPTED_SUFFIX = 'send was not accepted; draft is still in composer';

export class ProviderResponseError extends Error {
  readonly provider: AIProvider;
  readonly response: string;

  constructor(provider: AIProvider, response: string, reason: string) {
    super(reason);
    this.name = 'ProviderResponseError';
    this.provider = provider;
    this.response = response;
  }
}

export function providerResponseError(provider: AIProvider, response: string): ProviderResponseError | undefined {
  const match = PROVIDER_ERROR_PATTERN.exec(response.trim());
  if (!match) return undefined;
  return new ProviderResponseError(provider, response.trim(), match[1].trim());
}

export function isRetryableSendRejection(error: ProviderResponseError): boolean {
  return error.message.toLowerCase() === `${error.provider} ${SEND_NOT_ACCEPTED_SUFFIX}`;
}
