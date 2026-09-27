import { useCerberusStore } from '@/store/cerberus/useCerberusStore'
import { Minimize2, X, ExternalLink, ExternalLinkIcon } from 'lucide-react'

export default function Holoframe({ id }: { id: string }) {
  const { nodes, activeFrameId, minimizeFrame, closeFrame } = useCerberusStore()
  const node = nodes.find(n => n.id === id)
  
  if (!node) return null

  const PROXY_URL = 'https://api.allorigins.win/raw?url='
  let safeUrl = node.url.trim()
  if (!safeUrl.startsWith('http')) safeUrl = `https://${safeUrl}`
  const finalSrc = `${PROXY_URL}${encodeURIComponent(safeUrl)}`

  const isActive = activeFrameId === id;

  return (
    <div 
      style={{
        position: 'fixed',
        top: '100px', 
        bottom: '100px', 
        left: '16px',
        right: '16px',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#000000',
        border: '1px solid #c0c0c0',
        boxShadow: '0 0 40px rgba(0,0,0,0.9)',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: isActive ? 1 : 0,
        pointerEvents: isActive ? 'auto' : 'none',
        transform: isActive ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', backgroundColor: '#000', borderBottom: '1px solid #333', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffffff', boxShadow: '0 0 10px #ffffff' }} />
          <span style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold', color: '#c0c0c0', letterSpacing: '2px', textTransform: 'uppercase' }}>
            {node.name}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a href={safeUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#c0c0c0', padding: '4px' }}>
            <ExternalLink size={20} />
          </a>
          <button onClick={minimizeFrame} style={{ color: '#c0c0c0', background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}>
            <Minimize2 size={20} />
          </button>
          <button onClick={() => closeFrame(id)} style={{ color: '#ff4444', background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, width: '100%', height: '100%', backgroundColor: '#050505' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', color: '#444', fontFamily: 'monospace', zIndex: 0 }}>
          <p style={{ color: '#c0c0c0', marginBottom: '16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px' }}>Establishing Connection...</p>
          <p style={{ fontSize: '10px', maxWidth: '300px', marginBottom: '24px', lineHeight: '1.5' }}>
            If this screen remains black, the target node has high-level security enabled and is actively blocking embedded proxies.
          </p>
          
          <a 
            href={safeUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '12px 24px', 
              backgroundColor: '#111', 
              border: '1px solid #c0c0c0', 
              color: '#c0c0c0', 
              textDecoration: 'none',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontSize: '11px',
              borderRadius: '4px'
            }}
          >
            <ExternalLinkIcon size={16} /> Route Externally
          </a>
        </div>

        {isActive && (
          <iframe
            src={finalSrc}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', backgroundColor: 'transparent', zIndex: 10 }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          />
        )}
      </div>
    </div>
  )
}


