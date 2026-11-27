// radar-2: the token radar's value model.
//
// The board ranks protocols that record no token, by an implied value computed
// only from the snapshot's own figures. Nothing here names a protocol: the same
// function scores every row, and every number it uses is read from the snapshot
// at run time.
//
//   implied = TVL x categoryMultiple x growthMult x maturityMult x chainMult
//
// categoryMultiple is the market's own price for this kind of protocol: the
// live-token protocols (a token that already trades, so the market has priced
// it) in the SAME category, in this snapshot. It is a shrinkage estimate, not
// a hard cutoff: a category with n live comparables is priced at
//
//   (n / 5) x (median mcap/TVL of its own comparables)
//     + (1 - n / 5) x (overall live-token median),
//
// with n capped at 5, so a category with 5 or more comparables is priced by
// its own median alone, a category with 1 to 4 comparables keeps a real share
// of its own price instead of being thrown away, and a category with none is
// priced at the market average, never at a guess. The multiple is clamped to
// [0.05, 0.60] so one frothy category cannot dominate the board. In this
// snapshot that matters: 26 of the board's 34 categories hold 1 to 4 live
// comparables, and the old radar-2 rule (5 or none) priced all of them —
// including the whole top of the board — at one flat number.
//
//   growthMult   = 1 + clamp(change_7d, -60, 120) / 100 x 0.5   (no 7d figure: 0)
//   maturityMult = 0.6 + min(age_days, 1095) / 1095 x 0.4       (age unknown: 365 days)
//   chainMult    = 1 + 0.10 x (1 - 1 / chains.length)            (1 chain: 1.00, many: ->1.10)
//
// Age is days from listed_at to the snapshot's as_of date, so a run is
// deterministic: no clock is read. Implied value is max(1, round(...)).
//
// The board is every protocol passing the house's own pre-token rule, which
// mirrors the watchlist rule: it records no token (mcap, gecko id and symbol
// all null), its category is not Bridge, Canonical Bridge, Liquid Staking,
// Liquid Restaking, Restaked BTC or CEX, its name ends in no version marker,
// carries no whole word wrapped / staked / staking, and begins with no
// exchange name. That covers the whole 40-protocol watchlist and every other
// pre-token protocol the snapshot holds, above and below the $50M floor.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The radar-2 constants, stated in the dashboard and in the model below. */
export interface ModelConstants {
  min_live_comps: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_bonus: number;
}

export const MODEL: ModelConstants = {
  min_live_comps: 5,
  multiple_floor: 0.05,
  multiple_cap: 0.6,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_bonus: 0.1,
};

/** The model's version label, shown on the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  value_tvl_ratio: number;
  model: {
    category_multiple: number;
    category_comps: number;
    category_weight: number;
    overall_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row's compact form for data.js (farm plan included, page-side). */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  value_tvl_ratio: number;
  category_multiple: number;
  category_comps: number;
  category_weight: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
  farm_econ: FarmEcon;
}

/** A live-token protocol: the market's own value, never a model number. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One perturbation of the snapshot's figures, and how much of the board's top it kept. */
export interface StabilityRow {
  tvl_factor: number;
  growth_shift_pp: number;
  top20_overlap: number;
  top10_overlap: number;
  rank_spearman: number;
  top1_same: boolean;
}

/** The board's own checks: every row's arithmetic recomputed, and the board's order under perturbed figures. */
export interface BoardChecks {
  recompute_exact: number;
  recompute_total: number;
  perturbations: StabilityRow[];
  worst_top20_overlap: number;
  worst_rank_spearman: number;
}

/** How every protocol in the snapshot is accounted for: the ranked board, the
 * pre-token protocols the ranking rules set aside (by the first rule each
 * fails), and the protocols that already carry a token in the record. The
 * three groups sum to the snapshot's protocol count, so a reader can check
 * that no protocol in the snapshot is missing from the board's story. */
