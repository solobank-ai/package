import type { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Mppx } from 'mppx/client';
import { solanaClient, type SolanaChargeOptions } from './mpp/index.js';
import type { KeyPairSigner } from '@solana/kit';

export interface BrowserSigner {
  publicKey: PublicKey;
  signTransaction(transaction: Transaction): Promise<Transaction>;
}

export interface BrowserPayOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  maxPrice?: number;
}

export function createBrowserClient(options: {
  rpcUrl: string;
  signer: KeyPairSigner;
}): { address: string; pay(request: BrowserPayOptions): Promise<Response> } {
  return {
    address: options.signer.address,
    async pay(request: BrowserPayOptions) {
      const client = Mppx.create({
        methods: [
          solanaClient({
            rpcUrl: options.rpcUrl,
            signer: options.signer,
          }),
        ],
        polyfill: false,
        onChallenge: async (challenge, helpers) => {
          const requested = Number(challenge.request?.amount ?? 0);
          if (request.maxPrice !== undefined && requested > request.maxPrice) {
            throw new Error(`MPP price ${requested} exceeds maxPrice ${request.maxPrice}`);
          }
          return helpers.createCredential();
        },
      });

      const headers = { ...(request.headers ?? {}) };
      const init: RequestInit = { method: request.method ?? 'GET', headers };

      if (request.body !== undefined) {
        if (typeof request.body === 'string') {
          init.body = request.body;
        } else {
          init.body = JSON.stringify(request.body);
          if (!headers['content-type']) {
            headers['content-type'] = 'application/json';
          }
        }
      }

      return client.fetch(request.url, init);
    },
  };
}
