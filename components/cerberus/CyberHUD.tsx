import { useState } from 'react'
import { supabase } from '@/lib/cerberus/supabase'
import { useCerberusStore, WebNode } from '@/store/cerberus/useCerberusStore'
import { Plus, ZoomIn, ZoomOut, Maximize, Unlock, ChevronLeft, ChevronRight, Bookmark, Network, Globe, X, FolderPlus, ArrowUpCircle, LogOut, Folder, CornerUpLeft, Edit2, Trash2 } from 'lucide-react'

export default function CyberHUD() {
  const {
    nodes, openFrames, activeFrameId, nextFrame, prevFrame,
    zoomIn, zoomOut, isZoomModeActive, toggleZoomMode,
    addNode, updateNode, deleteNode, openFrame, currentClusterId, exitCluster, resetToMap
  } = useCerberusStore()

  const [showAddModal, setShowAddModal] = useState(false)
  const [showSavedMenu, setShowSavedMenu] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null)
  
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [isClusterType, setIsClusterType] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editClusterId, setEditClusterId] = useState<string | null>(null)
  const [editingIsCluster, setEditingIsCluster] = useState(false)

  const handleInstall = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    addNode(name, isClusterType ? '' : url, isClusterType)
    setName(''); setUrl(''); setIsClusterType(false); setShowAddModal(false)
  }

  const openEdit = (node: WebNode) => {
    setEditId(node.id)
    setEditName(node.name)
    setEditUrl(node.url)
    setEditClusterId(node.clusterId)
    setEditingIsCluster(node.isCluster)
    setShowEditModal(true)
    setShowSavedMenu(false)
  }

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (editId) updateNode(editId, editName, editingIsCluster ? '' : editUrl, editClusterId)
    setShowEditModal(false)
  }

  const handleToggleSavedMenu = () => {
    if (!showSavedMenu) {
      setMenuFolderId(currentClusterId)
    } else {
      setMenuFolderId(null)
    }
    setShowSavedMenu(!showSavedMenu)
  }

  const currentFolder = nodes.find(n => n.id === menuFolderId)
  const parentFolderId = currentFolder ? currentFolder.clusterId : null
  const displayNodes = nodes.filter(n => n.saved && n.clusterId === menuFolderId)
  
  const displayFolders = displayNodes.filter(n => n.isCluster)
  const displayFiles = displayNodes.filter(n => !n.isCluster)
  
  const availableClusters = nodes.filter(n => n.isCluster && n.id !== editId)

  const hardBlackStyle = { backgroundColor: '#000000', borderColor: '#c0c0c0', color: '#c0c0c0' }
  const btnClass = "border rounded-sm flex items-center justify-center gap-2 px-4 py-3 sm:px-6 sm:py-4 transition-colors pointer-events-auto whitespace-nowrap shadow-[0_0_15px_rgba(0,0,0,0.8)] hover:border-white hover:text-white"
  const textClass = "font-bitcount text-xs sm:text-sm tracking-[0.15em] uppercase"
  const iconColor = "#c0c0c0" 

  return (
    <>
      <div style={{ position: 'fixed', top: '40px', left: 0, width: '100%', textAlign: 'center', zIndex: 50, pointerEvents: 'none' }}>
        <h1 className="font-bitcount silver-fade-text" style={{ fontSize: '2.5rem', margin: 0, textTransform: 'uppercase', letterSpacing: '4px', textShadow: '0 0 15px rgba(192,192,192,0.3)' }}>
          Cerberus
        </h1>
        <button 
          onClick={() => supabase.auth.signOut()} 
          style={{ position: 'absolute', top: 0, right: '24px', ...hardBlackStyle }}
          className="border rounded-sm px-4 py-2 pointer-events-auto text-[10px] uppercase font-bitcount tracking-widest hover:border-white hover:text-white"
        >
          <LogOut size={14} className="inline mr-2" /> Disconnect
        </button>
      </div>

      {showSavedMenu && (
        <div style={{ 
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', 
          backgroundColor: 'rgba(0,0,0,0.95)', border: '1px solid #c0c0c0', borderRadius: '8px', padding: '16px', 
          display: 'flex', flexDirection: 'column', zIndex: 100, boxShadow: '0 0 40px rgba(0,0,0,0.9)', pointerEvents: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #555', paddingBottom: '12px', marginBottom: '12px' }}>
            <span style={{ color: '#c0c0c0', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}>
              {currentFolder ? `[ ${currentFolder.name} ]` : 'Root Directory'}
            </span>
            <button onClick={() => { setShowSavedMenu(false); setMenuFolderId(null); }} style={{ background: 'none', border: 'none', color: '#c0c0c0', cursor: 'pointer', padding: '4px' }}>
              <X size={20} />
            </button>
          </div>
          
          <div style={{ maxHeight: '45vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingRight: '4px' }}>
            {menuFolderId && (
              <button 
                onClick={() => setMenuFolderId(parentFolderId)}
                style={{ ...hardBlackStyle, width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 12px', marginBottom: '8px', border: '1px dashed #555' }}
              >
                <CornerUpLeft color={iconColor} size={16} />
                <span style={{ fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}>.. / back</span>
              </button>
            )}

            {displayNodes.length === 0 && <p style={{ color: '#555', fontSize: '10px', textAlign: 'center', padding: '20px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Directory empty.</p>}
            
            {displayFolders.map(node => (
              <div key={node.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => setMenuFolderId(node.id)} style={{ ...hardBlackStyle, flex: 1, display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 12px', border: '1px solid #00f2ff', color: '#00f2ff' }}>
                  <Folder color="#00f2ff" size={16} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>[ {node.name} ]</span>
                </button>
                <button onClick={() => openEdit(node)} style={{ ...hardBlackStyle, padding: '0 16px', border: '1px solid #333' }}><Edit2 size={16} color="#c0c0c0"/></button>
                <button onClick={() => deleteNode(node.id)} style={{ ...hardBlackStyle, padding: '0 16px', border: '1px solid #333' }}><Trash2 size={16} color="#ff4444"/></button>
              </div>
            ))}

            {displayFiles.map(node => (
              <div key={node.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => { openFrame(node.id); setShowSavedMenu(false); setMenuFolderId(null); }} style={{ ...hardBlackStyle, flex: 1, display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 12px', border: '1px solid #333' }}>
                  <Globe color={iconColor} size={16} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>{node.name}</span>
                </button>
                <button onClick={() => openEdit(node)} style={{ ...hardBlackStyle, padding: '0 16px', border: '1px solid #333' }}><Edit2 size={16} color="#c0c0c0"/></button>
                <button onClick={() => deleteNode(node.id)} style={{ ...hardBlackStyle, padding: '0 16px', border: '1px solid #333' }}><Trash2 size={16} color="#ff4444"/></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showEditModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'auto' }}>
          <form onSubmit={handleEditSave} style={{ width: '90%', maxWidth: '400px', backgroundColor: '#000', border: '1px solid #c0c0c0', borderRadius: '4px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #555', paddingBottom: '12px' }}>
              <h2 className="silver-fade-text font-bitcount" style={{ margin: 0, fontSize: '16px', textTransform: 'uppercase', letterSpacing: '2px' }}>Modify {editingIsCluster ? 'Cluster' : 'Signal'}</h2>
              <button type="button" onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', color: '#c0c0c0' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Designation</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required style={{ ...hardBlackStyle, width: '100%', padding: '16px', outline: 'none' }} />
              </div>
              
              {!editingIsCluster && (
                <div>
                  <label style={{ display: 'block', color: '#888', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Signal Source (URL)</label>
                  <input type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} required style={{ ...hardBlackStyle, width: '100%', padding: '16px', outline: 'none' }} />
                </div>
              )}

              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Parent Cluster (Location)</label>
                <select 
                  value={editClusterId || ''} 
                  onChange={(e) => setEditClusterId(e.target.value || null)} 
                  style={{ ...hardBlackStyle, width: '100%', padding: '16px', outline: 'none', appearance: 'none' }}
                >
                  <option value="">Root Directory (Cosmos)</option>
                  {availableClusters.map(c => (
                    <option key={c.id} value={c.id}>[ {c.name} ]</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" style={{ ...hardBlackStyle, width: '100%', padding: '16px', marginTop: '8px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 'bold', border: '1px solid #fff' }}>
              Save Coordinates
            </button>
          </form>
        </div>
      )}

      <div style={{ position: 'fixed', bottom: '24px', left: 0, width: '100%', zIndex: 50, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', alignItems: 'center', gap: '12px', padding: '0 16px', width: '100%', pointerEvents: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          
          {currentClusterId && (
            <button onClick={() => { exitCluster(); setMenuFolderId(null); }} style={hardBlackStyle} className={btnClass}>
              <ArrowUpCircle color="#00f2ff" size={18} />
              <span className={textClass} style={{ color: '#00f2ff' }}>Cosmos</span>
            </button>
          )}

          <button onClick={() => { resetToMap(); setShowSavedMenu(false); setMenuFolderId(null); }} style={hardBlackStyle} className={btnClass}>
            <Network color={iconColor} size={18} />
            <span className={textClass}>Map</span>
          </button>
          
          <button onClick={() => { setShowAddModal(true); setShowSavedMenu(false); }} style={hardBlackStyle} className={btnClass}>
            <Plus color={iconColor} size={18} />
            <span className={textClass}>Add</span>
          </button>

          <button onClick={handleToggleSavedMenu} style={hardBlackStyle} className={btnClass}>
            <Bookmark color={iconColor} size={18} />
            <span className={textClass}>Saved</span>
          </button>

          {openFrames.length > 0 && activeFrameId && (
            <div style={{ ...hardBlackStyle, padding: '0', display: 'flex', flexShrink: 0 }} className="border rounded-sm shadow-[0_0_15px_rgba(0,0,0,0.8)]">
              <button onClick={prevFrame} style={{ background: 'transparent', border: 'none', borderRight: '1px solid #555', padding: '12px', color: '#c0c0c0' }}><ChevronLeft size={20} /></button>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '9px', color: '#888', letterSpacing: '2px' }}>ACTIVE</span>
                <span style={{ color: '#fff' }}>{openFrames.indexOf(activeFrameId) + 1} / {openFrames.length}</span>
              </div>
              <button onClick={nextFrame} style={{ background: 'transparent', border: 'none', borderLeft: '1px solid #555', padding: '12px', color: '#c0c0c0' }}><ChevronRight size={20} /></button>
            </div>
          )}

          <div style={{ ...hardBlackStyle, padding: '0', display: 'flex', flexShrink: 0 }} className="border rounded-sm shadow-[0_0_15px_rgba(0,0,0,0.8)]">
            <button onClick={zoomOut} style={{ background: 'transparent', border: 'none', borderRight: '1px solid #555', padding: '12px', color: '#c0c0c0' }}><ZoomOut size={20} /></button>
            <button onClick={toggleZoomMode} style={{ background: 'transparent', border: 'none', padding: '12px 16px', color: '#c0c0c0', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '12px', fontWeight: 'bold' }}>
              {isZoomModeActive ? <Unlock size={18} /> : <Maximize size={18} />}
              <span>{isZoomModeActive ? 'Unlock' : 'Lock'}</span>
            </button>
            <button onClick={zoomIn} style={{ background: 'transparent', border: 'none', borderLeft: '1px solid #555', padding: '12px', color: '#c0c0c0' }}><ZoomIn size={20} /></button>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'auto' }}>
          <form onSubmit={handleInstall} style={{ width: '90%', maxWidth: '400px', backgroundColor: '#000', border: '1px solid #c0c0c0', borderRadius: '4px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #555', paddingBottom: '12px' }}>
              <h2 className="silver-fade-text font-bitcount" style={{ margin: 0, fontSize: '16px', textTransform: 'uppercase', letterSpacing: '2px' }}>Add Coordinates</h2>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: '#c0c0c0' }}><X size={20} /></button>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', paddingBottom: '12px' }}>
              <button type="button" onClick={() => setIsClusterType(false)} style={{ ...hardBlackStyle, flex: 1, padding: '12px', border: isClusterType ? '1px solid #333' : '1px solid #fff' }}>
                <Globe size={16} style={{ margin: '0 auto 8px auto' }} /> SITE
              </button>
              <button type="button" onClick={() => setIsClusterType(true)} style={{ ...hardBlackStyle, flex: 1, padding: '12px', border: isClusterType ? '1px solid #00f2ff' : '1px solid #333' }}>
                <FolderPlus size={16} style={{ margin: '0 auto 8px auto', color: isClusterType ? '#00f2ff' : '#c0c0c0' }} /> CLUSTER
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Designation</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{ ...hardBlackStyle, width: '100%', padding: '16px', textAlign: 'left', outline: 'none' }} />
              </div>
              {!isClusterType && (
                <div>
                  <label style={{ display: 'block', color: '#888', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Signal Source (URL)</label>
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://" style={{ ...hardBlackStyle, width: '100%', padding: '16px', textAlign: 'left', outline: 'none' }} />
                </div>
              )}
            </div>

            <button type="submit" style={{ ...hardBlackStyle, width: '100%', padding: '16px', marginTop: '8px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 'bold' }}>
              Initialize {isClusterType ? 'Cluster' : 'Signal'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}


