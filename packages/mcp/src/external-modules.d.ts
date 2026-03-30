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

declare module '@solobank/sdk' {
  export interface SolobankBalanceSnapshot {
    address?: string;
    network?: string;
    sol?: number;
    usdc?: number;
    [key: string]: unknown;
  }

  export interface SolobankSendInput {
    to: string;
    amount: number;
    asset?: string;
    dryRun?: boolean;
  }

  export interface SolobankPayInput {
    url: string;
    method?: string;
    body?: unknown;
    maxPrice?: number;
    headers?: Record<string, string>;
  }

  export class Solobank {
    static create?(options?: { rpcUrl?: string; keypairPath?: string }): Promise<Solobank>;
    static load?(options?: { rpcUrl?: string; keypairPath?: string }): Promise<Solobank>;
    address(): string;
    balance(): Promise<SolobankBalanceSnapshot>;
    send(input: SolobankSendInput): Promise<unknown>;
    pay(input: SolobankPayInput): Promise<unknown>;
  }
}
