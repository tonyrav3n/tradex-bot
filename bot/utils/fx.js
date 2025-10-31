/**
 * USD ↔ ETH conversion utilities with multiple provider fallbacks and basic caching.
 *
 * Features:
 * - Fetch ETH-USD rate from multiple providers (Coinbase, CoinGecko, Binance, Kraken, CryptoCompare[opt])
 * - Median-of-providers selection to reduce outliers
 * - In-memory caching with TTL
 * - Simple conversion helpers: USD→ETH and ETH→USD
 * - Defensive parsing, timeouts, and structured errors
 *
 * Environment (optional):
 * - FX_RATE_TTL_MS: cache TTL in milliseconds (default: 60_000)
 * - FX_FETCH_TIMEOUT_MS: HTTP timeout per provider in ms (default: 3_500)
 * - CRYPTOCOMPARE_API_KEY: if set, tries CryptoCompare as an additional provider
 *
 * Notes:
 * - Returns string amounts formatted to a reasonable number of decimals (configurable).
 * - Rate is in USD per 1 ETH (e.g., 3123.45 means 1 ETH = 3123.45 USD).
 */

const TTL_MS = safeParseInt(process.env.FX_RATE_TTL_MS, 60_000);
const FETCH_TIMEOUT_MS = safeParseInt(process.env.FX_FETCH_TIMEOUT_MS, 3_500);

export const DEFAULT_ETH_DECIMALS = 6;
export const DEFAULT_USD_DECIMALS = 2;

let cache = {
  rate: null /** @type {number | null} */,
  source: null /** @type {string | null} */,
  at: 0 /** timestamp ms */,
};

/**
 * Convert a USD amount to ETH using the best-available rate.
 * @param {number|string} amountUsd
 * @param {{ decimals?: number, fresh?: boolean }} [options]
 * @returns {Promise<{ eth: string, rateUsdPerEth: number, source: string }>}
 */
export async function convertUsdToEth(amountUsd, options = {}) {
  const { decimals = DEFAULT_ETH_DECIMALS, fresh = false } = options;
  const usd = ensureNumber(amountUsd, "amountUsd");
  if (usd < 0) throw new Error("convertUsdToEth: amountUsd must be >= 0");

  const { rate, source } = await getEthUsdRate({ fresh });
  if (!isFinite(rate) || rate <= 0) {
    throw new Error("convertUsdToEth: invalid rate");
  }

  const eth = usd / rate;
  return {
    eth: formatDecimal(eth, decimals),
    rateUsdPerEth: rate,
    source,
  };
}

/**
 * Convert an ETH amount to USD using the best-available rate.
 * @param {number|string} amountEth
 * @param {{ decimals?: number, fresh?: boolean }} [options]
 * @returns {Promise<{ usd: string, rateUsdPerEth: number, source: string }>}
 */
export async function convertEthToUsd(amountEth, options = {}) {
  const { decimals = DEFAULT_USD_DECIMALS, fresh = false } = options;
  const eth = ensureNumber(amountEth, "amountEth");
  if (eth < 0) throw new Error("convertEthToUsd: amountEth must be >= 0");

  const { rate, source } = await getEthUsdRate({ fresh });
  if (!isFinite(rate) || rate <= 0) {
    throw new Error("convertEthToUsd: invalid rate");
  }

  const usd = eth * rate;
  return {
    usd: formatDecimal(usd, decimals),
    rateUsdPerEth: rate,
    source,
  };
}

/**
 * Get the ETH-USD rate (USD per ETH) with multi-provider fallback and caching.
 * @param {{ fresh?: boolean }} [options]
 * @returns {Promise<{ rate: number, source: string }>}
 */
export async function getEthUsdRate(options = {}) {
  const { fresh = false } = options;
  const now = Date.now();

  if (!fresh && cache.rate && now - cache.at < TTL_MS) {
    return { rate: cache.rate, source: cache.source || "cache" };
  }

  const results = await fetchAllRates();
  const ok = results.filter((r) => r.ok && isFinite(r.rate) && r.rate > 0);

  if (ok.length === 0) {
    const reasons = results
      .map((r) => `${r.source}: ${r.error || "unknown error"}`)
      .join("; ");
    throw new Error(`getEthUsdRate: all providers failed (${reasons})`);
  }

  // Choose median rate to reduce impact of outliers
  const medianRate = median(ok.map((r) => r.rate));
  // Find the provider whose rate is closest to the median
  const picked =
    ok.reduce(
      (best, r) => {
        const d = Math.abs(r.rate - medianRate);
        return d < best.delta ? { ...r, delta: d } : best;
      },
      {
        source: ok[0].source,
        rate: ok[0].rate,
        ok: true,
        delta: Math.abs(ok[0].rate - medianRate),
      },
    ) || ok[0];

  cache = { rate: picked.rate, source: picked.source, at: now };
  return { rate: picked.rate, source: picked.source };
}

/**
 * Fetch rates from multiple providers concurrently.
 * @returns {Promise<Array<{ source: string, ok: boolean, rate: number, error?: string }>>}
 */
async function fetchAllRates() {
  const providers = [
    fetchCoinbaseRate,
    fetchCoinGeckoRate,
    fetchBinanceRate,
    fetchKrakenRate,
  ];

  if (process.env.CRYPTOCOMPARE_API_KEY) {
    providers.push(fetchCryptoCompareRate);
  }

  const settled = await Promise.allSettled(providers.map((fn) => fn()));
  return settled.map((res, i) => {
    const name = providers[i].name;
    if (res.status === "fulfilled") {
      return {
        source: name,
        ok: true,
        rate: res.value,
      };
    }
    return {
      source: name,
      ok: false,
      rate: NaN,
      error:
        (res.reason && (res.reason.message || String(res.reason))) || "error",
    };
  });
}

