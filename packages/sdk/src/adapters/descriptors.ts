export interface CapabilityDescriptor {
  id: string;
  chain: 'solana';
  capability: 'wallet' | 'payments' | 'transfers' | 'swaps' | 'lending';
  description: string;
}

export const capabilityDescriptors: CapabilityDescriptor[] = [
  {
    id: 'solana-wallet',
    chain: 'solana',
    capability: 'wallet',
    description: 'Local Ed25519 keypair wallet with SOL and USDC balance inspection.',
  },
  {
    id: 'solana-transfers',
    chain: 'solana',
    capability: 'transfers',
    description: 'Native SOL and SPL USDC transfers with ATA creation when needed.',
  },
  {
    id: 'solana-mpp',
    chain: 'solana',
    capability: 'payments',
    description: 'MPP-compatible API payments over Solana USDC.',
  },
  {
    id: 'solana-jupiter',
    chain: 'solana',
    capability: 'swaps',
    description: 'Jupiter-powered token quotes and swaps with the current best route.',
  },
  {
    id: 'solana-lending-router',
    chain: 'solana',
    capability: 'lending',
    description: 'Supply APY discovery across Kamino and marginfi with auto-routing to the best opportunity.',
  },
];
