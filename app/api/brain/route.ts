export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const MASTER_OWNER_EMAIL = 'olympiannexus@gmail.com';
const MANIFEST_REL_PATH = 'public/muse_provision_manifest.txt';

// Known core tables across Nexus Vortex / Olympus
const CORE_TABLES = [
  'central_telemetry',
  'nexus_nodes',
  'manuscripts',
  'drafts',
  'profiles',
  'fortresses_',
  'sgc_messages',
  'olympus_battleship_profiles',
  'olympus_battleship_rooms',
  'olympus_battleship_friends',
  'user_agents',
  'muse_manifest_logs'
];

async function verifyMasterOwner(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const supabaseUserClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabaseUserClient.auth.getUser();
  if (error || !user || user.email?.toLowerCase() !== MASTER_OWNER_EMAIL) {
    return null;
  }
  return user;
}

export async function GET(req: Request) {
  try {
    const owner = await verifyMasterOwner(req);
    if (!owner) {
      return NextResponse.json(
        { error: 'ACCESS DENIED: Master Brain Reader belongs exclusively to olympiannexus@gmail.com.' },
        { status: 403 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 1. Read Schema via RPC (if installed)
    const { data: schemaData } = await supabaseAdmin.rpc('read_olympus_brain');

    // 2. Read Full Data Copy from all core tables
    const tablesDump: Record<string, any> = {};
    for (const tableName of CORE_TABLES) {
      const { data, error } = await supabaseAdmin.from(tableName).select('*').limit(1000);
      tablesDump[tableName] = error ? { status: 'unreachable_or_restricted', detail: error.message } : data;
    }

    // 3. Read current Muse Provision .txt file
    const manifestFullPath = path.join(process.cwd(), MANIFEST_REL_PATH);
    let manifestLines: string[] = [];
    if (fs.existsSync(manifestFullPath)) {
      const rawTxt = fs.readFileSync(manifestFullPath, 'utf-8');
      manifestLines = rawTxt.split('\n').map(l => l.trim()).filter(Boolean);
    } else if (tablesDump['muse_manifest_logs'] && Array.isArray(tablesDump['muse_manifest_logs'])) {
      manifestLines = tablesDump['muse_manifest_logs'].map((r: any) => r.file_path);
    }

    const fullBrainCopy = {
      timestamp: new Date().toISOString(),
      operator: owner.email,
      schema: schemaData || 'Run read_olympus_brain SQL RPC for live column introspection.',
      tables: tablesDump,
      muse_manifest: manifestLines
    };

    return NextResponse.json(fullBrainCopy, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const owner = await verifyMasterOwner(req);
    if (!owner) {
      return NextResponse.json(
        { error: 'ACCESS DENIED: Only olympiannexus@gmail.com can append to the Muse Manifest.' },
        { status: 403 }
      );
    }

    const { filePaths } = await req.json();
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return NextResponse.json({ error: 'Provide an array of filePaths.' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const cleanPaths = filePaths.map((p: string) => p.trim()).filter(Boolean);

    // 1. Log to Supabase Brain
    for (const fp of cleanPaths) {
      await supabaseAdmin.from('muse_manifest_logs').upsert([{ file_path: fp }], { onConflict: 'file_path' });
    }

    // 2. Append to local public/muse_provision_manifest.txt (when running in writable filesystem)
    const manifestFullPath = path.join(process.cwd(), MANIFEST_REL_PATH);
    let existingLines: string[] = [];
    try {
      if (fs.existsSync(manifestFullPath)) {
        existingLines = fs.readFileSync(manifestFullPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
      }
      const mergedSet = new Set([...existingLines, ...cleanPaths]);
      const finalTxt = Array.from(mergedSet).join('\n') + '\n';
      fs.writeFileSync(manifestFullPath, finalTxt, 'utf-8');
    } catch (fsErr) {
      // Serverless read-only fallback: Supabase holds the canonical list
      console.warn('Filesystem read-only on cloud edge; synced to muse_manifest_logs table.');
    }

    const { data: allLogs } = await supabaseAdmin
      .from('muse_manifest_logs')
      .select('file_path')
      .order('created_at', { ascending: true });

    const canonicalList = allLogs?.map(r => r.file_path) || cleanPaths;

    return NextResponse.json({
      status: 'MANIFEST_UPDATED',
      manifestTxtContent: canonicalList.join('\n'),
      filesRegistered: canonicalList
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
