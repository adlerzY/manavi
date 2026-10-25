export const UNITS_PER_COIN = 100;
export const BPS_DENOMINATOR = 10_000;
export const MICRO = 1_000_000;

export function coinsToUnits(coins: number): number {
  return coins * UNITS_PER_COIN;
}

export function percentToBps(percent: number | string): number {
  return Math.round(Number(percent) * 100);
}

export function mulBps(units: number, bps: number): number {
  return Math.floor((units * bps) / BPS_DENOMINATOR);
}

export function unitsToUsdtMicro(units: number, coinPriceUsdt: number): number {
  return Math.floor((units * Math.round(coinPriceUsdt * MICRO)) / UNITS_PER_COIN);
}

export function usdtToMicro(usdt: number): number {
  return Math.round(usdt * MICRO);
}

export function microToUsdt(micro: number | bigint): number {
  return Number(micro) / MICRO;
}