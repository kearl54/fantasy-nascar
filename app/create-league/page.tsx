'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function CreateLeaguePage() {
  const [name, setName] = useState('')
  const [maxTeams, setMaxTeams] = useState(12)
  const [isPublic, setIsPublic] = useState(false)
  const [seasonType, setSeasonType] = useState('full')
  const [startRace, setStartRace] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [scoringFormat, setScoringFormat] = useState<'full' | 'chase'>('full')
  const [chaseTeams, setChaseTeams] = useState(16)

  const getEndRace = () => {
    if (seasonType === 'full') return 36
    if (seasonType === 'first_half') return 18
    if (seasonType === 'second_half') return 36
    if (seasonType === 'regular') return 26
    if (seasonType === 'chase') return 36
    return 36
  }

  const handleCreate = async () => {
    setLoading(true)
    setError('')
    setStatus('Starting...')

    try {
      // Import inside the function so the page can load
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      setStatus('Checking login...')
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        setError('You are not logged in. Please log in again.')
        setStatus('Not logged in')
        setLoading(false)
        return
      }
	  
	  if (scoringFormat === 'chase') {
		  if (chaseTeams < 2 || chaseTeams > maxTeams) {
			setError(`Chase teams must be between 2 and ${maxTeams}`)
			setStatus('')
			setLoading(false)
			return
		  }
		}

      setStatus('Creating league...')

      const endRace = getEndRace()
      const inviteCode = isPublic ? null : Math.random().toString(36).substring(2, 8).toUpperCase()

      const { data, error: leagueError } = await supabase
        .from('leagues')
        .insert({
          name: name.trim() || 'Untitled League',
          commissioner_id: user.id,
          max_teams: maxTeams,
          is_public: isPublic,
          invite_code: inviteCode,
          season_type: seasonType,
          start_race: startRace,
          end_race: endRace,
		  scoring_format: scoringFormat,
		  chase_teams: scoringFormat === 'chase' ? chaseTeams : null,
		  regular_season_end: 26,
          status: 'setup'
        })
        .select()
        .single()

      if (leagueError) {
        setError(leagueError.message)
        setStatus('Failed to create league')
        setLoading(false)
        return
      }

      setStatus('Adding you as member...')

      const { error: memberError } = await supabase
        .from('league_members')
        .insert({
          league_id: data.id,
          user_id: user.id,
          team_name: 'Commissioner'
        })

      if (memberError) {
        setError('League created but could not add you as member: ' + memberError.message)
        setLoading(false)
        return
      }

      setStatus('Success! Redirecting...')
      window.location.href = `/league/${data.id}`

    } catch (err: any) {
      setError(err.message || 'Unexpected error')
      setStatus('Error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-4">
          <Link href="/" className="text-blue-600 hover:underline">← Back to Home</Link>
        </div>

        <div className="bg-white rounded-xl shadow-md p-8">
          <h1 className="text-2xl font-bold mb-6">Create a New League</h1>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">League Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="My Fantasy NASCAR League"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Number of Teams (2–30)</label>
              <input
                type="number"
                min={2}
                max={30}
                value={maxTeams}
                onChange={(e) => setMaxTeams(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Season Type</label>
              <select
                value={seasonType}
                onChange={(e) => {
                  const type = e.target.value
                  setSeasonType(type)
                  if (type === 'full' || type === 'first_half' || type === 'regular') setStartRace(1)
                  else if (type === 'second_half') setStartRace(19)
                  else if (type === 'chase') setStartRace(27)
                }}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="full">Full Season (Races 1–36)</option>
                <option value="first_half">First Half (Races 1–18)</option>
                <option value="second_half">Second Half (Races 19–36)</option>
                <option value="regular">Regular Season (Races 1–26)</option>
                <option value="chase">Chase Only (Races 27–36)</option>
                <option value="custom">Custom Start Race</option>
              </select>
            </div>
			
			{/* Scoring Format */}
				<div>
				  <label className="block text-sm font-medium mb-1">Scoring Format</label>
				  <select
					value={scoringFormat}
					onChange={(e) => setScoringFormat(e.target.value as 'full' | 'chase')}
					className="w-full border rounded-lg px-3 py-2"
				  >
					<option value="full">Full Season (cumulative points)</option>
					<option value="chase">Chase Format (reset after race 26)</option>
				  </select>
				</div>

				{scoringFormat === 'chase' && (
				  <div>
					<label className="block text-sm font-medium mb-1">
					  Teams that make The Chase
					</label>
					<input
					  type="number"
					  min={2}
					  max={maxTeams}
					  value={chaseTeams}
					  onChange={(e) => setChaseTeams(Number(e.target.value))}
					  className="w-full border rounded-lg px-3 py-2"
					/>
					<p className="text-sm text-gray-500 mt-1">
					  Must be between 2 and {maxTeams} (your league size).
					</p>
				  </div>
				)}

            {seasonType === 'custom' && (
              <div>
                <label className="block text-sm font-medium mb-1">Starting Race (1–36)</label>
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={startRace}
                  onChange={(e) => setStartRace(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="public"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <label htmlFor="public">Public League</label>
            </div>

            {status && (
              <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm">
                {status}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create League'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}