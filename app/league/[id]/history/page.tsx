'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

function HistoryContent() {
  const supabase = createClient()
  const params = useParams()
  const leagueId = params.id as string

  const [league, setLeague] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedHistoryRace, setSelectedHistoryRace] = useState<number | null>(null)
  const [myHistoryAssignment, setMyHistoryAssignment] = useState<any>(null)
  const [myHistorySubmission, setMyHistorySubmission] = useState<any>(null)
  const [historyRaceInfo, setHistoryRaceInfo] = useState<any>(null)
  const [historyDrivers, setHistoryDrivers] = useState<any[]>([])
  const [resultsAssignments, setResultsAssignments] = useState<any[]>([])
  const [allAssignments, setAllAssignments] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      const { data: leagueData } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', leagueId)
        .single()

      if (!leagueData) {
        setError('League not found')
        setLoading(false)
        return
      }
      setLeague(leagueData)

      const { data: membersData } = await supabase
        .from('league_members')
        .select('*, profiles(display_name, username)')
        .eq('league_id', leagueId)
      setMembers(membersData || [])

      const { data: allAssignData } = await supabase
        .from('assignments')
        .select('user_id, finish_position, points_earned, race_number')
        .eq('league_id', leagueId)
      setAllAssignments(allAssignData || [])

      const currentRace = leagueData.current_race || leagueData.start_race
      setSelectedHistoryRace(currentRace)
      await loadMyHistory(currentRace, user, leagueData)

      setLoading(false)
    }
    if (leagueId) load()
  }, [leagueId])

  const loadMyHistory = async (raceNum: number, user = currentUser, leagueData = league) => {
    if (!leagueId || !user) return

    const { data: raceData } = await supabase
      .from('races')
      .select('*')
      .eq('race_number', raceNum)
      .single()
    setHistoryRaceInfo(raceData)

    const { data: assignment } = await supabase
      .from('assignments')
      .select('*, drivers(name, car_number)')
      .eq('league_id', leagueId)
      .eq('race_number', raceNum)
      .eq('user_id', user.id)
      .maybeSingle()
    setMyHistoryAssignment(assignment)

    const { data: submission } = await supabase
      .from('submissions')
      .select('*')
      .eq('league_id', leagueId)
      .eq('race_number', raceNum)
      .eq('user_id', user.id)
      .maybeSingle()
    setMyHistorySubmission(submission)

    if (submission?.ranked_driver_ids?.length) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, name, car_number')
        .in('id', submission.ranked_driver_ids)

      const ordered = submission.ranked_driver_ids
        .map((id: number) => drivers?.find((d: any) => d.id === id))
        .filter(Boolean)
      setHistoryDrivers(ordered)
    } else {
      setHistoryDrivers([])
    }

    const { data: assignData } = await supabase
      .from('assignments')
      .select('*, drivers(name, car_number)')
      .eq('league_id', leagueId)
      .eq('race_number', raceNum)
    setResultsAssignments(assignData || [])

    setSelectedHistoryRace(raceNum)
  }

  const regularSeasonEnd = league?.regular_season_end || 26
const isChaseFormat = league?.scoring_format === 'chase'
const currentRaceNumForStandings = league?.current_race || league?.start_race || 1
const chaseFieldSize = league?.chase_teams || 16

const getChaseSeed = (rank: number) => {
  if (rank === 1) return 2100
  if (rank === 2) return 2075
  return 2065 - (rank - 3) * 5
}

const compareNASCARTiebreaker = (a: any, b: any) => {
  // 1. Points
  if (b.displayPoints !== a.displayPoints) {
    return b.displayPoints - a.displayPoints
  }

  // 2. Most wins, then most 2nds, then most 3rds, etc.
  for (let pos = 1; pos <= 40; pos++) {
    const aCount = a.finishCounts?.[pos] || 0
    const bCount = b.finishCounts?.[pos] || 0
    if (bCount !== aCount) {
      return bCount - aCount
    }
  }

  return 0 // still tied
}

