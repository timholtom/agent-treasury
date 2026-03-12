// Agent Treasury — Policy Engine
// Human oversight layer for autonomous agent spending
import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.env.HOME, '.config/agent-treasury');

export class PolicyEngine {
  constructor(config) {
    this.policy = config.policy;
    this.pendingApprovals = new Map();
    this.dailySpend = 0;
    this.dailySpendDate = new Date().toDateString();
  }

  // Check if a transaction is allowed
  evaluate(tx) {
    const amount = parseFloat(tx.amountUSD || 0);

    // Reset daily counter if new day
    if (new Date().toDateString() !== this.dailySpendDate) {
      this.dailySpend = 0;
      this.dailySpendDate = new Date().toDateString();
    }

    // Hard limit
    if (amount > this.policy.maxSingleTransaction) {
      return {
        decision: 'DENY',
        reason: `Exceeds max single transaction ($${this.policy.maxSingleTransaction})`
      };
    }

    // Daily limit
    if (this.dailySpend + amount > this.policy.dailySpendLimit) {
      return {
        decision: 'DENY',
        reason: `Would exceed daily spend limit ($${this.policy.dailySpendLimit})`
      };
    }

    // Auto-approve small amounts
    if (amount <= this.policy.autoApproveBelow) {
      this.dailySpend += amount;
      return {
        decision: 'APPROVE',
        reason: `Auto-approved (below $${this.policy.autoApproveBelow} threshold)`
      };
    }

    // Needs human approval
    const approvalId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.pendingApprovals.set(approvalId, {
      tx,
      amount,
      requestedAt: new Date().toISOString(),
      status: 'PENDING'
    });

    return {
      decision: 'ASK_HUMAN',
      approvalId,
      reason: `Amount $${amount} exceeds auto-approve threshold ($${this.policy.autoApproveBelow})`
    };
  }

  // Human approves
  approve(approvalId) {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return { error: 'Approval not found' };
    
    pending.status = 'APPROVED';
    this.dailySpend += pending.amount;
    this.pendingApprovals.delete(approvalId);
    
    this.logDecision(approvalId, 'APPROVED', pending);
    return { status: 'APPROVED', tx: pending.tx };
  }

  // Human rejects
  reject(approvalId, reason) {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return { error: 'Approval not found' };
    
    pending.status = 'REJECTED';
    this.pendingApprovals.delete(approvalId);
    
    this.logDecision(approvalId, 'REJECTED', pending, reason);
    return { status: 'REJECTED' };
  }

  // Get all pending approvals
  getPending() {
    return Array.from(this.pendingApprovals.entries()).map(([id, data]) => ({
      approvalId: id,
      ...data
    }));
  }

  // Log decisions for audit
  logDecision(approvalId, decision, data, reason) {
    const logFile = path.join(CONFIG_DIR, 'policy-log.json');
    let logs = [];
    if (fs.existsSync(logFile)) logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    logs.push({
      approvalId,
      decision,
      amount: data.amount,
      tx: data.tx,
      reason,
      decidedAt: new Date().toISOString()
    });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  }

  // Summary
  getStatus() {
    return {
      stackAsset: this.policy.stackAsset,
      autoApproveBelow: this.policy.autoApproveBelow,
      maxSingleTransaction: this.policy.maxSingleTransaction,
      dailySpendLimit: this.policy.dailySpendLimit,
      dailySpent: this.dailySpend,
      dailyRemaining: this.policy.dailySpendLimit - this.dailySpend,
      pendingApprovals: this.pendingApprovals.size
    };
  }
}
