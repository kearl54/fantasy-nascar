'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type LiveRow = {
  position: number
  carNumber: string
  driverName: string
  teamName: string | null
  bestLapTime: number | null
  bestLapSpeed: number | null
  onTrack: boolean
}

type SessionInfo = {
  runType: number
  sessionLabel: string
  runName: string
  trackName: string
  lapNumber: number | null
  lapsInRace: number | null
  flagState: number | null
}

function LiveContent() {
  const params = useParams()
  const leagueId = params.id as string
  const supabase = createClient()

  const [raceNumber, setRaceNumber] = useState<number | null>(null)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [order, setOrder] = useState<LiveRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  // Load league current race once
  useEffect(() => {
    async function loadLeague() {
      const { data } = await supabase
        .from('leagues')
        .select('current_race, start_race')
        .eq('id', leagueId)
        .single()
      if (data) {
        setRaceNumber(data.current_race || data.start_race || 1)
      }
    }
    loadLeague()
  }, [leagueId])

  // Poll live feed
  useEffect(() => {
    if (!raceNumber) return

    let cancelled = false

    async function fetchLive() {
      try {
        const res = await fetch(
          `/api/live-feed?leagueId=${leagueId}&raceNumber=${raceNumber}`,
          { cache: 'no-store' }
        )
        const data = await res.json()
        if (cancelled) return

        if (!res.ok || data.error) {
          setError(data.error || 'Could not load live feed')
          setLoading(false)
          return
        }

        setSession(data.session)
        setOrder(data.order || [])
        setUpdatedAt(data.updatedAt)
        setError('')
        setLoading(false)
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Network error')
          setLoading(false)
        }
      }
    }

    fetchLive()
    const id = setInterval(fetchLive, 8000) // every 8 seconds
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [leagueId, raceNumber])

  const flagLabel = (flag: number | null) => {
    if (flag === 1) return 'Green'
    if (flag === 2) return 'Caution'
    if (flag === 4) return 'Red'
    if (flag === 9) return 'Checkered'
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Link
          href={`/league/${leagueId}`}
          className="text-blue-600 hover:underline text-base"
        >
          ← Back to League
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h1 className="text-2xl font-bold text-gray-900">Live</h1>
          {session ? (
            <div className="mt-2 space-y-1 text-base text-gray-600">
              <div className="font-medium text-gray-900">
                {session.runName || session.sessionLabel}
              </div>
              <div>{session.trackName}</div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="bg-gray-100 px-2 py-0.5 rounded">
                  {session.sessionLabel}
                </span>
                {session.runType === 3 && session.lapNumber != null && (
                  <span>
                    Lap {session.lapNumber}
                    {session.lapsInRace && session.lapsInRace < 900
                      ? ` / ${session.lapsInRace}`
                      : ''}
                  </span>
                )}
                {flagLabel(session.flagState) && (
                  <span className="font-medium">{flagLabel(session.flagState)}</span>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-gray-500">Loading session…</p>
          )}
          {updatedAt && (
            <p className="text-xs text-gray-400 mt-2">
              Updated {new Date(updatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-5 py-3 border-b font-bold text-lg">Running Order</div>
          {loading ? (
            <p className="p-5 text-gray-500">Loading…</p>
          ) : order.length === 0 ? (
            <p className="p-5 text-gray-500">No vehicles in feed right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b text-left text-gray-500 text-sm">
                    <th className="px-4 py-2 w-12">Pos</th>
                    <th className="px-3 py-2 w-14">Car</th>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Team</th>
                    {session && session.runType !== 3 && (
                      <th className="px-3 py-2 text-right">Best Lap</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {order.map((row) => (
                    <tr
                      key={`${row.carNumber}-${row.position}`}
                      className={`border-b last:border-0 ${
                        row.teamName ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-gray-500">{row.position}</td>
                      <td className="px-3 py-2.5 font-bold">{row.carNumber}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        {row.driverName}
                      </td>
                      <td className="px-3 py-2.5 text-blue-800 font-medium">
                        {row.teamName || '—'}
                      </td>
                      {session && session.runType !== 3 && (
                        <td className="px-3 py-2.5 text-right text-gray-600">
                          {row.bestLapTime
                            ? row.bestLapTime.toFixed(3)
                            : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          Data from NASCAR public live feed · refreshes every 8 seconds
        </p>
      </div>
    </div>
  )
}

export default function LivePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading live feed…
        </div>
      }
    >
      <LiveContent />
    </Suspense>
  )
}