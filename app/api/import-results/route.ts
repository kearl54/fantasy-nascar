import { NextRequest, NextResponse } from 'next/server'
import {
  getResultsForPointsRace,
  getLatestCompletedPointsRace,
} from '@/lib/nascar-cdn'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { leagueId, raceNumber } = body

    // leagueId is still accepted so the rest of your UI doesn’t break,
    // even though this route only returns the results (it doesn’t write to DB).
    if (!raceNumber && raceNumber !== 0) {
      return NextResponse.json(
        { error: 'Missing raceNumber' },
        { status: 400 }
      )
    }

    const raceNum = Number(raceNumber)
    const year = 2026

    // Use the official NASCAR CDN instead of kyleGrealis
    const parsed = await getResultsForPointsRace(raceNum, year)

    if (!parsed) {
      return NextResponse.json(
        {
          error: `No results found for Race ${raceNumber}. The race may not be finished yet, or results are not posted.`,
        },
        { status: 404 }
      )
    }

    // Convert to the exact shape your existing UI expects
    const results = parsed.results.map((r) => {
      // Reconstruct stage1/2/3 from the stageResults array if needed
      let stage1 = 0
      let stage2 = 0
      let stage3 = 0

      for (const stage of parsed.stageResults) {
        const entry = stage.results.find(
          (s) => s.driver_id === r.driverId || s.driver_fullname === r.driverName
        )
        if (entry) {
          if (stage.stage_number === 1) stage1 = entry.stage_points
          if (stage.stage_number === 2) stage2 = entry.stage_points
          if (stage.stage_number === 3) stage3 = entry.stage_points
        }
      }

      return {
        driver: r.driverName,
        car: r.carNumber,
        finish: r.finish,
        points: r.points,           // official NASCAR points (finish + stages)
        stage1,
        stage2,
        stage3,
        stagePoints: r.stagePoints, // total stage points
      }
    })

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
      // Extra info you can use later if you want
      raceName: parsed.raceName,
      trackName: parsed.trackName,
      source: 'cf.nascar.com',
    })
  } catch (err: any) {
    console.error('Import error:', err)
    return NextResponse.json(
      { error: err.message || 'Import failed' },
      { status: 500 }
    )
  }
}