'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function SubmitPicksContent() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [league, setLeague] = useState<any>(null)
  const [raceInfo, setRaceInfo] = useState<any>(null)
  const [drivers, setDrivers] = useState<any[]>([])
  const [selectedDrivers, setSelectedDrivers] = useState<any[]>([])
  const [pickPosition, setPickPosition] = useState<number | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  
  const [picksLocked, setPicksLocked] = useState(false)
  const [lockReason, setLockReason] = useState('')

// Friday 8:00 AM Eastern deadline
function isPastFridayDeadline() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date())

  const weekday = parts.find(p => p.type === 'weekday')?.value // Mon, Tue, ... Fri, Sat, Sun
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0)
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0)

  // Locked: Friday at/after 8:00 AM ET, all day Saturday, all day Sunday
  if (weekday === 'Fri' && (hour > 8 || (hour === 8 && minute >= 0))) return true
  if (weekday === 'Sat' || weekday === 'Sun') return true
  return false
}

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setCurrentUser(user)

      const { data: leagueData, error: leagueError } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', leagueId)
        .single()

      if (leagueError || !leagueData) {
        setError('League not found')
        setLoading(false)
        return
      }
      setLeague(leagueData)
	  
	  const raceNumber = leagueData.current_race || leagueData.start_race || 1

	  // Already assigned for this race?
	  const { data: existingAssignments } = await supabase
	  .from('assignments')
	  .select('id')
	  .eq('league_id', leagueId)
	  .eq('race_number', raceNumber)
	  .limit(1)

	  if (existingAssignments && existingAssignments.length > 0) {
	    setPicksLocked(true)
	    setLockReason('Drivers are already assigned for this race.')
	  } else if (isPastFridayDeadline()) {
	    setPicksLocked(true)
	    setLockReason('Pick deadline has passed (Friday 8:00 AM Eastern).')
	  } else {
	    setPicksLocked(false)
	    setLockReason('')
	  }

      const currentRace = leagueData.current_race || leagueData.start_race

      // Race info
      const { data: raceData } = await supabase
        .from('races')
        .select('*')
        .eq('race_number', currentRace)
        .single()
      setRaceInfo(raceData)

      // User's pick position for the CURRENT race
      const { data: orderData } = await supabase
        .from('pick_orders')
        .select('pick_position')
        .eq('league_id', leagueId)
        .eq('race_number', currentRace)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!orderData) {
        setError('Pick order has not been set for this race yet.')
        setLoading(false)
        return
      }
      setPickPosition(orderData.pick_position)

      // Existing submission for the CURRENT race (if any)
      const { data: existing } = await supabase
        .from('submissions')
        .select('ranked_driver_ids')
        .eq('league_id', leagueId)
        .eq('race_number', currentRace)
        .eq('user_id', user.id)
        .maybeSingle()

      // Load all active drivers with car numbers, sorted by car number
      const { data: driversData } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)

      const cleaned = (driversData || [])
        .filter((d: any) => d.car_number && d.car_number.toString().trim() !== '')
        .sort((a: any, b: any) => {
          const numA = parseInt(a.car_number) || 999
          const numB = parseInt(b.car_number) || 999
          return numA - numB
        })

      setDrivers(cleaned)

      // If the user already submitted for this race, restore their list
      if (existing?.ranked_driver_ids?.length) {
        const ordered = existing.ranked_driver_ids
          .map((id: number) => cleaned.find((d: any) => d.id === id))
          .filter(Boolean)
        setSelectedDrivers(ordered)
      } else {
        // Fresh start for the new race
        setSelectedDrivers([])
      }

      setLoading(false)
    }

    if (leagueId) load()
  }, [leagueId])

  const addDriver = (driver: any) => {
    if (selectedDrivers.find(d => d.id === driver.id)) return
    if (pickPosition && selectedDrivers.length >= pickPosition) return
    setSelectedDrivers([...selectedDrivers, driver])
  }

  const removeDriver = (driverId: number) => {
    setSelectedDrivers(selectedDrivers.filter(d => d.id !== driverId))
  }

  const moveDriver = (index: number, direction: 'up' | 'down') => {
    const newList = [...selectedDrivers]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= newList.length) return
    ;[newList[index], newList[target]] = [newList[target], newList[index]]
    setSelectedDrivers(newList)
  }

  const handleSubmit = async () => {
  if (picksLocked) {
    setError(lockReason || 'Picks are locked for this race.')
    return
  }

  if (!pickPosition || selectedDrivers.length !== pickPosition) {
    setError(`You must rank exactly ${pickPosition} drivers.`)
    return
  }
  setSaving(true)
  setError('')
  setMessage('')

    const currentRace = league.current_race || league.start_race
    const rankedIds = selectedDrivers.map(d => d.id)

    // Upsert the submission
    const { error: upsertError } = await supabase
      .from('submissions')
      .upsert(
        {
          league_id: leagueId,
          race_number: currentRace,
          user_id: currentUser.id,
          ranked_driver_ids: rankedIds
        },
        { onConflict: 'league_id,race_number,user_id' }
      )

    if (upsertError) {
      setError(upsertError.message)
      setSaving(false)
      return
    }

    setMessage('Picks submitted successfully!')
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">Loading...</p>
      </div>
    )
  }

  if (error && !league) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600 text-lg">{error}</p>
      </div>
    )
  }

  const currentRace = league?.current_race || league?.start_race
  const raceLabel = raceInfo
    ? `Race ${currentRace} – ${raceInfo.track || raceInfo.name}`
    : `Race ${currentRace}`

  const filteredDrivers = drivers.filter(d => {
    const term = search.toLowerCase()
    return (
      d.name.toLowerCase().includes(term) ||
      (d.car_number && d.car_number.toString().includes(term))
    )
  })

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4">
          <Link href={`/league/${leagueId}`} className="text-blue-600 hover:underline text-base">
            ← Back to League
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
		  <h1 className="text-2xl font-bold mb-1">Submit Picks</h1>
		  <p className="text-gray-600 text-base">
			{league?.name} · {raceLabel}
		  </p>

		  {picksLocked && (
			<div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
			  <p className="font-medium">Picks are locked</p>
			  <p className="text-sm">{lockReason}</p>
			</div>
		  )}
          <p className="mt-2 text-base">
            Your pick position: <span className="font-bold text-blue-600">#{pickPosition}</span>
            {pickPosition && (
              <span className="text-gray-500"> (you must rank exactly {pickPosition} drivers)</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Available Drivers */}
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <h2 className="text-lg font-bold mb-3">Available Drivers</h2>
            <input
              type="text"
              placeholder="Search drivers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4 text-base"
            />
            <div className="max-h-[500px] overflow-y-auto space-y-1">
              {filteredDrivers.map((driver) => {
                const alreadySelected = selectedDrivers.some(d => d.id === driver.id)
                return (
                  <button
                    key={driver.id}
                    onClick={() => addDriver(driver)}
                    disabled={alreadySelected || (pickPosition !== null && selectedDrivers.length >= pickPosition)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-base ${
                      alreadySelected
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'hover:bg-blue-50'
                    }`}
                  >
                    {driver.car_number} - {driver.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Ranked List */}
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <h2 className="text-lg font-bold mb-3">
              Your Ranked List ({selectedDrivers.length}/{pickPosition || '?'})
            </h2>

            {selectedDrivers.length === 0 ? (
              <p className="text-gray-500 text-base">No drivers selected yet.</p>
            ) : (
              <ul className="space-y-2">
                {selectedDrivers.map((driver, index) => (
                  <li
                    key={driver.id}
                    className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="w-6 text-gray-500 font-mono">{index + 1}.</span>
                    <span className="flex-1 text-base">
                      {driver.car_number} - {driver.name}
                    </span>
                    <button
                      onClick={() => moveDriver(index, 'up')}
                      disabled={index === 0}
                      className="px-2 py-1 bg-gray-200 rounded disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveDriver(index, 'down')}
                      disabled={index === selectedDrivers.length - 1}
                      className="px-2 py-1 bg-gray-200 rounded disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeDriver(driver.id)}
                      className="px-2 py-1 bg-red-100 text-red-600 rounded"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

{error && <p className="text-red-600 mb-3 text-center">{error}</p>}
{message && <p className="text-green-600 mb-3 text-center font-medium">{message}</p>}

            <button
              onClick={handleSubmit}
              disabled={saving || picksLocked || selectedDrivers.length !== pickPosition}
              className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl text-base font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Submitting...' : 'Submit Ranked List'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SubmitPicksPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SubmitPicksContent />
    </Suspense>
  )
}