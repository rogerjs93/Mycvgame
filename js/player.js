```javascript
import * as THREE from 'three';
import * as Constants from './constants.js';
import { shuffleArray, triggerScreenShake, updateScreenShake } from './utils.js';
import * as Audio from './audio.js'; // Import audio for effects

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Player object (invisible mesh for position and collision capsule shape)
        const playerGeo = new THREE.CapsuleGeometry(Constants.PLAYER_RADIUS, Constants.PLAYER_HEIGHT - 2 * Constants.PLAYER_RADIUS, 4, 16);
        const playerMat = new THREE.MeshStandardMaterial({ visible: false }); // Usually invisible
        this.mesh = new THREE.Mesh(playerGeo, playerMat);
        // Start position set by reset() or universeManager
        this.mesh.position.y = Constants.PLAYER_HEIGHT / 2 + 0.1;
        scene.add(this.mesh);

        // Physics state
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.lastVelocityY = 0; // For landing detection

        // Collision detection state
        this.collider = new THREE.Box3(); // Player's collision box (AABB approximation)
        this.updateCollider();

        // Controls state
        this.keysPressed = {};
        this.controlMap = { ...Constants.defaultControlMap }; // Current control mapping
        this.isControlsRandomized = false;
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ'); // For mouse look

        // Universe-specific physics parameters
        this.currentPhysics = {
            gravity: Constants.BASE_GRAVITY,
            friction: Constants.DEFAULT_FRICTION,
            speedMultiplier: 1.0,
        };

        console.log("Player initialized.");
    }

    reset(position) {
        this.mesh.position.copy(position);
        this.velocity.set(0, 0, 0);
        this.onGround = false; // Re-evaluate on first update
        this.lastVelocityY = 0;
        this.updateCollider();
        // Camera position updated in update() based on mesh position
        console.log("Player state reset at position:", position);
    }

    // --- Control Handling ---

    updateMovementKeys(keysState) {
        this.keysPressed = keysState;
    }

    randomizeControls() {
        let shuffledActions = [...Constants.controlActions];
        shuffleArray(shuffledActions);
        this.controlMap.KeyW = shuffledActions[0];
        this.controlMap.KeyS = shuffledActions[1];
        this.controlMap.KeyA = shuffledActions[2];
        this.controlMap.KeyD = shuffledActions[3];
        this.isControlsRandomized = true;
        console.log("Player controls randomized:", this.controlMap);
    }

    resetControls() {
        this.controlMap = { ...Constants.defaultControlMap };
        this.isControlsRandomized = false;
        console.log("Player controls reset to default.");
    }

    stabilizeControls() {
         this.resetControls(); // For current universe only - called by external reward logic
         console.log("Player controls stabilized for this universe.");
         // Maybe add a temporary UI message? (Handled externally via UI.displayTemporaryMessage)
    }

    handleMouseMove(event) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        const PI_2 = Math.PI / 2;

        this.euler.setFromQuaternion(this.camera.quaternion);
        this.euler.y -= movementX * 0.002;
        this.euler.x -= movementY * 0.002;
        this.euler.x = Math.max(-PI_2, Math.min(PI_2, this.euler.x)); // Clamp vertical rotation
        this.camera.quaternion.setFromEuler(this.euler);
    }

    // --- Physics & Update ---

    jump() {
        if (this.onGround) {
            this.velocity.y = Constants.JUMP_VELOCITY;
            this.onGround = false;
            Audio.playJumpSound();
        }
    }

    setPhysicsParams(params) {
        this.currentPhysics.gravity = Constants.BASE_GRAVITY * (params.gravityMultiplier || 1.0);
        this.currentPhysics.friction = params.friction || Constants.DEFAULT_FRICTION;
        this.currentPhysics.speedMultiplier = params.playerSpeedMultiplier || 1.0;
         console.log("Player physics updated:", this.currentPhysics);
    }

    update(deltaTime, worldObjects) {
        const effectiveSpeed = Constants.PLAYER_BASE_SPEED * this.currentPhysics.speedMultiplier;
        let moveDirection = new THREE.Vector3(0, 0, 0);
        let inputVector = new THREE.Vector2(0, 0); // x = strafe, y = forward/backward

        // Calculate input based on current control map
        if (this.keysPressed['KeyW']) { const action = this.controlMap['KeyW']; if (action === 'forward') inputVector.y += 1; else if (action === 'backward') inputVector.y -= 1; else if (action === 'left') inputVector.x -= 1; else if (action === 'right') inputVector.x += 1; }
        if (this.keysPressed['KeyS']) { const action = this.controlMap['KeyS']; if (action === 'forward') inputVector.y += 1; else if (action === 'backward') inputVector.y -= 1; else if (action === 'left') inputVector.x -= 1; else if (action === 'right') inputVector.x += 1; }
        if (this.keysPressed['KeyA']) { const action = this.controlMap['KeyA']; if (action === 'forward') inputVector.y += 1; else if (action === 'backward') inputVector.y -= 1; else if (action === 'left') inputVector.x -= 1; else if (action === 'right') inputVector.x += 1; }
        if (this.keysPressed['KeyD']) { const action = this.controlMap['KeyD']; if (action === 'forward') inputVector.y += 1; else if (action === 'backward') inputVector.y -= 1; else if (action === 'left') inputVector.x -= 1; else if (action === 'right') inputVector.x += 1; }

        // Get camera direction (flattened)
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(this.camera.up, forward).normalize();

        // Apply input relative to camera
        if (inputVector.lengthSq() > 0) {
            inputVector.normalize(); // Prevent faster diagonal movement if raw input used
            moveDirection.add(forward.multiplyScalar(inputVector.y));
            moveDirection.add(right.multiplyScalar(inputVector.x));
            moveDirection.normalize(); // Ensure final move direction is normalized
        }

        // Apply movement intention to velocity
        let targetVelocityX = moveDirection.x * effectiveSpeed;
        let targetVelocityZ = moveDirection.z * effectiveSpeed;

        if (this.onGround) {
            // Apply friction if no input, otherwise move towards target velocity
             if (inputVector.lengthSq() === 0) {
                 this.velocity.x *= this.currentPhysics.friction;
                 this.velocity.z *= this.currentPhysics.friction;
             } else {
                  // Smooth acceleration could be added here instead of direct set
                  this.velocity.x = targetVelocityX;
                  this.velocity.z = targetVelocityZ;
             }
        } else {
             // Allow some air control - interpolate towards target velocity?
             this.velocity.x += (targetVelocityX - this.velocity.x) * 0.1; // Simple air control lerp
             this.velocity.z += (targetVelocityZ - this.velocity.z) * 0.1;
        }


        // Apply Gravity
        this.velocity.y += this.currentPhysics.gravity * deltaTime;

        // Store Y velocity before collision check for landing detection
        const V_y_before_collision = this.velocity.y;

        // Calculate potential position change
        const deltaPosition = this.velocity.clone().multiplyScalar(deltaTime);

        // Perform Collision Detection & Resolution
        const { correctedDelta, grounded } = this.performCollisionDetection(deltaPosition, worldObjects);

        // Update Ground State & Landing Effects
        if (!this.onGround && grounded) {
             // Just landed
             const impactVelocity = V_y_before_collision; // Use velocity before collision correction
             console.log("Landed with velocity:", impactVelocity);
             const hardLanding = impactVelocity < Constants.HARD_LANDING_VELOCITY_THRESHOLD;
             Audio.playLandSound(hardLanding);
             if (hardLanding) {
                 triggerScreenShake(0.3, 0.08); // Trigger screen shake utility
             }
        }
        this.onGround = grounded;


        // Update Player Position based on corrected delta
        this.mesh.position.add(correctedDelta);

        // Update Collider after moving
        this.updateCollider();

        // Boundary Collision (simple clamp or push back) - Handled by UniverseManager or here?
        // Let's handle it here for simplicity, assuming circular random universes
        const currentRadius = getCurrentUniverseType() === 'main' ? Constants.MAIN_UNIVERSE_RADIUS : Constants.UNIVERSE_RADIUS;
        const maxDist = currentRadius - Constants.PLAYER_RADIUS;
        const distFromCenterSq = this.mesh.position.x ** 2 + this.mesh.position.z ** 2;
        if (distFromCenterSq > maxDist ** 2) {
            const angle = Math.atan2(this.mesh.position.z, this.mesh.position.x);
            this.mesh.position.x = Math.cos(angle) * maxDist;
            this.mesh.position.z = Math.sin(angle) * maxDist;
            // Dampen velocity component pushing outwards
            const outwardDir = new THREE.Vector3(this.mesh.position.x, 0, this.mesh.position.z).normalize();
            const outwardSpeed = this.velocity.dot(outwardDir);
            if (outwardSpeed > 0) {
                this.velocity.sub(outwardDir.multiplyScalar(outwardSpeed * 1.1)); // Push back slightly
            }
            this.updateCollider(); // Update collider after boundary correction
        }

        // Update Camera Position to follow player's head (eye level)
        this.camera.position.x = this.mesh.position.x;
        this.camera.position.y = this.mesh.position.y + (Constants.PLAYER_HEIGHT / 2) - Constants.PLAYER_RADIUS * 0.2; // Adjust eye height slightly
        this.camera.position.z = this.mesh.position.z;

        // Apply screen shake if active
        updateScreenShake(this.camera, deltaTime);
    }


    performCollisionDetection(deltaPosition, worldObjects) {
        const originalDelta = deltaPosition.clone();
        let correctedDelta = deltaPosition.clone();
        let grounded = false;

        // Update collider to potential future position for checking
        const futureCollider = this.collider.clone().translate(deltaPosition);

        for (const obj of worldObjects) {
            // Skip self, non-collidable, or objects without bounding boxes
            if (obj === this.mesh || !obj.userData.boundingBox || obj.userData.isNonCollidable) continue;

            const objectBox = obj.userData.boundingBox;

            if (futureCollider.intersectsBox(objectBox)) {
                // --- Collision Response ---

                // 1. Ground Collision
                // Check if moving down AND colliding with ground specifically
                if (originalDelta.y < 0 && obj.userData.isGround) {
                    // Ground surface Y - use the top of the ground's bounding box
                    const groundSurfaceY = objectBox.max.y;
                    // Player's bottom position in the future state
                    const playerBottomFutureY = futureCollider.min.y;

                    if (playerBottomFutureY <= groundSurfaceY) {
                        // Correct Y movement to land exactly on the ground surface
                        // The amount to correct delta.y is the difference needed to align player bottom with ground top
                        const correction = groundSurfaceY - playerBottomFutureY;
                        correctedDelta.y += correction; // Adjust delta Y upwards

                        this.velocity.y = 0; // Stop vertical velocity
                        grounded = true;

                        // Update future collider based on this correction for subsequent checks in this frame
                        futureCollider.translate(new THREE.Vector3(0, correction, 0));
                    }
                    // Don't do axis separation for ground, only handle Y correction.
                    // Continue checking other objects, but we are now potentially grounded.
                    continue; // Move to next object check
                }

                // 2. Other Objects (Scenery, NPCs, Portals, Console) - AABB Separation
                // Simple separation: Find minimum penetration axis and stop movement along it.
                // Calculate overlap on each axis
                const penetration = new THREE.Vector3();
                penetration.x = (this.collider.max.x - this.collider.min.x) / 2 + (objectBox.max.x - objectBox.min.x) / 2 - Math.abs(futureCollider.getCenter(new THREE.Vector3()).x - objectBox.getCenter(new THREE.Vector3()).x);
                penetration.y = (this.collider.max.y - this.collider.min.y) / 2 + (objectBox.max.y - objectBox.min.y) / 2 - Math.abs(futureCollider.getCenter(new THREE.Vector3()).y - objectBox.getCenter(new THREE.Vector3()).y);
                penetration.z = (this.collider.max.z - this.collider.min.z) / 2 + (objectBox.max.z - objectBox.min.z) / 2 - Math.abs(futureCollider.getCenter(new THREE.Vector3()).z - objectBox.getCenter(new THREE.Vector3()).z);

                 // Find minimum *positive* penetration axis (axis of least overlap)
                 let minPen = Infinity;
                 let axis = -1; // 0=x, 1=y, 2=z

                 if (penetration.x > 0 && penetration.x < minPen) { minPen = penetration.x; axis = 0; }
                 if (penetration.y > 0 && penetration.y < minPen) { minPen = penetration.y; axis = 1; }
                 if (penetration.z > 0 && penetration.z < minPen) { minPen = penetration.z; axis = 2; }

                 // Apply correction based on minimum penetration axis
                 if (axis === 0) { // Correct X
                     const sign = Math.sign(futureCollider.getCenter(new THREE.Vector3()).x - objectBox.getCenter(new THREE.Vector3()).x);
                     correctedDelta.x += penetration.x * sign;
                     this.velocity.x = 0; // Stop velocity on this axis
                 } else if (axis === 1) { // Correct Y
                     const sign = Math.sign(futureCollider.getCenter(new THREE.Vector3()).y - objectBox.getCenter(new THREE.Vector3()).y);
                     correctedDelta.y += penetration.y * sign;
                      // If hitting ceiling or obstacle vertically, stop velocity
                     if (sign > 0 && this.velocity.y < 0) this.velocity.y = 0; // Hitting from below
                     if (sign < 0 && this.velocity.y > 0) this.velocity.y = 0; // Hitting from above (ceiling)
                 } else if (axis === 2) { // Correct Z
                     const sign = Math.sign(futureCollider.getCenter(new THREE.Vector3()).z - objectBox.getCenter(new THREE.Vector3()).z);
                     correctedDelta.z += penetration.z * sign;
                     this.velocity.z = 0; // Stop velocity on this axis
                 }

                 // Update future collider based on this correction before checking the next object
                 futureCollider.copy(this.collider).translate(correctedDelta);
            }
        }

        // Return the possibly adjusted deltaPosition and ground status
        return { correctedDelta, grounded };
    }


    updateCollider() {
        // Calculate AABB based on capsule shape (approximate)
        const halfHeight = Constants.PLAYER_HEIGHT / 2;
        this.collider.min.set(
            this.mesh.position.x - Constants.PLAYER_RADIUS,
            this.mesh.position.y - halfHeight,
            this.mesh.position.z - Constants.PLAYER_RADIUS
        );
        this.collider.max.set(
            this.mesh.position.x + Constants.PLAYER_RADIUS,
            this.mesh.position.y + halfHeight,
            this.mesh.position.z + Constants.PLAYER_RADIUS
        );
    }

    getPosition() {
        return this.mesh.position;
    }
}
```