const standings = (() => {
  const base = members.map(member => {
    const memberResults = allAssignments.filter(a => a.user_id === member.user_id)

	// Count each finishing position (1st, 2nd, 3rd, ...)
	const finishCounts: {[pos: number]: number} = {}
	memberResults.forEach(a => {
	  if (a.finish_position) {
		finishCounts[a.finish_position] = (finishCounts[a.finish_position] || 0) + 1
	  }
	})

	const wins = finishCounts[1] || 0
	const top5s = memberResults.filter(a => a.finish_position && a.finish_position <= 5).length
	const top10s = memberResults.filter(a => a.finish_position && a.finish_position <= 10).length

    const regularPoints = memberResults
      .filter(a => (a.race_number || 0) <= regularSeasonEnd)
      .reduce((sum, a) => sum + (a.points_earned || 0), 0)

    const chaseRacePoints = memberResults
      .filter(a => (a.race_number || 0) > regularSeasonEnd)
      .reduce((sum, a) => sum + (a.points_earned || 0), 0)

    const totalPoints = memberResults.reduce((sum, a) => sum + (a.points_earned || 0), 0)

    return {
	  ...member,
	  wins,
	  top5s,
	  top10s,
	  finishCounts,
	  regularPoints,
	  chaseRacePoints,
	  totalPoints,
	  inChase: false,
	  chaseSeed: 0,
	  displayPoints: totalPoints,
}
  })

  if (!isChaseFormat || currentRaceNumForStandings <= regularSeasonEnd) {
    return base
  .map(t => ({ ...t, displayPoints: t.totalPoints }))
  .sort(compareNASCARTiebreaker)
  }

  const byRegular = [...base].sort((a, b) => b.regularPoints - a.regularPoints)

  return byRegular
    .map((team, idx) => {
      const rank = idx + 1
      const inChase = rank <= chaseFieldSize
      const chaseSeed = inChase ? getChaseSeed(rank) : 0
      const displayPoints = inChase
        ? chaseSeed + team.chaseRacePoints
        : team.regularPoints

      return {
        ...team,
        inChase,
        chaseSeed,
        displayPoints,
      }
    })
    .sort((a, b) => {
	  // Chase teams always rank above non-Chase teams
	  if (a.inChase && !b.inChase) return -1
	  if (!a.inChase && b.inChase) return 1

	  // Within the same group, use NASCAR tiebreaker
	  return compareNASCARTiebreaker(a, b)
	})
})()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-lg">Loading...</p></div>
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-red-600 text-lg">{error}</p></div>
  }
