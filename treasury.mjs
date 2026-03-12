// Agent Treasury — Main entry point
// "One wallet. Every chain. Auto-stack what you believe in."

import { WalletManager } from './wallet-manager.mjs';
import { PolicyEngine } from './policy-engine.mjs';
import fs from 'fs';

const CONFIG_FILE = new URL('./config.json', import.meta.url).pathname;
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

const wallet = new WalletManager();
const policy = new PolicyEngine(config);

// Initialize wallets
console.log('🔐 Initializing Agent Treasury...\n');
const keys = wallet.initAll();

console.log('EVM:');
console.log(`  Address: ${keys.evm.address}`);
console.log(`  Source: ${keys.evm.source}`);
console.log(`  Chains: Base, Ethereum, Arbitrum, Optimism, Polygon\n`);

console.log('Solana:');
console.log(`  Address: ${keys.sol.address}`);
console.log(`  Source: ${keys.sol.source}\n`);

console.log('Bitcoin: Pending (Spark integration)\n');

// Fetch all balances
console.log('📊 Fetching balances across all chains...\n');
const { balances, errors } = await wallet.getAllBalances();

// Group by token for unified view
const byToken = {};
let totalUSD = 0;

for (const b of balances) {
  const val = parseFloat(b.balance);
  if (val === 0) continue;
  
  if (!byToken[b.token]) byToken[b.token] = [];
  byToken[b.token].push({ chain: b.chain, balance: b.balance });
}

console.log('=== TREASURY BALANCES ===\n');

if (Object.keys(byToken).length === 0) {
  console.log('  All balances are zero. Fund your wallets:\n');
  console.log(`  EVM (any chain): ${keys.evm.address}`);
  console.log(`  Solana:          ${keys.sol.address}`);
  console.log(`  Bitcoin:         Coming soon (Spark)\n`);
} else {
  for (const [token, chains] of Object.entries(byToken)) {
    console.log(`  ${token}:`);
    for (const { chain, balance } of chains) {
      console.log(`    ${chain}: ${balance}`);
    }
    console.log();
  }
}

if (errors.length) {
  console.log('⚠️  Errors:');
  for (const e of errors) console.log(`  ${e}`);
  console.log();
}

// Policy status
const policyStatus = policy.getStatus();
console.log('=== POLICY ===\n');
console.log(`  Stack: ${policyStatus.stackAsset}`);
console.log(`  Auto-approve: < $${policyStatus.autoApproveBelow}`);
console.log(`  Ask human: >= $${policyStatus.askHumanAbove || policyStatus.autoApproveBelow}`);
console.log(`  Max single tx: $${policyStatus.maxSingleTransaction}`);
console.log(`  Daily limit: $${policyStatus.dailySpendLimit}`);
console.log(`  Spent today: $${policyStatus.dailySpent}`);
console.log(`  Remaining: $${policyStatus.dailyRemaining}`);
console.log(`  Pending approvals: ${policyStatus.pendingApprovals}`);

// Addresses summary
console.log('\n=== RECEIVE ADDRESSES ===\n');
const addrs = wallet.getAddresses();
console.log(`  EVM (all chains): ${addrs.evm}`);
console.log(`  Solana:           ${addrs.solana}`);
console.log(`  Bitcoin:          ${addrs.bitcoin || 'Pending'}`);

console.log('\n✅ Treasury initialized');
