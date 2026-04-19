import { useEffect, useMemo, useState } from 'react'
import './App.css'

const apiBase = '/api'
const wsOrigin = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`

function App() {
  const [sessionId, setSessionId] = useState(() => {
    const url = new URL(window.location.href)

    return url.searchParams.get('session') || ''
  })
  const [participantLabel, setParticipantLabel] = useState('')
  const [participantLinks, setParticipantLinks] = useState([])
  const [isCreating, setIsCreating] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [latestLocations, setLatestLocations] = useState({})

  const liveParticipants = useMemo(() => Object.values(latestLocations), [latestLocations])

  useEffect(() => {
    if (!sessionId) {
      return undefined
    }

    const socket = new WebSocket(`${wsOrigin}/ws?session=${encodeURIComponent(sessionId)}&role=viewer`)

    socket.onopen = () => setStatus('connected')
    socket.onclose = () => setStatus('disconnected')
    socket.onerror = () => setError('WebSocket connection failed')
    socket.onmessage = (event) => {
      let payload

      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }

      if (payload.type === 'SNAPSHOT' && Array.isArray(payload.locations)) {
        const mappedLocations = payload.locations.reduce((accumulator, location) => {
          if (location?.label) {
            accumulator[location.label] = location
          }

          return accumulator
        }, {})

        setLatestLocations(mappedLocations)
        return
      }

      if (payload.type === 'LOCATION') {
        if (payload.label) {
          setLatestLocations((currentLocations) => ({
            ...currentLocations,
            [payload.label]: payload
          }))
        }

        setStatus('live')
      }
    }

    return () => socket.close()
  }, [sessionId])

  async function createSession() {
    setIsCreating(true)
    setError('')

    try {
      const response = await fetch(`${apiBase}/create-session`, {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Could not create a session')
      }

        const data = await response.json()
        setSessionId(data.sessionId)
        setParticipantLinks([])
        setLatestLocations({})
      setStatus('connected')

      const url = new URL(window.location.href)
      url.searchParams.set('session', data.sessionId)
      window.history.replaceState({}, '', url)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsCreating(false)
    }
  }

  function addParticipantLink() {
    const label = participantLabel.trim()

    if (!sessionId) {
      setError('Create a session first.')
      return
    }

    if (!label) {
      setError('Enter a participant identifier.')
      return
    }

    const trackingUrl = `${window.location.origin}/track.html?session=${encodeURIComponent(sessionId)}&label=${encodeURIComponent(label)}`

    setError('')
    setParticipantLinks((currentLinks) => {
      const existingIndex = currentLinks.findIndex((entry) => entry.label === label)

      if (existingIndex === -1) {
        return [...currentLinks, { label, trackingUrl }]
      }

      const nextLinks = [...currentLinks]
      nextLinks[existingIndex] = { label, trackingUrl }
      return nextLinks
    })
    setParticipantLabel('')
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text)
  }

  return (
    <main className="shell">
      <section className="hero-card">
        <p className="eyebrow">Consent-based live location sharing</p>
        <h1>Track multiple people in one session</h1>
        <p className="lede">
          Create one session, generate a unique link for each person, and watch
          live updates as each person approves location sharing.
        </p>

        {!sessionId ? (
          <button className="primary-button" onClick={createSession} disabled={isCreating}>
            {isCreating ? 'Creating session...' : 'Create session'}
          </button>
        ) : (
          <div className="status-row">
            <span className={`status-pill status-${status}`}>{status}</span>
            <span className="session-id">Session {sessionId}</span>
          </div>
        )}

        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {sessionId ? (
        <section className="panel-grid">
          <article className="panel">
            <h2>Create participant links</h2>
            <p>Generate one link per person. Each link gets its own identifier.</p>
            <div className="label-input">
              <label htmlFor="participantLabelInput">Participant identifier</label>
              <input
                id="participantLabelInput"
                type="text"
                value={participantLabel}
                onChange={(event) => setParticipantLabel(event.target.value)}
                placeholder="for example: alex-phone"
                autoComplete="off"
              />
            </div>
            <button className="primary-button" onClick={addParticipantLink}>
              Generate link
            </button>
            <div className="link-list">
              {participantLinks.length ? participantLinks.map((entry) => (
                <div className="link-list-item" key={entry.label}>
                  <div>
                    <strong>{entry.label}</strong>
                    <div className="link-box">{entry.trackingUrl}</div>
                  </div>
                  <button className="secondary-button" onClick={() => copyText(entry.trackingUrl)}>
                    Copy
                  </button>
                </div>
              )) : <p className="helper-text">Generate links for each person you want to track.</p>}
            </div>
          </article>
        </section>
      ) : null}

      {sessionId ? (
        <section className="panel live-panel">
          <div className="panel-heading">
            <div>
              <h2>Live feed</h2>
              <p>Each card below is a participant identified by the label you set.</p>
            </div>
            <span className={`status-pill status-${status}`}>{status}</span>
          </div>

          {liveParticipants.length ? (
            <div className="participant-grid">
              {liveParticipants.map((participant) => (
                <article className="participant-card" key={participant.label}>
                  <div className="participant-card-heading">
                    <strong>{participant.label}</strong>
                    <span>{new Date(participant.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="location-grid location-grid--compact">
                    <div>
                      <span className="label">Latitude</span>
                      <strong>{participant.lat.toFixed(6)}</strong>
                    </div>
                    <div>
                      <span className="label">Longitude</span>
                      <strong>{participant.lng.toFixed(6)}</strong>
                    </div>
                    <div>
                      <span className="label">Accuracy</span>
                      <strong>{participant.accuracy ? `${participant.accuracy.toFixed(0)} m` : 'Unknown'}</strong>
                    </div>
                    <div>
                      <span className="label">Updated</span>
                      <strong>{new Date(participant.timestamp).toLocaleTimeString()}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">Waiting for participants to connect and approve location access.</p>
          )}
        </section>
      ) : null}

      {sessionId ? (
        <section className="panel">
          <h2>Next step</h2>
          <p>
            Create one participant link per device, send it to the right person,
            and keep the dashboard open to watch the live updates.
          </p>
        </section>
      ) : null}
    </main>
  )
}

export default App
