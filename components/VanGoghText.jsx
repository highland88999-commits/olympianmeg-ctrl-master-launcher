'use client';

// VanGoghText — drop-in for drei <Text> in hub labels.
//
// Merlin, 2026-10-31: "Add shadowing to our letters accordingly."
// When the Van Gogh sky is active, hub letters get a warm umber
// outline — hand-painted depth, not a flat digital shadow. When
// it's off, this renders a plain <Text> with identical props, so
// the default background keeps its exact current styling.

import { Text } from '@react-three/drei';
import { useVanGoghActive, VANGOGH_SHADOW_COLOR } from '@/lib/vangogh';

export default function VanGoghText(props) {
  const vgogh = useVanGoghActive();
  if (!vgogh) return <Text {...props} />;
  const fontSize = typeof props.fontSize === 'number' ? props.fontSize : 1;
  return (
    <Text
      {...props}
      outlineWidth={props.outlineWidth ?? Math.max(0.012, fontSize * 0.05)}
      outlineColor={props.outlineColor ?? VANGOGH_SHADOW_COLOR}
      outlineOpacity={props.outlineOpacity ?? 0.92}
    />
  );
}
