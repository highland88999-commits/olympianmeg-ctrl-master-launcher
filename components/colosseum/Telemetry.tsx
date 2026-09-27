'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/colosseum/supabase'

export default function Telemetry() {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    const fetchTelemetry = async () => {
      const { data: logs, error } = await supabase
        .from('central_telemetry')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (!error && logs) {
        setData(logs)
      }
    }

    fetchTelemetry()
  }, [])

  return (
    <div className="panel" style={{ marginTop: '2rem' }}>
      <h2 style={{ color: 'var(--neon-bloom)' }}>Live Feed</h2>
      <p>Recent activity across the repositories.</p>
      
      {data.length === 0 ? (
        <p>Waiting for data connection...</p>
      ) : (
        <ul style={{ paddingLeft: '0', listStyle: 'none' }}>
          {data.map((log: any) => (
            <li key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(197, 198, 199, 0.2)' }}>
              <strong>{new Date(log.created_at).toLocaleString()}</strong> - {log.action_type || log.action}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


