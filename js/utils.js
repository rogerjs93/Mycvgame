import * as THREE from 'three';
import * as Constants from './constants.js';

export function getRandomColor(minBrightness = 0, maxBrightness = 1) {
    return new THREE.Color().setHSL(Math.random(), THREE.MathUtils.randFloat(0.6, 1.0), THREE.MathUtils.randFloat(minBrightness, maxBrightness));
}

// Reusable temporary Box3 for placement checks
const placementCheckBounds = new THREE.Box3();
const objectBounds = new THREE.Box3();

export function placeObjectRandomly(object, yPosition, maxRadius, worldObjectsForCheck = [], clearanceMultiplier = 1.0) {
    let attempts = 0;
    let positionFound = false;
    // Use object's own bounding box for size estimation if available
    let checkRadius = Constants.PLAYER_RADIUS * clearanceMultiplier; // Default if no geometry/bbox
    if (object.userData.boundingBox) {
        const size = new THREE.Vector3();
        object.userData.boundingBox.getSize(size);
        checkRadius = Math.max(size.x, size.y, size.z) / 2 * clearanceMultiplier; // Use half-diagonal approx
    } else if (object.geometry?.boundingSphere) {
        checkRadius = object.geometry.boundingSphere.radius * clearanceMultiplier;
    }


    while (attempts < Constants.MAX_PLACEMENT_ATTEMPTS && !positionFound) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * maxRadius;
        object.position.set(
            Math.cos(angle) * radius,
            yPosition, // Set initial Y
            Math.sin(angle) * radius
        );
        object.rotation.y = Math.random() * Math.PI * 2;

        // --- Check using Bounding Boxes for stricter check ---
        // Update the object's bounding box based on potential position
        if (!object.userData.boundingBox) object.userData.boundingBox = new THREE.Box3(); // Ensure bbox exists
        object.userData.boundingBox.setFromObject(object); // Update based on current object transform

        // Create a slightly larger box for clearance check
        placementCheckBounds.copy(object.userData.boundingBox);
        if (clearanceMultiplier !== 1.0) {
             const size = new THREE.Vector3();
             placementCheckBounds.getSize(size);
             placementCheckBounds.expandByVector(size.multiplyScalar(clearanceMultiplier - 1.0));
        }

        // Check against other objects using Box3 intersection
        if (isPlacementAreaClearBox(placementCheckBounds, worldObjectsForCheck, object)) {
             positionFound = true;
        }
        // --- End Bounding Box Check ---

        attempts++;
    }

    if (!positionFound) {
        console.warn(`Could not find clear spot for object ${object.uuid} after ${attempts} attempts. Placing at last position.`);
    }

    // Update final BBox (already done inside loop)
    // if (object.userData.boundingBox) {
    //     object.userData.boundingBox.setFromObject(object);
    //     if(object.userData.isPortal) { updatePortalBoundingBox(object); }
    // }

    return positionFound;
}

// --- NEW: Placement check using Box3 intersection ---
function isPlacementAreaClearBox(objectCheckBounds, checkObjects, selfObject = null) {
    for (const obj of checkObjects) {
        // Skip self, ground, or objects without a bounding box
        if (obj === selfObject || obj.userData.isGround || !obj.userData.boundingBox) continue;

        // Check intersection using Box3
        if (objectCheckBounds.intersectsBox(obj.userData.boundingBox)) {
            // Optional: Log which object caused the conflict
            // console.log(`Placement conflict: ${selfObject?.uuid} vs ${obj.uuid}`);
            return false; // Collision detected
        }
    }
    return true; // Area is clear
}

// Original sphere check kept for reference or specific uses (like player spawn)
export function isSpawnAreaClear(position, radius, checkObjects, selfObject = null) {
    const checkSphere = new THREE.Sphere(position, radius);
    for (const obj of checkObjects) {
        if (obj === selfObject || obj.userData.isGround || !obj.userData.boundingBox) continue;
        if (obj.userData.boundingBox.intersectsSphere(checkSphere)) {
            return false;
        }
    }
    return true;
}


// Fisher-Yates Shuffle
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Simple raycast down to find ground height
const raycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);
export function findGroundHeight(position, worldObjects) {
    // Create a copy of the position slightly above to avoid starting inside ground
    const rayOrigin = position.clone();
    rayOrigin.y += 5.0; // Start ray higher up
    raycaster.set(rayOrigin, downVector);
    raycaster.far = 20.0; // Limit raycast distance

    const groundObjects = worldObjects.filter(o => o.userData.isGround);
    if(groundObjects.length === 0) return null; // No ground objects to hit

    const intersects = raycaster.intersectObjects(groundObjects, false); // Don't check children recursively for simple ground plane/cylinder

    if (intersects.length > 0) {
        return intersects[0].point.y; // Return Y coordinate of the hit point
    }
    // console.warn("Raycast down found no ground at:", position);
    return null; // No ground found below
}


// Helper to update portal BBox
export function updatePortalBoundingBox(portalMesh) {
    const thickness = 0.6; // Slightly thicker for better collision checks
    if (!portalMesh.userData.boundingBox) portalMesh.userData.boundingBox = new THREE.Box3();
    portalMesh.userData.boundingBox.setFromObject(portalMesh);
    // Expand based on portal's orientation - use local axes
     const worldScale = new THREE.Vector3();
     portalMesh.getWorldScale(worldScale); // Get world scale

     const localExpand = new THREE.Vector3(thickness / 2 / worldScale.x, 0, thickness / 2 / worldScale.z); // Expand in local X/Z
     localExpand.applyQuaternion(portalMesh.quaternion); // Rotate expansion vector to world space

     portalMesh.userData.boundingBox.expandByVector(localExpand.abs()); // Expand by absolute values in world axes


    // portalMesh.userData.boundingBox.expandByVector(new THREE.Vector3(thickness, thickness, thickness)); // Old simpler way
}

// Simple screen shake placeholder
let shakeDuration = 0;
let shakeIntensity = 0;
export function triggerScreenShake(duration = 0.2, intensity = 0.05) {
    shakeDuration = duration;
    shakeIntensity = intensity;
}
export function updateScreenShake(camera, deltaTime) {
    if (shakeDuration > 0 && camera) { // Added camera check
        shakeDuration -= deltaTime;
        const shakeAmountX = (Math.random() - 0.5) * shakeIntensity * 2;
        const shakeAmountY = (Math.random() - 0.5) * shakeIntensity * 2;
        camera.position.x += shakeAmountX;
        camera.position.y += shakeAmountY;
    }
}
