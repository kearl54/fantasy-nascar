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
      .order('standings_rank', { ascending: true, nullsFirst: false })

    const rankedDrivers = (drivers || []).filter(d => d.standings_rank != null)
    const results: any[] = []

    for (const league of leagues) {
      const raceNumber = league.current_race || league.start_race || 1

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

      // Submitted ranked lists
      const { data: picks } = await supabase
        .from('picks')
        .select('user_id, ranked_drivers')
        .eq('league_id', league.id)
        .eq('race_number', raceNumber)

      const picksByUser: {[userId: string]: string[]} = {}
      ;(picks || []).forEach((p: any) => {
        picksByUser[p.user_id] = p.ranked_drivers || []
      })

      const taken = new Set<string>()
      const assignments: any[] = []

      // Assign in pick order
      for (const po of pickOrder) {
        const ranked = picksByUser[po.user_id] || []
        let assigned: string | null = null

        for (const driverId of ranked) {
          if (!taken.has(driverId)) {
            assigned = driverId
            break
          }
        }

        // Non-submitter / exhausted list: highest remaining by Cup standings
        if (!assigned) {
          for (const d of rankedDrivers) {
            if (!taken.has(d.id)) {
              assigned = d.id
              break
            }
          }
        }

        if (assigned) {
          taken.add(assigned)
          assignments.push({
            league_id: league.id,
            race_number: raceNumber,
            user_id: po.user_id,
            driver_id: assigned,
          })
        }
      }

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