export interface SnapshotCounts {
  total: number;
  pre_token: number;
  ranked: number;
  excluded_category: number;
  excluded_versioned: number;
  excluded_wrapped: number;
  excluded_exchange: number;
  with_token: number;
  live_shown: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  overall_multiple: number;
  live_comps: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  snapshot_counts: SnapshotCounts;
  checks: BoardChecks;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** The median of a sorted-by-value list; 0 when it is empty. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The live-token comparables: for every category, the median market-cap / TVL
 * of the protocols in it whose token already trades (mcap not null, not a CEX),
 * plus the overall live median. Each category is priced by a shrinkage
 * estimate: its own median gets weight n / min_live_comps (1 at 5 or more
 * comparables), the rest of the weight goes to the overall median, so a
 * category with 1 to 4 comparables keeps a real share of its own price and a
 * category with none falls back to the overall median. All of it is computed
 * from this snapshot, at run time.
 */
export interface Comparables {
  byCategory: Map<string, { multiple: number; comps: number; weight: number }>;
  overall: number;
  liveCount: number;
}

export function comparables(snapshot: Snapshot, model: ModelConstants): Comparables {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.category === 'CEX' || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio)) continue;
    all.push(ratio);
    const list = byCategory.get(p.category ?? '');
    if (list) list.push(ratio);
    else byCategory.set(p.category ?? '', [ratio]);
  }
  const overall = clamp(median(all), model.multiple_floor, model.multiple_cap);
  const priced = new Map<string, { multiple: number; comps: number; weight: number }>();
  for (const [category, ratios] of byCategory) {
    const n = ratios.length;
    const weight = Math.min(1, n / model.min_live_comps);
    const own = clamp(median(ratios), model.multiple_floor, model.multiple_cap);
    const multiple = clamp(weight * own + (1 - weight) * overall, model.multiple_floor, model.multiple_cap);
    priced.set(category, { multiple, comps: n, weight: Math.round(weight * 1e4) / 1e4 });
  }
  return { byCategory: priced, overall, liveCount: all.length };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The four multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comps: Comparables,
): {
  implied: number;
  categoryMultiple: number;
  categoryComps: number;
  categoryWeight: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const priced = protocol.category === null ? undefined : comps.byCategory.get(protocol.category);
  const categoryMultiple = priced ? priced.multiple : comps.overall;
  const categoryComps = priced ? priced.comps : 0;
  const categoryWeight = priced ? priced.weight : 0;
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainCount = Math.max(1, protocol.chains.length);
  const chainMult = 1 + model.chain_bonus * (1 - 1 / chainCount);
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * chainMult),
  );
  return { implied, categoryMultiple, categoryComps, categoryWeight, growthPct, growthMult, maturityMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a bridged, staked or exchange product, never a launch of their own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a protocol name must not begin with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: the house's pre-token rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return false;
  return true;
}

/**
 * Every protocol in the snapshot, accounted for: the ranked board, the
 * pre-token protocols the ranking rules set aside, and the protocols that
 * already carry a token. The set-aside counts follow the same rule order as
 * isRankable, so each protocol is counted by the first rule it fails and the
 * groups sum exactly to the snapshot's protocol count.
 */
