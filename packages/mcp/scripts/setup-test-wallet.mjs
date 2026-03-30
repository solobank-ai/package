/**
 * Creates a throwaway wallet for local MCP inspection.
 * The generated keypair has no funds and is not used in production.
 */
import { Solobank, resolveConfigDir, walletExists } from '@solobank/sdk';
import { mkdir } from 'node:fs/promises';

const configDir = resolveConfigDir(process.env.SOLOBANK_CONFIG_DIR);

await mkdir(configDir, { recursive: true });

if (await walletExists(configDir)) {
  console.log('Wallet already exists, skipping');
} else {
  await Solobank.init({ configDir });
}
console.log('Test wallet created');
