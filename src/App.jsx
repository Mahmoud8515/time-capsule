import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const [text, setText] = useState('')
  const [unlockDate, setUnlockDate] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [messages, setMessages] = useState([])
  const [tab, setTab] = useState('mine') // mine | received

  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadMessages()
  }, [session])

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setMessages(data)
  }

  async function handleSignUp() {
    setMessage('')
    const cleanEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.signUp({ email: cleanEmail, password })
    if (error) setMessage('Error: ' + error.message)
    else setMessage('Account created! You can sign in now.')
  }

  async function handleSignIn() {
    setMessage('')
    const cleanEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    if (error) setMessage('Error: ' + error.message)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  async function startRecording() {
    setMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      let mimeType = ''
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm'
      }
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/mp4'
        const blob = new Blob(chunksRef.current, { type })
        setAudioBlob(blob)
        setAudioPreviewUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      setMessage('Microphone access denied or unavailable.')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  async function handleSaveMessage() {
    setMessage('')
    if (!text && !audioBlob) {
      setMessage('Please write a message or record audio.')
      return
    }
    if (!unlockDate) {
      setMessage('Please choose an unlock date.')
      return
    }

    setSaving(true)
    let audioUrl = null

    if (audioBlob) {
      const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const fileName = `${session.user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, audioBlob)
      if (uploadError) {
        setMessage('Upload error: ' + uploadError.message)
        setSaving(false)
        return
      }
      const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(fileName)
      audioUrl = urlData.publicUrl
    }

    const { error } = await supabase.from('messages').insert({
      user_id: session.user.id,
      text_content: text || null,
      audio_url: audioUrl,
      unlock_date: new Date(unlockDate).toISOString(),
      recipient_email: recipientEmail.trim().toLowerCase() || null,
    })

    setSaving(false)
    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setText('')
      setUnlockDate('')
      setRecipientEmail('')
      setAudioBlob(null)
      setAudioPreviewUrl(null)
      setMessage('Message sealed! 🎉')
      loadMessages()
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this message permanently?')) return
    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (!error) loadMessages()
  }

  function isUnlocked(d) {
    return new Date(d) <= new Date()
  }

  const myEmail = session?.user?.email?.toLowerCase()
  // رسائلي = اللي أنشأتها أنا
  const mineMessages = messages.filter((m) => m.user_id === session?.user?.id)
  // المستلمة = مرسلة لإيميلي ومن شخص آخر
  const receivedMessages = messages.filter(
    (m) => m.recipient_email === myEmail && m.user_id !== session?.user?.id
  )

  // ===== Sign in screen =====
  if (!session) {
    return (
      <>
        <Styles />
        <div className="tc-wrap" dir="ltr">
          <div className="tc-card tc-auth">
            <div className="tc-logo">🕰️</div>
            <h1 className="tc-title">Time Capsule</h1>
            <p className="tc-sub">Seal a message. Open it in the future.</p>
            <input className="tc-input" type="email" placeholder="Email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="tc-input" type="password" placeholder="Password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="tc-auth-btns">
              <button className="tc-btn tc-btn-primary" onClick={handleSignIn}>Sign In</button>
              <button className="tc-btn tc-btn-ghost" onClick={handleSignUp}>Sign Up</button>
            </div>
            {message && <p className="tc-msg">{message}</p>}
          </div>
        </div>
      </>
    )
  }

  const shown = tab === 'mine' ? mineMessages : receivedMessages

  // ===== Main screen =====
  return (
    <>
      <Styles />
      <div className="tc-wrap" dir="ltr">
        <header className="tc-header">
          <div>
            <h1 className="tc-title tc-title-sm">🕰️ Time Capsule</h1>
            <p className="tc-email">{session.user.email}</p>
          </div>
          <button className="tc-btn tc-btn-ghost tc-btn-sm" onClick={handleSignOut}>Sign Out</button>
        </header>

        <div className="tc-card">
          <h3 className="tc-h3">New message to the future</h3>
          <textarea
            className="tc-input tc-textarea"
            placeholder="Write a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="tc-rec-row">
            {!recording ? (
              <button className="tc-btn tc-btn-rec" onClick={startRecording}>🎤 Record Voice</button>
            ) : (
              <button className="tc-btn tc-btn-stop" onClick={stopRecording}>
                <span className="tc-pulse" /> Stop Recording
              </button>
            )}
          </div>

          {audioPreviewUrl && (
            <div className="tc-preview">
              <p className="tc-preview-label">Preview:</p>
              <audio controls src={audioPreviewUrl} className="tc-audio" />
            </div>
          )}

          <label className="tc-label">Send to (optional)</label>
          <input
            className="tc-input"
            type="email"
            placeholder="friend@email.com — leave empty to keep for yourself"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
          />

          <label className="tc-label">Unlock date</label>
          <input
            className="tc-input"
            type="datetime-local"
            value={unlockDate}
            onChange={(e) => setUnlockDate(e.target.value)}
          />

          <button className="tc-btn tc-btn-primary tc-btn-full" onClick={handleSaveMessage} disabled={saving}>
            {saving ? 'Sealing...' : '🔒 Seal Message'}
          </button>
          {message && <p className="tc-msg">{message}</p>}
        </div>

        {/* تبويبات */}
        <div className="tc-tabs">
          <button
            className={`tc-tab ${tab === 'mine' ? 'active' : ''}`}
            onClick={() => setTab('mine')}
          >
            My Messages <span className="tc-count">{mineMessages.length}</span>
          </button>
          <button
            className={`tc-tab ${tab === 'received' ? 'active' : ''}`}
            onClick={() => setTab('received')}
          >
            Received <span className="tc-count">{receivedMessages.length}</span>
          </button>
        </div>

        <div className="tc-messages">
          {shown.length === 0 && (
            <p className="tc-empty">
              {tab === 'mine' ? 'No messages yet. Seal your first one above.' : 'No messages received yet.'}
            </p>
          )}
          {shown.map((m, i) => {
            const unlocked = isUnlocked(m.unlock_date)
            const isMine = m.user_id === session.user.id
            return (
              <div key={m.id} className={`tc-msg-card ${unlocked ? 'unlocked' : 'locked'}`} style={{ animationDelay: `${i * 0.05}s` }}>
                {isMine && (
                  <button className="tc-delete" onClick={() => handleDelete(m.id)} title="Delete">✕</button>
                )}
                {/* وسم: لمن أرسلت / من أرسل */}
                {isMine && m.recipient_email && (
                  <p className="tc-tag">→ to {m.recipient_email}</p>
                )}
                {!isMine && (
                  <p className="tc-tag">✉ a sealed message for you</p>
                )}
                {unlocked ? (
                  <>
                    {m.text_content && <p className="tc-msg-text">{m.text_content}</p>}
                    {m.audio_url && <audio controls src={m.audio_url} className="tc-audio" />}
                    <span className="tc-badge tc-badge-open">✓ Unlocked</span>
                  </>
                ) : (
                  <>
                    <div className="tc-lock-icon">🔒</div>
                    <p className="tc-locked-text">Sealed until</p>
                    <p className="tc-locked-date">
                      {new Date(m.unlock_date).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Nunito:wght@400;600;700&display=swap');

      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #1a1410;
        background-image: radial-gradient(circle at 20% 20%, #2a1f15 0%, #1a1410 55%);
        min-height: 100vh;
        font-family: 'Nunito', sans-serif;
        color: #f0e6d8;
      }

      .tc-wrap { max-width: 560px; margin: 0 auto; padding: 32px 18px 60px; }

      .tc-title {
        font-family: 'Fraunces', serif; font-weight: 900; font-size: 2.6rem;
        margin: 8px 0 4px; color: #f5c97a; letter-spacing: -0.5px;
      }
      .tc-title-sm { font-size: 1.5rem; margin: 0; }
      .tc-sub { color: #b09a80; margin: 0 0 24px; font-size: 1.05rem; }
      .tc-email { color: #8a7560; margin: 2px 0 0; font-size: 0.85rem; }

      .tc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }

      .tc-card {
        background: #241b14; border: 1px solid #3a2c1f; border-radius: 18px;
        padding: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.35);
        margin-bottom: 28px; animation: rise 0.5s ease both;
      }
      .tc-auth { text-align: center; margin-top: 8vh; }
      .tc-logo { font-size: 3rem; }

      .tc-h3 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.25rem; margin: 0 0 16px; color: #f0e6d8; }
      .tc-count {
        background: #3a2c1f; color: #f5c97a; font-family: 'Nunito';
        font-size: 0.8rem; font-weight: 700; padding: 1px 8px; border-radius: 20px; margin-left: 4px;
      }

      .tc-input {
        display: block; width: 100%; padding: 13px 15px; margin: 8px 0;
        background: #1a1410; border: 1px solid #3a2c1f; border-radius: 11px;
        color: #f0e6d8; font-family: 'Nunito'; font-size: 1rem;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .tc-input:focus { outline: none; border-color: #f5c97a; box-shadow: 0 0 0 3px rgba(245,201,122,0.15); }
      .tc-input::placeholder { color: #6b5a48; }
      .tc-textarea { height: 90px; resize: vertical; }
      .tc-label { display: block; margin: 14px 0 2px; color: #b09a80; font-size: 0.9rem; font-weight: 600; }

      .tc-btn {
        padding: 12px 22px; border-radius: 11px; cursor: pointer;
        font-family: 'Nunito'; font-weight: 700; font-size: 0.98rem;
        border: 1px solid transparent; transition: transform 0.12s, filter 0.2s;
      }
      .tc-btn:active { transform: scale(0.97); }
      .tc-btn-primary { background: linear-gradient(135deg, #f5c97a, #e0a955); color: #2a1f15; }
      .tc-btn-primary:hover { filter: brightness(1.06); }
      .tc-btn-primary:disabled { opacity: 0.6; cursor: default; }
      .tc-btn-ghost { background: transparent; border-color: #3a2c1f; color: #f0e6d8; }
      .tc-btn-ghost:hover { background: #2a1f15; }
      .tc-btn-sm { padding: 8px 16px; font-size: 0.85rem; }
      .tc-btn-full { width: 100%; margin-top: 16px; }
      .tc-auth-btns { display: flex; gap: 10px; margin-top: 8px; }
      .tc-auth-btns .tc-btn { flex: 1; }

      .tc-rec-row { margin: 14px 0; }
      .tc-btn-rec { background: #2a1f15; border-color: #3a2c1f; color: #f5c97a; width: 100%; }
      .tc-btn-rec:hover { background: #32261a; }
      .tc-btn-stop {
        background: #3a1a18; border-color: #6b2b28; color: #ff8a80; width: 100%;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .tc-pulse { width: 10px; height: 10px; border-radius: 50%; background: #ff5247; display: inline-block; animation: pulse 1s infinite; }

      .tc-preview { margin: 12px 0; }
      .tc-preview-label { color: #b09a80; font-size: 0.85rem; margin: 0 0 6px; }
      .tc-audio { width: 100%; height: 40px; }

      .tc-msg { color: #b09a80; font-size: 0.92rem; margin-top: 14px; text-align: center; }
      .tc-empty { color: #6b5a48; font-style: italic; }

      .tc-tabs { display: flex; gap: 8px; margin-bottom: 18px; }
      .tc-tab {
        flex: 1; padding: 11px; border-radius: 11px; cursor: pointer;
        background: #241b14; border: 1px solid #3a2c1f; color: #b09a80;
        font-family: 'Fraunces', serif; font-size: 1rem; font-weight: 600;
        transition: all 0.2s;
      }
      .tc-tab.active { background: #3a2c1f; color: #f5c97a; border-color: #f5c97a; }

      .tc-msg-card {
        position: relative; background: #241b14; border: 1px solid #3a2c1f;
        border-radius: 14px; padding: 18px; margin-bottom: 14px; animation: rise 0.4s ease both;
      }
      .tc-msg-card.locked { text-align: center; border-style: dashed; border-color: #4a3826; }
      .tc-msg-card.unlocked { border-left: 3px solid #f5c97a; }

      .tc-tag { font-size: 0.78rem; color: #8a7560; margin: 0 0 8px; font-weight: 600; }
      .tc-msg-text { margin: 0 0 10px; line-height: 1.6; color: #f0e6d8; }
      .tc-lock-icon { font-size: 1.6rem; margin-bottom: 4px; opacity: 0.7; }
      .tc-locked-text { color: #8a7560; margin: 0; font-size: 0.85rem; }
      .tc-locked-date { color: #f5c97a; margin: 2px 0 0; font-family: 'Fraunces', serif; font-size: 1.05rem; }

      .tc-badge { display: inline-block; font-size: 0.78rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-top: 8px; }
      .tc-badge-open { background: rgba(245,201,122,0.15); color: #f5c97a; }

      .tc-delete {
        position: absolute; top: 12px; right: 12px; width: 26px; height: 26px;
        border-radius: 50%; background: transparent; border: none; color: #6b5a48;
        cursor: pointer; font-size: 0.9rem; transition: color 0.2s, background 0.2s;
      }
      .tc-delete:hover { color: #ff8a80; background: rgba(255,138,128,0.1); }

      @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    `}</style>
  )
}

export default App