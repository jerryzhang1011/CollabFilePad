import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { TextAreaBinding } from 'y-textarea'

// Single fixed room for the entire LAN (single shared file)
const roomName = 'lan-room'
const roomNameEl = document.getElementById('room-name')
if (roomNameEl) roomNameEl.textContent = roomName

const ydoc = new Y.Doc()
// Legacy (for one-time migration): filename -> Y.Text
const legacyFilesMap = ydoc.getMap('files')

// New data model (VS Code-like):
// - nodes: id -> { id, type: 'file'|'folder', name, parentId, createdAt, updatedAt }
// - children: folderId -> Y.Array<childId>
// - fileContents: fileId -> Y.Text
const yNodes = ydoc.getMap('nodes')
const yChildren = ydoc.getMap('children')
const yFiles = ydoc.getMap('fileContents')

// Keep selection local to this page (do not sync via Yjs)
let selectedId = null

// Per-page persistence for last selected file (scoped by room)
const LAST_SELECTED_KEY = `last-selected:${roomName}`
const saveLastSelected = (name) => { try { localStorage.setItem(LAST_SELECTED_KEY, name) } catch {} }
const loadLastSelected = () => { try { return localStorage.getItem(LAST_SELECTED_KEY) } catch { return null } }

// Use LAN signaling on the current host only (no public fallback)
const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
const host = location.hostname
const signalingServers = [`${protocol}://${host}:4444`]

const provider = new WebrtcProvider(roomName, ydoc, {
  signaling: signalingServers,
  awareness: undefined,
  // Avoid too many peers in large LANs; adjust if needed
  maxConns: 20
})

const textarea = document.getElementById('editor')
let binding = null

// Insert three spaces on Tab inside the editor
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = textarea.value
    const spaces = '   '
    // Simple behavior: always insert three spaces at caret, replace selection
    const newValue = value.slice(0, start) + spaces + value.slice(end)
    textarea.value = newValue
    const newPos = start + spaces.length
    textarea.selectionStart = newPos
    textarea.selectionEnd = newPos
    // Notify Yjs binding
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
})

const fileListEl = document.getElementById('file-list')
const newBtn = document.getElementById('new-file')
const sidebarToggleBtn = document.getElementById('sidebar-toggle')
const sidebarEl = document.querySelector('.sidebar')

// Collapse sidebar when opening modals on small screens to avoid overlaying dialogs
const closeSidebarForModal = () => {
  try {
    const isSmall = window.matchMedia && window.matchMedia('(max-width: 768px)').matches
    if (isSmall && sidebarEl && sidebarEl.classList.contains('open')) {
      sidebarEl.classList.remove('open')
      document.body.classList.remove('sidebar-open')
    }
  } catch {}
}

// Modal elements
const modal = document.getElementById('modal')
const modalTitle = document.getElementById('modal-title')
const modalBody = document.getElementById('modal-body')
const modalCancel = document.getElementById('modal-cancel')
const modalConfirm = document.getElementById('modal-confirm')

let modalConfirmHandler = null
const openModal = (title, buildBody, onConfirm, confirmText = 'Confirm') => {
  modalTitle.textContent = title
  modalBody.innerHTML = ''
  buildBody(modalBody)
  // keep SVG icon inside the confirm button; only set accessible labels
  if (modalConfirm) {
    modalConfirm.setAttribute('aria-label', confirmText)
    modalConfirm.setAttribute('title', confirmText)
  }
  modalConfirmHandler = onConfirm
  modal.classList.remove('hidden')
}
const closeModal = () => {
  modal.classList.add('hidden')
  modalConfirmHandler = null
}
modalCancel.onclick = closeModal
modalConfirm.onclick = () => { if (modalConfirmHandler) modalConfirmHandler() }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal() })

// Utilities
const nowIso = () => new Date().toISOString()
const uid = () => 'n_' + Math.random().toString(36).slice(2)

const ensureArray = (folderId) => {
  if (!yChildren.has(folderId)) yChildren.set(folderId, new Y.Array())
  return yChildren.get(folderId)
}

const createFolderNode = (name, parentId) => {
  const id = uid()
  yNodes.set(id, { id, type: 'folder', name, parentId, createdAt: nowIso(), updatedAt: nowIso() })
  ensureArray(id)
  const arr = ensureArray(parentId)
  arr.push([id])
  return id
}

