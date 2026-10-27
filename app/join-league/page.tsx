'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function JoinLeaguePage() {
  const supabase = createClient()
  const router = useRouter()

  const [inviteCode, setInviteCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [publicLeagues, setPublicLeagues] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadPublicLeagues() {
  const { data } = await supabase
    .from('leagues')
    .select('id, name, max_teams, start_race, end_race, season_type')
    .eq('is_public', true)
    .eq('status', 'setup')

  const leaguesWithCounts = await Promise.all(
    (data || []).map(async (league) => {
      const { data: memberCount, error } = await supabase
        .rpc('get_league_member_count', { p_league_id: league.id })

      return {
        ...league,
        member_count: error ? 0 : (memberCount ?? 0),
      }
    })
  )

  setPublicLeagues(leaguesWithCounts)
}

    loadPublicLeagues()
  }, [])

  const joinLeague = async (leagueId: string, isPrivate = false) => {
    setLoading(true)
    setError('')
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in')
      setLoading(false)
      return
    }

    if (!teamName.trim()) {
      setError('Please enter a team name')
      setLoading(false)
      return
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('league_members')
      .select('id')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      setError('You are already a member of this league')
      setLoading(false)
      return
    }

    // Check if league is full
    const { count } = await supabase
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', leagueId)

    const { data: league } = await supabase
      .from('leagues')
      .select('max_teams')
      .eq('id', leagueId)
      .single()

    if (count !== null && league && count >= league.max_teams) {
      setError('This league is full')
      setLoading(false)
      return
    }

    // Enforce max teams
const { data: leagueRow, error: leagueRowError } = await supabase
  .from('leagues')
  .select('id, max_teams')
  .eq('id', leagueId)
  .single()

if (leagueRowError || !leagueRow) {
  setError('League not found')
  setLoading(false)
  return
}

const maxTeams = leagueRow.max_teams ?? 0

const { count: memberCount, error: countError } = await supabase
  .from('league_members')
  .select('*', { count: 'exact', head: true })
  .eq('league_id', leagueId)

if (countError) {
  setError(countError.message)
  setLoading(false)
  return
}

if (!maxTeams || (memberCount || 0) >= maxTeams) {
  setError(`This league is full (${maxTeams || 0} teams max).`)
  setLoading(false)
  return
}

// Join
const { error: joinError } = await supabase
  .from('league_members')
  .insert({
    league_id: leagueId,
    user_id: user.id,
    team_name: teamName.trim()
  })

    if (joinError) {
      setError(joinError.message)
      setLoading(false)
      return
    }

    setMessage('Successfully joined the league!')
    setTimeout(() => {
      router.push(`/league/${leagueId}`)
    }, 1000)
  }

  const handleInviteCodeJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: league, error: findError } = await supabase
      .from('leagues')
      .select('id')
      .eq('invite_code', inviteCode.trim().toUpperCase())
      .maybeSingle()

    if (findError || !league) {
      setError('Invalid invite code')
      setLoading(false)
      return
    }

    await joinLeague(league.id, true)
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-md p-8 mb-8">
          <h1 className="text-2xl font-bold mb-6">Join a League</h1>

          {/* Team name (required for both methods) */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Your Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g. Speed Demons"
              required
            />
          </div>

          {/* Invite Code section */}
          <form onSubmit={handleInviteCodeJoin} className="mb-8">
            <h2 className="font-semibold mb-3">Join with Invite Code</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 uppercase"
                placeholder="Enter invite code"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </form>

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {message && <p className="text-green-600 text-sm mb-4">{message}</p>}

          {/* Public Leagues */}
          <div>
            <h2 className="font-semibold mb-3">Public Leagues</h2>
            {publicLeagues.length === 0 ? (
              <p className="text-gray-500 text-sm">No public leagues available right now.</p>
            ) : (
              <div className="space-y-3">
                {publicLeagues.map((league) => (
                  <div
                    key={league.id}
                    className="border rounded-lg p-4 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium">{league.name}</div>
                      <div className="text-sm text-gray-500">
					  Teams {league.member_count}/{league.max_teams}
					  {league.member_count >= league.max_teams
						? ' · Full'
						: ` · ${league.max_teams - league.member_count} open`}
					  {' '}· Races {league.start_race}–{league.end_race}
					</div>
                    </div>
                    <button
					  onClick={() => joinLeague(league.id)}
					  disabled={
						loading ||
						!teamName.trim() ||
						league.member_count >= league.max_teams
					  }
					  className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
					>
					  {league.member_count >= league.max_teams ? 'Full' : 'Join'}
					</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}