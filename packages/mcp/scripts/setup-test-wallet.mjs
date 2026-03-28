/**
 * Creates a throwaway wallet for local MCP inspection.
 * The generated keypair has no funds and is not used in production.
 */
import { Banka, resolveConfigDir, walletExists } from '@banka/sdk';
import { mkdir } from 'node:fs/promises';

const configDir = resolveConfigDir(process.env.BANKA_CONFIG_DIR);

await mkdir(configDir, { recursive: true });

if (await walletExists(configDir)) {
  console.log('Wallet already exists, skipping');
} else {
  await Banka.init({ configDir });
}
console.log('Test wallet created');