const createFileNode = (name, parentId) => {
  const id = uid()
  yNodes.set(id, { id, type: 'file', name, parentId, createdAt: nowIso(), updatedAt: nowIso() })
  yFiles.set(id, new Y.Text())
  const arr = ensureArray(parentId)
  arr.push([id])
  return id
}

const ROOT_ID = 'root'
const ensureRoot = () => {
  if (!yNodes.has(ROOT_ID)) {
    yNodes.set(ROOT_ID, { id: ROOT_ID, type: 'folder', name: 'ROOT', parentId: null, createdAt: nowIso(), updatedAt: nowIso() })
    ensureArray(ROOT_ID)
  } else if (!yChildren.has(ROOT_ID)) {
    ensureArray(ROOT_ID)
  }
}

// One-time migration from legacy files to new nodes
const migrateIfNeeded = () => {
  ensureRoot()
  if (yNodes.size > 1) return
  if (legacyFilesMap.size === 0) return
  legacyFilesMap.forEach((text, name) => {
    const id = createFileNode(name, ROOT_ID)
    yFiles.set(id, text) // reuse existing Y.Text instance
  })
}

const ensureInitialFile = () => {
  ensureRoot()
  if (yChildren.get(ROOT_ID).length === 0) {
    createFileNode('Untitled.txt', ROOT_ID)
  }
}

const getSelectedId = () => selectedId

const selectFile = (id) => {
  if (!id) return
  const node = yNodes.get(id)
  if (!node || node.type !== 'file') return
  selectedId = id
  if (binding) binding.destroy()
  const ytext = yFiles.get(id)
  binding = new TextAreaBinding(ytext, textarea)
  renderTreeUI()
  saveLastSelected(id)
}

const createFile = (parentId = ROOT_ID) => {
  const siblingNames = new Set((ensureArray(parentId).toArray() || []).map(cid => yNodes.get(cid)?.name))
  closeSidebarForModal()
  openModal('New file', (container) => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'icon-file'
    input.placeholder = 'File name'
    input.value = 'Untitled.txt'
    container.appendChild(input)
    setTimeout(() => { try { input.focus(); input.select() } catch {} }, 0)
    const doConfirm = () => {
      let name = input.value.trim()
      if (!name) { closeModal(); return }
      let i = 1
      const base = name
      while (siblingNames.has(name)) { name = `${base} ${i++}` }
      const id = createFileNode(name, parentId)
      selectFile(id)
      closeModal()
    }
    modalConfirm.onclick = doConfirm
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doConfirm() } })
  }, null, 'Create')
}

const renameFile = (targetId) => {
  const current = targetId || getSelectedId()
  if (!current) return
  const node = yNodes.get(current)
  if (!node || node.type !== 'file') return
  closeSidebarForModal()
  openModal('Rename file', (container) => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'icon-file'
    input.placeholder = 'File name'
    input.value = node.name
    container.appendChild(input)
    // Focus and select the whole filename
    setTimeout(() => {
      input.focus()
      try { input.select() } catch {}
      try { input.setSelectionRange(0, input.value.length) } catch {}
    }, 0)
    const doConfirm = () => {
      const next = input.value.trim()
      if (!next || next === node.name) { closeModal(); return }
      const parentArr = ensureArray(node.parentId)
      const siblingNames = new Set(parentArr.toArray().filter(id => id !== node.id).map(id => yNodes.get(id)?.name))
      if (siblingNames.has(next)) { alert('A file with that name already exists.'); return }
      yNodes.set(node.id, { ...node, name: next, updatedAt: nowIso() })
      selectFile(node.id)
      closeModal()
    }
    modalConfirm.onclick = doConfirm
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doConfirm() }
    })
  }, null, 'Rename')
}

const deleteFile = (targetId) => {
  const current = targetId || getSelectedId()
  if (!current) return
  const node = yNodes.get(current)
  if (!node || node.type !== 'file') return
  openModal('Delete file', (container) => {
    const p = document.createElement('p')
    p.innerHTML = `Delete <span class="danger">${node.name}</span>?`
    container.appendChild(p)
    modalConfirm.onclick = () => {
      // remove from parent children
      const arr = ensureArray(node.parentId)
      const idx = arr.toArray().indexOf(node.id)
      if (idx >= 0) arr.delete(idx)
      yFiles.delete(node.id)
      yNodes.delete(node.id)
      // select next
      const firstFileId = Array.from(yNodes.values()).find(n => n.type === 'file')?.id
      if (firstFileId) selectFile(firstFileId)
      closeModal()
    }
  }, null, 'Delete')
}

