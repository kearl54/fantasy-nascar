'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

function LeagueContent() {
  const supabase = createClient()
  const params = useParams()
  const leagueId = params.id as string

  const [league, setLeague] = useState<any>(null)
  const [raceInfo, setRaceInfo] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [pickOrder, setPickOrder] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [allAssignments, setAllAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [orderedMembers, setOrderedMembers] = useState<any[]>([])

  const [finishInput, setFinishInput] = useState<{[key: string]: string}>({})
  const [stageInput, setStageInput] = useState<{[key: string]: string}>({})
  const [fastestLapInput, setFastestLapInput] = useState<{[key: string]: boolean}>({})

  const [selectedResultsRace, setSelectedResultsRace] = useState<number | null>(null)
  const [resultsAssignments, setResultsAssignments] = useState<any[]>([])
  const [resultsRaceInfo, setResultsRaceInfo] = useState<any>(null)
  
  const [selectedHistoryRace, setSelectedHistoryRace] = useState<number | null>(null)
  const [myHistoryAssignment, setMyHistoryAssignment] = useState<any>(null)
  const [myHistorySubmission, setMyHistorySubmission] = useState<any>(null)
  const [historyRaceInfo, setHistoryRaceInfo] = useState<any>(null)
  const [historyDrivers, setHistoryDrivers] = useState<any[]>([])

  const [membersOpen, setMembersOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  
  const [endingSeason, setEndingSeason] = useState(false)
  
  const [myTeamName, setMyTeamName] = useState('')
  const [editingTeamName, setEditingTeamName] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')

  const getFinishPoints = (pos: number): number => {
    if (pos === 1) return 55
    if (pos >= 2 && pos <= 35) return 37 - pos
    if (pos >= 36 && pos <= 40) return 1
    return 0
  }

  const loadData = async () => {
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
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

    if (user && leagueData.commissioner_id === user.id) {
      setIsCommissioner(true)
    }

    const currentRace = leagueData.current_race || leagueData.start_race

    const { data: raceData } = await supabase
      .from('races')
      .select('*')
      .eq('race_number', currentRace)
      .single()
    setRaceInfo(raceData)

    const { data: membersData } = await supabase
      .from('league_members')
      .select('*, profiles(display_name, username)')
      .eq('league_id', leagueId)

    const membersList = membersData || []
    setMembers(membersList)
    setOrderedMembers([...membersList])
	
	if (user) {
  const myMember = membersList.find((m: any) => m.user_id === user.id)
  if (myMember) {
    setMyTeamName(myMember.team_name || '')
    setNewTeamName(myMember.team_name || '')
  }
}

    const { data: orderData } = await supabase
      .from('pick_orders')
      .select('*')
      .eq('league_id', leagueId)
      .eq('race_number', currentRace)
      .order('pick_position')

    setPickOrder(orderData || [])

    const { data: assignData } = await supabase
      .from('assignments')
      .select('*, drivers(name, car_number)')
      .eq('league_id', leagueId)
      .eq('race_number', currentRace)

    setAssignments(assignData || [])

    const { data: allAssignData } = await supabase
      .from('assignments')
      .select('user_id, finish_position, points_earned, race_number')
      .eq('league_id', leagueId)

    setAllAssignments(allAssignData || [])

    setSelectedResultsRace(currentRace)
    setResultsAssignments(assignData || [])
    setResultsRaceInfo(raceData)
	
	setSelectedHistoryRace(currentRace)

    const f: {[key: string]: string} = {}
    const s: {[key: string]: string} = {}
    const fl: {[key: string]: boolean} = {}
    ;(assignData || []).forEach((a: any) => {
      f[a.id] = a.finish_position ? String(a.finish_position) : ''
      s[a.id] = a.stage_points ? String(a.stage_points) : '0'
      fl[a.id] = false
    })
    setFinishInput(f)
    setStageInput(s)
    setFastestLapInput(fl)

    setLoading(false)
  }
  

  const loadResultsForRace = async (raceNum: number) => {
    if (!leagueId) return

    const { data: raceData } = await supabase
      .from('races')
      .select('*')
      .eq('race_number', raceNum)
      .single()
    setResultsRaceInfo(raceData)

    const { data: assignData } = await supabase
      .from('assignments')
      .select('*, drivers(name, car_number)')
      .eq('league_id', leagueId)
      .eq('race_number', raceNum)

    setResultsAssignments(assignData || [])
    setSelectedResultsRace(raceNum)
  }

const loadMyHistory = async (raceNum: number) => {
  if (!leagueId || !currentUser) return

  const { data: raceData } = await supabase
    .from('races')
    .select('*')
    .eq('race_number', raceNum)
    .single()
  setHistoryRaceInfo(raceData)

  // Get the player's assignment for this race
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, drivers(name, car_number)')
    .eq('league_id', leagueId)
    .eq('race_number', raceNum)
    .eq('user_id', currentUser.id)
    .maybeSingle()

  setMyHistoryAssignment(assignment)

  // Get the player's submission (ranked list) for this race
  const { data: submission } = await supabase
    .from('submissions')
    .select('*')
    .eq('league_id', leagueId)
    .eq('race_number', raceNum)
    .eq('user_id', currentUser.id)
    .maybeSingle()

  setMyHistorySubmission(submission)

  // Load driver names for the ranked list
  if (submission?.ranked_driver_ids?.length) {
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, name, car_number')
      .in('id', submission.ranked_driver_ids)

    // Keep the original ranked order
    const ordered = submission.ranked_driver_ids.map((id: number) =>
      drivers?.find((d: any) => d.id === id)
    ).filter(Boolean)

    setHistoryDrivers(ordered)
  } else {
    setHistoryDrivers([])
  }

// Add this at the end of loadMyHistory, before setSelectedHistoryRace
const { data: assignData } = await supabase
  .from('assignments')
  .select('*, drivers(name, car_number)')
  .eq('league_id', leagueId)
  .eq('race_number', raceNum)

setResultsAssignments(assignData || [])

  setSelectedHistoryRace(raceNum)
}

  useEffect(() => {
    if (leagueId) loadData()
  }, [leagueId])

  const savePickOrder = async (orderedList: any[]) => {
    if (!league) return
    setMessage('')
    setError('')

    const currentRace = league.current_race || league.start_race

    await supabase
      .from('pick_orders')
      .delete()
      .eq('league_id', leagueId)
      .eq('race_number', currentRace)

    const rows = orderedList.map((member, index) => ({
      league_id: leagueId,
      race_number: currentRace,
      user_id: member.user_id,
      pick_position: index + 1
    }))

    const { error: insertError } = await supabase.from('pick_orders').insert(rows)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setPickOrder(rows)
    setMessage('Pick order saved successfully!')
  }

  const handleRandomize = () => {
    const shuffled = [...members].sort(() => Math.random() - 0.5)
    setOrderedMembers(shuffled)
    savePickOrder(shuffled)
  }

  const handleManualSave = () => savePickOrder(orderedMembers)

  const moveMember = (index: number, direction: 'up' | 'down') => {
    const newList = [...orderedMembers]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newList.length) return
    ;[newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]]
    setOrderedMembers(newList)
  }

  const processAssignments = async () => {
    if (!league || !isCommissioner) return
    setProcessing(true)
    setError('')
    setMessage('')

    try {
      const raceNumber = league.current_race || league.start_race

      const { data: order } = await supabase
        .from('pick_orders')
        .select('*')
        .eq('league_id', leagueId)
        .eq('race_number', raceNumber)
        .order('pick_position')

       if (!order || order.length === 0) {
         setError('No pick order set.')
         setProcessing(false)
         return
       }
	  
		  const clearAssignments = async () => {
    if (!league || !isCommissioner) return
    if (!confirm('Are you sure you want to clear all assignments for the current race? This cannot be undone.')) return

    setProcessing(true)
    setError('')
    setMessage('')

    const raceNumber = league.current_race || league.start_race

    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('league_id', leagueId)
      .eq('race_number', raceNumber)

    if (error) {
      setError(error.message)
    } else {
      setAssignments([])
      setMessage('Assignments cleared. You can now process picks again.')
    }

    setProcessing(false)
  }

      const { data: submissions } = await supabase
        .from('submissions')
        .select('*')
        .eq('league_id', leagueId)
        .eq('race_number', raceNumber)

      const submissionMap = new Map()
      ;(submissions || []).forEach((s: any) => submissionMap.set(s.user_id, s.ranked_driver_ids || []))

      const { data: allDrivers } = await supabase.from('drivers').select('*').eq('is_active', true)
      const availableDriverIds = new Set((allDrivers || []).map((d: any) => d.id))
      const finalAssignments: any[] = []
      const nonSubmitters: any[] = []

      for (const po of order) {
        const rankedIds: number[] = submissionMap.get(po.user_id) || []
        if (rankedIds.length === 0) {
          nonSubmitters.push(po)
          continue
        }

        let assignedDriverId: number | null = null
        for (const driverId of rankedIds) {
          if (availableDriverIds.has(driverId)) {
            assignedDriverId = driverId
            availableDriverIds.delete(driverId)
            break
          }
        }

        if (assignedDriverId) {
          finalAssignments.push({
            league_id: leagueId,
            race_number: raceNumber,
            user_id: po.user_id,
            driver_id: assignedDriverId,
            points_earned: 0
          })
        } else {
          nonSubmitters.push(po)
        }
      }

      const remainingDrivers = (allDrivers || [])
  .filter((d: any) => availableDriverIds.has(d.id))
  .sort((a: any, b: any) => {
    // Lower standings_rank = higher in Cup points (1 is best)
    const rankA = a.standings_rank ?? 9999
    const rankB = b.standings_rank ?? 9999
    return rankA - rankB
  })

      nonSubmitters.forEach((po, idx) => {
        if (remainingDrivers[idx]) {
          finalAssignments.push({
            league_id: leagueId,
            race_number: raceNumber,
            user_id: po.user_id,
            driver_id: remainingDrivers[idx].id,
            points_earned: 0
          })
        }
      })

      await supabase.from('assignments').delete().eq('league_id', leagueId).eq('race_number', raceNumber)

      if (finalAssignments.length > 0) {
        const { error: insertError } = await supabase.from('assignments').insert(finalAssignments)
        if (insertError) {
          setError(insertError.message)
          setProcessing(false)
          return
        }
      }

      await loadData()
      setMessage(`Assigned drivers to ${finalAssignments.length} teams!`)
    } catch (err: any) {
      setError(err.message || 'Processing failed')
    }
    setProcessing(false)
  }
  
    const saveTeamName = async () => {
    if (!currentUser || !newTeamName.trim()) return

    const { error } = await supabase
      .from('league_members')
      .update({ team_name: newTeamName.trim() })
      .eq('league_id', leagueId)
      .eq('user_id', currentUser.id)

    if (error) {
      setError(error.message)
    } else {
      setMyTeamName(newTeamName.trim())
      setEditingTeamName(false)
      // Refresh members so the name updates everywhere
      const { data: membersData } = await supabase
        .from('league_members')
        .select('*, profiles(display_name, username)')
        .eq('league_id', leagueId)
      setMembers(membersData || [])
    }
  }

  const importResults = async () => {
    if (!league || !isCommissioner) return
    setImporting(true)
    setError('')
    setMessage('')

    try {
      const raceNumber = league.current_race || league.start_race

      const res = await fetch('/api/import-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, raceNumber })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Import failed')
        setImporting(false)
        return
      }

      if (!data.results || data.results.length === 0) {
        setError('No results returned from the data source')
        setImporting(false)
        return
      }

      const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, '')

let updatedCount = 0

for (const assignment of assignments) {
  const driverName = assignment.drivers?.name || ''
  const carNumber = String(assignment.drivers?.car_number || '').trim()
  if (!driverName && !carNumber) continue

  const match = data.results.find((r: any) => {
    // Prefer car number match when available
    if (carNumber && r.car && String(r.car).trim() === carNumber) {
      return true
    }

    const official = normalize(r.driver || '')
    const ours = normalize(driverName)
    return (
      official === ours ||
      official.includes(ours) ||
      ours.includes(official)
    )
  })

  if (match) {
    const { error } = await supabase
      .from('assignments')
      .update({
  points_earned: match.points,
  finish_position: match.finish || null,
  stage_points: match.stagePoints || 0,
  stage1_points: match.stage1 || 0,
  stage2_points: match.stage2 || 0,
  stage3_points: match.stage3 || 0,
})
      .eq('id', assignment.id)

    if (!error) updatedCount++
  }
}

      await loadData()
      setMessage(`Imported official results! Updated ${updatedCount} teams.`)
    } catch (err: any) {
      setError(err.message || 'Import failed')
    }

    setImporting(false)
  }

  const calculateAndSavePoints = async () => {
    if (!isCommissioner) return
    setScoring(true)
    setError('')
    setMessage('')

    try {
      for (const assignment of assignments) {
        const finishPos = parseInt(finishInput[assignment.id] || '0', 10)
        const stagePts = parseInt(stageInput[assignment.id] || '0', 10)
        const hasFastest = fastestLapInput[assignment.id] || false

        if (isNaN(finishPos) || finishPos < 1 || finishPos > 40) continue

        const finishPts = getFinishPoints(finishPos)
        const total = finishPts + (isNaN(stagePts) ? 0 : stagePts) + (hasFastest ? 1 : 0)

        await supabase
          .from('assignments')
          .update({ 
            points_earned: total,
            finish_position: finishPos,
            stage_points: isNaN(stagePts) ? 0 : stagePts
          })
          .eq('id', assignment.id)
      }

      await loadData()
      setMessage('Points and finish positions saved successfully!')
    } catch (err: any) {
      setError(err.message || 'Failed to save points')
    }

    setScoring(false)
  }
  const clearAssignments = async () => {
    if (!league || !isCommissioner) return
    if (!confirm('Are you sure you want to clear all assignments for the current race? This cannot be undone.')) return

    setProcessing(true)
    setError('')
    setMessage('')

    const raceNumber = league.current_race || league.start_race

    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('league_id', leagueId)
      .eq('race_number', raceNumber)

    if (error) {
      setError(error.message)
    } else {
      setAssignments([])
      setMessage('Assignments cleared. You can now process picks again.')
    }

    setProcessing(false)
  }
  

	const endSeason = async () => {
	  if (!league || !isCommissioner) return
	  if (!seasonComplete) {
		setError('Season is not complete yet. Enter results for the final race first.')
		return
	  }
	  if (
		!confirm(
		  'End this season? Final standings will be saved and the league will be locked until you start a new season.'
		)
	  ) {
		return
	  }

	  setEndingSeason(true)
	  setError('')
	  setMessage('')

	  try {
		const finalStandings = standings.map((s: any, idx: number) => ({
		  place: idx + 1,
		  user_id: s.user_id || s.id,
		  team_name: s.team_name,
		  points: s.displayPoints ?? s.totalPoints ?? 0,
		  wins: s.wins ?? 0,
		  top5s: s.top5s ?? 0,
		  top10s: s.top10s ?? 0,
		  inChase: s.inChase ?? false,
		}))

		const { error: historyError } = await supabase
		  .from('season_history')
		  .insert({
			league_id: leagueId,
			season_year: league.season_year || 2026,
			end_race: league.end_race || 36,
			standings: finalStandings,
		  })

		if (historyError) {
		  setError(historyError.message)
		  setEndingSeason(false)
		  return
		}

		const { error: leagueError } = await supabase
		  .from('leagues')
		  .update({ status: 'completed' })
		  .eq('id', leagueId)

		if (leagueError) {
		  setError(leagueError.message)
		  setEndingSeason(false)
		  return
		}

		setLeague({ ...league, status: 'completed' })
		setMessage('Season ended. Champion and final standings have been saved.')
	  } catch (err: any) {
		setError(err.message || 'Failed to end season')
	  }

	  setEndingSeason(false)
	}


  const advanceToNextRace = async () => {
    if (!league || !isCommissioner) return
    setAdvancing(true)
    setError('')
    setMessage('')

    try {
      const currentRace = league.current_race || league.start_race
      const nextRace = currentRace + 1

      if (nextRace > league.end_race) {
        setError('This is the final race of the season. Cannot advance further.')
        setAdvancing(false)
        return
      }

      const { data: currentResults } = await supabase
        .from('assignments')
        .select('user_id, finish_position')
        .eq('league_id', leagueId)
        .eq('race_number', currentRace)
        .not('finish_position', 'is', null)
        .order('finish_position')

      if (!currentResults || currentResults.length === 0) {
        setError('No finish positions found for the current race. Please enter results first.')
        setAdvancing(false)
        return
      }

      const newOrder = currentResults.map((r, index) => ({
        league_id: leagueId,
        race_number: nextRace,
        user_id: r.user_id,
        pick_position: index + 1
      }))

      await supabase
        .from('pick_orders')
        .delete()
        .eq('league_id', leagueId)
        .eq('race_number', nextRace)

      const { error: orderError } = await supabase
        .from('pick_orders')
        .insert(newOrder)

      if (orderError) {
        setError(orderError.message)
        setAdvancing(false)
        return
      }

      const { error: leagueError } = await supabase
        .from('leagues')
        .update({ current_race: nextRace })
        .eq('id', leagueId)

      if (leagueError) {
        setError(leagueError.message)
        setAdvancing(false)
        return
      }

      await loadData()
      setMessage(`Advanced to Race ${nextRace}! New pick order has been set based on previous results.`)
    } catch (err: any) {
      setError(err.message || 'Failed to advance race')
    }

    setAdvancing(false)
  }

  const regularSeasonEnd = league?.regular_season_end || 26
