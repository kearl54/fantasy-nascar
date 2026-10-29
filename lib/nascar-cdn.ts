/**
 * Official NASCAR CDN fetcher (cf.nascar.com)
 * Free, no auth, updates within hours of the checkered flag.
 *
 * Series IDs: 1 = Cup, 2 = Xfinity/O'Reilly, 3 = Trucks
 */

export type NascarRaceListItem = {
  race_id: number;
  series_id: number;
  race_season: number;
  race_name: string;
  track_name: string;
  race_date: string;
  winner_driver_id: number | null;
  actual_laps: number | null;
  stage_1_laps: number;
  stage_2_laps: number;
  stage_3_laps: number;
  inspection_complete: boolean;
  playoff_round: number;
  is_qualifying_race?: boolean;
};

export type NascarResult = {
  finishing_position: number;
  starting_position: number;
  car_number: string;
  driver_fullname: string;
  driver_id: number;
  team_name: string;
  points_earned: number;
  playoff_points_earned: number;
  laps_completed: number;
  laps_led: number;
  finishing_status: string;
};

export type NascarStageResult = {
  stage_number: number;
  results: Array<{
    driver_fullname: string;
    driver_id: number;
    car_number: string;
    finishing_position: number;
    stage_points: number;
  }>;
};

export type ParsedRaceResults = {
  raceId: number;
  raceName: string;
  raceDate: string;
  trackName: string;
  /** Official sequential points-paying race number (1-36). Null if non-points. */
  pointsRaceNumber: number | null;
  results: Array<{
    finish: number;
    driverName: string;
    driverId: number;
    carNumber: string;
    points: number; // official Cup points (finish + stages)
    playoffPoints: number;
    stagePoints: number; // sum of stage points for convenience
    lapsLed: number;
    status: string;
  }>;
  stageResults: NascarStageResult[];
  raw: any;
};

const CDN_BASE = "https://cf.nascar.com";

/** Non-points events that appear in the Cup feed (Clash, Duels, All-Star, etc.) */
const NON_POINTS_KEYWORDS = [
  "clash",
  "duel",
  "all-star",
  "all star",
  "exhibition",
];

/**
 * Fetch the basic race list for a season.
 */
export async function fetchRaceList(
  year: number = 2026,
  seriesId: number = 1
): Promise<NascarRaceListItem[]> {
  const url = `${CDN_BASE}/cacher/${year}/race_list_basic.json`;
  const res = await fetch(url, {
    next: { revalidate: 3600 }, // cache 1h on Vercel
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch race list: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const key = `series_${seriesId}`;
  const list: NascarRaceListItem[] = data[key] ?? [];
  return list;
}

/**
 * Determine if a race is a points-paying Cup race and assign sequential number 1-36.
 * Order is chronological by race_date among non-exhibition races.
 */
export function mapToPointsRaceNumber(
  race: NascarRaceListItem,
  allCupRaces: NascarRaceListItem[]
): number | null {
  const name = (race.race_name || "").toLowerCase();
  if (NON_POINTS_KEYWORDS.some((k) => name.includes(k))) {
    return null;
  }
  // Some qualifying races are flagged
  if (race.is_qualifying_race) return null;

  const pointsRaces = allCupRaces
    .filter((r) => {
      const n = (r.race_name || "").toLowerCase();
      return !NON_POINTS_KEYWORDS.some((k) => n.includes(k)) && !r.is_qualifying_race;
    })
    .sort(
      (a, b) =>
        new Date(a.race_date).getTime() - new Date(b.race_date).getTime()
    );

  const idx = pointsRaces.findIndex((r) => r.race_id === race.race_id);
  return idx >= 0 ? idx + 1 : null;
}

/**
 * Fetch full weekend feed (results + stages) for a specific race.
 */
export async function fetchWeekendFeed(
  year: number,
  seriesId: number,
  raceId: number
): Promise<any> {
  const url = `${CDN_BASE}/cacher/${year}/${seriesId}/${raceId}/weekend-feed.json`;
  const res = await fetch(url, {
    next: { revalidate: 1800 },
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch weekend feed for race ${raceId}: ${res.status}`
    );
  }
  return res.json();
}

/**
 * Parse a weekend-feed into a clean structure ready for scoring.
 */
export function parseWeekendFeed(
  feed: any,
  pointsRaceNumber: number | null
): ParsedRaceResults {
  const wr = feed?.weekend_race?.[0];
  if (!wr) {
    throw new Error("weekend_race missing from feed");
  }

  const stageResults: NascarStageResult[] = wr.stage_results ?? [];

  // Build a quick map of total stage points per driver_id
  const stagePtsMap = new Map<number, number>();
  for (const stage of stageResults) {
    for (const s of stage.results ?? []) {
      const prev = stagePtsMap.get(s.driver_id) ?? 0;
      stagePtsMap.set(s.driver_id, prev + (s.stage_points ?? 0));
    }
  }

  const results = (wr.results ?? []).map((r: NascarResult) => ({
    finish: r.finishing_position,
    driverName: r.driver_fullname,
    driverId: r.driver_id,
    carNumber: String(r.car_number),
    points: r.points_earned ?? 0,
    playoffPoints: r.playoff_points_earned ?? 0,
    stagePoints: stagePtsMap.get(r.driver_id) ?? 0,
    lapsLed: r.laps_led ?? 0,
    status: r.finishing_status ?? "Unknown",
  }));

  // Sort by finish just in case
  results.sort((a: any, b: any) => a.finish - b.finish);

  return {
    raceId: wr.race_id,
    raceName: wr.race_name,
    raceDate: wr.race_date,
    trackName: wr.track_name,
    pointsRaceNumber,
    results,
    stageResults,
    raw: wr,
  };
}

/**
 * High-level helper: given a points race number (1-36), return parsed results.
 * Returns null if that race has not been completed yet (no winner / no results).
 */
export async function getResultsForPointsRace(
  pointsRaceNumber: number,
  year: number = 2026
): Promise<ParsedRaceResults | null> {
  const list = await fetchRaceList(year, 1);
  const withNumbers = list.map((r) => ({
    race: r,
    num: mapToPointsRaceNumber(r, list),
  }));

  const match = withNumbers.find((x) => x.num === pointsRaceNumber);
  if (!match) {
    throw new Error(`No Cup points race found for number ${pointsRaceNumber}`);
  }

  const { race } = match;

  // Not finished yet
  if (!race.winner_driver_id && !race.inspection_complete) {
    return null;
  }

  const feed = await fetchWeekendFeed(year, 1, race.race_id);
  return parseWeekendFeed(feed, pointsRaceNumber);
}

/**
 * Convenience: get the most recent completed points race.
 */
export async function getLatestCompletedPointsRace(
  year: number = 2026
): Promise<ParsedRaceResults | null> {
  const list = await fetchRaceList(year, 1);
  const points = list
    .map((r) => ({ race: r, num: mapToPointsRaceNumber(r, list) }))
    .filter((x) => x.num !== null)
    .sort((a, b) => (b.num! - a.num!));

  for (const item of points) {
    if (item.race.winner_driver_id || item.race.inspection_complete) {
      const feed = await fetchWeekendFeed(year, 1, item.race.race_id);
      return parseWeekendFeed(feed, item.num);
    }
  }
  return null;
}