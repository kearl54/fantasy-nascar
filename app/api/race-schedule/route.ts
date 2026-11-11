import { NextRequest, NextResponse } from 'next/server'
import { getWeekendSchedule } from '@/lib/nascar-cdn'

export async function GET(req: NextRequest) {
  try {
    const raceNumber = Number(new URL(req.url).searchParams.get('raceNumber'))
    if (!raceNumber || Number.isNaN(raceNumber)) {
      return NextResponse.json({ error: 'raceNumber required' }, { status: 400 })
    }

    // Cup Series only (helper uses series_id 1)
    const schedule = await getWeekendSchedule(raceNumber, 2026)
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, schedule })
  } catch (err: any) {
    console.error('race-schedule error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to load schedule' },
      { status: 500 }
    )
  }
}