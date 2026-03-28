declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export class McpServer {
    constructor(info: { name: string; version: string });
    tool(
      name: string,
      description: string,
      schema: Record<string, unknown>,
      handler: (args: any) => Promise<any> | any,
    ): void;
    prompt?(
      name: string,
      description: string,
      schema: Record<string, unknown>,
      handler: (args: any) => Promise<any> | any,
    ): void;
    connect(transport: unknown): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport {}
}

declare module '@banka/sdk' {
  export interface BankaBalanceSnapshot {
    address?: string;
    network?: string;
    sol?: number;
    usdc?: number;
    [key: string]: unknown;
  }

  export interface BankaSendInput {
    to: string;
    amount: number;
    asset?: string;
    dryRun?: boolean;
  }

  export interface BankaPayInput {
    url: string;
    method?: string;
    body?: unknown;
    maxPrice?: number;
    headers?: Record<string, string>;
  }

  export class Banka {
    static create?(options?: { rpcUrl?: string; keypairPath?: string }): Promise<Banka>;
    static load?(options?: { rpcUrl?: string; keypairPath?: string }): Promise<Banka>;
    address(): string;
    balance(): Promise<BankaBalanceSnapshot>;
    send(input: BankaSendInput): Promise<unknown>;
    pay(input: BankaPayInput): Promise<unknown>;
  }
}