const isChaseFormat = league?.scoring_format === 'chase'
const currentRaceNumForStandings = league?.current_race || league?.start_race || 1
const chaseFieldSize = league?.chase_teams || 16

// Official Chase seed values (1st gets 2100, then 2075, then -5 each)
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

  // Full season, or still in regular season
  if (!isChaseFormat || currentRaceNumForStandings <= regularSeasonEnd) {
    return base
  .map(t => ({ ...t, displayPoints: t.totalPoints }))
  .sort(compareNASCARTiebreaker)
  }

  // Chase is active: seed top N by regular-season points
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

  const endRace = league?.end_race || 36

  const finalRaceResultsCount = (allAssignments || assignments || []).filter(
  (a: any) =>
    (a.race_number === endRace || currentRaceNumForStandings >= endRace) &&
    a.finish_position
  ).length

  const seasonComplete =
  !!league &&
  currentRaceNumForStandings >= endRace &&
  finalRaceResultsCount > 0 &&
  members.length > 0

  const podium = seasonComplete ? standings.slice(0, 3) : []

  const leagueLocked = league?.status === 'completed'

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-lg">Loading league...</p></div>
  }

  if (error && !league) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-red-600 text-lg">{error}</p></div>
  }

  const currentRaceNum = league.current_race || league.start_race
  const raceLabel = raceInfo
    ? `Race ${currentRaceNum} – ${raceInfo.track || raceInfo.name}`
    : `Race ${currentRaceNum}`

  const showStage3 =
    (resultsRaceInfo?.name || '').toLowerCase().includes('coca-cola 600') ||
    (resultsRaceInfo?.name || '').toLowerCase().includes('coca cola 600') ||
    ((resultsRaceInfo?.track || '').toLowerCase().includes('charlotte') &&
      (resultsRaceInfo?.name || '').toLowerCase().includes('600')) ||
    resultsAssignments.some((a: any) => (a.stage3_points || 0) > 0)

    return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">

        <div>
          <Link href="/" className="text-blue-600 hover:underline text-base">← Back to Home</Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
  <h1 className="text-3xl font-bold text-gray-900">{league.name}</h1>
  
  {myTeamName && (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {editingTeamName ? (
        <>
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-base"
            maxLength={30}
          />
          <button
            onClick={saveTeamName}
            className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm"
          >
            Save
          </button>
          <button
            onClick={() => {
              setEditingTeamName(false)
              setNewTeamName(myTeamName)
            }}
            className="bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <p className="text-base text-gray-600">
            Your team: <span className="font-semibold text-gray-900">{myTeamName}</span>
          </p>
          <button
            onClick={() => setEditingTeamName(true)}
            className="text-blue-600 text-sm hover:underline"
          >
            Edit
          </button>
        </>
      )}
    </div>
  )}

  <p className="text-gray-500 text-base mt-1">
    {league.is_public ? 'Public League' : 'Private League'}
    {league.invite_code && isCommissioner && (
      <span className="ml-2 font-mono bg-gray-100 px-2 py-0.5 rounded text-sm">
        Invite: {league.invite_code}
      </span>
    )}
  </p>
