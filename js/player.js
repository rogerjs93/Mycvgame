import * as THREE from 'three';
import * as Constants from './constants.js';
import { shuffleArray, triggerScreenShake, updateScreenShake } from './utils.js';
import * as Audio from './audio.js'; // Import audio for effects
import { getCurrentUniverseType } from './universeManager.js'; // Import the function

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
        // Tag player mesh if needed for filtering in universeManager clear logic
        this.mesh.userData.isPlayerMesh = true;
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
        // Ensure position is valid before copying
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
             console.error("Invalid reset position provided:", position, "Using default fallback.");
             position = new THREE.Vector3(0, Constants.PLAYER_HEIGHT / 2 + 0.1, 5); // Default safe fallback
        }

        this.mesh.position.copy(position);
        this.velocity.set(0, 0, 0);
        this.onGround = false;
        this.lastVelocityY = 0;
        this.updateCollider();

        // --- RESET CAMERA POSITION AND ORIENTATION ---
        // Ensure camera exists before manipulating
        if (this.camera) {
            this.camera.position.set(position.x, position.y + (Constants.PLAYER_HEIGHT / 2) - Constants.PLAYER_RADIUS * 0.2, position.z); // Set initial camera pos too
            this.camera.quaternion.identity(); // Reset rotation to default (looking down -Z if world is standard)
            this.euler.set(0, 0, 0, 'YXZ'); // Reset euler angles
        } else {
            console.error("Camera not available during player reset.");
        }
        // --- END RESET ---

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
         this.resetControls();
         console.log("Player controls stabilized for this universe.");
    }

    handleMouseMove(event) {
        if (!this.camera) return; // Safety check
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
        if (!params) {
            console.warn("Attempted to set invalid physics params.");
            params = {}; // Use empty object to avoid errors below
        }
        this.currentPhysics.gravity = Constants.BASE_GRAVITY * (params.gravityMultiplier ?? 1.0); // Use nullish coalescing for default
        this.currentPhysics.friction = params.friction ?? Constants.DEFAULT_FRICTION;
        this.currentPhysics.speedMultiplier = params.playerSpeedMultiplier ?? 1.0;
         console.log("Player physics updated:", this.currentPhysics);
    }

    // --- Accept spawnPoint in signature ---
    update(deltaTime, worldObjects, spawnPoint) {
        // Safety check for camera
        if (!this.camera) {
            console.error("Player camera missing in update!");
            return;
        }

        // --- AUTOMATIC RESPAWN CHECK ---
        if (this.mesh.position.y < Constants.RESPAWN_Y_THRESHOLD) {
            console.log(`Player fell below threshold (${Constants.RESPAWN_Y_THRESHOLD}). Respawning.`);
            Audio.playRespawnSound(); // Play respawn sound
            this.reset(spawnPoint); // Reset using the passed spawnPoint
            return; // Stop further updates this frame after reset
        }
        // --- END RESPAWN CHECK ---

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

        // Calculate right vector relative to CAMERA's up and the flattened forward
        const right = new THREE.Vector3();
        right.crossVectors(this.camera.up, forward).normalize(); // camera.up is usually (0,1,0)

        // Apply input relative to camera
        if (inputVector.lengthSq() > 0) {
            inputVector.normalize(); // Prevent faster diagonal movement
            moveDirection.add(forward.multiplyScalar(inputVector.y));
            moveDirection.add(right.multiplyScalar(inputVector.x));
            // Normalize final move direction only if inputs were combined
            if (inputVector.x !== 0 && inputVector.y !== 0) {
                 moveDirection.normalize(); // Normalize if moving diagonally
            }
        }

        // Apply movement intention to velocity
        let targetVelocityX = moveDirection.x * effectiveSpeed;
        let targetVelocityZ = moveDirection.z * effectiveSpeed;

        const applyFriction = inputVector.lengthSq() === 0;
        if (this.onGround) {
            if (applyFriction) {
                 this.velocity.x *= this.currentPhysics.friction;
                 this.velocity.z *= this.currentPhysics.friction;
            } else {
                  this.velocity.x += (targetVelocityX - this.velocity.x) * 0.2; // Smoother acceleration
                  this.velocity.z += (targetVelocityZ - this.velocity.z) * 0.2;
            }
        } else {
             // Air control
             this.velocity.x += (targetVelocityX - this.velocity.x) * 0.03; // Less air control
             this.velocity.z += (targetVelocityZ - this.velocity.z) * 0.03;
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
             const impactVelocity = V_y_before_collision;
             const hardLanding = impactVelocity < Constants.HARD_LANDING_VELOCITY_THRESHOLD;
             Audio.playLandSound(hardLanding);
             if (hardLanding) { triggerScreenShake(0.3, 0.08); }
        }
        this.onGround = grounded;

        // Update Player Position based on corrected delta
        this.mesh.position.add(correctedDelta);

        // Update Collider after moving
        this.updateCollider();

        // Boundary Collision
        let currentRadius = Constants.UNIVERSE_RADIUS; // Default to random
        try {
            if (getCurrentUniverseType() === 'main') {
                currentRadius = Constants.MAIN_UNIVERSE_RADIUS;
            }
        } catch (e) {
            console.error("Error calling getCurrentUniverseType in Player.update:", e);
        }

        const maxDist = currentRadius - Constants.PLAYER_RADIUS;
        const distFromCenterSq = this.mesh.position.x ** 2 + this.mesh.position.z ** 2;
        if (distFromCenterSq > maxDist ** 2) {
            const angle = Math.atan2(this.mesh.position.z, this.mesh.position.x);
            this.mesh.position.x = Math.cos(angle) * maxDist;
            this.mesh.position.z = Math.sin(angle) * maxDist;
            const outwardDir = new THREE.Vector3(this.mesh.position.x, 0, this.mesh.position.z).normalize();
            const outwardSpeed = this.velocity.dot(outwardDir);
            if (outwardSpeed > 0) { this.velocity.sub(outwardDir.multiplyScalar(outwardSpeed * 1.1)); }
            this.updateCollider();
        }

        // Update Camera Position
        this.camera.position.x = this.mesh.position.x;
        this.camera.position.y = this.mesh.position.y + (Constants.PLAYER_HEIGHT / 2) - Constants.PLAYER_RADIUS * 0.2;
        this.camera.position.z = this.mesh.position.z;

        // Apply screen shake if active
        updateScreenShake(this.camera, deltaTime);
    }


    performCollisionDetection(deltaPosition, worldObjects) {
        const originalDelta = deltaPosition.clone();
        let correctedDelta = deltaPosition.clone();
        let grounded = false;
        const stepHeight = 0.2; // Allow stepping up small obstacles

        // Update collider to potential future position for checking
        const futureCollider = this.collider.clone().translate(deltaPosition);

        for (const obj of worldObjects) {
            // --- NPC COLLISION FIX ---
            // Skip self, non-collidable, objects without bounding boxes, OR NPCs
            if (obj === this.mesh || !obj.userData.boundingBox || obj.userData.isNonCollidable || obj.userData.isNPC) continue;
            // --- END NPC COLLISION FIX ---

            const objectBox = obj.userData.boundingBox;

            if (futureCollider.intersectsBox(objectBox)) {
                // --- Collision Response ---

                // 1. Ground Collision
                if (originalDelta.y <= 0 && obj.userData.isGround) {
                    const groundSurfaceY = objectBox.max.y;
                    const playerBottomFutureY = futureCollider.min.y;

                    if (playerBottomFutureY <= groundSurfaceY) {
                        const groundClearance = groundSurfaceY - this.collider.min.y;
                        if(groundClearance <= stepHeight && groundClearance > -0.1) {
                             const stepUpCorrection = groundSurfaceY - this.collider.min.y;
                              this.mesh.position.y += stepUpCorrection;
                              correctedDelta.y = 0;
                              this.velocity.y = 0;
                              grounded = true;
                              futureCollider.copy(this.collider).translate(correctedDelta);
                        } else {
                            const correction = groundSurfaceY - playerBottomFutureY;
                            correctedDelta.y += correction;
                            this.velocity.y = 0;
                            grounded = true;
                            futureCollider.translate(new THREE.Vector3(0, correction, 0));
                        }
                    }
                    continue;
                }

                // 2. Other Objects - AABB Separation
                const penetration = new THREE.Vector3();
                const centerPlayer = futureCollider.getCenter(new THREE.Vector3());
                const centerObject = objectBox.getCenter(new THREE.Vector3());
                const halfSizePlayer = futureCollider.getSize(new THREE.Vector3()).multiplyScalar(0.5);
                const halfSizeObject = objectBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);

                penetration.x = halfSizePlayer.x + halfSizeObject.x - Math.abs(centerPlayer.x - centerObject.x);
                penetration.y = halfSizePlayer.y + halfSizeObject.y - Math.abs(centerPlayer.y - centerObject.y);
                penetration.z = halfSizePlayer.z + halfSizeObject.z - Math.abs(centerPlayer.z - centerObject.z);

                 let minPen = Infinity;
                 let axis = -1;

                 if (penetration.x > 0 && penetration.x < minPen) { minPen = penetration.x; axis = 0; }
                 if (penetration.y > 0 && penetration.y < minPen) { minPen = penetration.y; axis = 1; }
                 if (penetration.z > 0 && penetration.z < minPen) { minPen = penetration.z; axis = 2; }

                 const signCorrection = new THREE.Vector3();
                 if (axis === 0) { // Correct X
                     signCorrection.x = Math.sign(centerPlayer.x - centerObject.x);
                     correctedDelta.x -= minPen * signCorrection.x;
                     this.velocity.x = 0;
                 } else if (axis === 1) { // Correct Y
                     signCorrection.y = Math.sign(centerPlayer.y - centerObject.y);
                     if (!grounded || signCorrection.y < 0) {
                         correctedDelta.y -= minPen * signCorrection.y;
                          if (this.velocity.y > 0 && signCorrection.y < 0) this.velocity.y = 0;
                          if (this.velocity.y < 0 && signCorrection.y > 0) this.velocity.y = 0;
                     }
                 } else if (axis === 2) { // Correct Z
                     signCorrection.z = Math.sign(centerPlayer.z - centerObject.z);
                     correctedDelta.z -= minPen * signCorrection.z;
                     this.velocity.z = 0;
                 }

                 futureCollider.copy(this.collider).translate(correctedDelta);
            }
        }

        return { correctedDelta, grounded };
    }


    updateCollider() {
        if (!this.mesh) return;
        const radius = this.mesh.geometry?.parameters?.radius ?? Constants.PLAYER_RADIUS;
        const height = this.mesh.geometry?.parameters?.height ?? (Constants.PLAYER_HEIGHT - 2 * Constants.PLAYER_RADIUS);
        const capsuleHalfHeight = height / 2;
        const totalHalfHeight = capsuleHalfHeight + radius;

        this.collider.min.set(
            this.mesh.position.x - radius,
            this.mesh.position.y - totalHalfHeight,
            this.mesh.position.z - radius
        );
        this.collider.max.set(
            this.mesh.position.x + radius,
            this.mesh.position.y + totalHalfHeight,
            this.mesh.position.z + radius
        );
    }

    getPosition() {
        return this.mesh?.position;
    }
}
