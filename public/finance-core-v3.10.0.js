// Shared by the app and Worker. All accounting is in integer fils.
export function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER / 100) return 0;
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100);
}
export const money = value => cents(value) / 100;
export function transactionTotals(state) {
  return (state.transactions || []).reduce((sum, tx) => ({
    cash: sum.cash + cents(tx.amount), savings: sum.savings + cents(tx.savingsDelta)
  }), {cash: 0, savings: 0});
}
export function ensureLedger(state) {
  if (state.cashLedger?.version === 1 && Number.isSafeInteger(state.cashLedger.baseCents) && Number.isSafeInteger(state.cashLedger.savingsBaseCents)) return false;
  const totals = transactionTotals(state);
  // Legacy balance is preserved, including earlier explicit bank reconciliations.
  // Historical balanceAfter fields are receipts, never calculation anchors.
  state.cashLedger = {version: 1, baseCents: cents(state.walletBalance) - totals.cash,
    savingsBaseCents: cents(state.savingsBalance) - totals.savings, migratedAt: new Date().toISOString()};
  return true;
}
export function balances(state) {
  const totals = transactionTotals(state);
  return {cash: (state.cashLedger.baseCents + totals.cash) / 100,
    savings: (state.cashLedger.savingsBaseCents + totals.savings) / 100};
}
export function audit(state) {
  ensureLedger(state);
  const expected = balances(state);
  return {...expected, difference: (cents(expected.cash) - cents(state.walletBalance)) / 100,
    savingsDifference: (cents(expected.savings) - cents(state.savingsBalance)) / 100};
}
export function paydayPreview(state, choice, month, paydayKey) {
  const before = cents(state.walletBalance), salary = Math.max(0, cents(state.salary));
  const moved = choice === 'savings' ? Math.max(0, before) : 0;
  const charged = new Set((state.transactions || []).filter(tx => tx.type === 'commitment' && tx.paydayKey === paydayKey).map(tx => String(tx.refId)));
  const commitments = (state.commitments || []).filter(item => !charged.has(String(item.id)) &&
    String(item.startDate || '').slice(0, 7) <= month && String(item.endDate || '').slice(0, 7) >= month && cents(item.amount) > 0);
  const total = commitments.reduce((sum, item) => sum + cents(item.amount), 0);
  return {before: before / 100, salary: salary / 100, moved: moved / 100,
    commitments: total / 100, after: (before - moved + salary - total) / 100};
}

const copy = value => value === undefined ? undefined : structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const identity = v => String(v?.operationKey || v?.id || '');
const derived = new Set(['walletBalance', 'savingsBalance', 'balanceIntegrity']);
// Three-way merging preserves independent edits. Conflicting edits are explicit.
export function mergeStates(base, local, remote, strategy = 'remote') {
  const conflicts = [];
  function merge(b, l, r, path) {
    if (same(l, r)) return copy(l);
    if (same(l, b)) return copy(r);
    if (same(r, b)) return copy(l);
    if (Array.isArray(l) && Array.isArray(r) && (b === undefined || Array.isArray(b))) {
      const all = [...(b || []), ...l, ...r];
      if (all.every(v => isObject(v) && identity(v))) {
        const bm = new Map((b || []).map(v => [identity(v), v]));
        const lm = new Map(l.map(v => [identity(v), v]));
        const rm = new Map(r.map(v => [identity(v), v]));
        const keys = new Set([...rm.keys(), ...lm.keys(), ...bm.keys()]);
        return [...keys].map(key => merge(bm.get(key), lm.get(key), rm.get(key), path + '[' + key + ']')).filter(v => v !== undefined);
      }
      if (all.every(v => typeof v === 'string')) {
        const bs = new Set(b || []), ls = new Set(l), rs = new Set(r);
        return [...new Set([...r, ...l])].filter(v => !bs.has(v) || (ls.has(v) && rs.has(v)));
      }
    }
    if (isObject(l) && isObject(r) && (b === undefined || isObject(b))) {
      const out = {};
      for (const key of new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)])) {
        if (!path && derived.has(key)) continue;
        // Concurrent identical logical operations may have different client ids/times.
        if (b === undefined && ['id', 'createdAt', 'processedAt', 'updatedAt', 'migratedAt'].includes(key)) {out[key] = copy(r[key] ?? l[key]); continue;}
        const value = merge(b?.[key], l[key], r[key], path ? path + '.' + key : key);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    conflicts.push({path, local: copy(l), remote: copy(r)});
    return copy(strategy === 'local' ? l : r);
  }
  const state = merge(base || {}, local, remote, '');
  // A new payday is one atomic decision. Conflicting carry choices must not
  // leave a savings transfer from one device combined with the other's choice.
  for (const key of Object.keys(local.processedPaydays || {})) {
    const l = local.processedPaydays[key], r = remote.processedPaydays?.[key];
    if (!r || base?.processedPaydays?.[key]) continue;
    const signature = v => JSON.stringify([v.choice, cents(v.salary), cents(v.movedToSavings), cents(v.commitmentsTotal), cents(v.balanceBeforePayday)]);
    if (signature(l) === signature(r)) continue;
    conflicts.push({path:'processedPaydays.' + key, local:copy(l), remote:copy(r)});
    const chosen = strategy === 'local' ? local : remote;
    const isPayroll = tx => tx.paydayKey === key && ['salary','commitment','savings_transfer'].includes(tx.type);
    state.transactions = (state.transactions || []).filter(tx => !isPayroll(tx)).concat(copy((chosen.transactions || []).filter(isPayroll)));
    state.processedPaydays[key] = copy(chosen.processedPaydays[key]);
  }
  ensureLedger(state);
  const expected = balances(state);
  state.walletBalance = expected.cash;
  state.savingsBalance = expected.savings;
  return {state, conflicts};
}

export function dailyBalances(state, month, lastDay) {
  const totals = Array.from({length: lastDay}, () => ({incoming: 0, outgoing: 0}));
  for (const tx of state.transactions || []) {
    if (String(tx.month || String(tx.date || '').slice(0, 7)) !== month || tx.hiddenFromStatement) continue;
    const day = Number(String(tx.date || '').slice(8, 10));
    if (day < 1 || day > lastDay) continue;
    const amount = cents(tx.amount);
    if (amount >= 0) totals[day - 1].incoming += amount;
    else totals[day - 1].outgoing -= amount;
  }
  let running = cents(state.monthOpeningBalances?.[month] ?? state.walletMonthOpeningBalance);
  return totals.map((row, i) => {
    running += row.incoming - row.outgoing;
    return {day: i + 1, incoming: row.incoming / 100, outgoing: row.outgoing / 100, balance: running / 100};
  });
}
