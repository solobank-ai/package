import { SOLANA_USDC_MINT } from '@solobank/mpp-solana';

export const gatewayBaseUrl =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3000';

export const gatewayRecipient =
  process.env.SOLOBANK_GATEWAY_RECIPIENT ?? '11111111111111111111111111111111';

export const gatewayRpcUrl =
  process.env.SOLOBANK_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

export const gatewayCurrency = process.env.SOLOBANK_GATEWAY_CURRENCY ?? SOLANA_USDC_MINT;

export const defaultAnthropicVersion =
  process.env.ANTHROPIC_VERSION ?? '2023-06-01';

export const gatewayAdminToken = process.env.SOLOBANK_GATEWAY_ADMIN_TOKEN;
