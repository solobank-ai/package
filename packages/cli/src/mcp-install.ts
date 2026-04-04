import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MCP_ENTRY = {
  command: 'npx',
  args: ['-y', '@solobank/mcp@latest'],
};

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AppTarget {
  app: string;
  path: string;
}

export function getConfigPaths(): AppTarget[] {
  const home = homedir();
  const targets: AppTarget[] = [];

  if (process.platform === 'darwin') {
    targets.push({
      app: 'Claude Desktop',
      path: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    });
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    targets.push({
      app: 'Claude Desktop',
      path: join(appData, 'Claude', 'claude_desktop_config.json'),
    });
  }

  targets.push({
    app: 'Cursor',
    path: join(home, '.cursor', 'mcp.json'),
  });

  return targets;
}

async function readConfig(configPath: string): Promise<McpConfig> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeConfig(configPath: string, config: McpConfig): Promise<void> {
  await mkdir(join(configPath, '..'), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

export async function installToConfig(configPath: string): Promise<void> {
  const config = await readConfig(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.solobank = MCP_ENTRY;
  await writeConfig(configPath, config);
}

export async function uninstallFromConfig(configPath: string): Promise<void> {
  const config = await readConfig(configPath);
  if (config.mcpServers && 'solobank' in config.mcpServers) {
    delete config.mcpServers.solobank;
    await writeConfig(configPath, config);
  }
}

export async function getInstallStatus(configPath: string): Promise<boolean> {
  const config = await readConfig(configPath);
  return !!config.mcpServers && 'solobank' in config.mcpServers;
}
