import { Command } from 'commander';
import pc from 'picocolors';
import { getConfigPaths, installToConfig, uninstallFromConfig, getInstallStatus } from './mcp-install.js';
import {
  Solobank,
  type BorrowOptions,
  formatAssetAmount,
  formatUsd,
  type LendingActionResult,
  truncateAddress,
  type LendOptions,
  type LendingProtocolSelector,
  type PayOptions,
  type RebalanceOptions,
  type RebalanceResult,
  type RepayOptions,
  type SendOptions,
  type SwapOptions,
  type WithdrawOptions,
  loadSafeguardConfig,
  saveSafeguardConfig,
  lockWallet,
  unlockWallet,
} from '@solobank/sdk';

export interface CliDeps {
  init(options?: { force?: boolean; password?: string }): Promise<{ address: string; keypairPath: string }>;
  createAgent(): Promise<Pick<Solobank, 'getAddress' | 'getBalance' | 'send' | 'pay' | 'getSwapQuote' | 'swap' | 'getLendingRates' | 'lend' | 'borrow' | 'withdraw' | 'repay' | 'rebalance'>>;
  write(message: string): void;
  writeErr(message: string): void;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatLendingAction(title: string, result: LendingActionResult): string {
  return [
    pc.green(title),
    `Protocol: ${result.protocol}`,
    `Asset: ${result.asset}`,
    `Amount: ${result.amount}`,
    `APY: ${formatPercent(result.apy)}`,
    `Signature: ${result.signature}`,
  ].join('\n');
}

function formatRebalanceResult(result: RebalanceResult): string {
  const lines = [
    pc.green(result.status === 'rebalanced' ? 'Rebalance complete' : 'Rebalance skipped'),
    `Asset: ${result.asset}`,
    `Amount: ${result.amount}`,
    `From: ${result.from.protocol} ${formatPercent(result.from.apy)}`,
    `To: ${result.to.protocol} ${formatPercent(result.to.apy)}`,
    `APY delta: ${formatPercent(result.apyDelta)}`,
  ];

  if (result.withdrawSignature) {
    lines.push(`Withdraw signature: ${result.withdrawSignature}`);
  }
  if (result.lendSignature) {
    lines.push(`Lend signature: ${result.lendSignature}`);
  }
  if (result.reason) {
    lines.push(`Reason: ${result.reason}`);
  }

  return lines.join('\n');
}

function parseBody(input: string | undefined): unknown {
  if (input === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function createProgram(deps: CliDeps): Command {
  const program = new Command();

  program
    .name('solobank')
    .description('Solobank CLI for AI agents on Solana')
    .showHelpAfterError();

  program
    .command('init')
    .option('--force', 'overwrite an existing local wallet')
    .option('--password <password>', 'encrypt keypair with AES-256-GCM')
    .action(async (options: { force?: boolean; password?: string }) => {
      const result = await deps.init({ force: options.force, password: options.password });
      deps.write(`${pc.green('Wallet ready')}\nAddress: ${result.address}\nKeypair: ${result.keypairPath}\n`);
    });

  program
    .command('address')
    .action(async () => {
      const agent = await deps.createAgent();
      deps.write(`${agent.getAddress()}\n`);
    });

  program
    .command('balance')
    .action(async () => {
      const agent = await deps.createAgent();
      const balance = await agent.getBalance();
      deps.write(
        [
          `Address: ${truncateAddress(balance.address)}`,
          `SOL: ${formatAssetAmount(balance.sol, 'SOL')}`,
          `USDC: ${formatUsd(balance.usdc)}`,
        ].join('\n') + '\n',
      );
    });

  program
    .command('send')
    .argument('<amount>', 'amount to send')
    .argument('<to>', 'recipient public key')
    .option('--asset <asset>', 'asset symbol: SOL or USDC', 'USDC')
    .action(async (amount: string, to: string, options: { asset: string }) => {
      const agent = await deps.createAgent();
      const result = await agent.send({
        amount: Number(amount),
        to,
        asset: options.asset.toUpperCase() as SendOptions['asset'],
      });
      deps.write(
        [
          `${pc.green('Transfer sent')}`,
          `Asset: ${result.asset}`,
          `Amount: ${result.amount}`,
          `Signature: ${result.signature}`,
          `Explorer: ${result.explorerUrl}`,
        ].join('\n') + '\n',
      );
    });

  program
    .command('pay')
    .argument('<url>', 'MPP-protected URL')
    .option('--method <method>', 'HTTP method', 'GET')
    .option('--data <json>', 'request body as JSON or string')
    .option('--max-price <usd>', 'maximum allowed payment in USD')
    .action(async (url: string, options: { method: string; data?: string; maxPrice?: string }) => {
      const agent = await deps.createAgent();
      const result = await agent.pay({
        url,
        method: options.method.toUpperCase() as PayOptions['method'],
        body: parseBody(options.data),
        maxPrice: options.maxPrice !== undefined ? Number(options.maxPrice) : undefined,
      });
      deps.write(
        [
          `${pc.green('Request completed')}`,
          `Status: ${result.status}`,
          `Content-Type: ${result.contentType || 'unknown'}`,
          `Body: ${typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}`,
        ].join('\n') + '\n',
      );
    });

  program
    .command('swap-quote')
    .argument('<amount>', 'input amount')
    .argument('<from>', 'input asset symbol or mint')
    .argument('<to>', 'output asset symbol or mint')
    .option('--slippage-bps <bps>', 'slippage in basis points', '50')
    .action(async (amount: string, from: string, to: string, options: { slippageBps: string }) => {
      const agent = await deps.createAgent();
      const quote = await agent.getSwapQuote({
        amount: Number(amount),
        fromAsset: from,
        toAsset: to,
        slippageBps: Number(options.slippageBps),
      } satisfies SwapOptions);
      deps.write(
        [
          `${pc.green('Swap quote ready')}`,
          `From: ${quote.inAmount} ${quote.inputSymbol}`,
          `To: ${quote.outAmount} ${quote.outputSymbol}`,
          `Price impact: ${formatPercent(quote.priceImpactPct)}`,
          `Route: ${quote.routeLabels.join(' -> ') || 'direct'}`,
        ].join('\n') + '\n',
      );
    });

  program
    .command('swap')
    .argument('<amount>', 'input amount')
    .argument('<from>', 'input asset symbol or mint')
    .argument('<to>', 'output asset symbol or mint')
    .option('--slippage-bps <bps>', 'slippage in basis points', '50')
    .action(async (amount: string, from: string, to: string, options: { slippageBps: string }) => {
      const agent = await deps.createAgent();
      const result = await agent.swap({
        amount: Number(amount),
        fromAsset: from,
        toAsset: to,
        slippageBps: Number(options.slippageBps),
      } satisfies SwapOptions);
      deps.write(
        [
          `${pc.green('Swap sent')}`,
          `From: ${result.inAmount} ${result.inputSymbol}`,
          `To: ${result.outAmount} ${result.outputSymbol}`,
          `Signature: ${result.signature}`,
          `Explorer: ${result.explorerUrl}`,
        ].join('\n') + '\n',
      );
    });

  program
    .command('lend-rates')
    .argument('<asset>', 'asset symbol or mint')
    .option('--protocol <protocol>', 'auto, kamino, or marginfi', 'auto')
    .action(async (asset: string, options: { protocol: LendingProtocolSelector }) => {
      const agent = await deps.createAgent();
      const rates = await agent.getLendingRates({
        asset,
        protocol: options.protocol,
      });
      deps.write(
        rates
          .map((rate, index) => (
            `${index + 1}. ${rate.protocol} ${rate.asset} ${formatPercent(rate.apy)} ` +
            `market=${truncateAddress(rate.marketAddress, 6, 6)}`
          ))
          .join('\n') + '\n',
      );
    });

  program
    .command('lend')
    .argument('<amount>', 'amount to supply')
    .argument('<asset>', 'asset symbol or mint')
    .option('--protocol <protocol>', 'auto, kamino, or marginfi', 'auto')
    .action(async (amount: string, asset: string, options: { protocol: LendingProtocolSelector }) => {
      const agent = await deps.createAgent();
      const result = await agent.lend({
        amount: Number(amount),
        asset,
        protocol: options.protocol,
      } satisfies LendOptions);
      deps.write(
        [
          `${pc.green('Lend transaction sent')}`,
          `Protocol: ${result.protocol}`,
          `Asset: ${result.asset}`,
          `Amount: ${result.amount}`,
          `APY: ${formatPercent(result.apy)}`,
          `Signature: ${result.signature}`,
        ].join('\n') + '\n',
      );
    });

  program
    .command('borrow')
    .argument('<amount>', 'amount to borrow')
    .argument('<asset>', 'asset symbol or mint')
    .option('--protocol <protocol>', 'auto, kamino, or marginfi', 'auto')
    .option('--market <address>', 'target market address')
    .option('--bank <address>', 'target marginfi bank address')
    .option('--reserve <address>', 'target Kamino reserve address')
    .action(async (
      amount: string,
      asset: string,
      options: { protocol: LendingProtocolSelector; market?: string; bank?: string; reserve?: string },
    ) => {
      const agent = await deps.createAgent();
      const result = await agent.borrow({
        amount: Number(amount),
        asset,
        protocol: options.protocol,
        marketAddress: options.market,
        bankAddress: options.bank,
        reserveAddress: options.reserve,
      } satisfies BorrowOptions);
      deps.write(`${formatLendingAction('Borrow transaction sent', result)}\n`);
    });

  program
    .command('withdraw')
    .argument('<amount>', 'amount to withdraw')
    .argument('<asset>', 'asset symbol or mint')
    .option('--protocol <protocol>', 'auto, kamino, or marginfi', 'auto')
    .option('--market <address>', 'target market address')
    .option('--bank <address>', 'target marginfi bank address')
    .option('--reserve <address>', 'target Kamino reserve address')
    .option('--all', 'withdraw entire position')
    .action(async (
      amount: string,
      asset: string,
      options: { protocol: LendingProtocolSelector; market?: string; bank?: string; reserve?: string; all?: boolean },
    ) => {
      const agent = await deps.createAgent();
      const result = await agent.withdraw({
        amount: Number(amount),
        asset,
        protocol: options.protocol,
        marketAddress: options.market,
        bankAddress: options.bank,
        reserveAddress: options.reserve,
        withdrawAll: options.all,
      } satisfies WithdrawOptions);
      deps.write(`${formatLendingAction('Withdraw transaction sent', result)}\n`);
    });

  program
    .command('repay')
    .argument('<amount>', 'amount to repay')
    .argument('<asset>', 'asset symbol or mint')
    .option('--protocol <protocol>', 'auto, kamino, or marginfi', 'auto')
    .option('--market <address>', 'target market address')
    .option('--bank <address>', 'target marginfi bank address')
    .option('--reserve <address>', 'target Kamino reserve address')
    .option('--all', 'repay entire debt position')
    .action(async (
      amount: string,
      asset: string,
      options: { protocol: LendingProtocolSelector; market?: string; bank?: string; reserve?: string; all?: boolean },
    ) => {
      const agent = await deps.createAgent();
      const result = await agent.repay({
        amount: Number(amount),
        asset,
        protocol: options.protocol,
        marketAddress: options.market,
        bankAddress: options.bank,
        reserveAddress: options.reserve,
        repayAll: options.all,
      } satisfies RepayOptions);
      deps.write(`${formatLendingAction('Repay transaction sent', result)}\n`);
    });

  program
    .command('rebalance')
    .argument('<amount>', 'amount to move')
    .argument('<asset>', 'asset symbol or mint')
    .option('--protocol <protocol>', 'current venue protocol: auto, kamino, or marginfi', 'auto')
    .option('--target-protocol <protocol>', 'destination venue protocol: auto, kamino, or marginfi', 'auto')
    .option('--market <address>', 'current market address')
    .option('--bank <address>', 'current marginfi bank address')
    .option('--reserve <address>', 'current Kamino reserve address')
    .option('--min-apy-delta <value>', 'minimum APY delta required before moving', '0')
    .action(async (
      amount: string,
      asset: string,
      options: {
        protocol: LendingProtocolSelector;
        targetProtocol: LendingProtocolSelector;
        market?: string;
        bank?: string;
        reserve?: string;
        minApyDelta: string;
      },
    ) => {
      const agent = await deps.createAgent();
      const result = await agent.rebalance({
        amount: Number(amount),
        asset,
        protocol: options.protocol,
        targetProtocol: options.targetProtocol,
        marketAddress: options.market,
        bankAddress: options.bank,
        reserveAddress: options.reserve,
        minApyDelta: Number(options.minApyDelta),
      } satisfies RebalanceOptions);
      deps.write(`${formatRebalanceResult(result)}\n`);
    });

  const mcpCmd = program
    .command('mcp')
    .description('manage MCP server integration');

  mcpCmd
    .command('install')
    .description('auto-configure Solobank MCP in Claude Desktop and Cursor')
    .action(async () => {
      const targets = getConfigPaths();
      for (const { app, path } of targets) {
        try {
          await installToConfig(path);
          deps.write(`${pc.green('✓')} Installed in ${app} (${path})\n`);
        } catch (err) {
          deps.writeErr(`${pc.red('✗')} Failed for ${app}: ${err instanceof Error ? err.message : err}\n`);
        }
      }
    });

  mcpCmd
    .command('uninstall')
    .description('remove Solobank MCP from Claude Desktop and Cursor')
    .action(async () => {
      const targets = getConfigPaths();
      for (const { app, path } of targets) {
        try {
          await uninstallFromConfig(path);
          deps.write(`${pc.green('✓')} Removed from ${app}\n`);
        } catch {
          // config doesn't exist, nothing to remove
        }
      }
    });

  mcpCmd
    .command('status')
    .description('show which apps have Solobank MCP configured')
    .action(async () => {
      const targets = getConfigPaths();
      for (const { app, path } of targets) {
        const installed = await getInstallStatus(path);
        deps.write(`${installed ? pc.green('✓') : pc.dim('·')} ${app}\n`);
      }
    });

  mcpCmd
    .command('config')
    .description('print MCP config snippet for manual setup')
    .action(async () => {
      deps.write(`${JSON.stringify({
        mcpServers: {
          solobank: {
            command: 'npx',
            args: ['-y', '@solobank/mcp@latest'],
          },
        },
      }, null, 2)}\n`);
    });

  // Default action when no subcommand given
  mcpCmd.action(async () => {
    deps.write(`${JSON.stringify({
      mcpServers: {
        solobank: {
          command: 'npx',
          args: ['-y', '@solobank/mcp@latest'],
        },
      },
    }, null, 2)}\n`);
  });

  // ── Safeguard commands ──

  const configCmd = program
    .command('config')
    .description('manage safeguard configuration');

  configCmd
    .command('get [key]')
    .description('view safeguard settings')
    .action(async (key?: string) => {
      const cfg = await loadSafeguardConfig();
      if (key) {
        const value = (cfg as unknown as Record<string, unknown>)[key];
        deps.write(`${key}: ${JSON.stringify(value)}\n`);
      } else {
        deps.write(`${JSON.stringify({ maxAmountPerTx: cfg.maxAmountPerTx, maxDailySend: cfg.maxDailySend, locked: cfg.locked }, null, 2)}\n`);
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('set a safeguard value (maxAmountPerTx, maxDailySend)')
    .action(async (key: string, value: string) => {
      const cfg = await loadSafeguardConfig();
      const num = Number(value);
      if (isNaN(num)) {
        deps.writeErr(`${pc.red('Error:')} Value must be a number.\n`);
        return;
      }
      if (key === 'maxAmountPerTx') cfg.maxAmountPerTx = num;
      else if (key === 'maxDailySend') cfg.maxDailySend = num;
      else {
        deps.writeErr(`${pc.red('Error:')} Unknown key "${key}". Use maxAmountPerTx or maxDailySend.\n`);
        return;
      }
      await saveSafeguardConfig(cfg);
      deps.write(`${pc.green('✓')} ${key} = ${num}\n`);
    });

  program
    .command('lock')
    .description('emergency lock — disables all transactions')
    .action(async () => {
      await lockWallet();
      deps.write(`${pc.red('🔒')} Wallet locked. All transactions disabled.\n`);
    });

  program
    .command('unlock')
    .description('unlock wallet — re-enables transactions')
    .action(async () => {
      await unlockWallet();
      deps.write(`${pc.green('🔓')} Wallet unlocked.\n`);
    });

  program.exitOverride();
  return program;
}

export async function runCli(argv: string[], deps?: Partial<CliDeps>): Promise<void> {
  const resolved: CliDeps = {
    init: (options) => Solobank.init(options),
    createAgent: () => Solobank.create(),
    write: (message) => process.stdout.write(message),
    writeErr: (message) => process.stderr.write(message),
    ...deps,
  };

  const program = createProgram(resolved);
  program.configureOutput({
    writeOut: resolved.write,
    writeErr: resolved.writeErr,
  });
  await program.parseAsync(argv, { from: 'user' });
}
