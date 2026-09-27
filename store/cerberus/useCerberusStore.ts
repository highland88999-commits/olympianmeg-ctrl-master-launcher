import { create } from 'zustand'
import { supabase } from '@/lib/cerberus/supabase'

export interface WebNode {
  id: string;
  name: string;
  url: string;
  position: [number, number, number];
  saved: boolean;
  isCluster: boolean;
  clusterId: string | null; 
}

interface CerberusState {
  session: any;
  nodes: WebNode[];
  openFrames: string[]; 
  activeFrameId: string | null; 
  
  currentClusterId: string | null; 
  cameraDistance: number;
  isZoomModeActive: boolean;

  setSession: (session: any) => void;
  fetchUserNodes: () => Promise<void>;
  
  addNode: (name: string, url: string, isCluster?: boolean) => Promise<void>;
  updateNode: (id: string, name: string, url: string, clusterId: string | null) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;

  enterCluster: (id: string) => void;
  exitCluster: () => void;
  
  openFrame: (id: string) => void;
  closeFrame: (id: string) => void;
  minimizeFrame: () => void;
  nextFrame: () => void;
  prevFrame: () => void;
  resetToMap: () => void; 
  
  setCameraDistance: (distance: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleZoomMode: () => void;
}

export const useCerberusStore = create<CerberusState>((set, get) => ({
  session: null,
  nodes: [],
  openFrames: [],
  activeFrameId: null,
  currentClusterId: null,
  cameraDistance: 25,
  isZoomModeActive: false,

  setSession: (session) => set({ session }),

  fetchUserNodes: async () => {
    const { session } = get();
    if (!session?.user) return;

    const { data, error } = await supabase.from('cerberus_nodes').select('*').eq('user_id', session.user.id);
    
    if (error) {
      console.error("Error fetching nodes:", error);
      return;
    }

    if (data && data.length > 0) {
      const mappedNodes: WebNode[] = data.map(dbNode => ({
        id: dbNode.id,
        name: dbNode.name,
        url: dbNode.url,
        position: [dbNode.pos_x, dbNode.pos_y, dbNode.pos_z],
        saved: dbNode.saved,
        isCluster: dbNode.is_cluster,
        clusterId: dbNode.cluster_id
      }));

      const uniqueNodes = Array.from(new Map(mappedNodes.map(item => [item.name, item])).values());
      
      set({ nodes: uniqueNodes });
    } else {
      const seedNodes = [
        { name: 'Olympus Core', url: '', pos_x: -5, pos_y: 2, pos_z: 4, saved: true, is_cluster: true, cluster_id: null },
        { name: 'Media Sector', url: '', pos_x: 6, pos_y: -3, pos_z: -2, saved: true, is_cluster: true, cluster_id: null },
      ];
      
      for (const node of seedNodes) {
        await supabase.from('cerberus_nodes').insert({ user_id: session.user.id, ...node });
      }
      get().fetchUserNodes(); 
    }
  },

  addNode: async (name, url, isCluster = false) => {
    const { session, nodes, currentClusterId } = get();
    if (!session?.user) return;

    const index = nodes.length + 1;
    const phi = index * 137.5 * (Math.PI / 180);
    const radius = 8 + (index * 1.5);
    const y = ((index % 5) - 2) * 3;

    const posX = Math.cos(phi) * radius;
    const posY = y;
    const posZ = Math.sin(phi) * radius;

    const { data, error } = await supabase.from('cerberus_nodes').insert({
      user_id: session.user.id,
      name,
      url,
      pos_x: posX,
      pos_y: posY,
      pos_z: posZ,
      saved: true,
      is_cluster: isCluster,
      cluster_id: currentClusterId
    }).select().single();

    if (data && !error) {
      const newNode: WebNode = {
        id: data.id,
        name: data.name,
        url: data.url,
        position: [data.pos_x, data.pos_y, data.pos_z],
        saved: data.saved,
        isCluster: data.is_cluster,
        clusterId: data.cluster_id
      };
      set({ nodes: [...nodes, newNode] });
    }
  },

  updateNode: async (id, name, url, clusterId) => {
    const { session, nodes } = get();
    if (!session?.user) return;

    const { error } = await supabase.from('cerberus_nodes')
      .update({ name, url, cluster_id: clusterId })
      .eq('id', id);

    if (!error) {
      set({ nodes: nodes.map(n => n.id === id ? { ...n, name, url, clusterId } : n) });
    }
  },

  deleteNode: async (id) => {
    const { session, nodes, openFrames, activeFrameId } = get();
    if (!session?.user) return;

    const nodeToDelete = nodes.find(n => n.id === id);
    if (nodeToDelete?.isCluster) {
      await supabase.from('cerberus_nodes').update({ cluster_id: null }).eq('cluster_id', id);
    }

    const { error } = await supabase.from('cerberus_nodes').delete().eq('id', id);
    if (!error) {
      const newNodes = nodes.filter(n => n.id !== id).map(n => n.clusterId === id ? { ...n, clusterId: null } : n);
      set({ 
        nodes: newNodes,
        openFrames: openFrames.filter(f => f !== id),
        activeFrameId: activeFrameId === id ? null : activeFrameId
      });
    }
  },

  enterCluster: (id) => set({ currentClusterId: id, cameraDistance: 15 }),
  exitCluster: () => set({ currentClusterId: null, cameraDistance: 25 }),

  openFrame: (id) => {
    const { openFrames } = get();
    if (!openFrames.includes(id)) {
      set({ openFrames: [...openFrames, id], activeFrameId: id });
    } else {
      set({ activeFrameId: id });
    }
  },

  closeFrame: (id) => {
    const { openFrames, activeFrameId } = get();
    const newFrames = openFrames.filter(f => f !== id);
    set({ 
      openFrames: newFrames, 
      activeFrameId: activeFrameId === id ? (newFrames[newFrames.length - 1] || null) : activeFrameId 
    });
  },

  minimizeFrame: () => set({ activeFrameId: null }),

  resetToMap: () => set({ activeFrameId: null, currentClusterId: null, cameraDistance: 25 }),

  nextFrame: () => {
    const { openFrames, activeFrameId } = get();
    if (openFrames.length === 0) return;
    const currentIndex = openFrames.indexOf(activeFrameId as string);
    const nextIndex = (currentIndex + 1) % openFrames.length;
    set({ activeFrameId: openFrames[nextIndex] });
  },

  prevFrame: () => {
    const { openFrames, activeFrameId } = get();
    if (openFrames.length === 0) return;
    const currentIndex = openFrames.indexOf(activeFrameId as string);
    const prevIndex = (currentIndex - 1 + openFrames.length) % openFrames.length;
    set({ activeFrameId: openFrames[prevIndex] });
  },

  setCameraDistance: (cameraDistance) => set({ cameraDistance }),
  zoomIn: () => set((s) => ({ cameraDistance: Math.max(8, s.cameraDistance - 5) })),
  zoomOut: () => set((s) => ({ cameraDistance: Math.min(100, s.cameraDistance + 5) })),
  toggleZoomMode: () => set((s) => ({ isZoomModeActive: !s.isZoomModeActive })),
}))


