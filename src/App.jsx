import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// ---------- Login / Signup ----------
function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMsg(error.message)
  }
  const signUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password })
    setMsg(error ? error.message : 'Signed up! Check your email if confirmation is on.')
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto' }}>
      <h2>File Manager</h2>
      <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password}
             onChange={e => setPassword(e.target.value)} />
      <button onClick={signIn}>Log in</button>
      <button onClick={signUp}>Sign up</button>
      <p>{msg}</p>
    </div>
  )
}

// ---------- Main manager ----------
function Manager({ session }) {
  const [role, setRole] = useState(null)
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [current, setCurrent] = useState(null) // selected folder
  const [newFolder, setNewFolder] = useState('')

  const isAdmin = role === 'admin'

  const loadFolders = async () => {
    const { data } = await supabase.from('folders').select('*').order('name')
    setFolders(data || [])
  }

  const loadFiles = async (folderId) => {
    const { data } = await supabase.from('files').select('*')
      .eq('folder_id', folderId).order('created_at', { ascending: false })
    setFiles(data || [])
  }

  useEffect(() => {
    supabase.from('profiles').select('role').eq('id', session.user.id).single()
      .then(({ data }) => setRole(data?.role))
    loadFolders()
  }, [])

  useEffect(() => { if (current) loadFiles(current.id) }, [current])

  const createFolder = async () => {
    if (!newFolder.trim()) return
    const { error } = await supabase.from('folders')
      .insert({ name: newFolder.trim(), created_by: session.user.id })
    if (error) return alert(error.message)
    setNewFolder('')
    loadFolders()
  }

  const uploadFile = async (e) => {
    const file = e.target.files[0]
    if (!file || !current) return
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${current.id}/${crypto.randomUUID()}-${safeName}`

    const { error: upErr } = await supabase.storage.from('files').upload(path, file)
    if (upErr) return alert(upErr.message)

    const { error: dbErr } = await supabase.from('files').insert({
      folder_id: current.id, name: file.name, storage_path: path,
      size: file.size, mime_type: file.type, uploaded_by: session.user.id,
    })
    if (dbErr) return alert(dbErr.message)
    loadFiles(current.id)
  }

  const download = async (f) => {
    const { data, error } = await supabase.storage.from('files')
      .createSignedUrl(f.storage_path, 60) // link valid for 60 seconds
    if (error) return alert(error.message)
    window.open(data.signedUrl, '_blank')
  }

  const deleteFile = async (f) => {
    await supabase.storage.from('files').remove([f.storage_path])
    await supabase.from('files').delete().eq('id', f.id)
    loadFiles(current.id)
  }

  return (
    <div style={{ maxWidth: 800, margin: '30px auto' }}>
      <p>
        {session.user.email} (<b>{role}</b>){' '}
        <button onClick={() => supabase.auth.signOut()}>Log out</button>
      </p>

      <div style={{ display: 'flex', gap: 40 }}>
        {/* Folders column */}
        <div>
          <h3>Folders</h3>
          {isAdmin && (
            <div>
              <input placeholder="New folder" value={newFolder}
                     onChange={e => setNewFolder(e.target.value)} />
              <button onClick={createFolder}>Create</button>
            </div>
          )}
          <ul>
            {folders.map(f => (
              <li key={f.id}>
                <a href="#" onClick={e => { e.preventDefault(); setCurrent(f) }}>
                  {current?.id === f.id ? <b>{f.name}</b> : f.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Files column */}
        <div>
          <h3>{current ? `Files in "${current.name}"` : 'Select a folder'}</h3>
          {isAdmin && current && <input type="file" onChange={uploadFile} />}
          <ul>
            {files.map(f => (
              <li key={f.id}>
                {f.name} ({Math.round((f.size || 0) / 1024)} KB){' '}
                <button onClick={() => download(f)}>Download</button>
                {isAdmin && <button onClick={() => deleteFile(f)}>Delete</button>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ---------- Root ----------
export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <p>Loading...</p>
  return session ? <Manager session={session} /> : <Auth />
}