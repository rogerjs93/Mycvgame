```javascript
import * as THREE from 'three';
import * as Constants from './constants.js';

export function getRandomColor(minBrightness = 0, maxBrightness = 1) {
    return new THREE.Color().setHSL(Math.random(), THREE.MathUtils.randFloat(0.6, 1.0), THREE.MathUtils.randFloat(minBrightness, maxBrightness));
}

// Updated to handle bounding box checks better during placement
export function placeObjectRandomly(object, yPosition, maxRadius, worldObjectsForCheck = [], clearanceMultiplier = 1.0) {
    let attempts = 0;
    let positionFound = false;
    const clearanceRadius = (object.geometry?.parameters?.radius || Constants.PLAYER_RADIUS) * clearanceMultiplier; // Estimate object radius

    while (attempts < Constants.MAX_PLACEMENT_ATTEMPTS && !positionFound) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * maxRadius;
        object.position.set(
            Math.cos(angle) * radius,
            yPosition,
            Math.sin(angle) * radius
        );
        object.rotation.y = Math.random() * Math.PI * 2;

        // Check for collisions before finalizing position
        if (isSpawnAreaClear(object.position, clearanceRadius, worldObjectsForCheck, object)) {
             positionFound = true;
        }
        attempts++;
    }

    if (!positionFound) {
        console.warn(`Could not find clear spot for object after ${attempts} attempts. Placing at last tried position or (0, Y, 0).`);
        // Optionally force position to 0, Y, 0 if needed
        // object.position.set(0, yPosition, 0);
    }

    // Update BBox after final placement
    if (object.userData.boundingBox) {
        object.userData.boundingBox.setFromObject(object);
         if (object.userData.isPortal) { updatePortalBoundingBox(object); }
    }

    return positionFound; // Return whether a clear spot was found
}

// Check using bounding sphere intersection - simpler than AABB for clearance checks
export function isSpawnAreaClear(position, radius, checkObjects, selfObject = null) {
    const checkSphere = new THREE.Sphere(position, radius);
    for (const obj of checkObjects) {
        // Skip self, ground, or objects without a bounding box
        if (obj === selfObject || obj.userData.isGround || !obj.userData.boundingBox) continue;

        // Check intersection
        if (obj.userData.boundingBox.intersectsSphere(checkSphere)) {
            return false; // Collision detected
        }
    }
    return true; // Area is clear
}


// Fisher-Yates Shuffle
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Simple raycast down to find ground height (useful for portal/object placement)
const raycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);
export function findGroundHeight(position, worldObjects) {
    raycaster.set(position, downVector);
    const groundObjects = worldObjects.filter(o => o.userData.isGround); // Only check against ground
    const intersects = raycaster.intersectObjects(groundObjects);
    if (intersects.length > 0) {
        return intersects[0].point.y; // Return Y coordinate of the hit point
    }
    return null; // No ground found below
}


// Helper to update portal BBox (if portal logic isn't in its own module)
export function updatePortalBoundingBox(portalMesh) {
    const thickness = 0.5;
    if (!portalMesh.userData.boundingBox) portalMesh.userData.boundingBox = new THREE.Box3();
    portalMesh.userData.boundingBox.setFromObject(portalMesh);
    // Adjust based on rotation - This simple expansion isn't perfect for rotated portals
    // A better approach involves using an OBB (Oriented Bounding Box) or multiple AABBs
    portalMesh.userData.boundingBox.expandByVector(new THREE.Vector3(thickness, thickness, thickness)); // Expand slightly in all axes for safety
}

// Simple screen shake placeholder
let shakeDuration = 0;
let shakeIntensity = 0;
const initialCameraPos = new THREE.Vector3(); // Store initial offset if needed
export function triggerScreenShake(duration = 0.2, intensity = 0.05) {
    shakeDuration = duration;
    shakeIntensity = intensity;
}
export function updateScreenShake(camera, deltaTime) {
    if (shakeDuration > 0) {
        shakeDuration -= deltaTime;
        const shakeAmountX = (Math.random() - 0.5) * shakeIntensity * 2;
        const shakeAmountY = (Math.random() - 0.5) * shakeIntensity * 2;
        camera.position.x += shakeAmountX;
        camera.position.y += shakeAmountY;
        // Reset slightly? Or let it return naturally as shakeDuration ends.
        // If using offset: camera.position.add(shakeOffset);
    } else {
        // Optional: Smoothly return camera to base position if needed
    }
}
```