// ------- Tree rendering (folders + files) -------
const isFolder = (id) => yNodes.get(id)?.type === 'folder'
const nameOf = (id) => yNodes.get(id)?.name || ''

const renderFolderRow = (folderId, container) => {
  const li = document.createElement('li')
  li.className = 'folder-row'
  const label = document.createElement('div'); label.className = 'file-name'
  const chev = document.createElement('span'); chev.style.marginRight = '6px'
  label.appendChild(chev)
  const span = document.createElement('span'); span.textContent = nameOf(folderId) || 'ROOT'
  label.appendChild(span)
  li.appendChild(label)

  // actions
  const actions = document.createElement('div'); actions.className = 'file-actions'
  const kebab = document.createElement('button'); kebab.className = 'kebab'; kebab.textContent = '...'
  kebab.onclick = (e) => {
    e.stopPropagation()
    const menu = li.querySelector('.menu')
    const isOpen = menu.classList.contains('open')
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'))
    document.querySelectorAll('.file-list li.menu-open').forEach(row => row.classList.remove('menu-open'))
    if (!isOpen) { menu.classList.add('open'); li.classList.add('menu-open') }
  }
  actions.appendChild(kebab)
  const menu = document.createElement('div'); menu.className = 'menu'; menu.onclick = (e)=>e.stopPropagation()
  const nf = document.createElement('button'); nf.textContent = 'New File'; nf.onclick = (e)=>{ e.stopPropagation(); menu.classList.remove('open'); li.classList.remove('menu-open'); createFile(folderId) }
  const nd = document.createElement('button'); nd.textContent = 'New Folder'; nd.onclick = (e)=>{ e.stopPropagation(); menu.classList.remove('open'); li.classList.remove('menu-open'); createFolder(folderId) }
  const rn = document.createElement('button'); rn.textContent = 'Rename'; rn.onclick = (e)=>{ e.stopPropagation(); menu.classList.remove('open'); li.classList.remove('menu-open'); renameFolder(folderId) }
  const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = (e)=>{ e.stopPropagation(); menu.classList.remove('open'); li.classList.remove('menu-open'); deleteFolder(folderId) }
  menu.appendChild(nf); menu.appendChild(nd); if (folderId!==ROOT_ID) { menu.appendChild(rn); menu.appendChild(del) }

  // collapsed state
  const COLLAPSED_KEY = `collapsed-folders:${roomName}`
  const loadCollapsed = () => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')) } catch { return new Set() } }
  const saveCollapsed = (set) => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(set))) } catch {} }
  if (!window.__collapsedFolders) window.__collapsedFolders = loadCollapsed()
  const collapsed = window.__collapsedFolders

  const setChev = () => { chev.textContent = collapsed.has(folderId) ? '▸' : '▾' }
  setChev()

  // toggle expand/collapse on any click within the folder row (except menus/buttons)
  const toggle = (e) => {
    // ignore menu/kebab clicks
    if (e.target.closest('.kebab') || e.target.closest('.menu')) return
    e.stopPropagation()
    if (collapsed.has(folderId)) collapsed.delete(folderId); else collapsed.add(folderId)
    saveCollapsed(collapsed)
    renderTreeUI()
  }
  label.onclick = toggle
  li.onclick = toggle

  // DND as drop target
  li.addEventListener('dragover', (e)=>{ e.preventDefault(); li.classList.add('drop-target') })
  li.addEventListener('dragenter', ()=> li.classList.add('drop-target'))
  li.addEventListener('dragleave', ()=> li.classList.remove('drop-target'))
  li.addEventListener('drop', (e)=>{
    e.preventDefault(); li.classList.remove('drop-target')
    const data = e.dataTransfer?.getData('application/x-node') || e.dataTransfer?.getData('text/plain')
    if (!data) return
    const payload = JSON.parse(data)
    if (payload.type === 'file') moveNode(payload.id, folderId)
    if (payload.type === 'folder') moveNode(payload.id, folderId)
  })

  // make folder itself draggable as a source (except ROOT)
  if (folderId !== ROOT_ID) {
    li.draggable = true
    li.addEventListener('dragstart', (e) => {
      if (!e.dataTransfer) return
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-node', JSON.stringify({ type: 'folder', id: folderId }))
    })
  }

  li.appendChild(actions); li.appendChild(menu)
  container.appendChild(li)
  return li
}

