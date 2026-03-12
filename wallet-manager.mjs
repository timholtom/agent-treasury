// Agent Treasury — Multi-chain Wallet Manager
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { base, mainnet, arbitrum, optimism, polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.env.HOME, '.config/agent-treasury');
const CONFIG_FILE = new URL('./config.json', import.meta.url).pathname;

// Chain configs
const CHAINS = { base, ethereum: mainnet, arbitrum, optimism, polygon };

// ERC20 ABI for balanceOf
const ERC20_ABI = [{
  inputs: [{ name: 'account', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function'
}];

export class WalletManager {
  constructor() {
    this.config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    this.evmAccount = null;
    this.solKeypair = null;
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // === KEY MANAGEMENT ===

  loadOrCreateEVM() {
    const keyFile = path.join(process.env.HOME, '.config/aixbt/wallet_key');
    // Reuse existing Base wallet
    if (fs.existsSync(keyFile)) {
      const key = fs.readFileSync(keyFile, 'utf8').trim();
      this.evmAccount = privateKeyToAccount(key);
      // Also save to treasury config dir
      fs.writeFileSync(path.join(CONFIG_DIR, 'evm_key'), key, { mode: 0o600 });
      return { address: this.evmAccount.address, source: 'existing' };
    }
    throw new Error('No EVM key found');
  }

  loadOrCreateSolana() {
    const keyFile = path.join(CONFIG_DIR, 'solana_key.json');
    if (fs.existsSync(keyFile)) {
      const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keyFile, 'utf8')));
      this.solKeypair = Keypair.fromSecretKey(secretKey);
      return { address: this.solKeypair.publicKey.toBase58(), source: 'existing' };
    }
    // Generate new
    this.solKeypair = Keypair.generate();
    fs.writeFileSync(keyFile, JSON.stringify(Array.from(this.solKeypair.secretKey)), { mode: 0o600 });
    return { address: this.solKeypair.publicKey.toBase58(), source: 'new' };
  }

  initAll() {
    const evm = this.loadOrCreateEVM();
    const sol = this.loadOrCreateSolana();
    return { evm, sol };
  }

  // === BALANCE QUERIES ===

  async getEVMNativeBalance(chainName) {
    const networkConfig = this.config.chains.evm.networks[chainName];
    if (!networkConfig) throw new Error(`Unknown chain: ${chainName}`);
    
    const chain = CHAINS[chainName];
    const client = createPublicClient({
      chain,
      transport: http(networkConfig.rpc)
    });

    const balance = await client.getBalance({ address: this.evmAccount.address });
    return {
      chain: chainName,
      token: chain.nativeCurrency.symbol,
      balance: formatEther(balance),
      raw: balance.toString()
    };
  }

  async getERC20Balance(chainName, tokenSymbol) {
    const networkConfig = this.config.chains.evm.networks[chainName];
    const tokenAddress = this.config.chains.evm.tokens[tokenSymbol]?.[chainName];
    if (!tokenAddress) return null;

    const chain = CHAINS[chainName];
    const client = createPublicClient({
      chain,
      transport: http(networkConfig.rpc)
    });

    try {
      const balance = await client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [this.evmAccount.address]
      });
      return {
        chain: chainName,
        token: tokenSymbol,
        balance: formatUnits(balance, 6), // USDC/USDT are 6 decimals
        raw: balance.toString()
      };
    } catch {
      return { chain: chainName, token: tokenSymbol, balance: '0', raw: '0' };
    }
  }

  async getSolanaBalance() {
    const connection = new Connection(this.config.chains.solana.rpc);
    const balance = await connection.getBalance(this.solKeypair.publicKey);
    return {
      chain: 'solana',
      token: 'SOL',
      balance: (balance / LAMPORTS_PER_SOL).toFixed(9),
      raw: balance.toString()
    };
  }

  async getAllBalances() {
    const balances = [];
    const errors = [];

    // EVM native balances
    for (const chainName of Object.keys(this.config.chains.evm.networks)) {
      try {
        balances.push(await this.getEVMNativeBalance(chainName));
      } catch (e) {
        errors.push(`${chainName} native: ${e.message}`);
      }
    }

    // ERC20 balances (USDC on all chains)
    for (const tokenSymbol of Object.keys(this.config.chains.evm.tokens)) {
      for (const chainName of Object.keys(this.config.chains.evm.tokens[tokenSymbol])) {
        try {
          const b = await this.getERC20Balance(chainName, tokenSymbol);
          if (b) balances.push(b);
        } catch (e) {
          errors.push(`${chainName} ${tokenSymbol}: ${e.message}`);
        }
      }
    }

    // Solana
    try {
      balances.push(await this.getSolanaBalance());
    } catch (e) {
      errors.push(`solana: ${e.message}`);
    }

    return { balances, errors };
  }

  // === TRANSACTION LOG ===

  logTransaction(tx) {
    const logFile = path.join(CONFIG_DIR, 'transactions.json');
    let txs = [];
    if (fs.existsSync(logFile)) txs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    txs.push({ ...tx, timestamp: new Date().toISOString() });
    fs.writeFileSync(logFile, JSON.stringify(txs, null, 2));
  }

  getTransactionLog() {
    const logFile = path.join(CONFIG_DIR, 'transactions.json');
    if (!fs.existsSync(logFile)) return [];
    return JSON.parse(fs.readFileSync(logFile, 'utf8'));
  }

  // === ADDRESSES ===

  getAddresses() {
    return {
      evm: this.evmAccount?.address || null,
      solana: this.solKeypair?.publicKey.toBase58() || null,
      bitcoin: null // Spark integration pending
    };
  }
}
