import { Command } from 'commander';
import pc from 'picocolors';
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
} from '@solobank/sdk';

export interface CliDeps {
  init(options?: { force?: boolean }): Promise<{ address: string; keypairPath: string }>;
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
    .action(async (options: { force?: boolean }) => {
      const result = await deps.init({ force: options.force });
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

  program
    .command('mcp')
    .description('print an MCP stdio config snippet')
    .action(async () => {
      deps.write(`${JSON.stringify({
        mcpServers: {
          solobank: {
            command: 'npx',
            args: ['-y', '@solobank/mcp'],
          },
        },
      }, null, 2)}\n`);
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
