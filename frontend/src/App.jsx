import { useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function requestJson(path, options) {
  const response = await fetch(`${API_URL}${path}`, options)
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.detail || 'Request failed')
  }
  return result
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = window.localStorage.getItem('chesshub-user')
      return savedUser ? JSON.parse(savedUser) : null
    } catch {
      return null
    }
  })
  const [players, setPlayers] = useState([])
  const [pendingChallenges, setPendingChallenges] = useState([])
  const [activeMatch, setActiveMatch] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [registrationName, setRegistrationName] = useState('')
  const [registrationError, setRegistrationError] = useState('')
  const [poolError, setPoolError] = useState('')
  const [challengeError, setChallengeError] = useState('')
  const [notice, setNotice] = useState('')
  const [challengeStates, setChallengeStates] = useState({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let isCurrent = true

    const loadPool = async () => {
      setIsRefreshing(true)
      try {
        const activePlayers = await requestJson('/players/active')
        if (isCurrent) {
          setPlayers(activePlayers)
          setPoolError('')
          setIsLoading(false)
          setIsRefreshing(false)
          setLastUpdated(new Date())
        }
      } catch (requestError) {
        if (isCurrent) {
          setPoolError(requestError.message)
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    loadPool()
    const refreshTimer = window.setInterval(loadPool, 5000)

    return () => {
      isCurrent = false
      window.clearInterval(refreshTimer)
    }
  }, [refreshKey])

  useEffect(() => {
    let isCurrent = true
    const userId = currentUser?.id

    if (!userId) {
      setPendingChallenges([])
      setActiveMatch(null)
      return undefined
    }

    const loadChallengeState = async () => {
      try {
        const [incoming, match] = await Promise.all([
          requestJson(`/challenges/incoming/${userId}`),
          requestJson(`/challenges/active/${userId}`),
        ])
        if (isCurrent) {
          setPendingChallenges(incoming)
          setActiveMatch(match)
          setChallengeError('')
        }
      } catch (requestError) {
        if (isCurrent) {
          setChallengeError(requestError.message)
        }
      }
    }

    loadChallengeState()
    const challengeTimer = window.setInterval(loadChallengeState, 5000)

    return () => {
      isCurrent = false
      window.clearInterval(challengeTimer)
    }
  }, [currentUser, refreshKey])

  const visiblePlayers = players.filter((player) =>
    player.username.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const updatedLabel = lastUpdated
    ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Waiting for first sync'

  const registerUser = async (event) => {
    event.preventDefault()
    const username = registrationName.trim()
    if (!username) {
      setRegistrationError('Enter a username to join the pool.')
      return
    }

    setIsRegistering(true)
    setRegistrationError('')
    try {
      const result = await requestJson('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      window.localStorage.setItem('chesshub-user', JSON.stringify(result))
      setCurrentUser(result)
      setRegistrationName('')
      setRefreshKey((currentKey) => currentKey + 1)
    } catch (requestError) {
      setRegistrationError(requestError.message)
    } finally {
      setIsRegistering(false)
    }
  }

  const challengePlayer = async (player) => {
    if (!currentUser) return
    setChallengeError('')
    setNotice('')
    setChallengeStates((states) => ({ ...states, [player.id]: 'sending' }))
    try {
      await requestJson('/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_id: currentUser.id, receiver_id: player.id }),
      })
      setChallengeStates((states) => ({ ...states, [player.id]: 'sent' }))
      setNotice(`Challenge sent to ${player.username}.`)
      setRefreshKey((currentKey) => currentKey + 1)
    } catch (requestError) {
      setChallengeStates((states) => ({ ...states, [player.id]: 'idle' }))
      setChallengeError(requestError.message)
    }
  }

  const acceptChallenge = async (challenge) => {
    setChallengeError('')
    try {
      await requestJson(`/challenges/${challenge.id}/accept`, { method: 'PATCH' })
      setPendingChallenges((challenges) => challenges.filter((item) => item.id !== challenge.id))
      setActiveMatch({
        challenge_id: challenge.id,
        opponent_id: challenge.sender_id,
        opponent_username: challenge.sender_username,
        status: 'ACCEPTED',
      })
      setNotice(`Match accepted. You are playing ${challenge.sender_username}.`)
      setRefreshKey((currentKey) => currentKey + 1)
    } catch (requestError) {
      setChallengeError(requestError.message)
    }
  }

  const clearCurrentUser = () => {
    window.localStorage.removeItem('chesshub-user')
    setCurrentUser(null)
    setNotice('')
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="brand-line">
            <span className="brand-mark">CH</span>
            <p className="eyebrow">ChessHub / Matchmaker</p>
          </div>
          <h1>Find your next<br />opponent.</h1>
        </div>
        <div className="header-meta">
          <span className="live-indicator"><span className="pulse-dot" /> Live pool</span>
          <span className="sync-label">{updatedLabel}</span>
        </div>
      </header>

      <section className="account-panel" aria-labelledby="account-title">
        {currentUser ? (
          <div className="account-summary">
            <div className="account-identity">
              <span className="avatar account-avatar" aria-hidden="true">
                {currentUser.username.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="eyebrow">You are in the pool</p>
                <h2 id="account-title">{currentUser.username}</h2>
              </div>
            </div>
            <button className="text-button" type="button" onClick={clearCurrentUser}>
              Switch player
            </button>
          </div>
        ) : (
          <form className="registration-form" onSubmit={registerUser}>
            <div>
              <p className="eyebrow">Join the queue</p>
              <h2 id="account-title">Create your player profile</h2>
            </div>
            <div className="registration-controls">
              <label className="registration-field">
                <span className="sr-only">Username</span>
                <input
                  type="text"
                  value={registrationName}
                  onChange={(event) => setRegistrationName(event.target.value)}
                  placeholder="Choose a username"
                  maxLength={50}
                  autoComplete="nickname"
                />
              </label>
              <button className="join-button" type="submit" disabled={isRegistering}>
                {isRegistering ? 'Joining...' : 'Join pool'}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            {registrationError && <p className="form-error">{registrationError}</p>}
          </form>
        )}
      </section>

      {activeMatch && (
        <section className="match-panel" aria-labelledby="match-title">
          <div className="match-symbol" aria-hidden="true">VS</div>
          <div>
            <p className="eyebrow">Match accepted</p>
            <h2 id="match-title">You are playing {activeMatch.opponent_username}</h2>
          </div>
          <span className="match-status">{activeMatch.status}</span>
        </section>
      )}

      {pendingChallenges.length > 0 && (
        <section className="incoming-panel" aria-labelledby="incoming-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your turn</p>
              <h2 id="incoming-title">Incoming challenge</h2>
            </div>
            <span className="challenge-count">{pendingChallenges.length}</span>
          </div>
          <ul className="incoming-list">
            {pendingChallenges.map((challenge) => (
              <li className="incoming-row" key={challenge.id}>
                <span><strong>{challenge.sender_username}</strong> wants to play.</span>
                <button className="accept-button" type="button" onClick={() => acceptChallenge(challenge)}>
                  Accept <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notice && <p className="notice-message">{notice}</p>}
      {challengeError && <p className="state-message error-message">{challengeError}</p>}

      <section className="pool-panel" aria-labelledby="pool-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Available now</p>
            <h2 id="pool-title">Players looking for a game</h2>
          </div>
          <div className="panel-actions">
            <span className="player-count">{players.length} online</span>
            <button
              className="refresh-button"
              type="button"
              onClick={() => setRefreshKey((currentKey) => currentKey + 1)}
              disabled={isRefreshing}
            >
              <span aria-hidden="true" className={isRefreshing ? 'refresh-icon spinning' : 'refresh-icon'}>↻</span>
              {isRefreshing ? 'Syncing' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="pool-toolbar">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search players"
              aria-label="Search players"
            />
          </label>
          <span className="poll-label">Auto-sync / 5 sec</span>
        </div>

        {isLoading && <p className="state-message">Loading the active pool...</p>}
        {poolError && <p className="state-message error-message">{poolError}</p>}
        {!isLoading && !poolError && players.length === 0 && (
          <p className="state-message">No players are waiting right now.</p>
        )}
        {!isLoading && !poolError && players.length > 0 && visiblePlayers.length === 0 && (
          <p className="state-message">No player matches “{searchTerm}”.</p>
        )}
        {!isLoading && !poolError && visiblePlayers.length > 0 && (
          <ul className="player-list">
            {visiblePlayers.map((player, playerIndex) => {
              const isCurrentPlayer = player.id === currentUser?.id
              const challengeState = challengeStates[player.id]
              return (
                <li className="player-row" key={player.id} style={{ '--row-index': playerIndex }}>
                  <div className="player-identity">
                    <span className="avatar" aria-hidden="true">
                      {player.username.charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <strong>{player.username}{isCurrentPlayer ? ' (you)' : ''}</strong>
                      <small>{player.status}</small>
                    </span>
                  </div>
                  <div className="player-actions">
                    <span className="available-status"><span className="available-dot" /> Available</span>
                    {!isCurrentPlayer && currentUser && (
                      <button
                        className="challenge-button"
                        type="button"
                        onClick={() => challengePlayer(player)}
                        disabled={challengeState === 'sending' || challengeState === 'sent'}
                      >
                        {challengeState === 'sending' ? 'Sending...' : challengeState === 'sent' ? 'Sent' : 'Challenge'}
                        <span aria-hidden="true">{challengeState === 'sent' ? '✓' : '→'}</span>
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
