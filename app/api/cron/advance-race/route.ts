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

      if (current >= endRace) {
        results.push({
          leagueId: league.id,
          status: 'season_complete',
          current_race: current,
        })
        continue
      }

      const nextRace = current + 1

      // Same logic as the commissioner "Advance" button:
      // order by previous race finish_position (best finish picks first)
      const { data: currentResults } = await supabase
        .from('assignments')
        .select('user_id, finish_position')
        .eq('league_id', league.id)
        .eq('race_number', current)
        .not('finish_position', 'is', null)
        .order('finish_position')

      if (!currentResults || currentResults.length === 0) {
        results.push({
          leagueId: league.id,
          status: 'skipped_no_results',
          current_race: current,
        })
        continue
      }

      const newOrder = currentResults.map((r, index) => ({
        league_id: league.id,
        race_number: nextRace,
        user_id: r.user_id,
        pick_position: index + 1,
      }))

      // Replace any existing pick order for the next race
      await supabase
        .from('pick_orders')
        .delete()
        .eq('league_id', league.id)
        .eq('race_number', nextRace)

      const { error: orderError } = await supabase
        .from('pick_orders')
        .insert(newOrder)

      if (orderError) {
        results.push({
          leagueId: league.id,
          status: 'pick_order_error',
          error: orderError.message,
        })
        continue
      }

      // Advance the league
      const { error: leagueError } = await supabase
        .from('leagues')
        .update({ current_race: nextRace })
        .eq('id', league.id)

      if (leagueError) {
        results.push({
          leagueId: league.id,
          status: 'advance_error',
          error: leagueError.message,
        })
        continue
      }

      results.push({
        leagueId: league.id,
        status: 'advanced',
        from: current,
        to: nextRace,
        pickOrderCount: newOrder.length,
      })
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