const showStage3 =
  (historyRaceInfo?.name || '').toLowerCase().includes('coca-cola 600') ||
  (historyRaceInfo?.name || '').toLowerCase().includes('coca cola 600') ||
  ((historyRaceInfo?.track || '').toLowerCase().includes('charlotte') &&
    (historyRaceInfo?.name || '').toLowerCase().includes('600')) ||
  resultsAssignments.some((a: any) => (a.stage3_points || 0) > 0)
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link href={`/league/${leagueId}`} className="text-blue-600 hover:underline text-base">
            ← Back to League
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h1 className="text-2xl font-bold">Race History</h1>
            <select
              value={selectedHistoryRace || ''}
              onChange={(e) => loadMyHistory(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 text-base bg-white"
            >
              {Array.from(
                { length: (league?.current_race || league?.start_race || 1) - (league?.start_race || 1) + 1 },
                (_, i) => (league?.start_race || 1) + i
              ).map(raceNum => (
                <option key={raceNum} value={raceNum}>Race {raceNum}</option>
              ))}
            </select>
          </div>

          {selectedHistoryRace && (
            <div className="space-y-6">
              <p className="text-base text-gray-600 font-medium">
                {historyRaceInfo
                  ? `Race ${selectedHistoryRace} – ${historyRaceInfo.track || historyRaceInfo.name}`
                  : `Race ${selectedHistoryRace}`}
              </p>

              {/* Assigned Driver */}
              <div>
                <h2 className="font-semibold text-lg mb-1">Your Assigned Driver</h2>
                {myHistoryAssignment ? (
                  <p className="text-base">
                    {myHistoryAssignment.drivers?.car_number
                      ? `${myHistoryAssignment.drivers.car_number} - ${myHistoryAssignment.drivers.name}`
                      : myHistoryAssignment.drivers?.name || 'Unknown'}
                    <span className="ml-3 font-medium">
                      {myHistoryAssignment.points_earned || 0} pts
                    </span>
                  </p>
                ) : (
                  <p className="text-gray-500 text-base">No assignment for this race.</p>
                )}
              </div>

              {/* Ranked List */}
              <div>
                <h2 className="font-semibold text-lg mb-1">Your Ranked List</h2>
                {historyDrivers.length > 0 ? (
                  <ol className="list-decimal list-inside space-y-1 text-base">
                    {historyDrivers.map((d: any) => (
                      <li key={d.id}>
                        {d.car_number ? `${d.car_number} - ${d.name}` : d.name}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-gray-500 text-base">No ranked list submitted for this race.</p>
                )}
              </div>

              {/* Results */}
              <div>
                <h2 className="font-semibold text-lg mb-2">Results</h2>
                {resultsAssignments.filter(a => a.finish_position).length === 0 ? (
                  <p className="text-gray-500 text-base">No results entered yet.</p>
                ) : (
                  <table className="w-full text-base">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
					  <th className="pb-2 pr-3">Pos</th>
					  <th className="pb-2 pr-4">Team</th>
					  <th className="pb-2 pr-4">Driver</th>
					  <th className="pb-2 pr-3 text-right">S1</th>
					  <th className="pb-2 pr-3 text-right">S2</th>
					  {showStage3 && <th className="pb-2 pr-3 text-right">S3</th>}
					  <th className="pb-2 text-right">Pts</th>
					</tr>
                    </thead>
                    <tbody>
                      {[...resultsAssignments]
                        .filter(a => a.finish_position)
                        .sort((a, b) => (a.finish_position || 99) - (b.finish_position || 99))
                        .map((a) => {
                          const member = members.find(m => m.user_id === a.user_id)
                          return (
                            <tr key={a.id} className="border-b last:border-0">
                              <td className="py-2 pr-3 font-mono text-gray-500">{a.finish_position}</td>
                              <td className="py-2 pr-4 font-medium">{member?.team_name || 'Unknown'}</td>
                              <td className="py-2 pr-4">
                                {a.drivers?.car_number ? `${a.drivers.car_number} - ${a.drivers.name}` : a.drivers?.name}
                              </td>
                              <td className="py-2 pr-3 text-right">{a.stage1_points || 0}</td>
							  <td className="py-2 pr-3 text-right">{a.stage2_points || 0}</td>
							  {showStage3 && (
							  <td className="py-2 pr-3 text-right">{a.stage3_points || 0}</td>
							  )}
							  <td className="py-2 text-right font-bold">{a.points_earned || 0}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Point Standings */}
              <div>
                <h2 className="font-semibold text-lg mb-2">Point Standings</h2>
                <table className="w-full text-base">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2 pr-4">Team</th>
                      <th className="pb-2 pr-4 text-right">Pts</th>
                      <th className="pb-2 pr-4 text-right">Wins</th>
                      <th className="pb-2 pr-4 text-right">Top 5</th>
                      <th className="pb-2 text-right">Top 10</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s, idx) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2 pr-2 text-gray-400">{idx + 1}</td>
                        <td className="py-2 pr-4 font-medium">
						  {s.team_name}
						  {isChaseFormat && currentRaceNumForStandings > regularSeasonEnd && s.inChase && (
							<span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
							  Chase
							</span>
						  )}
						</td>
                        <td className="py-2 pr-4 text-right font-bold">{s.displayPoints}</td>
                        <td className="py-2 pr-4 text-right">{s.wins}</td>
                        <td className="py-2 pr-4 text-right">{s.top5s}</td>
                        <td className="py-2 text-right">{s.top10s}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <HistoryContent />
    </Suspense>
  )
}