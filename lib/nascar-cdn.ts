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
    points: number;
    playoffPoints: number;
    stagePoints: number;
    stage1: number; // finishing position in stage 1 (0 if none)
    stage2: number;
    stage3: number;
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

  // Total stage points + stage finishing positions per driver
  const stagePtsMap = new Map<number, number>();
  const stagePosMap = new Map<number, { stage1: number; stage2: number; stage3: number }>();

  for (const stage of stageResults) {
    for (const s of stage.results ?? []) {
      const prev = stagePtsMap.get(s.driver_id) ?? 0;
      stagePtsMap.set(s.driver_id, prev + (s.stage_points ?? 0));

      const pos = stagePosMap.get(s.driver_id) ?? { stage1: 0, stage2: 0, stage3: 0 };
      if (stage.stage_number === 1) pos.stage1 = s.finishing_position ?? 0;
      if (stage.stage_number === 2) pos.stage2 = s.finishing_position ?? 0;
      if (stage.stage_number === 3) pos.stage3 = s.finishing_position ?? 0;
      stagePosMap.set(s.driver_id, pos);
    }
  }

  const results = (wr.results ?? []).map((r: NascarResult) => {
    const stages = stagePosMap.get(r.driver_id) ?? { stage1: 0, stage2: 0, stage3: 0 };
    return {
      finish: r.finishing_position,
      driverName: r.driver_fullname,
      driverId: r.driver_id,
      carNumber: String(r.car_number),
      points: r.points_earned ?? 0,
      playoffPoints: r.playoff_points_earned ?? 0,
      stagePoints: stagePtsMap.get(r.driver_id) ?? 0,
      stage1: stages.stage1,
      stage2: stages.stage2,
      stage3: stages.stage3,
      lapsLed: r.laps_led ?? 0,
      status: r.finishing_status ?? "Unknown",
    };
  });

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

export type ScheduleRow = {
  key: string
  label: string
  startUtc: string
}

export type WeekendScheduleItem = {
  trackName: string | null
  raceName: string | null
  rows: ScheduleRow[]
}

/**
 * Cup Series only. Returns ordered practice / qualifying / duels / race times.
 * Daytona Speedweeks will include multiple practices + Duel 1 / Duel 2 when present.
 */
export async function getWeekendSchedule(
  pointsRaceNumber: number,
  year: number = 2026
): Promise<WeekendScheduleItem | null> {
  const list = await fetchRaceList(year, 1) // Cup only
  const withNumbers = list.map((r) => ({
    race: r,
    num: mapToPointsRaceNumber(r, list),
  }))
  const match = withNumbers.find((x) => x.num === pointsRaceNumber)
  if (!match) return null

  const feed = await fetchWeekendFeed(year, 1, match.race.race_id)
  const wr = feed?.weekend_race?.[0]
  const schedule: any[] = Array.isArray(wr?.schedule) ? wr.schedule : []

  const practices: { start: string; name: string }[] = []
  const duels: { start: string; name: string }[] = []
  let qualifying: string | null = null
  let race: string | null = null

  for (const e of schedule) {
    const name = String(e.event_name || '').toLowerCase()
    const start = e.start_time_utc as string | undefined
    if (!start) continue

    const runType = Number(e.run_type)

    // Skip non-session noise
    if (
      name.includes('meeting') ||
      name.includes('hauler') ||
      name.includes('garage') ||
      name.includes('intro') ||
      name.includes('grid') ||
      name.includes('access') ||
      name.includes('briefing') ||
      name.includes('report for')
    ) {
      continue
    }

    if (name.includes('duel')) {
      duels.push({ start, name })
      continue
    }

    if (runType === 1 || name.includes('practice')) {
      practices.push({ start, name })
      continue
    }

    if (runType === 2 || name.includes('qualifying')) {
      if (!qualifying) qualifying = start
      continue
    }

    if (runType === 3 || (name === 'race' || name.startsWith('race '))) {
      if (!race) race = start
      continue
    }
  }

  // Sort practices / duels by time
  practices.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )
  duels.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )

  const rows: ScheduleRow[] = []

  if (practices.length <= 1) {
    if (practices[0]) {
      rows.push({
        key: 'practice',
        label: 'Practice',
        startUtc: practices[0].start,
      })
    }
  } else {
    practices.forEach((p, i) => {
      rows.push({
        key: `practice_${i + 1}`,
        label: `Practice ${i + 1}`,
        startUtc: p.start,
      })
    })
  }

  if (qualifying) {
    rows.push({
      key: 'qualifying',
      label: 'Qualifying',
      startUtc: qualifying,
    })
  }

  duels.forEach((d, i) => {
    // Prefer "Duel 1" / "Duel 2" from name when possible
    let label = `Duel ${i + 1}`
    if (d.name.includes('duel 1') || d.name.includes('duel i')) label = 'Duel 1'
    if (d.name.includes('duel 2') || d.name.includes('duel ii')) label = 'Duel 2'
    rows.push({
      key: `duel_${i + 1}`,
      label,
      startUtc: d.start,
    })
  })

  // Race time: prefer schedule race, else race_list race_date
  const raceStart = race || match.race.race_date || null
  if (raceStart) {
    rows.push({
      key: 'race',
      label: 'Race',
      startUtc: raceStart,
    })
  }

  // Final chronological order (Daytona: Practice1, Qual, Duels, Practice2…, Race)
  rows.sort(
    (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
  )

  return {
    trackName: wr?.track_name || match.race.track_name || null,
    raceName: wr?.race_name || match.race.race_name || null,
    rows,
  }
}