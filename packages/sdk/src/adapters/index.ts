import { capabilityDescriptors, type CapabilityDescriptor } from './descriptors.js';

export class CapabilityRegistry {
  private readonly descriptors = new Map<string, CapabilityDescriptor>();

  constructor(initial: CapabilityDescriptor[] = capabilityDescriptors) {
    for (const descriptor of initial) {
      this.register(descriptor);
    }
  }

  register(descriptor: CapabilityDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
  }

  list(): CapabilityDescriptor[] {
    return [...this.descriptors.values()];
  }

  get(id: string): CapabilityDescriptor | undefined {
    return this.descriptors.get(id);
  }
}

export function createDefaultRegistry(): CapabilityRegistry {
  return new CapabilityRegistry();
}

export { capabilityDescriptors };
export type { CapabilityDescriptor };
