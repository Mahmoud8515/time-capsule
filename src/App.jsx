import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

// قراءة رمز الكبسولة من الرابط: /c/CODE
function getCapsuleCode() {
  const m = window.location.pathname.match(/^\/c\/([A-Za-z0-9]+)/)
  return m ? m[1] : null
}

// توليد رمز عشوائي للرابط
function makeCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function App() {
  const capsuleCode = getCapsuleCode()
  if (capsuleCode) return <CapsulePage code={capsuleCode} />
  return <MainApp />
}

// ============= صفحة الكبسولة (الضيف) =============
function CapsulePage({ code }) {
  const [capsule, setCapsule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [authorName, setAuthorName] = useState('')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState(null)
  const [mediaType, setMediaType] = useState(null)

  useEffect(() => { loadCapsule() }, [code])

  async function loadCapsule() {
    const { data, error } = await supabase
      .from('capsules')
      .select('*')
      .eq('share_code', code)
      .single()
    if (error || !data) setNotFound(true)
    else setCapsule(data)
    setLoading(false)
  }

  async function startRecording() {
    setMsg('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      let mimeType = ''
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'
      else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm'
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
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
      setMsg('Microphone access denied or unavailable.')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  function handleMediaPick(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      setMsg('File too large (max 50MB). Try a shorter clip.')
      e.target.value = ''
      return
    }
    const type = file.type.startsWith('video') ? 'video' : 'image'
    setMediaFile(file)
    setMediaType(type)
    setMediaPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function clearMedia() {
    setMediaFile(null)
    setMediaPreview(null)
    setMediaType(null)
  }

  async function uploadFile(file, folder, ext) {
    const fileName = `capsules/${code}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
    const { error } = await supabase.storage.from('recordings').upload(fileName, file)
    if (error) throw error
    const { data } = supabase.storage.from('recordings').getPublicUrl(fileName)
    return data.publicUrl
  }

  function resetForm() {
    setText(''); setAudioBlob(null); setAudioPreviewUrl(null); clearMedia()
  }

  async function handleAdd() {
    setMsg('')
    if (!authorName.trim()) { setMsg('Please enter your name.'); return }
    if (!text && !audioBlob && !mediaFile) {
      setMsg('Please add a message, voice, photo, or video.'); return
    }
    setSaving(true)
    try {
      let audioUrl = null, imageUrl = null, videoUrl = null
      if (audioBlob) {
        const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm'
        audioUrl = await uploadFile(audioBlob, 'audio', ext)
      }
      if (mediaFile) {
        const ext = mediaFile.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg')
        const url = await uploadFile(mediaFile, mediaType === 'video' ? 'videos' : 'images', ext)
        if (mediaType === 'video') videoUrl = url
        else imageUrl = url
      }
      const { error } = await supabase.from('capsule_messages').insert({
        capsule_id: capsule.id,
        author_name: authorName.trim(),
        text_content: text || null,
        audio_url: audioUrl,
        image_url: imageUrl,
        video_url: videoUrl,
      })
      if (error) throw error
      resetForm()
      setDone(true)
    } catch (err) {
      setMsg('Error: ' + err.message)
    }
    setSaving(false)
  }

  function addAnother() {
    setDone(false)
    setMsg('')
  }

  // ===== الحالات =====
  if (loading) {
    return (
      <>
        <Styles />
        <div className="tc-wrap" dir="ltr">
          <header className="tc-header"><h1 className="tc-title tc-title-sm">Time Capsule</h1></header>
          <div className="tc-card"><p className="tc-empty">Loading...</p></div>
        </div>
      </>
    )
  }

  if (notFound) {
    return (
      <>
        <Styles />
        <div className="tc-wrap" dir="ltr">
          <header className="tc-header"><h1 className="tc-title tc-title-sm">Time Capsule</h1></header>
          <div className="tc-card"><p className="tc-empty">This capsule link is invalid or no longer exists.</p></div>
        </div>
      </>
    )
  }

  const openDate = new Date(capsule.unlock_date).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })

  return (
    <>
      <Styles />
      <div className="tc-wrap" dir="ltr">
        <header className="tc-header">
          <h1 className="tc-title tc-title-sm">Time Capsule</h1>
        </header>

        <div className="tc-card">
          <h3 className="tc-h3">{capsule.title}</h3>
          <p className="tc-msg" style={{ marginTop: 0 }}>
            A shared capsule that opens on {openDate}. Add your message below — it stays sealed until then.
          </p>

          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div className="tc-wax" style={{ fontSize: '2.4rem' }}>🕯️</div>
              <p className="tc-locked-date" style={{ fontSize: '1.3rem' }}>Your message was added!</p>
              <p className="tc-msg" style={{ marginTop: 6 }}>It will be revealed when the capsule opens.</p>
              <button className="tc-btn tc-btn-ghost tc-btn-full" onClick={addAnother}>✦ Add another message</button>
            </div>
          ) : (
            <>
              <label className="tc-label">Your name</label>
              <input
                className="tc-input"
                type="text"
                placeholder="e.g. Grandpa Ahmad"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
              />

              <label className="tc-label">Your message</label>
              <textarea
                className="tc-input tc-textarea"
                placeholder="Write something for the future..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />

              <div className="tc-rec-row">
                {!recording ? (
                  <button className="tc-btn tc-btn-rec" onClick={startRecording}>🪶 Record Voice</button>
                ) : (
                  <button className="tc-btn tc-btn-stop" onClick={stopRecording}>
                    <span className="tc-pulse" /> Stop Recording
                  </button>
                )}
              </div>
              {audioPreviewUrl && (
                <div className="tc-preview">
                  <p className="tc-preview-label">Voice preview:</p>
                  <audio controls src={audioPreviewUrl} className="tc-audio" />
                </div>
              )}

              <div className="tc-rec-row">
                <label className="tc-btn tc-btn-rec tc-media-btn-single">
                  📸 Add Media
                  <input type="file" accept="image/*,video/*" onChange={handleMediaPick} hidden />
                </label>
              </div>
              {mediaPreview && (
                <div className="tc-preview">
                  <div className="tc-preview-head">
                    <span className="tc-preview-label">{mediaType === 'video' ? 'Video' : 'Photo'} preview:</span>
                    <button className="tc-clear-media" onClick={clearMedia}>✕ remove</button>
                  </div>
                  {mediaType === 'video'
                    ? <video controls src={mediaPreview} className="tc-media-preview" />
                    : <img src={mediaPreview} className="tc-media-preview" alt="preview" />}
                </div>
              )}

              <button className="tc-btn tc-btn-primary tc-btn-full" onClick={handleAdd} disabled={saving}>
                {saving ? 'Adding...' : '🕯️ Add to Capsule'}
              </button>
              {msg && <p className="tc-msg">{msg}</p>}
            </>
          )}
        </div>

        <footer className="tc-footer">✦ ❦ ✦</footer>
      </div>
    </>
  )
}

// ============= التطبيق الرئيسي =============
function MainApp() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const [text, setText] = useState('')
  const [unlockDate, setUnlockDate] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [messages, setMessages] = useState([])
  const [tab, setTab] = useState('mine')

  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null)

  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState(null)
  const [mediaType, setMediaType] = useState(null)

  const [saving, setSaving] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  // الكبسولات الجماعية
  const [capsules, setCapsules] = useState([])
  const [copiedCode, setCopiedCode] = useState(null)
  const [showTitleModal, setShowTitleModal] = useState(false)
  const [capsuleTitle, setCapsuleTitle] = useState('')
  const [creatingCapsule, setCreatingCapsule] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) { loadMessages(); loadCapsules() }
  }, [session])

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setMessages(data)
  }

  async function loadCapsules() {
    const { data, error } = await supabase
      .from('capsules')
      .select('*')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: false })
    if (!error) setCapsules(data)
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
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'
      else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm'
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
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

  function handleMediaPick(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      setMessage('File too large (max 50MB). Try a shorter clip.')
      e.target.value = ''
      return
    }
    const type = file.type.startsWith('video') ? 'video' : 'image'
    setMediaFile(file)
    setMediaType(type)
    setMediaPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function clearMedia() {
    setMediaFile(null)
    setMediaPreview(null)
    setMediaType(null)
  }

  async function uploadFile(file, folder, ext) {
    const fileName = `${session.user.id}/${folder}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('recordings').upload(fileName, file)
    if (error) throw error
    const { data } = supabase.storage.from('recordings').getPublicUrl(fileName)
    return data.publicUrl
  }

  async function uploadAttachments() {
    let audioUrl = null, imageUrl = null, videoUrl = null
    if (audioBlob) {
      const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm'
      audioUrl = await uploadFile(audioBlob, 'audio', ext)
    }
    if (mediaFile) {
      const ext = mediaFile.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg')
      const url = await uploadFile(mediaFile, mediaType === 'video' ? 'videos' : 'images', ext)
      if (mediaType === 'video') videoUrl = url
      else imageUrl = url
    }
    return { audioUrl, imageUrl, videoUrl }
  }

  function clearForm() {
    setText(''); setUnlockDate(''); setRecipientEmail('')
    setAudioBlob(null); setAudioPreviewUrl(null)
    clearMedia()
  }

  async function handleSaveMessage() {
    setMessage('')
    if (!text && !audioBlob && !mediaFile) {
      setMessage('Please add a message, voice, photo, or video.')
      return
    }
    if (!unlockDate) {
      setMessage('Please choose an unlock date.')
      return
    }
    setSaving(true)
    try {
      const { audioUrl, imageUrl, videoUrl } = await uploadAttachments()
      const { error } = await supabase.from('messages').insert({
        user_id: session.user.id,
        text_content: text || null,
        audio_url: audioUrl,
        image_url: imageUrl,
        video_url: videoUrl,
        unlock_date: new Date(unlockDate).toISOString(),
        recipient_email: recipientEmail.trim().toLowerCase() || null,
      })
      if (error) throw error
      clearForm()
      setMessage('Message sealed! 🎉')
      loadMessages()
    } catch (err) {
      setMessage('Error: ' + err.message)
    }
    setSaving(false)
  }

  function openCapsuleModal() {
    setMessage('')
    if (!text && !audioBlob && !mediaFile) {
      setMessage('Write your own message first — it becomes the first message in the capsule.')
      return
    }
    if (!unlockDate) {
      setMessage('Please choose an unlock date.')
      return
    }
    setCapsuleTitle('')
    setShowTitleModal(true)
  }

  async function handleCreateCapsule() {
    if (!capsuleTitle.trim()) return
    setCreatingCapsule(true)
    setMessage('')
    try {
      const shareCode = makeCode()
      const { data: capsule, error: capErr } = await supabase.from('capsules').insert({
        owner_id: session.user.id,
        title: capsuleTitle.trim(),
        unlock_date: new Date(unlockDate).toISOString(),
        share_code: shareCode,
      }).select().single()
      if (capErr) throw capErr

      const { audioUrl, imageUrl, videoUrl } = await uploadAttachments()
      const authorName = session.user.email.split('@')[0]
      const { error: msgErr } = await supabase.from('capsule_messages').insert({
        capsule_id: capsule.id,
        author_name: authorName,
        text_content: text || null,
        audio_url: audioUrl,
        image_url: imageUrl,
        video_url: videoUrl,
      })
      if (msgErr) throw msgErr

      setShowTitleModal(false)
      clearForm()
      setMessage('Group capsule created! 🎉 Copy the link below to invite others.')
      loadCapsules()
    } catch (err) {
      setMessage('Error: ' + err.message)
    }
    setCreatingCapsule(false)
  }

  async function handleDeleteCapsule(id) {
    if (!window.confirm('Delete this group capsule and all its messages?')) return
    const { error } = await supabase.from('capsules').delete().eq('id', id)
    if (!error) loadCapsules()
  }

  function copyLink(code) {
    const url = `${window.location.origin}/c/${code}`
    navigator.clipboard.writeText(url)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
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
  const mineMessages = messages.filter((m) => m.user_id === session?.user?.id)
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
            <h1 className="tc-title tc-title-sm">Time Capsule</h1>
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
              <button className="tc-btn tc-btn-rec" onClick={startRecording}>🪶 Record Voice</button>
            ) : (
              <button className="tc-btn tc-btn-stop" onClick={stopRecording}>
                <span className="tc-pulse" /> Stop Recording
              </button>
            )}
          </div>
          {audioPreviewUrl && (
            <div className="tc-preview">
              <p className="tc-preview-label">Voice preview:</p>
              <audio controls src={audioPreviewUrl} className="tc-audio" />
            </div>
          )}

          <div className="tc-rec-row">
            <label className="tc-btn tc-btn-rec tc-media-btn-single">
              📸 Add Media
              <input type="file" accept="image/*,video/*" onChange={handleMediaPick} hidden />
            </label>
          </div>

          {mediaPreview && (
            <div className="tc-preview">
              <div className="tc-preview-head">
                <span className="tc-preview-label">{mediaType === 'video' ? 'Video' : 'Photo'} preview:</span>
                <button className="tc-clear-media" onClick={clearMedia}>✕ remove</button>
              </div>
              {mediaType === 'video'
                ? <video controls src={mediaPreview} className="tc-media-preview" />
                : <img src={mediaPreview} className="tc-media-preview" alt="preview" />}
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
            {saving ? 'Sealing...' : '🕯️ Seal Message'}
          </button>

          <div className="tc-or"><span>or</span></div>

          <button className="tc-btn tc-btn-group tc-btn-full" onClick={openCapsuleModal}>
            ✦ Create Group Capsule
          </button>
          <p className="tc-group-hint">
            Your message above becomes the first one. Invite others with a link.
          </p>

          {message && <p className="tc-msg">{message}</p>}
        </div>

        {capsules.length > 0 && (
          <div className="tc-card">
            <h3 className="tc-h3">My group capsules</h3>
            {capsules.map((c) => (
              <div key={c.id} className="tc-capsule-item">
                <button className="tc-delete" onClick={() => handleDeleteCapsule(c.id)} title="Delete">✕</button>
                <p className="tc-capsule-title">{c.title}</p>
                <p className="tc-capsule-date">
                  Opens {new Date(c.unlock_date).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <button className="tc-btn tc-btn-ghost tc-btn-sm tc-copy-btn" onClick={() => copyLink(c.share_code)}>
                  {copiedCode === c.share_code ? '✓ Link copied!' : '🔗 Copy invite link'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="tc-tabs">
          <button className={`tc-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
            My Messages <span className="tc-count">{mineMessages.length}</span>
          </button>
          <button className={`tc-tab ${tab === 'received' ? 'active' : ''}`} onClick={() => setTab('received')}>
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
                {isMine && m.recipient_email && <p className="tc-tag">✉ to {m.recipient_email}</p>}
                {!isMine && <p className="tc-tag">✉ a sealed message for you</p>}
                {unlocked ? (
                  <>
                    {m.text_content && <p className="tc-msg-text">{m.text_content}</p>}
                    {m.image_url && <img src={m.image_url} className="tc-media-preview" alt="" />}
                    {m.video_url && <video controls src={m.video_url} className="tc-media-preview" />}
                    {m.audio_url && <audio controls src={m.audio_url} className="tc-audio" />}
                    <span className="tc-badge tc-badge-open">✦ Unlocked</span>
                  </>
                ) : (
                  <>
                    <div className="tc-wax">🔴</div>
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

        <footer className="tc-footer">✦ ❦ ✦</footer>
      </div>

      {showTitleModal && (
        <div className="tc-modal-overlay" onClick={() => setShowTitleModal(false)}>
          <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="tc-h3">Name your group capsule</h3>
            <p className="tc-preview-label" style={{ textAlign: 'center' }}>
              This is what guests will see when they open the link.
            </p>
            <input
              className="tc-input"
              type="text"
              placeholder="e.g. Baby Sara's 18th Birthday"
              value={capsuleTitle}
              onChange={(e) => setCapsuleTitle(e.target.value)}
              autoFocus
            />
            <div className="tc-auth-btns" style={{ marginTop: 16 }}>
              <button className="tc-btn tc-btn-primary" onClick={handleCreateCapsule} disabled={creatingCapsule || !capsuleTitle.trim()}>
                {creatingCapsule ? 'Creating...' : 'Create'}
              </button>
              <button className="tc-btn tc-btn-ghost" onClick={() => setShowTitleModal(false)} disabled={creatingCapsule}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh;
        font-family: 'Cormorant Garamond', serif; color: #f0e6d2;
        background-color: #1a1310;
        background-image:
          radial-gradient(ellipse at 50% 0%, rgba(120,85,45,0.25) 0%, transparent 55%),
          radial-gradient(ellipse at 80% 90%, rgba(90,60,35,0.2) 0%, transparent 50%),
          linear-gradient(160deg, #1f1712 0%, #140e0a 100%);
        background-attachment: fixed;
      }
      .tc-wrap { max-width: 580px; margin: 0 auto; padding: 36px 18px 50px; }
      .tc-title { font-family: 'Cinzel', serif; font-weight: 700; font-size: 2.4rem; margin: 10px 0 4px; color: #e8c074; letter-spacing: 1px; text-shadow: 0 2px 8px rgba(0,0,0,0.5); }
      .tc-title-sm { font-size: 1.4rem; margin: 0; letter-spacing: 0.5px; }
      .tc-sub { color: #b89968; margin: 0 0 24px; font-size: 1.2rem; font-style: italic; }
      .tc-email { color: #8a7355; margin: 2px 0 0; font-size: 0.95rem; font-style: italic; }
      .tc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 26px; }
      .tc-card {
        background: radial-gradient(circle at 15% 20%, rgba(180,150,110,0.12) 0%, transparent 40%), linear-gradient(135deg, #f3e7cc 0%, #e8d7b3 100%);
        color: #3a2c1a; border: 1px solid #c9b186; border-radius: 6px; padding: 28px; margin-bottom: 30px;
        box-shadow: 0 14px 40px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(180,150,110,0.3), inset 0 0 60px rgba(160,120,70,0.15);
        position: relative; animation: rise 0.5s ease both;
      }
      .tc-card::before { content: ''; position: absolute; inset: 7px; border: 1px solid rgba(120,90,50,0.35); border-radius: 3px; pointer-events: none; }
      .tc-auth { text-align: center; margin-top: 7vh; }
      .tc-auth .tc-title { color: #7a5a2e; }
      .tc-auth .tc-sub { color: #6b5436; }
      .tc-h3 { font-family: 'Cinzel', serif; font-weight: 600; font-size: 1.2rem; margin: 0 0 18px; color: #5a3e1e; text-align: center; letter-spacing: 0.5px; }
      .tc-h3::after { content: '❦'; display: block; color: #a8743a; font-size: 1rem; margin-top: 6px; }
      .tc-count { background: #7a5a2e; color: #f3e7cc; font-family: 'Cinzel', serif; font-size: 0.7rem; font-weight: 600; padding: 2px 9px; border-radius: 20px; margin-left: 4px; vertical-align: middle; }
      .tc-input { display: block; width: 100%; padding: 12px 14px; margin: 8px 0; background: rgba(255,252,244,0.7); border: 1px solid #bfa478; border-radius: 4px; color: #3a2c1a; font-family: 'Cormorant Garamond', serif; font-size: 1.1rem; transition: border-color 0.2s, box-shadow 0.2s; }
      .tc-input:focus { outline: none; border-color: #8a5a28; box-shadow: 0 0 0 3px rgba(168,116,58,0.2); background: #fffdf6; }
      .tc-input::placeholder { color: #9a8867; font-style: italic; }
      .tc-textarea { height: 90px; resize: vertical; line-height: 1.5; }
      .tc-label { display: block; margin: 14px 0 2px; color: #6b4e28; font-size: 1rem; font-weight: 600; font-family: 'Cinzel', serif; letter-spacing: 0.3px; }
      .tc-btn { padding: 12px 22px; border-radius: 5px; cursor: pointer; font-family: 'Cinzel', serif; font-weight: 600; font-size: 0.95rem; border: 1px solid transparent; transition: transform 0.12s, filter 0.2s; letter-spacing: 0.5px; }
      .tc-btn:active { transform: scale(0.97); }
      .tc-btn-primary { background: linear-gradient(135deg, #9c3b2e 0%, #7a2820 100%); color: #f3e7cc; border-color: #5a1c16; box-shadow: 0 3px 8px rgba(0,0,0,0.3); }
      .tc-btn-primary:hover { filter: brightness(1.1); }
      .tc-btn-primary:disabled { opacity: 0.6; cursor: default; }
      .tc-btn-ghost { background: rgba(255,252,244,0.4); border-color: #bfa478; color: #5a3e1e; }
      .tc-btn-ghost:hover { background: rgba(255,252,244,0.7); }
      .tc-btn-sm { padding: 8px 16px; font-size: 0.8rem; }
      .tc-btn-full { width: 100%; margin-top: 18px; }
      .tc-btn-group { background: linear-gradient(135deg, #5a3e1e, #3a2812); color: #e8c074; border-color: #2a1c0e; box-shadow: 0 3px 8px rgba(0,0,0,0.3); margin-top: 0; }
      .tc-btn-group:hover { filter: brightness(1.15); }
      .tc-or { display: flex; align-items: center; text-align: center; color: #8a6a3a; margin: 20px 0 14px; font-style: italic; }
      .tc-or::before, .tc-or::after { content: ''; flex: 1; height: 1px; background: rgba(120,90,50,0.35); }
      .tc-or span { padding: 0 14px; font-size: 1rem; }
      .tc-group-hint { text-align: center; color: #6b4e28; font-size: 0.9rem; font-style: italic; margin: 10px 0 0; }
      .tc-auth-btns { display: flex; gap: 10px; margin-top: 10px; }
      .tc-auth-btns .tc-btn { flex: 1; }
      .tc-rec-row { margin: 14px 0; }
      .tc-btn-rec { background: rgba(120,80,40,0.12); border-color: #bfa478; color: #6b4e28; width: 100%; font-size: 0.95rem; }
      .tc-btn-rec:hover { background: rgba(120,80,40,0.2); }
      .tc-media-btn-single { display: block; width: 100%; text-align: center; }
      .tc-btn-stop { background: linear-gradient(135deg, #9c3b2e, #7a2820); color: #f3e7cc; border-color: #5a1c16; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; }
      .tc-pulse { width: 10px; height: 10px; border-radius: 50%; background: #f3e7cc; display: inline-block; animation: pulse 1s infinite; }
      .tc-media-preview { width: 100%; border-radius: 5px; margin-top: 4px; border: 1px solid #c9b186; max-height: 320px; object-fit: contain; background: #2a1f15; }
      .tc-preview { margin: 12px 0; }
      .tc-preview-head { display: flex; justify-content: space-between; align-items: center; }
      .tc-preview-label { color: #6b4e28; font-size: 0.95rem; margin: 0 0 6px; font-style: italic; }
      .tc-clear-media { background: none; border: none; color: #9c3b2e; cursor: pointer; font-family: 'Cormorant Garamond', serif; font-size: 0.95rem; font-style: italic; }
      .tc-audio { width: 100%; height: 38px; margin-top: 4px; }
      .tc-msg { color: #6b4e28; font-size: 1rem; margin-top: 14px; text-align: center; font-style: italic; }
      .tc-empty { color: #8a7355; font-style: italic; text-align: center; font-size: 1.1rem; }
      .tc-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
      .tc-tab { flex: 1; padding: 12px; border-radius: 5px; cursor: pointer; background: rgba(243,231,204,0.08); border: 1px solid #5a4632; color: #b89968; font-family: 'Cinzel', serif; font-size: 0.95rem; font-weight: 600; transition: all 0.2s; letter-spacing: 0.5px; }
      .tc-tab.active { background: linear-gradient(135deg, #3a2c1a, #2a1f12); color: #e8c074; border-color: #a8743a; box-shadow: inset 0 0 12px rgba(168,116,58,0.2); }
      .tc-msg-card { position: relative; background: linear-gradient(135deg, #f3e7cc 0%, #e6d4ad 100%); color: #3a2c1a; border: 1px solid #c9b186; border-radius: 5px; padding: 20px; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(180,150,110,0.3); animation: rise 0.4s ease both; }
      .tc-msg-card.locked { text-align: center; background: linear-gradient(135deg, #ece0c4 0%, #ddc9a0 100%); }
      .tc-msg-card.unlocked { border-left: 4px solid #9c3b2e; }
      .tc-tag { font-size: 0.9rem; color: #8a5a28; margin: 0 0 10px; font-style: italic; }
      .tc-msg-text { margin: 0 0 12px; line-height: 1.6; color: #2e2114; font-size: 1.2rem; }
      .tc-wax { font-size: 1.8rem; margin-bottom: 6px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3)); }
      .tc-locked-text { color: #6b4e28; margin: 0; font-size: 1rem; font-style: italic; }
      .tc-locked-date { color: #7a2820; margin: 3px 0 0; font-family: 'Cinzel', serif; font-size: 1.05rem; font-weight: 600; }
      .tc-badge { display: inline-block; font-size: 0.8rem; font-weight: 600; padding: 3px 12px; border-radius: 20px; margin-top: 8px; font-family: 'Cinzel', serif; background: rgba(156,59,46,0.15); color: #9c3b2e; }
      .tc-delete { position: absolute; top: 12px; right: 12px; width: 26px; height: 26px; border-radius: 50%; background: transparent; border: none; color: #a89070; cursor: pointer; font-size: 0.95rem; transition: color 0.2s, background 0.2s; }
      .tc-delete:hover { color: #9c3b2e; background: rgba(156,59,46,0.12); }
      .tc-capsule-item { position: relative; background: rgba(120,80,40,0.08); border: 1px solid #c9b186; border-radius: 5px; padding: 16px; margin-bottom: 12px; }
      .tc-capsule-title { font-family: 'Cinzel', serif; font-weight: 600; color: #5a3e1e; margin: 0 0 4px; font-size: 1.05rem; }
      .tc-capsule-date { color: #7a2820; margin: 0 0 12px; font-size: 0.95rem; font-style: italic; }
      .tc-copy-btn { width: 100%; }
      .tc-modal-overlay { position: fixed; inset: 0; background: rgba(20,14,8,0.75); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 100; animation: fade 0.2s ease; }
      .tc-modal { background: linear-gradient(135deg, #f3e7cc 0%, #e8d7b3 100%); border: 1px solid #c9b186; border-radius: 6px; padding: 28px; max-width: 440px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(180,150,110,0.3); animation: rise 0.3s ease both; }
      .tc-footer { text-align: center; color: #6b5436; font-size: 1.3rem; margin-top: 30px; letter-spacing: 8px; }
      @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    `}</style>
  )
}

export default App