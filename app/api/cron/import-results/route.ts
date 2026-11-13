import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getLatestCompletedPointsRace,
  getResultsForPointsRace,
  getDaytonaDuelBonusPoints,
} from '@/lib/nascar-cdn'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+jr$/i, ' jr')
    .replace(/\s+sr$/i, ' sr')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  try {
    // Security
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const year = 2026

    // Get the most recent completed points race
    const parsed = await getLatestCompletedPointsRace(year)
    if (!parsed || !parsed.pointsRaceNumber) {
      return NextResponse.json({
        success: true,
        message: 'No completed race found to import',
      })
    }

    const raceNumber = parsed.pointsRaceNumber

    // Load active leagues
    const { data: leagues, error: leaguesError } = await supabase
      .from('leagues')
      .select('id, current_race, start_race, end_race, status, season_year')
      .in('status', ['setup', 'active', 'in_progress', 'open'])

    if (leaguesError) {
      return NextResponse.json({ error: leaguesError.message }, { status: 500 })
    }

    const results: any[] = []

    for (const league of leagues || []) {
      // Only import if this race is the one the league is currently on
      // (or has already passed). Adjust this logic if you prefer different rules.
      if (league.current_race && league.current_race < raceNumber) {
        // League is still on an earlier race – skip for now
        results.push({
          leagueId: league.id,
          raceNumber,
          status: 'skipped_league_behind',
        })
        continue
      }

      // Check if this race already has scores
      const { data: existing } = await supabase
		.from('assignments')
		.select('id, points_earned')
		.eq('league_id', league.id)
		.eq('race_number', raceNumber)
		.gt('points_earned', 0)          // only treat real scores as “already scored”
		.limit(1)

      if (existing && existing.length > 0) {
        results.push({
          leagueId: league.id,
          raceNumber,
          status: 'already_scored',
        })
        continue
      }

      // Daytona only: Duel top-10 points (10..1 per duel), keyed by car number
      let duelBonusByCar = new Map<string, number>()
      if (raceNumber === 1) {
        try {
          const year =
            (league as any).season_year || new Date().getFullYear()
          duelBonusByCar = await getDaytonaDuelBonusPoints(year)
        } catch (e) {
          console.error('Daytona duel bonus fetch failed:', e)
        }
      }

      // Build a lookup of official results by driver name
      const byName = new Map(
        parsed.results.map((r) => [normalizeName(r.driverName), r])
      )

            // Get the assignments for this race
      const { data: assignments } = await supabase
        .from('assignments')
        .select('id, driver_id, user_id')
        .eq('league_id', league.id)
        .eq('race_number', raceNumber)

      if (!assignments || assignments.length === 0) {
        results.push({
          leagueId: league.id,
          raceNumber,
          status: 'no_assignments',
        })
        continue
      }

      // Need driver names + car numbers to match
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, name, car_number')

      const driverNameById = new Map(
        (drivers || []).map((d) => [d.id, d.name])
      )
      const driverCarById = new Map(
        (drivers || []).map((d) => [d.id, String(d.car_number ?? '').replace(/^0+/, '')])
      )

      // Also build a car-number lookup from the official results
      const byCar = new Map(
        parsed.results.map((r) => [
          String(r.carNumber ?? '').replace(/^0+/, ''),
          r,
        ])
      )

      let updated = 0

      for (const a of assignments) {
        const driverName = driverNameById.get(a.driver_id)
        const carNumber = driverCarById.get(a.driver_id)

        // Try name first, then fall back to car number
        let result = driverName
          ? byName.get(normalizeName(driverName))
          : undefined

        if (!result && carNumber) {
          result = byCar.get(carNumber)
        }

        if (!result) continue

        const carKey = String(result.carNumber ?? '')
          .replace(/^0+/, '')
          .trim()
        const duelPts =
          raceNumber === 1 ? (duelBonusByCar.get(carKey) || 0) : 0
        const totalPoints = (Number(result.points) || 0) + duelPts

        const { error } = await supabase
          .from('assignments')
          .update({
            finish_position: result.finish,
            points_earned: totalPoints,
            stage_points: result.stagePoints,
            stage1_points: result.stage1 ?? 0,
            stage2_points: result.stage2 ?? 0,
            stage3_points: result.stage3 ?? 0,
          })
          .eq('id', a.id)

        if (!error) updated++
      }

            results.push({
        leagueId: league.id,
        raceNumber,
        status: 'scored',
        updated,
        raceName: parsed.raceName,
      })

      // Auto end season after final race is scored
      const endRace = league.end_race || 36
      if (
        raceNumber === endRace &&
        updated > 0 &&
        league.status !== 'completed'
      ) {
        try {
          const { data: members } = await supabase
            .from('league_members')
            .select('user_id, team_name')
            .eq('league_id', league.id)

          const { data: allAssign } = await supabase
            .from('assignments')
            .select('user_id, points_earned, finish_position, race_number')
            .eq('league_id', league.id)

          const standings = (members || [])
            .map((m) => {
              const rows = (allAssign || []).filter((a) => a.user_id === m.user_id)
              const totalPoints = rows.reduce(
                (sum, a) => sum + (a.points_earned || 0),
                0
              )
              const wins = rows.filter((a) => a.finish_position === 1).length
              const top5s = rows.filter(
                (a) => a.finish_position && a.finish_position <= 5
              ).length
              const top10s = rows.filter(
                (a) => a.finish_position && a.finish_position <= 10
              ).length
              return {
                user_id: m.user_id,
                team_name: m.team_name,
                totalPoints,
                wins,
                top5s,
                top10s,
              }
            })
            .sort((a, b) => b.totalPoints - a.totalPoints)

          const finalStandings = standings.map((s, idx) => ({
            place: idx + 1,
            ...s,
          }))

          const seasonYear =
            (league as any).season_year || new Date().getFullYear()

          const { data: existingHistory } = await supabase
            .from('season_history')
            .select('id')
            .eq('league_id', league.id)
            .eq('season_year', seasonYear)
            .limit(1)

          if (!existingHistory?.length) {
            await supabase.from('season_history').insert({
              league_id: league.id,
              season_year: seasonYear,
              end_race: endRace,
              standings: finalStandings,
              completed_at: new Date().toISOString(),
            })
          }

          await supabase
            .from('leagues')
            .update({ status: 'completed' })
            .eq('id', league.id)

          results.push({
            leagueId: league.id,
            raceNumber,
            status: 'season_ended',
            champion: finalStandings[0]?.team_name ?? null,
          })
        } catch (e: any) {
          console.error('Auto end season failed:', e)
          results.push({
            leagueId: league.id,
            raceNumber,
            status: 'season_end_error',
            error: e.message || 'Failed to end season',
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      raceNumber,
      raceName: parsed.raceName,
      results,
    })
  } catch (err: any) {
    console.error('cron import-results error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed' },
      { status: 500 }
    )
  }
}