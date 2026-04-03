declare const process: {
  argv: string[];
};

declare const console: {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

declare module 'vitest' {
  export const beforeEach: (...args: any[]) => any;
  export const describe: (...args: any[]) => any;
  export const expect: ((...args: any[]) => any) & { objectContaining: (obj: any) => any };
  export const it: (...args: any[]) => any;
  export const vi: any;
}
