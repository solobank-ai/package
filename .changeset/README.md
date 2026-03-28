# Changesets

This repository uses Changesets to version and publish packages.

## Common commands

```bash
pnpm changeset
pnpm version-packages
pnpm release:dry
pnpm release
```

## Versioning model

The following packages are released as a fixed group and always share the same version:

- `banka`
- `@banka/sdk`
- `@banka/cli`
- `@banka/mcp`
