import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type LiveVehicle = {
  running_position?: number
  vehicle_number?: string
  starting_position?: number
  best_lap_time?: number
  best_lap_speed?: number
  laps_completed?: number
  driver?: {
    full_name?: string
    driver_id?: number
  }
  is_on_track?: boolean
}

function normalizeCar(n: string | number | undefined) {
  return String(n ?? '').replace(/^0+/, '').trim()
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const leagueId = searchParams.get('leagueId')
    const raceNumber = searchParams.get('raceNumber')

    // 1. Official live feed (practice / qualifying / race — same URL)
    const feedRes = await fetch('https://cf.nascar.com/live/feeds/live-feed.json', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    if (!feedRes.ok) {
      return NextResponse.json(
        { error: `Live feed unavailable (${feedRes.status})` },
        { status: 502 }
      )
    }

    const feed = await feedRes.json()
    const vehicles: LiveVehicle[] = feed.vehicles || []
    const runType = Number(feed.run_type) // 1=Practice, 2=Qualifying, 3=Race

    // 2. Sort: race by running position; practice/qual by best lap time
    const sorted = [...vehicles].sort((a, b) => {
      if (runType === 3) {
        return (a.running_position ?? 999) - (b.running_position ?? 999)
      }
      const ta = a.best_lap_time && a.best_lap_time > 0 ? a.best_lap_time : 9999
      const tb = b.best_lap_time && b.best_lap_time > 0 ? b.best_lap_time : 9999
      if (ta !== tb) return ta - tb
      return (a.running_position ?? 999) - (b.running_position ?? 999)
    })

    // 3. Optional: map car → fantasy team for this league/race
    const teamByCar: Record<string, string> = {}

    if (leagueId && raceNumber) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      )

      const { data: assignments } = await supabase
        .from('assignments')
        .select('driver_id, user_id')
        .eq('league_id', leagueId)
        .eq('race_number', Number(raceNumber))

      if (assignments && assignments.length > 0) {
        const driverIds = assignments.map((a) => a.driver_id)
        const userIds = assignments.map((a) => a.user_id)

        const [{ data: drivers }, { data: members }] = await Promise.all([
          supabase.from('drivers').select('id, car_number, name').in('id', driverIds),
          supabase
            .from('league_members')
            .select('user_id, team_name')
            .eq('league_id', leagueId)
            .in('user_id', userIds),
        ])

        const driverById = new Map((drivers || []).map((d) => [d.id, d]))
        const teamByUser = new Map((members || []).map((m) => [m.user_id, m.team_name]))

        for (const a of assignments) {
          const d = driverById.get(a.driver_id)
          const team = teamByUser.get(a.user_id)
          if (d && team) {
            teamByCar[normalizeCar(d.car_number)] = team
          }
        }
      }
    }

    // 4. Clean running order
    const order = sorted.map((v, index) => {
      const car = normalizeCar(v.vehicle_number)
      return {
        position: runType === 3 ? (v.running_position ?? index + 1) : index + 1,
        carNumber: v.vehicle_number ?? '',
        driverName: v.driver?.full_name ?? 'Unknown',
        teamName: teamByCar[car] || null,
        bestLapTime: v.best_lap_time ?? null,
        bestLapSpeed: v.best_lap_speed ?? null,
        startingPosition: v.starting_position ?? null,
        lapsCompleted: v.laps_completed ?? null,
        onTrack: v.is_on_track ?? true,
      }
    })

    const sessionLabel =
      runType === 1 ? 'Practice' : runType === 2 ? 'Qualifying' : runType === 3 ? 'Race' : 'Session'

    return NextResponse.json({
      success: true,
      session: {
        runType,
        sessionLabel,
        runName: feed.run_name ?? '',
        trackName: feed.track_name ?? '',
        raceId: feed.race_id ?? null,
        lapNumber: feed.lap_number ?? null,
        lapsInRace: feed.laps_in_race ?? null,
        flagState: feed.flag_state ?? null,
        seriesId: feed.series_id ?? 1,
      },
      order,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('live-feed error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to load live feed' },
      { status: 500 }
    )
  }
}