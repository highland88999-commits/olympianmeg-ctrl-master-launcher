import * as THREE from 'three';

const downRaycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);
const rayOrigin = new THREE.Vector3();

export function clampToTerrain(avatarMesh: THREE.Object3D, terrainGroup: THREE.Group, camera: THREE.Camera, offset = 2.5) {
    if (!avatarMesh || !terrainGroup) return;

    rayOrigin.set(avatarMesh.position.x, 1000, avatarMesh.position.z);
    downRaycaster.set(rayOrigin, downVector);

    const intersects = downRaycaster.intersectObjects(terrainGroup.children, true);

    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        const targetY = groundY + offset;
        avatarMesh.position.y = THREE.MathUtils.lerp(avatarMesh.position.y, targetY, 0.25);

        if (camera.position.y < groundY + 1.5) {
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, groundY + 1.5, 0.3);
        }
    }
}
