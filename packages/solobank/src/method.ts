import { Method, z } from 'mppx';

export const solanaCharge = Method.from({
  intent: 'charge',
  name: 'solana',
  schema: {
    credential: {
      payload: z.object({
        signature: z.string(),
      }),
    },
    request: z.object({
      amount: z.string(),
      currency: z.string(),
      recipient: z.string(),
    }),
  },
});