/* ===========================
   Provider implementations
   =========================== */

/**
 * Coinbase: https://api.coinbase.com/v2/exchange-rates?currency=ETH
 * Response: { data: { currency: "ETH", rates: { USD: "xxxx.xx", ... } } }
 */
async function fetchCoinbaseRate() {
  const url = "https://api.coinbase.com/v2/exchange-rates?currency=ETH";
  const json = await safeFetchJson(url);
  const rateStr = json?.data?.rates?.USD;
  const rate = parseFloat(String(rateStr));
  if (!isFinite(rate) || rate <= 0)
    throw new Error("coinbase: invalid USD rate");
  return rate;
}

/**
 * CoinGecko: https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd
 * Response: { ethereum: { usd: 1234.56 } }
 */
async function fetchCoinGeckoRate() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
  const json = await safeFetchJson(url, {
    headers: {
      // Optional: 'x-cg-pro-api-key': process.env.COINGECKO_API_KEY || ''
    },
  });
  const rate = Number(json?.ethereum?.usd);
  if (!isFinite(rate) || rate <= 0) throw new Error("coingecko: invalid usd");
  return rate;
}

/**
 * Binance: https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT
 * Response: { symbol: "ETHUSDT", price: "1234.56000000" }
 * Note: Assumes USDT ~ USD 1:1. Good enough for indicative UX.
 */
async function fetchBinanceRate() {
  const url = "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT";
  const json = await safeFetchJson(url);
  const rate = parseFloat(String(json?.price));
  if (!isFinite(rate) || rate <= 0) throw new Error("binance: invalid price");
  return rate;
}

/**
 * Kraken: https://api.kraken.com/0/public/Ticker?pair=ETHUSD
 * Response: { result: { XX...: { c: ["last","vol"], a: ["ask",...], b: ["bid",...] } } }
 */
async function fetchKrakenRate() {
  const url = "https://api.kraken.com/0/public/Ticker?pair=ETHUSD";
  const json = await safeFetchJson(url);
  const result = json?.result || {};
  const firstKey = Object.keys(result)[0];
  const ticker = firstKey ? result[firstKey] : null;
  const last = ticker?.c?.[0] ?? null;
  const rate = parseFloat(String(last));
  if (!isFinite(rate) || rate <= 0)
    throw new Error("kraken: invalid last price");
  return rate;
}

/**
 * CryptoCompare (optional, requires API key):
 * https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD&api_key=...
 * Response: { USD: 1234.56 }
 */
async function fetchCryptoCompareRate() {
  const key = process.env.CRYPTOCOMPARE_API_KEY;
  if (!key) throw new Error("cryptocompare: missing api key");
  const url =
    "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD&api_key=" +
    encodeURIComponent(key);
  const json = await safeFetchJson(url);
  const rate = Number(json?.USD);
  if (!isFinite(rate) || rate <= 0)
    throw new Error("cryptocompare: invalid usd");
  return rate;
}

/* ===========================
   Helpers
   =========================== */

/**
 * Fetch JSON with timeout and basic error handling.
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [options]
 */
async function safeFetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await tryReadText(res);
      throw new Error(
        `HTTP ${res.status} ${res.statusText} (${text?.slice(0, 200) || "no body"})`,
      );
    }
    const json = await res.json();
    return json;
  } catch (e) {
    throw new Error(
      `${url}: ${(e && (e.message || String(e))) || "fetch error"}`,
    );
  } finally {
    clearTimeout(id);
  }
}

async function tryReadText(res) {
  try {
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Return the median of an array of numbers.
 * @param {number[]} arr
 */
function median(arr) {
  if (!arr || arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 0) {
    return (s[mid - 1] + s[mid]) / 2;
  }
  return s[mid];
}

/**
 * Ensure value is a finite number.
 * @param {number|string} v
 * @param {string} name
 */
function ensureNumber(v, name) {
  if (typeof v === "number") {
    if (!isFinite(v)) throw new Error(`${name} must be finite number`);
    return v;
  }
  if (typeof v === "string") {
    const cleaned = v
      .trim()
      .replace(/,/g, "")
      .replace(/[^\d.+-]/g, "");
    const n = parseFloat(cleaned);
    if (!isFinite(n)) throw new Error(`${name} is not a valid number`);
    return n;
  }
  throw new Error(`${name} must be a number or numeric string`);
}

/**
 * Format a decimal number to fixed places without scientific notation.
 * @param {number} n
 * @param {number} decimals
 * @returns {string}
 */
function formatDecimal(n, decimals) {
  if (!isFinite(n)) return "0";
  // clamp decimals
  const d = Math.max(0, Math.min(18, Math.floor(decimals)));
  // Use toFixed to get a normalized string, then trim trailing zeros
  const s = n.toFixed(d);
  if (d === 0) return s;
  // Trim trailing zeros but keep at least one decimal if necessary
  return s
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, ".0")
    .replace(/\.$/u, "");
}

/**
 * Safe parse int with fallback.
 * @param {any} v
 * @param {number} fallback
 */
function safeParseInt(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export default {
  getEthUsdRate,
  convertUsdToEth,
  convertEthToUsd,
  DEFAULT_ETH_DECIMALS,
  DEFAULT_USD_DECIMALS,
};
