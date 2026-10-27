'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function HomePage() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [leagues, setLeagues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        // Get leagues the user is a member of
        const { data: memberData } = await supabase
          .from('league_members')
          .select('league_id, team_name, leagues(*)')
          .eq('user_id', user.id)

        if (memberData) {
          setLeagues(memberData.map((m: any) => ({
            ...m.leagues,
            team_name: m.team_name
          })))
        }
      }

      setLoading(false)
    }

    load()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.refresh()
    setUser(null)
    setLeagues([])
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-md p-10 max-w-md w-full text-center">
          <h1 className="text-3xl font-bold mb-2">Fantasy NASCAR</h1>
          <p className="text-gray-600 mb-8">Pick drivers. Compete weekly. Follow the Cup Series.</p>
          
          <div className="space-y-3">
            <Link
              href="/auth/login"
              className="block w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              Log In
            </Link>
            <Link
              href="/auth/sign-up"
              className="block w-full bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Logged in
  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Fantasy NASCAR</h1>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign Out
          </button>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <Link
            href="/create-league"
            className="bg-blue-600 text-white text-center py-4 rounded-xl font-medium hover:bg-blue-700"
          >
            + Create League
          </Link>
          <Link
            href="/join-league"
            className="bg-green-600 text-white text-center py-4 rounded-xl font-medium hover:bg-green-700"
          >
            Join League
          </Link>
        </div>

        {/* My Leagues */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">My Leagues</h2>

          {leagues.length === 0 ? (
            <p className="text-gray-500">You haven’t joined any leagues yet.</p>
          ) : (
            <div className="space-y-3">
              {leagues.map((league) => (
                <Link
                  key={league.id}
                  href={`/league/${league.id}`}
                  className="block border rounded-lg p-4 hover:bg-gray-50 transition"
                >
                  <div className="font-medium text-lg">{league.name}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    Your team: {league.team_name} · Races {league.start_race}–{league.end_race}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}