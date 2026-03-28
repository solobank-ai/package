#!/usr/bin/env node

import { startMcpServer, type StartMcpServerOptions } from './index.js';

function readOption(flag: string, args: string[]): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

const args = process.argv.slice(2);

const options: StartMcpServerOptions = {
  rpcUrl: readOption('--rpc-url', args),
  keypairPath: readOption('--keypair', args),
};

await startMcpServer(options);
