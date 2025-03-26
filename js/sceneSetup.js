import * as THREE from 'three';
import * as Constants from './constants.js';

export function initScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Default background

    const camera = new THREE.PerspectiveCamera(
        75, // FOV
        window.innerWidth / window.innerHeight, // Aspect Ratio
        0.1, // Near clipping plane
        1000 // Far clipping plane
    );
    // Initial camera position (will be controlled by player)
    camera.position.set(0, Constants.PLAYER_HEIGHT, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    renderer.outputEncoding = THREE.sRGBEncoding; // Match texture encoding

    // Basic initial light (will be replaced by universeManager)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    console.log("Scene, Camera, Renderer initialized.");
    return { scene, camera, renderer };
}

export function resizeRenderer(camera, renderer) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    console.log("Renderer resized.");
}

// Export getters if needed by other modules directly (less ideal than passing references)
// export function getScene() { return scene; }
// export function getCamera() { return camera; }
// export function getRenderer() { return renderer; }
