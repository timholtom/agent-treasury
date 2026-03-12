// Agent Treasury — Status report (Telegram-friendly output)
import { WalletManager } from './wallet-manager.mjs';
import { PolicyEngine } from './policy-engine.mjs';
import fs from 'fs';

const CONFIG_FILE = new URL('./config.json', import.meta.url).pathname;
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

const wallet = new WalletManager();
const policy = new PolicyEngine(config);
wallet.initAll();

const { balances, errors } = await wallet.getAllBalances();
const addrs = wallet.getAddresses();
const ps = policy.getStatus();

// Build Telegram message
let msg = '🏦 *Agent Treasury*\n\n';

// Balances
const nonZero = balances.filter(b => parseFloat(b.balance) > 0);
if (nonZero.length) {
  msg += '*Balances:*\n';
  for (const b of nonZero) {
    msg += `• ${b.balance} ${b.token} (${b.chain})\n`;
  }
} else {
  msg += '_No balances yet_\n';
}

msg += `\n*Policy:* Stack ${ps.stackAsset}\n`;
msg += `Auto-approve: < $${ps.autoApproveBelow}\n`;
msg += `Daily: $${ps.dailySpent}/$${ps.dailySpendLimit} spent\n`;

msg += `\n*Addresses:*\n`;
msg += `EVM: \`${addrs.evm}\`\n`;
msg += `SOL: \`${addrs.solana}\`\n`;
msg += `BTC: _pending_`;

console.log(msg);
