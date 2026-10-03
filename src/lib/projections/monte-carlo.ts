import {
  runDetailedProjection,
  type DetailedProjectionParams,
} from "@/lib/utils/projection-scenarios";
import { getGlidePathParams } from "@/lib/utils/glide-path";

/**
 * The odds that savings last, from the tested projection engine.
 *
 * Each simulation is runDetailedProjection itself, given a different market:
 * one random return per year around the scenario's (or the glide path's)
 * expected return and volatility. Taxes, required distributions, claiming
 * ages, contribution limits and inflation from today are therefore the
 * engine's own, not a second, simplified model of them. Until October 2026
 * the Projections page, its scenarios and the AI assistant each ran a
 * simulation of their own, and they disagreed with the engine and with each
 * other.
 *
 * The random numbers come from a fixed seed. The same inputs give the same
 * odds on the server and in the browser, on every visit and in every check,
 * and two scenarios are compared against the same markets rather than
 * different luck.
 */

export type MonteCarloSummary = {
  simulations: number;
  /** Percentage of simulations in which savings last the whole horizon. */
  successRate: number;
  /** Per projected year: the 10th, 25th, 50th, 75th and 90th percentile balance. */
  chartData: { age: number; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  medianAtRetirement: number;
  /** 10th percentile balance at retirement. */
  worstCase: number;
  /** 90th percentile balance at retirement. */
  bestCase: number;
};

export const DEFAULT_SEED = 20261002;

/** A small, fast, seedable generator (mulberry32). Deterministic for a given seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runProjectionMonteCarlo(
  params: DetailedProjectionParams,
  opts: { volatilityPct: number; simulations?: number; seed?: number }
): MonteCarloSummary {
  const simulations = opts.simulations ?? 500;
  const random = seededRandom(opts.seed ?? DEFAULT_SEED);
  const totalYears = params.yearsToRetirement + params.yearsInRetirement;

  // Expected return and volatility for each year, by age when a glide path is on.
  const mean: number[] = [];
  const sd: number[] = [];
  for (let y = 0; y < totalYears; y++) {
    const age = params.startAge + y + 1;
    if (params.glidePath?.enabled) {
      const gp = getGlidePathParams(age, params.glidePath);
      mean.push(gp.returnPct / 100);
      sd.push(gp.volatility / 100);
    } else {
      mean.push(params.returnPct / 100);
      sd.push(opts.volatilityPct / 100);
    }
  }

  // Box-Muller; 1 - random() keeps the logarithm away from zero.
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());

  const paths: number[][] = [];
  let successes = 0;
  for (let sim = 0; sim < simulations; sim++) {
    const annualReturns = mean.map((m, y) => m + sd[y] * normal());
    const { totalValues } = runDetailedProjection({ ...params, annualReturns });
    paths.push(totalValues);
    if (totalValues.length === 0 || totalValues[totalValues.length - 1] > 0) successes++;
  }

  const at = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const chartData: MonteCarloSummary["chartData"] = [];
  for (let y = 0; y < totalYears; y++) {
    const values = paths.map((p) => p[y]).sort((a, b) => a - b);
    chartData.push({
      age: params.startAge + y + 1,
      p10: at(values, 0.1),
      p25: at(values, 0.25),
      p50: at(values, 0.5),
      p75: at(values, 0.75),
      p90: at(values, 0.9),
    });
  }

  const atRetirement = chartData[params.yearsToRetirement - 1];
  return {
    simulations,
    successRate: Math.round((successes / simulations) * 100),
    chartData,
    medianAtRetirement: atRetirement?.p50 ?? 0,
    worstCase: atRetirement?.p10 ?? 0,
    bestCase: atRetirement?.p90 ?? 0,
  };
}
