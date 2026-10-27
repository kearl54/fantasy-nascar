import { NextRequest, NextResponse } from 'next/server'
import { parquetReadObjects } from 'hyparquet'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { leagueId, raceNumber } = body

    if (!leagueId || !raceNumber) {
      return NextResponse.json(
        { error: 'Missing leagueId or raceNumber' },
        { status: 400 }
      )
    }

    // Parquet is the working public source (CSV is currently 404)
    const parquetRes = await fetch(
      'https://nascar.kylegrealis.com/cup_series.parquet',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FantasyNASCAR/1.0)',
          Accept: 'application/octet-stream,*/*',
        },
        cache: 'no-store',
      }
    )

    if (!parquetRes.ok) {
      return NextResponse.json(
        {
          error: `Could not download NASCAR data (status ${parquetRes.status}). Try again later or enter points manually.`,
        },
        { status: 500 }
      )
    }

    const arrayBuffer = await parquetRes.arrayBuffer()
    const rows = await parquetReadObjects({ file: arrayBuffer })

    const raceNum = Number(raceNumber)

    const results = rows
      .filter((row: any) => {
        const season = Number(row.Season ?? row.season)
        const race = Number(row.Race ?? row.race)
        return season === 2026 && race === raceNum
      })
      .map((row: any) => {
  const driver = String(row.Driver ?? row.driver ?? '').trim()
  const car = String(row.Car ?? row.car ?? '').trim()
  const finish = Number(row.Finish ?? row.finish ?? 99) || 99
  const points = Number(row.Pts ?? row.points ?? row.Points ?? 0) || 0
  const stage1 = Number(row.S1 ?? row.s1 ?? 0) || 0
  const stage2 = Number(row.S2 ?? row.s2 ?? 0) || 0
  const stage3 = Number(row.S3 ?? row.s3 ?? 0) || 0

  return {
    driver,
    car,
    finish,
    points,
    stage1,
    stage2,
    stage3,
    stagePoints: stage1 + stage2 + stage3, // keep total for compatibility
  }
})
      .filter((r: any) => r.driver)

    if (results.length === 0) {
      return NextResponse.json(
        {
          error: `No results found for Race ${raceNumber} in the 2026 data. The weekly update may not have run yet (usually Monday morning).`,
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    })
  } catch (err: any) {
    console.error('Import error:', err)
    return NextResponse.json(
      { error: err.message || 'Import failed' },
      { status: 500 }
    )
  }
}