const renderTreeNode = (folderId, container, filter = '') => {
  const row = renderFolderRow(folderId, container)
  const list = document.createElement('ul')
  list.style.listStyle = 'none'; list.style.margin = '0'; list.style.padding = '0 0 0 14px'
  const COLLAPSED_KEY = `collapsed-folders:${roomName}`
  if (!window.__collapsedFolders) {
    try { window.__collapsedFolders = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')) } catch { window.__collapsedFolders = new Set() }
  }
  const collapsed = window.__collapsedFolders
  // ROOT never collapsed
  collapsed.delete(ROOT_ID)
  if (collapsed.has(folderId)) { list.style.display = 'none' }
  // keep parent row highlighted when dragging over its content area
  list.addEventListener('dragover', (e)=>{ e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; row.classList.add('drop-target') })
  list.addEventListener('dragleave', ()=> { row.classList.remove('drop-target') })
  list.addEventListener('drop', ()=> { row.classList.remove('drop-target') })
  const arr = ensureArray(folderId).toArray()
  const sorted = arr.slice().sort((a,b)=> nameOf(a).localeCompare(nameOf(b)))
  for (const id of sorted) {
    const nm = nameOf(id)
    if (filter && !nm.toLowerCase().includes(filter)) continue
    if (isFolder(id)) {
      renderTreeNode(id, list, filter)
    } else {
      const li = document.createElement('li')
      if (id === getSelectedId()) li.classList.add('active')
      li.onclick = () => selectFile(id)
      li.draggable = true
      li.addEventListener('dragstart', (e)=>{
        if (!e.dataTransfer) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/x-node', JSON.stringify({ type: 'file', id }))
      })
      const label = document.createElement('div'); label.className = 'file-name'; label.textContent = nm
      const actions = document.createElement('div'); actions.className = 'file-actions'
      const kebab = document.createElement('button'); kebab.className = 'kebab'; kebab.textContent = '...'
      kebab.onclick = (e)=>{ e.stopPropagation(); const menu = li.querySelector('.menu'); const isOpen = menu.classList.contains('open'); document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); document.querySelectorAll('.file-list li.menu-open').forEach(row => row.classList.remove('menu-open')); if (!isOpen) { menu.classList.add('open'); li.classList.add('menu-open') } }
      actions.appendChild(kebab)
      const menu = document.createElement('div'); menu.className = 'menu'; menu.onclick = (e)=>e.stopPropagation()
      const r = document.createElement('button'); r.textContent = 'Rename'; r.onclick = (e)=>{ e.stopPropagation(); menu.classList.remove('open'); li.classList.remove('menu-open'); renameFile(id) }
      const d = document.createElement('button'); d.textContent = 'Delete'; d.onclick = (e)=>{ e.stopPropagation(); menu.classList.remove('open'); li.classList.remove('menu-open'); deleteFile(id) }
      menu.appendChild(r); menu.appendChild(d)
      li.appendChild(label); li.appendChild(actions); li.appendChild(menu)
      list.appendChild(li)
    }
  }
  container.appendChild(list)
}

const renderTreeUI = () => {
  const filter = (document.getElementById('file-search')?.value || '').trim().toLowerCase()
  fileListEl.innerHTML = ''
  renderTreeNode(ROOT_ID, fileListEl, filter)
}

// ------- Folder CRUD & Move -------
const createFolder = (parentId = ROOT_ID) => {
  const siblingNames = new Set(ensureArray(parentId).toArray().map(id => yNodes.get(id)?.name))
  closeSidebarForModal()
  openModal('New folder', (container) => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'icon-folder'
    input.placeholder = 'Folder name'
    input.value = 'New Folder'
    container.appendChild(input)
    setTimeout(() => { try { input.focus(); input.select() } catch {} }, 0)
    const doConfirm = () => {
      let name = input.value.trim()
      if (!name) { closeModal(); return }
      let i = 1
      const base = name
      while (siblingNames.has(name)) name = `${base} ${i++}`
      createFolderNode(name, parentId)
      closeModal()
      renderTreeUI()
    }
    modalConfirm.onclick = doConfirm
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doConfirm() } })
  }, null, 'Create')
}

// ------- Download/Upload -------
const btnDownload = document.getElementById('btn-download')
const btnUploadFiles = document.getElementById('btn-upload-files')
const btnUploadFolder = document.getElementById('btn-upload-folder')
const uploaderFolder = document.getElementById('uploader-folder')
const uploaderFiles = document.getElementById('uploader-files')

const textFromYText = (ytext) => ytext.toString()