export function snapshotCounts(snapshot: Snapshot, liveShown: number): SnapshotCounts {
  const counts: SnapshotCounts = {
    total: snapshot.protocols.length,
    pre_token: 0,
    ranked: 0,
    excluded_category: 0,
    excluded_versioned: 0,
    excluded_wrapped: 0,
    excluded_exchange: 0,
    with_token: 0,
    live_shown: liveShown,
  };
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) {
      counts.with_token++;
      continue;
    }
    counts.pre_token++;
    if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) counts.excluded_category++;
    else if (VERSIONED.test(p.name)) counts.excluded_versioned++;
    else if (WRAPPED_WORD.test(p.name)) counts.excluded_wrapped++;
    else if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) counts.excluded_exchange++;
    else counts.ranked++;
  }
  return counts;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = comparables(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, comps);
    return { p, v };
  });
  scored.sort(
    (a, b) =>
      b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    value_tvl_ratio: round4(s.v.implied / Math.max(1, s.p.tvl_usd)),
    model: {
      // Full precision here, not rounded: the dashboard recomputes the implied
      // value from these multipliers and must land on the same number.
      category_multiple: s.v.categoryMultiple,
      category_comps: s.v.categoryComps,
      category_weight: s.v.categoryWeight,
      overall_multiple: round4(comps.overall),
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: s.v.growthMult,
      maturity_multiplier: s.v.maturityMult,
      chain_multiplier: s.v.chainMult,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The farm plan's own cost and time constants: the six step strings and the
 * economics rollup below are both built from these, so they cannot drift
 * apart. Gas is the plan's own figures — under $3 for the first transaction,
 * about $8 ($4 on a small deposit) to set the position up, about $2 a week
 * to keep it warm — and the minutes are the steps' own times added up.
 */
const GAS_FIRST_USD = 3;
const GAS_SETUP_HIGH_USD = 8;
const GAS_SETUP_LOW_USD = 4;
const GAS_WEEKLY_USD = 2;
const WALLET_MIN = 5;
const SETUP_MIN = 15;
const WEEKLY_MIN = 10;
const CLAIM_MIN = 10;
const LOG_MIN = 5;
/** Verdict thresholds: total gas over the hold, as a share of the deposit. */
const VERDICT_FARM_MAX = 0.2;
const VERDICT_THIN_MAX = 0.4;

/**
 * A row's farm economics, from the same figures the six steps are built on:
 * the deposit the plan sizes, the gas the plan's own steps add up to over the
 * hold, the minutes it takes, and the verdict those costs give. The verdict
 * is cost-only — gas over the hold as a share of the deposit — because the
 * snapshot carries no airdrop size to net against; the rule is stated on the
 * dashboard wherever the verdict is shown, so a reader can check it.
 */
export interface FarmEcon {
  capital_usd: number;
  gas_first_usd: number;
  gas_setup_usd: number;
  gas_weekly_usd: number;
  hold_weeks: number;
  gas_total_usd: number;
  setup_min: number;
  weekly_min: number;
  hold_days: number;
  gas_share: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

export function farmEconFor(tvlUsd: number, age: number | null): FarmEcon {
  const capital = capitalFor(tvlUsd);
  const hold = holdDaysFor(age);
  const gasSetup = capital >= 150 ? GAS_SETUP_HIGH_USD : GAS_SETUP_LOW_USD;
  const holdWeeks = Math.ceil(hold / 7);
  const gasTotal = GAS_FIRST_USD + gasSetup + GAS_WEEKLY_USD * holdWeeks;
  const gasShare = round4(gasTotal / capital);
  const verdict = gasShare <= VERDICT_FARM_MAX ? 'FARM' : gasShare <= VERDICT_THIN_MAX ? 'THIN' : 'SKIP';
  return {
    capital_usd: capital,
    gas_first_usd: GAS_FIRST_USD,
    gas_setup_usd: gasSetup,
    gas_weekly_usd: GAS_WEEKLY_USD,
    hold_weeks: holdWeeks,
    gas_total_usd: gasTotal,
    setup_min: WALLET_MIN + SETUP_MIN + CLAIM_MIN + LOG_MIN,
    weekly_min: WEEKLY_MIN,
    hold_days: hold,
    gas_share: gasShare,
    verdict,
  };
}

/** The category's one action, in words a farmer can follow. No name is special-cased. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('basis')) return `Open a $${capital} basis position through ${name} on ${chain} and hold it through one funding cycle.`;
  if (c.includes('chain')) return `Use ${name} on ${chain}: move $${capital} of USDC onto it and use one of its apps.`;
  if (c.includes('payment')) return `Route a $${capital} payment through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('governance')) return `Stake $${capital} of the governance asset through ${name} and vote on one proposal.`;
  if (c.includes('cedefi')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The gas token a chain settles fees in, for the chains this snapshot names most; anything else settles in its own gas token. */
function gasTokenFor(chain: string): string {
  const c = chain.toLowerCase();
  if (['ethereum', 'base', 'arbitrum', 'optimism', 'unichain', 'ink', 'tempo', 'blast', 'mode', 'linea', 'scroll', 'zksync era', 'polygon zkevm'].includes(c)) return 'ETH';
  if (c === 'binance' || c === 'bnb chain') return 'BNB';
  if (c === 'solana') return 'SOL';
  if (c === 'polygon') return 'POL';
  if (c === 'avalanche') return 'AVAX';
  if (c === 'tron') return 'TRX';
  if (c === 'sui') return 'SUI';
  if (c === 'aptos') return 'APT';
  if (c === 'near') return 'NEAR';
  if (c === 'cosmos') return 'ATOM';
  if (c === 'fantom') return 'FTM';
  if (c === 'gnosis') return 'xDAI';
  if (c === 'celo') return 'CELO';
  return 'the chain\u2019s gas token';
}

/** What kind of protocol this is, from its category alone — no name is special-cased. */
function categoryKind(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized')) return 'lending';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'perps';
  if (c.includes('curator') || c.includes('allocator')) return 'curator';
  if (c.includes('rwa') || c.includes('real world')) return 'rwa';
  if (c.includes('staking') || c.includes('restak')) return 'staking';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('stable') || c.includes('wrapper')) return 'stable';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('basis')) return 'basis';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm') || c.includes('liquidity')) return 'dex';
  if (c.includes('chain')) return 'chain';
  if (c.includes('payment') || c.includes('card')) return 'payment';
  if (c.includes('governance')) return 'governance';
  if (c.includes('cedefi')) return 'cedefi';
  return 'other';
}

/** The weekly qualifying action, by what kind of protocol this is. */
function weeklyActionFor(p: SnapshotProtocol, capital: number): string {
  const name = p.name;
  switch (categoryKind(p)) {
    case 'lending': return `Repay a small part of the borrow and top the supply back up, so the position moves every week.`;
    case 'dex': return `Collect the fees the position earned and add them back to the same pool, keeping the range active.`;
    case 'perps': return `Roll the hedge before funding settles, so the margin account shows fresh activity.`;
    case 'curator': return `Check the vault's allocation and move a small share into its newest vault when one opens.`;
    case 'rwa': return `Check the yield that accrued and mint a little more of the yield asset with it.`;
    case 'staking': return `Restake the staking rewards as they land, so the staked balance grows every week.`;
    case 'prediction': return `Settle one market position and open the next one on ${name}.`;
    case 'stable': return `Mint a small amount of the stable asset and hold it through the week.`;
    case 'bridge': return `Bridge a small amount back and forth through ${name} so the route stays warm.`;
    case 'insurance': return `Check the cover's expiry and top it up before it lapses.`;
    case 'basis': return `Check the funding rate and rebalance the basis position after one funding cycle.`;
    case 'chain': return `Use one of ${name}'s apps each week — a swap, a deposit or a vote.`;
    case 'payment': return `Route one small payment through ${name} each week and keep the receipt.`;
    case 'governance': return `Vote on one live proposal each week through ${name}.`;
    case 'cedefi': return `Check the position's yield and compound a small share of it back in.`;
    default: return `Repeat the qualifying action on ${name} once a week — a deposit, a swap or a vote.`;
  }
}

/** Where to claim, by what kind of protocol this is. */
function claimStepFor(p: SnapshotProtocol): string {
  const name = p.name;
  switch (categoryKind(p)) {
    case 'curator': return `Open ${name}'s own vault page and claim only from the link it publishes.`;
    case 'perps': return `Close the hedge first, then open ${name}'s own rewards page and claim only from the link it publishes.`;
    case 'staking': return `Open ${name}'s own staking page and claim only from the link it publishes.`;
    case 'prediction': return `Settle the open markets on ${name}'s own page and claim only from the link it publishes.`;
    case 'bridge': return `Check the bridged funds arrived, then open ${name}'s own page and claim only from the link it publishes.`;
    default: return `Open ${name}'s own points or rewards page and claim only from the link it publishes.`;
  }
}

/** The position to log, by what kind of protocol this is. */
function logNounFor(p: SnapshotProtocol): string {
  switch (categoryKind(p)) {
    case 'lending': return 'the supply and borrow balances';
    case 'dex': return 'the pool, the range and the fees collected';
    case 'perps': return 'the margin, the hedge and the funding paid';
    case 'curator': return 'the vault shares and the allocation';
    case 'rwa': return 'the yield asset balance and the accrual';
    case 'staking': return 'the staked balance and the rewards restaked';
    case 'prediction': return 'the markets settled and opened';
    case 'stable': return 'the stable asset balance';
    case 'bridge': return 'the bridged amounts and the arrival receipts';
    case 'insurance': return 'the cover amount and its expiry';
    case 'basis': return 'the basis position and the funding cycles';
    default: return 'the position size and every transaction';
  }
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Every step is derived from the protocol's own record — its category, its
 * chains, its TVL and its age — so no two protocols' plans read alike: the
 * wallet step names the chain and its gas token, the weekly step is the
 * category's own recurring action, the hold step names the protocol's age and
 * size, the claim step names where this kind of protocol pays out, and the
 * log step names what this kind of position has to track.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasTokenFor(chain);
  const econ = farmEconFor(p.tvl_usd, age);
  const capital = econ.capital_usd;
  const hold = econ.hold_days;
  const action = actionFor(p, capital, chain);
  const ageText = age === null ? 'an unknown age' : age < 365 ? `${age} days` : `${(age / 365).toFixed(1)} years`;
  const tvlText = p.tvl_usd >= 1e9 ? `$${(p.tvl_usd / 1e9).toFixed(2)}B` : `$${Math.round(p.tvl_usd / 1e6)}M`;
  const claim = claimStepFor(p);
  const claimLower = claim.charAt(0).toLowerCase() + claim.slice(1);
  return [
    {
      text: `Use a fresh wallet on ${chain} that holds only the funds you plan to farm, and keep a little ${gas} aside for gas. Keep its seed phrase offline.`,
      cost: `under $${econ.gas_first_usd} of gas for the first transaction`,
      time: `${WALLET_MIN} minutes`,
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${econ.gas_setup_usd} of gas`,
      time: `${SETUP_MIN} minutes to set up`,
    },
    {
      text: weeklyActionFor(p, capital),
      cost: `about $${econ.gas_weekly_usd} of gas a week`,
      time: `${WEEKLY_MIN} minutes a week`,
    },
    {
      text: `Hold the position for at least ${hold} days — ${p.name} has run ${ageText} with no token, so a position held across ${hold} days is counted in more than one snapshot. At ${tvlText} TVL, $${capital} is small enough to exit without moving the pool.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, ${claimLower}`,
      cost: 'no fee to check, and never pay to claim',
      time: `${CLAIM_MIN} minutes`,
    },
    {
      text: `Write the wallet, the dates, ${logNounFor(p)} and every transaction hash in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: `${LOG_MIN} minutes`,
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    value_tvl_ratio: row.value_tvl_ratio,
    category_multiple: row.model.category_multiple,
    category_comps: row.model.category_comps,
    category_weight: row.model.category_weight,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_steps: row.farm_steps,
    farm_econ: farmEconFor(row.tvl_usd, row.age_days),
  };
}

/** The Spearman rank correlation of two same-length number lists. */
function spearman(xs: number[], ys: number[]): number {
  const rankOf = (values: number[]): number[] => {
    const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const ranks = new Array<number>(values.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k]![1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rankOf(xs);
  const ry = rankOf(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

/**
 * The board's own checks, computed from the snapshot's figures at build time.
 * First, every row's implied value recomputed from the multipliers the row
 * stores — the same arithmetic the dashboard page runs live. Second, the
 * board rebuilt four times with every protocol's TVL moved 10% up or down and
 * its 7-day change moved 5 points either way, to show the board's order is
 * not an artifact of small moves in any one figure: how many of the top 20
 * (and top 10) survive each perturbation, how the full ranking correlates,
 * and whether the top row stays the top row. A robustness check, not an
 * accuracy claim: the snapshot is one frozen point in time, so no backtest
 * against later market caps can be run from it, and none is claimed here.
 */
export function boardChecks(snapshot: Snapshot, board: BoardRow[]): BoardChecks {
  let exact = 0;
  for (const r of board) {
    const m = r.model;
    const recomputed = Math.max(
      1,
      Math.round(r.tvl_usd * m.category_multiple * m.growth_multiplier * m.maturity_multiplier * m.chain_multiplier),
    );
    if (recomputed === r.implied_value_usd) exact++;
  }
  const base = board.map((r) => r.slug);
  const combos: Array<[number, number]> = [
    [1.1, 5],
    [0.9, -5],
    [1.1, -5],
    [0.9, 5],
  ];
  const perturbations: StabilityRow[] = combos.map(([tvlFactor, growthShift]) => {
    const perturbed: Snapshot = {
      ...snapshot,
      protocols: snapshot.protocols.map((p) => ({
        ...p,
        tvl_usd: Math.round(p.tvl_usd * tvlFactor),
        change_7d: p.change_7d === null ? null : p.change_7d + growthShift,
      })),
    };
    const rebuilt = buildBoard(perturbed).map((r) => r.slug);
    const top20 = new Set(rebuilt.slice(0, 20));
    const top10 = new Set(rebuilt.slice(0, 10));
    const position = new Map(rebuilt.map((slug, i) => [slug, i + 1] as const));
    const sp = spearman(
      base.map((_slug, i) => i + 1),
      base.map((slug) => position.get(slug) ?? 0),
    );
    return {
      tvl_factor: tvlFactor,
      growth_shift_pp: growthShift,
      top20_overlap: base.slice(0, 20).filter((slug) => top20.has(slug)).length,
      top10_overlap: base.slice(0, 10).filter((slug) => top10.has(slug)).length,
      rank_spearman: Math.round(sp * 1e4) / 1e4,
      top1_same: rebuilt[0] === base[0],
    };
  });
  return {
    recompute_exact: exact,
    recompute_total: board.length,
    perturbations,
    worst_top20_overlap: Math.min(...perturbations.map((p) => p.top20_overlap)),
    worst_rank_spearman: Math.min(...perturbations.map((p) => p.rank_spearman)),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const comps = comparables(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    overall_multiple: round4(comps.overall),
    live_comps: comps.liveCount,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    snapshot_counts: snapshotCounts(snapshot, live.length),
    checks: boardChecks(snapshot, board),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