</div>
            <div className="text-base text-gray-600 space-y-1">
              <div><span className="font-medium">Teams:</span> {members.length} / {league.max_teams}</div>
              <div><span className="font-medium">Current:</span> {raceLabel}</div>
            </div>
                    </div>
        </div>

{seasonComplete && podium.length > 0 && (
  <div className="bg-gradient-to-b from-amber-50 to-white rounded-2xl shadow-sm border border-amber-200 p-6 mb-6">
    <h2 className="text-2xl font-bold text-center text-amber-900 mb-1">
      Season Complete
    </h2>
    <p className="text-center text-gray-600 mb-6">
      Final standings · Race {endRace}
    </p>

    <div className="flex flex-col sm:flex-row items-end justify-center gap-4">
      {podium[1] && (
        <div className="order-2 sm:order-1 flex-1 max-w-[180px] mx-auto text-center">
          <div className="text-4xl mb-2">🥈</div>
          <div className="bg-gray-100 rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">2nd</p>
            <p className="font-bold text-lg leading-tight mt-1">
              {podium[1].team_name}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {podium[1].displayPoints ?? podium[1].totalPoints} pts
            </p>
          </div>
        </div>
      )}

      {podium[0] && (
        <div className="order-1 sm:order-2 flex-1 max-w-[200px] mx-auto text-center">
          <div className="text-5xl mb-2">🏆</div>
          <div className="bg-amber-100 rounded-xl p-5 border-2 border-amber-400 shadow-md">
            <p className="text-xs font-semibold text-amber-700 uppercase">Champion</p>
            <p className="font-bold text-xl leading-tight mt-1">
              {podium[0].team_name}
            </p>
            <p className="text-sm text-amber-900 mt-1 font-medium">
              {podium[0].displayPoints ?? podium[0].totalPoints} pts
            </p>
          </div>
        </div>
      )}

      {podium[2] && (
        <div className="order-3 flex-1 max-w-[180px] mx-auto text-center">
          <div className="text-4xl mb-2">🥉</div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <p className="text-xs font-semibold text-orange-700 uppercase">3rd</p>
            <p className="font-bold text-lg leading-tight mt-1">
              {podium[2].team_name}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {podium[2].displayPoints ?? podium[2].totalPoints} pts
            </p>
          </div>
        </div>
      )}
    </div>
  </div>
)}

