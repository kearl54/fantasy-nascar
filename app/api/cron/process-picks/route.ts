import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    // Security: only allow requests with the secret
    const authHeader = req.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )

    // Load active leagues
    const { data: leagues, error: leaguesError } = await supabase
      .from('leagues')
      .select('id, current_race, start_race, end_race, status')
      .in('status', ['setup', 'active', 'in_progress', 'open'])

    if (leaguesError) {
      return NextResponse.json({ error: leaguesError.message }, { status: 500 })
    }

    if (!leagues || leagues.length === 0) {
      return NextResponse.json({ success: true, message: 'No leagues to process', processed: 0 })
    }

    // Drivers ranked by current Cup standings (for non-submitters)
    const { data: drivers } = await supabase
	  .from('drivers')
	  .select('id, name, car_number, standings_rank')
	  .eq('is_active', true)
	  .order('standings_rank', { ascending: true, nullsFirst: false })

    const rankedDrivers = (drivers || []).filter(d => d.standings_rank != null)
    const results: any[] = []

    for (const league of leagues) {
      const raceNumber = league.current_race || league.start_race || 1
	  
	  // Thursday 12:00 UTC cron = 7:00 AM ET (EST). Only auto-assign for Daytona (Race 1).
      const dayUtc = new Date().getUTCDay() // 0=Sun ... 4=Thu
      if (dayUtc === 4 && raceNumber !== 1) {
        results.push({
          leagueId: league.id,
          raceNumber,
          status: 'skipped_not_daytona_thursday',
        })
        continue
      }

      // Skip if already has assignments for this race
      const { data: existing } = await supabase
        .from('assignments')
        .select('id')
        .eq('league_id', league.id)
        .eq('race_number', raceNumber)
        .limit(1)

      if (existing && existing.length > 0) {
        results.push({ leagueId: league.id, raceNumber, status: 'already_assigned' })
        continue
      }

      // Pick order for this race
      const { data: pickOrder } = await supabase
        .from('pick_orders')
        .select('user_id, pick_position')
        .eq('league_id', league.id)
        .eq('race_number', raceNumber)
        .order('pick_position')

      if (!pickOrder || pickOrder.length === 0) {
        results.push({ leagueId: league.id, raceNumber, status: 'no_pick_order' })
        continue
      }

      // Submitted ranked lists (correct table + column)
      const { data: submissions } = await supabase
        .from('submissions')
        .select('user_id, ranked_driver_ids')
        .eq('league_id', league.id)
        .eq('race_number', raceNumber)

     // Map user → ranked driver ids (as numbers)
      const submissionMap = new Map<string, number[]>()
      ;(submissions || []).forEach((s: any) => {
        const ids = (s.ranked_driver_ids || []).map((id: any) => Number(id))
        submissionMap.set(s.user_id, ids)
      })

      const availableDriverIds = new Set(
        (drivers || []).map((d) => d.id)
      )
      const finalAssignments: any[] = []
      const nonSubmitters: { user_id: string }[] = []

      // Pass 1: only teams that submitted a ranked list (in pick order)
      for (const po of pickOrder) {
        const rankedIds = submissionMap.get(po.user_id) || []
        if (rankedIds.length === 0) {
          nonSubmitters.push(po)
          continue
        }

        let assignedDriverId: number | null = null
        for (const driverId of rankedIds) {
          if (availableDriverIds.has(driverId)) {
            assignedDriverId = driverId
            availableDriverIds.delete(driverId)
            break
          }
        }

        if (assignedDriverId != null) {
          finalAssignments.push({
            league_id: league.id,
            race_number: raceNumber,
            user_id: po.user_id,
            driver_id: assignedDriverId,
            points_earned: 0,
          })
        } else {
          // Submitted but every ranked driver was already taken
          nonSubmitters.push(po)
        }
      }

      // Pass 2: non-submitters (and exhausted lists) get remaining by Cup standings
      const remainingDrivers = (drivers || [])
        .filter((d) => availableDriverIds.has(d.id))
        .sort((a, b) => {
          const rankA = a.standings_rank ?? 9999
          const rankB = b.standings_rank ?? 9999
          return rankA - rankB
        })

      nonSubmitters.forEach((po, idx) => {
        if (remainingDrivers[idx]) {
          finalAssignments.push({
            league_id: league.id,
            race_number: raceNumber,
            user_id: po.user_id,
            driver_id: remainingDrivers[idx].id,
            points_earned: 0,
          })
        }
      })

      const assignments = finalAssignments

      if (assignments.length > 0) {
        const { error: insertError } = await supabase
          .from('assignments')
          .insert(assignments)

        if (insertError) {
          results.push({ leagueId: league.id, raceNumber, status: 'error', error: insertError.message })
        } else {
          results.push({ leagueId: league.id, raceNumber, status: 'assigned', count: assignments.length })
        }
      } else {
        results.push({ leagueId: league.id, raceNumber, status: 'nothing_to_assign' })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    console.error('Cron process-picks error:', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}