import type { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Mppx } from 'mppx/client';
import { solanaClient } from '@solobank/mpp-solana';

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
  connection: Connection;
  signer: BrowserSigner;
}) {
  return {
    address: options.signer.publicKey.toBase58(),
    async pay(request: BrowserPayOptions) {
      const client = Mppx.create({
        methods: [
          solanaClient({
            connection: options.connection,
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