const collectProject = () => {
  // build a map of path -> content for files under ROOT
  const pathMap = new Map()
  const walk = (folderId, prefix) => {
    ensureArray(folderId).toArray().forEach(id => {
      const node = yNodes.get(id)
      const p = prefix ? `${prefix}/${node.name}` : node.name
      if (node.type === 'folder') walk(id, p)
      else pathMap.set(p, textFromYText(yFiles.get(id)))
    })
  }
  walk(ROOT_ID, yNodes.get(ROOT_ID)?.name || 'ROOT')
  return pathMap
}

const downloadZip = async () => {
  // Use ESM build to ensure dynamic import works in browsers
  const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')
  const zip = new JSZip()
  const files = collectProject()
  files.forEach((content, path) => zip.file(path, content))
  const blob = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(yNodes.get(ROOT_ID)?.name || 'project')}.zip`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  a.remove()
}

if (btnDownload) btnDownload.onclick = downloadZip

const isTextFileName = (name) => {
  // allow common text & source-code types; heuristic by extension
  return /\.(txt|md|json|jsonc|js|mjs|cjs|ts|jsx|tsx|css|scss|sass|less|html?|xml|yml|yaml|toml|ini|conf|log|csv|tsv|sql|pyw?|java|c|h|hpp|hh|cpp|cc|cxx|cs|go|rb|php|sh|bash|zsh|fish|rs|kt|kts|swift|m|mm|scala|lua|r|pl|pm|hs|clj|cljs|edn|dart|groovy|erl|ex|exs|elm|nim|zig)$/i.test(name)
}

const importFilesToRoot = async (fileList) => {
  for (const file of fileList) {
    if (file.type && !file.type.startsWith('text/')) {
      // if MIME is empty (folders via webkitdirectory), check name ext
      if (!isTextFileName(file.name)) { alert('Only text files are allowed. Non-text found: ' + file.name); return }
    }
  }
  // helper: ensure folder chain exists under ROOT by relative segments
  const folderCache = new Map()
  const getOrCreateFolderBySegments = (segments) => {
    let parent = ROOT_ID
    for (const seg of segments) {
      const key = parent + '/' + seg
      if (folderCache.has(key)) { parent = folderCache.get(key); continue }
      const existingId = ensureArray(parent).toArray().find(id => yNodes.get(id)?.type==='folder' && yNodes.get(id)?.name===seg)
      if (existingId) { folderCache.set(key, existingId); parent = existingId; continue }
      const created = createFolderNode(seg, parent)
      folderCache.set(key, created)
      parent = created
    }
    return parent
  }

  for (const file of fileList) {
    const text = await file.text()
    // keep full relative path (including top-level folder) under ROOT
    const relPath = file.webkitRelativePath && file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name
    const parts = relPath.split('/').filter(Boolean)
    const fileName = parts.pop()
    const parentId = getOrCreateFolderBySegments(parts)
    const siblingNames = new Set(ensureArray(parentId).toArray().map(id => yNodes.get(id)?.name))
    let finalName = fileName, i = 1
    while (siblingNames.has(finalName)) finalName = `${fileName} ${i++}`
    const id = createFileNode(finalName, parentId)
    yFiles.get(id).insert(0, text)
  }
  renderTreeUI()
}

if (btnUploadFiles && uploaderFiles) {
  btnUploadFiles.onclick = () => { uploaderFiles.value = ''; uploaderFiles.click() }
  uploaderFiles.onchange = (e) => { const files = Array.from(e.target.files || []); if (files.length) importFilesToRoot(files) }
}
if (btnUploadFolder && uploaderFolder) {
  btnUploadFolder.onclick = () => { uploaderFolder.value = ''; uploaderFolder.click() }
  uploaderFolder.onchange = (e) => { const files = Array.from(e.target.files || []); if (files.length) importFilesToRoot(files) }
}

const renameFolder = (folderId) => {
  if (!folderId) { return }
  const node = yNodes.get(folderId); if (!node || node.type !== 'folder') return
  closeSidebarForModal()
  openModal('Rename folder', (container) => {
    const input = document.createElement('input'); input.type = 'text'; input.value = node.name; container.appendChild(input)
    setTimeout(()=>{ try{ input.focus(); input.select() }catch{} },0)
    const doConfirm = () => {
      const next = input.value.trim(); if (!next || next === node.name) { closeModal(); return }
      const siblingNames = new Set(ensureArray(node.parentId).toArray().filter(id=>id!==node.id).map(id=>yNodes.get(id)?.name))
      if (siblingNames.has(next)) { alert('A folder with that name already exists.'); return }
      yNodes.set(node.id, { ...node, name: next, updatedAt: nowIso() }); closeModal(); renderTreeUI()
    }
    modalConfirm.onclick = doConfirm
    input.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ e.preventDefault(); doConfirm() } })
  }, null, 'Rename')
}

const deleteFolder = (folderId) => {
  if (!folderId || folderId === ROOT_ID) return
  const node = yNodes.get(folderId); if (!node || node.type !== 'folder') return
  openModal('Delete folder', (container)=>{
    const p = document.createElement('p'); p.innerHTML = `Delete folder <b>${node.name}</b> and everything inside?`; container.appendChild(p)
    modalConfirm.onclick = () => {
      // collect subtree
      const stack = [folderId]; const toDeleteNodes = []
      while (stack.length) {
        const id = stack.pop(); toDeleteNodes.push(id)
        if (isFolder(id)) stack.push(...ensureArray(id).toArray())
      }
      // remove from parent
      const arr = ensureArray(node.parentId); const idx = arr.toArray().indexOf(node.id); if (idx>=0) arr.delete(idx)
      // delete files and nodes
      toDeleteNodes.forEach(id => { if (!isFolder(id)) yFiles.delete(id); yNodes.delete(id); yChildren.delete(id) })
      renderTreeUI(); closeModal()
    }
  }, null, 'Delete')
}

const moveNode = (id, newParentId) => {
  if (id === newParentId) return
  const node = yNodes.get(id); if (!node) return
  // prevent moving folder into its descendant
  if (isFolder(id)) {
    let cur = newParentId
    while (cur) { if (cur === id) return; cur = yNodes.get(cur)?.parentId }
  }
  const oldArr = ensureArray(node.parentId); const pos = oldArr.toArray().indexOf(id); if (pos>=0) oldArr.delete(pos)
  const newArr = ensureArray(newParentId); newArr.push([id])
  yNodes.set(id, { ...node, parentId: newParentId, updatedAt: nowIso() })
  if (node.type === 'file' && selectedId === id) selectFile(id)
}

if (newBtn) newBtn.onclick = () => createFile(ROOT_ID)

// Close any open menus when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu') && !e.target.closest('.kebab')) {
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'))
  }
})

// Sidebar toggle for small screens
if (sidebarToggleBtn && sidebarEl) {
  const setOpen = (open) => {
    if (open) {
      sidebarEl.classList.add('open')
      try { document.body.classList.add('sidebar-open') } catch {}
      sidebarToggleBtn.setAttribute('aria-expanded', 'true')
    } else {
      sidebarEl.classList.remove('open')
      try { document.body.classList.remove('sidebar-open') } catch {}
      sidebarToggleBtn.setAttribute('aria-expanded', 'false')
    }
  }
  sidebarToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const isOpen = sidebarEl.classList.contains('open')
    setOpen(!isOpen)
  })
  // click outside to close
  document.addEventListener('click', (e) => {
    if (!sidebarEl.classList.contains('open')) return
    if (e.target.closest('.sidebar') || e.target.closest('#sidebar-toggle')) return
    setOpen(false)
  })
}

// Sync UI on data changes
;[yNodes, yChildren].forEach(ds => ds.observeDeep(()=>{
  renderTreeUI()
}))

migrateIfNeeded()
ensureInitialFile()
// Ensure initial tree render so ROOT is visible even before any selection
renderTreeUI()
const last = loadLastSelected()
if (last && yNodes.has(last)) {
  selectFile(last)
} else {
  // pick first file under root
  const firstFile = ensureArray(ROOT_ID).toArray().find(id => yNodes.get(id)?.type==='file')
  if (firstFile) selectFile(firstFile)
}

// Show LAN share URL (server IP + port 5173) for other users to access
const shareEl = document.getElementById('share-url')
if (shareEl) {
  const port = 5173
  // try to fetch LAN ip from dev server helper; fall back to location.hostname
  fetch('/__lanip').then(r=>r.json()).then(({ ip }) => {
    const host = ip || location.hostname
    shareEl.textContent = `${location.protocol}//${host}:${port}`
  }).catch(() => {
    shareEl.textContent = `${location.protocol}//${location.hostname}:${port}`
  })
}

// Clean up on unload
window.addEventListener('beforeunload', () => {
  binding.destroy()
  provider.destroy()
  ydoc.destroy()
})


