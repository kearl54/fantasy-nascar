import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Load active leagues
    const { data: leagues, error } = await supabase
      .from('leagues')
      .select('id, current_race, end_race, status')
      .in('status', ['setup', 'active', 'in_progress', 'open'])

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results: any[] = []

    for (const league of leagues || []) {
      const current = league.current_race ?? 1
      const endRace = league.end_race ?? 36

      // Already at the final race – do not advance
      if (current >= endRace) {
        results.push({
          leagueId: league.id,
          status: 'season_complete',
          current_race: current,
        })
        continue
      }

      const nextRace = current + 1

      const { error: updateError } = await supabase
        .from('leagues')
        .update({ current_race: nextRace })
        .eq('id', league.id)

      if (updateError) {
        results.push({
          leagueId: league.id,
          status: 'error',
          error: updateError.message,
        })
      } else {
        results.push({
          leagueId: league.id,
          status: 'advanced',
          from: current,
          to: nextRace,
        })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    console.error('cron advance-race error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed' },
      { status: 500 }
    )
  }
}