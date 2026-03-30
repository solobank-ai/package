import { describe, expect, it, vi } from 'vitest';
import { createProgram } from './program.js';

function createHarness() {
  const lines: string[] = [];
  const errors: string[] = [];

  return {
    lines,
    errors,
    deps: {
      init: vi.fn().mockResolvedValue({
        address: 'Wallet1111111111111111111111111111111111',
        keypairPath: '/tmp/solobank/id.json',
      }),
      createAgent: vi.fn().mockResolvedValue({
        getAddress: () => 'Wallet1111111111111111111111111111111111',
        getBalance: vi.fn().mockResolvedValue({
          address: 'Wallet1111111111111111111111111111111111',
          sol: 1.5,
          usdc: 42,
        }),
        send: vi.fn().mockResolvedValue({
          asset: 'USDC',
          amount: 2,
          signature: 'sig-1',
          explorerUrl: 'https://solscan.io/tx/sig-1',
        }),
        pay: vi.fn().mockResolvedValue({
          status: 200,
          contentType: 'application/json',
          data: { ok: true },
        }),
        getSwapQuote: vi.fn().mockResolvedValue({
          inputSymbol: 'USDC',
          outputSymbol: 'SOL',
          inAmount: 10,
          outAmount: 0.05,
          priceImpactPct: 0.001,
          routeLabels: ['Meteora'],
        }),
        swap: vi.fn().mockResolvedValue({
          inputSymbol: 'USDC',
          outputSymbol: 'SOL',
          inAmount: 10,
          outAmount: 0.05,
          signature: 'swap-sig',
          explorerUrl: 'https://solscan.io/tx/swap-sig',
        }),
        getLendingRates: vi.fn().mockResolvedValue([
          {
            protocol: 'kamino',
            asset: 'USDC',
            apy: 0.0725,
            marketAddress: 'Market111111111111111111111111111111111',
          },
        ]),
        lend: vi.fn().mockResolvedValue({
          protocol: 'kamino',
          asset: 'USDC',
          amount: 100,
          apy: 0.0725,
          signature: 'lend-sig',
        }),
        borrow: vi.fn().mockResolvedValue({
          protocol: 'marginfi',
          asset: 'USDC',
          amount: 10,
          apy: 0.04,
          signature: 'borrow-sig',
        }),
        withdraw: vi.fn().mockResolvedValue({
          protocol: 'marginfi',
          asset: 'USDC',
          amount: 25,
          apy: 0.04,
          signature: 'withdraw-sig',
        }),
        repay: vi.fn().mockResolvedValue({
          protocol: 'marginfi',
          asset: 'USDC',
          amount: 5,
          apy: 0.04,
          signature: 'repay-sig',
        }),
        rebalance: vi.fn().mockResolvedValue({
          status: 'rebalanced',
          asset: 'USDC',
          amount: 50,
          apyDelta: 0.0225,
          from: {
            protocol: 'marginfi',
            asset: 'USDC',
            apy: 0.05,
            mint: 'mint-1',
            marketAddress: 'Market111111111111111111111111111111111',
            bankAddress: 'Bank11111111111111111111111111111111111',
            decimals: 6,
          },
          to: {
            protocol: 'kamino',
            asset: 'USDC',
            apy: 0.0725,
            mint: 'mint-1',
            marketAddress: 'Market222222222222222222222222222222222',
            reserveAddress: 'Reserve2222222222222222222222222222222',
            decimals: 6,
          },
          withdrawSignature: 'withdraw-sig',
          lendSignature: 'lend-sig',
        }),
      }),
      write: (message: string) => {
        lines.push(message);
      },
      writeErr: (message: string) => {
        errors.push(message);
      },
    },
  };
}

describe('@solobank/cli', () => {
  it('runs init and prints wallet details', async () => {
    const harness = createHarness();
    const program = createProgram(harness.deps);
    await program.parseAsync(['init'], { from: 'user' });

    expect(harness.deps.init).toHaveBeenCalledTimes(1);
    expect(harness.lines.join('')).toContain('Wallet ready');
  });

  it('runs send through the sdk agent', async () => {
    const harness = createHarness();
    const program = createProgram(harness.deps);
    await program.parseAsync(['send', '2', 'Recipient1111111111111111111111111111111'], { from: 'user' });

    const agent = await harness.deps.createAgent.mock.results[0]!.value;
    expect(agent.send).toHaveBeenCalledWith({
      amount: 2,
      to: 'Recipient1111111111111111111111111111111',
      asset: 'USDC',
    });
    expect(harness.lines.join('')).toContain('Transfer sent');
  });

  it('prints an MCP config snippet', async () => {
    const harness = createHarness();
    const program = createProgram(harness.deps);
    await program.parseAsync(['mcp'], { from: 'user' });

    expect(harness.lines.join('')).toContain('@solobank/mcp');
  });

  it('prints lending rates', async () => {
    const harness = createHarness();
    const program = createProgram(harness.deps);
    await program.parseAsync(['lend-rates', 'USDC'], { from: 'user' });

    expect(harness.lines.join('')).toContain('kamino');
    expect(harness.lines.join('')).toContain('7.25%');
  });

  it('runs borrow through the sdk agent', async () => {
    const harness = createHarness();
    const program = createProgram(harness.deps);
    await program.parseAsync(['borrow', '10', 'USDC', '--protocol', 'marginfi'], { from: 'user' });

    const agent = await harness.deps.createAgent.mock.results[0]!.value;
    expect(agent.borrow).toHaveBeenCalledWith({
      amount: 10,
      asset: 'USDC',
      protocol: 'marginfi',
      marketAddress: undefined,
      bankAddress: undefined,
      reserveAddress: undefined,
    });
    expect(harness.lines.join('')).toContain('Borrow transaction sent');
  });

  it('runs rebalance through the sdk agent', async () => {
    const harness = createHarness();
    const program = createProgram(harness.deps);
    await program.parseAsync(['rebalance', '50', 'USDC', '--protocol', 'marginfi'], { from: 'user' });

    const agent = await harness.deps.createAgent.mock.results[0]!.value;
    expect(agent.rebalance).toHaveBeenCalledWith({
      amount: 50,
      asset: 'USDC',
      protocol: 'marginfi',
      targetProtocol: 'auto',
      marketAddress: undefined,
      bankAddress: undefined,
      reserveAddress: undefined,
      minApyDelta: 0,
    });
    expect(harness.lines.join('')).toContain('Rebalance complete');
    expect(harness.lines.join('')).toContain('withdraw-sig');
    expect(harness.lines.join('')).toContain('lend-sig');
  });
});