{leagueLocked && (
  <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
    <p className="font-medium">Season complete — league locked</p>
    <p className="text-sm">
      Picks and advances are disabled until a new season starts.
    </p>
  </div>
)}

		{/* Navigation links */}
<div className="flex flex-wrap gap-3">
  <Link
    href={`/league/${leagueId}/history`}
    className="inline-block bg-gray-600 text-white px-5 py-2.5 rounded-xl text-base font-medium hover:bg-gray-700"
  >
    Race History
  </Link>
  {!leagueLocked && (
    <Link
      href={`/league/${leagueId}/submit`}
      className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-xl text-base font-medium hover:bg-blue-700"
    >
      Submit Picks
    </Link>
  )}
</div>

        {/* 1. Pick Order */}
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h2 className="text-xl font-bold mb-4">Pick Order – {raceLabel}</h2>
          {pickOrder.length === 0 ? (
            <p className="text-gray-500 text-base">No pick order set yet.</p>
          ) : (
            <ol className="list-decimal list-inside space-y-2 text-base">
              {pickOrder.map((po) => {
                const member = members.find(m => m.user_id === po.user_id)
                return <li key={po.user_id}>{member?.team_name || 'Unknown'}</li>
              })}
            </ol>
          )}

          <div className="mt-6 text-center">
            <Link
              href={`/league/${leagueId}/submit`}
              className="inline-block bg-blue-600 text-white px-8 py-3 rounded-xl text-base font-medium hover:bg-blue-700"
            >
              Submit Picks for {raceLabel}
            </Link>
          </div>
        </div>

        {/* 2. Pick List */}
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h2 className="text-xl font-bold mb-4">Pick List – {raceLabel}</h2>
          {assignments.length === 0 ? (
            <p className="text-gray-500 text-base">No drivers assigned yet.</p>
          ) : (
            <div className="space-y-3">
              {[...assignments]
                .sort((a, b) => {
                  const posA = pickOrder.find(po => po.user_id === a.user_id)?.pick_position ?? 999
                  const posB = pickOrder.find(po => po.user_id === b.user_id)?.pick_position ?? 999
                  return posA - posB
               })
               .map((a) => {
                 const member = members.find(m => m.user_id === a.user_id)
                 return (
                   <div key={a.id} className="flex justify-between items-center py-2 border-b last:border-0">
                     <div>
                       <div className="font-medium text-base">{member?.team_name || 'Unknown'}</div>
                       <div className="text-base text-gray-500">
                         {a.drivers?.car_number ? `${a.drivers.car_number} - ${a.drivers.name}` : a.drivers?.name}
                     </div>
                   </div>
                   <div className="font-semibold text-base">{a.points_earned || 0} pts</div>
                 </div>
               )
             })}
            </div>
          )}
        </div>

        {/* 3. Results */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 overflow-x-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold">
              Results – {resultsRaceInfo
                ? `Race ${selectedResultsRace} – ${resultsRaceInfo.track || resultsRaceInfo.name}`
                : `Race ${selectedResultsRace}`}
            </h2>
            <select
              value={selectedResultsRace || ''}
              onChange={(e) => loadResultsForRace(Number(e.target.value))}
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

          {resultsAssignments.filter(a => a.finish_position).length === 0 ? (
            <p className="text-gray-500 text-base">No results entered yet for this race.</p>
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
                        <td className="py-2.5 pr-3 font-mono text-gray-500">{a.finish_position}</td>
                        <td className="py-2.5 pr-4 font-medium">{member?.team_name || 'Unknown'}</td>
                        <td className="py-2.5 pr-4">
                          {a.drivers?.car_number ? `${a.drivers.car_number} - ${a.drivers.name}` : a.drivers?.name}
                        </td>
                        <td className="py-2.5 pr-3 text-right">{a.stage1_points || 0}</td>
						<td className="py-2.5 pr-3 text-right">{a.stage2_points || 0}</td>
						{showStage3 && (
						  <td className="py-2.5 pr-3 text-right">{a.stage3_points || 0}</td>
						)}
						<td className="py-2.5 text-right font-bold">{a.points_earned || 0}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
        </div>

        {/* 4. Point Standings */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 overflow-x-auto">
          <h2 className="text-xl font-bold mb-4">Point Standings</h2>
          <table className="w-full text-base">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 w-8">#</th>
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
                  <td className="py-2.5 pr-2 text-gray-400">{idx + 1}</td>
                  <td className="py-2.5 pr-4 font-medium">
				   {s.team_name}
				   {isChaseFormat && currentRaceNumForStandings > regularSeasonEnd && s.inChase && (
					 <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
					   Chase
					 </span>
				   )}
				</td>
                  <td className="py-2.5 pr-4 text-right font-bold">{s.displayPoints}</td>
                  <td className="py-2.5 pr-4 text-right">{s.wins}</td>
                  <td className="py-2.5 pr-4 text-right">{s.top5s}</td>
                  <td className="py-2.5 text-right">{s.top10s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 5. Members */}
<div className="bg-white rounded-2xl shadow-sm border p-6">
  <button
    onClick={() => setMembersOpen(!membersOpen)}
    className="w-full flex items-center justify-between text-left"
  >
    <h2 className="text-xl font-bold">Members ({members.length})</h2>
    <span className="text-2xl text-gray-400">
      {membersOpen ? '−' : '+'}
    </span>
  </button>

  {membersOpen && (
    <ul className="space-y-2 text-base mt-4">
      {members.map((m) => (
        <li key={m.id} className="flex justify-between">
          <span className="font-medium">{m.team_name}</span>
          {isCommissioner && (
            <span className="text-gray-400">{m.profiles?.display_name || m.profiles?.username}</span>
          )}
        </li>
      ))}
    </ul>
  )}
</div>
	

        {/* 6. Commissioner Tools */}
 {isCommissioner && (
  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-6">
    <button
      type="button"
      onClick={() => setToolsOpen(!toolsOpen)}
      className="w-full flex items-center justify-between text-left"
    >
      <h2 className="text-xl font-bold text-amber-900">Commissioner Tools</h2>
      <span className="text-2xl text-amber-700">
        {toolsOpen ? '−' : '+'}
      </span>
    </button>

    {toolsOpen && (
      <div className="space-y-6">
        {message && (
          <p className="text-green-700 text-base mt-2">{message}</p>
        )}
        {error && (
          <p className="text-red-600 text-base mt-2">{error}</p>
        )}

        <div>
          <h3 className="font-semibold text-base mb-3">Enter Results & Points</h3>
          <div className="space-y-4">
            {assignments.map((a) => {
              const member = members.find((m) => m.user_id === a.user_id)
              const finishPos = parseInt(finishInput[a.id] || '0', 10)
              const previewPts =
                finishPos >= 1 && finishPos <= 40
                  ? getFinishPoints(finishPos) +
                    (parseInt(stageInput[a.id] || '0') || 0) +
                    (fastestLapInput[a.id] ? 1 : 0)
                  : a.points_earned || 0
              return (
                <div key={a.id} className="bg-white rounded-xl p-4 border">
                  <div className="flex justify-between mb-3">
                    <div>
                      <div className="font-medium text-base">
                        {member?.team_name}
                      </div>
                      <div className="text-base text-gray-500">
                        {a.drivers?.car_number
                          ? `${a.drivers.car_number} - ${a.drivers.name}`
                          : a.drivers?.name}
                      </div>
                    </div>
                    <div className="font-bold text-base">{previewPts} pts</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">
                        Finish
                      </label>
                      <select
                        value={finishInput[a.id] || ''}
                        onChange={(e) =>
                          setFinishInput({
                            ...finishInput,
                            [a.id]: e.target.value,
                          })
                        }
                        className="w-full border rounded-lg px-2 py-2 text-base"
                      >
                        <option value="">Select...</option>
                        {Array.from({ length: 40 }, (_, i) => i + 1).map(
                          (pos) => (
                            <option key={pos} value={pos}>
                              {pos}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">
                        Stage Pts
                      </label>
                      <select
                        value={stageInput[a.id] || '0'}
                        onChange={(e) =>
                          setStageInput({
                            ...stageInput,
                            [a.id]: e.target.value,
                          })
                        }
                        className="w-full border rounded-lg px-2 py-2 text-base"
                      >
                        {Array.from({ length: 21 }, (_, i) => i).map((pts) => (
                          <option key={pts} value={pts}>
                            {pts}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-base">
                        <input
                          type="checkbox"
                          checked={fastestLapInput[a.id] || false}
                          onChange={(e) =>
                            setFastestLapInput({
                              ...fastestLapInput,
                              [a.id]: e.target.checked,
                            })
                          }
                        />
                        Fastest Lap
                      </label>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={calculateAndSavePoints}
              disabled={scoring || leagueLocked}
              className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-base font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {scoring ? 'Saving...' : 'Calculate & Save Points'}
            </button>
            <button
              onClick={importResults}
              disabled={importing || leagueLocked}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-base font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import Official Results'}
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-amber-200">
          <h3 className="font-semibold text-base mb-3">Set Pick Order</h3>
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleRandomize}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-base"
            >
              Randomize
            </button>
            <button
              onClick={handleManualSave}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-base"
            >
              Save Order
            </button>
          </div>
          <ul className="space-y-2">
            {orderedMembers.map((member, index) => (
              <li
                key={member.id}
                className="flex items-center gap-2 bg-white p-2.5 rounded-lg border text-base"
              >
                <span className="w-6 text-gray-400">{index + 1}.</span>
                <span className="flex-1">{member.team_name}</span>
                <button
                  onClick={() => moveMember(index, 'up')}
                  disabled={index === 0}
                  className="px-2 py-1 bg-gray-100 rounded disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveMember(index, 'down')}
                  disabled={index === orderedMembers.length - 1}
                  className="px-2 py-1 bg-gray-100 rounded disabled:opacity-40"
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
                </div>

        {seasonComplete && league?.status !== 'completed' && (
          <div className="pt-4 border-t border-amber-200">
            <h3 className="font-semibold text-base mb-3">End Season</h3>
            <p className="text-sm text-gray-600 mb-3">
              Save final standings and lock the league. You can start a new season later.
            </p>
            <button
              onClick={endSeason}
              disabled={endingSeason}
              className="bg-amber-700 text-white px-5 py-2.5 rounded-lg text-base font-medium hover:bg-amber-800 disabled:opacity-50"
            >
              {endingSeason ? 'Ending Season...' : 'End Season & Lock League'}
            </button>
          </div>
        )}

        {league?.status === 'completed' && (
          <div className="pt-4 border-t border-amber-200">
            <p className="text-amber-900 font-medium">
              This season is complete. League is locked.
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-amber-200 flex flex-wrap gap-3">
		  <button
			onClick={processAssignments}
			disabled={processing || leagueLocked}
			className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-base font-medium disabled:opacity-50"
		  >
			{processing ? 'Processing...' : 'Process Picks & Assign Drivers'}
		  </button>
		  <button
			onClick={clearAssignments}
			disabled={processing || leagueLocked}
			className="bg-gray-600 text-white px-5 py-2.5 rounded-lg text-base font-medium hover:bg-gray-700 disabled:opacity-50"
		  >
			Clear Assignments
		  </button>
		  <button
			onClick={advanceToNextRace}
			disabled={advancing || leagueLocked}
			className="bg-red-600 text-white px-5 py-2.5 rounded-lg text-base font-medium hover:bg-red-700 disabled:opacity-50"
		  >
            {advancing
              ? 'Advancing...'
              : `Advance to Race ${currentRaceNum + 1}`}
          </button>
        </div>
      </div>
    )}
  </div>
)}
      </div>
    </div>
  )
}

export default function LeaguePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <LeagueContent />
    </Suspense>
  )
}