import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getLatestCompletedPointsRace,
  getResultsForPointsRace,
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
      .select('id, current_race')
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
        .not('points_earned', 'is', null)
        .limit(1)

      if (existing && existing.length > 0) {
        results.push({
          leagueId: league.id,
          raceNumber,
          status: 'already_scored',
        })
        continue
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

      // Need driver names to match
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, name')

      const driverNameById = new Map(
        (drivers || []).map((d) => [d.id, d.name])
      )

      let updated = 0

      for (const a of assignments) {
        const driverName = driverNameById.get(a.driver_id)
        if (!driverName) continue

        const result = byName.get(normalizeName(driverName))
        if (!result) continue

        const { error } = await supabase
          .from('assignments')
          .update({
            finish_position: result.finish,
            points_earned: result.points,
            stage_points: result.stagePoints,
            // add stage1/2/3 columns if you have them
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