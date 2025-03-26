```javascript
import * as THREE from 'three';
import * as Constants from './constants.js';
import { updatePortalBoundingBox } from './utils.js'; // Use utility for bbox

// Function to create a portal mesh
export function createPortalMesh(color, type) {
    const portalGeo = new THREE.PlaneGeometry(Constants.PORTAL_WIDTH, Constants.PORTAL_HEIGHT);
    const portalMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 3.0, // Make it glow brightly
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending, // Brighter where overlaps
        depthWrite: false, // Prevent writing to depth buffer for better transparency
    });
    const portalMesh = new THREE.Mesh(portalGeo, portalMat);
    portalMesh.castShadow = false; // Portals likely don't cast shadows

    // Store type and create bounding box in userData
    portalMesh.userData = {
        isPortal: true,
        type: type, // 'main' or 'random'
        boundingBox: new THREE.Box3()
    };

    updatePortalBoundingBox(portalMesh); // Initial calculation using util function

    // Optional: Add simple particle effect or rotating elements later

    return portalMesh;
}

// Function to update portal animations (if any)
export function updatePortals(portals, deltaTime) {
    portals.forEach(portal => {
        // Example: Gentle rotation or pulsing opacity/emissive intensity
         portal.rotation.y += 0.1 * deltaTime; // Gentle spin
         // portal.material.opacity = 0.6 + Math.sin(deltaTime * 5.0) * 0.1;
    });
}
```
