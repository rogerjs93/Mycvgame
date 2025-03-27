      
import * as THREE from 'three';
import { getSoundBuffer } from './assetsLoader.js'; // Assuming assetsLoader handles loading

let audioListener;
let audioContext;
let soundSources = {}; // To manage playing sounds (positional, effects)
let ambientSound = null; // Manage background music

export function initAudio(camera) {
    if (!camera) {
        console.error("Cannot initialize Audio: Camera object is missing.");
        return;
    }
    try {
        audioListener = new THREE.AudioListener();
        camera.add(audioListener); // Attach listener to the camera
        audioContext = audioListener.context; // Get context from listener
        console.log("Audio system initialized.");
    } catch (e) {
        console.warn("Web Audio API could not be initialized:", e);
    }
}

// Fallback procedural beep
function playProceduralBeep() {
    if (!audioContext || audioContext.state !== 'running') return; // Check context state
     try {
         const o = audioContext.createOscillator(); const g = audioContext.createGain();
         o.connect(g); g.connect(audioListener.gain);
         o.type = 'triangle'; o.frequency.setValueAtTime(440, audioContext.currentTime);
         g.gain.setValueAtTime(0.2, audioContext.currentTime);
         g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
         o.start(); o.stop(audioContext.currentTime + 0.2);
     } catch(e){ console.error("Procedural beep sound error", e); }
}

// Play a non-positional sound effect (UI, teleport)
export function playSound(soundName, volume = 0.5, detune = 0) {
    if (!audioContext || !audioListener || audioContext.state !== 'running') { // Check context state
         if(audioContext?.state === 'suspended') console.warn(`Cannot play sound '${soundName}', AudioContext suspended (needs user gesture).`);
         else if (!audioContext) console.warn(`Cannot play sound '${soundName}', AudioContext not initialized.`);
         return;
    }
    const buffer = getSoundBuffer(soundName);
    if (!buffer) {
        console.warn(`Sound buffer not found: ${soundName}. Playing fallback beep.`);
        playProceduralBeep(); // Play fallback beep if buffer missing
        return;
    }

    try {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.detune.value = detune;

        // Create a separate gain node for volume control
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

        source.connect(gainNode);
        gainNode.connect(audioListener.gain); // Connect to main listener gain

        source.start(0);
    } catch (e) {
         console.error(`Error playing sound ${soundName}:`, e);
    }
}

// Play positional sound
export function playPositionalSound(soundName, meshToAttach, volume = 1.0, refDistance = 1, rolloffFactor = 1) {
     if (!audioContext || !audioListener || audioContext.state !== 'running' || !meshToAttach) return;
     const buffer = getSoundBuffer(soundName);
     if (!buffer) { console.warn(`Positional sound buffer not found: ${soundName}`); return; }

    try {
        const sound = new THREE.PositionalAudio(audioListener);
        sound.setBuffer(buffer);
        sound.setRefDistance(refDistance);
        sound.setRolloffFactor(rolloffFactor);
        sound.setVolume(volume);
        // sound.setLoop(false);

        meshToAttach.add(sound);
        sound.play();
        // Auto cleanup after sound finishes? THREE.PositionalAudio doesn't have onended directly
        // May need to manage sources if attaching many sounds.
    } catch (e) {
         console.error(`Error playing positional sound ${soundName}:`, e);
    }
}


// Start/Stop Ambient Background Music/Sound
export function startAmbientSound(soundName) {
    if (!audioContext || !audioListener) return; // Don't check state here, allow scheduling even if suspended
    const buffer = getSoundBuffer(soundName);
    if (!buffer) { console.warn(`Ambient sound buffer not found: ${soundName}`); return; }

    // Stop previous ambient sound if playing
    if (ambientSound && ambientSound.isPlaying) {
        try { ambientSound.stop(); } catch(e){}
    }

    try {
        ambientSound = new THREE.Audio(audioListener);
        ambientSound.setBuffer(buffer);
        ambientSound.setLoop(true);
        ambientSound.setVolume(0.3);
        ambientSound.play(); // This might trigger the warning if context is suspended
        console.log(`Started ambient sound: ${soundName}`);
    } catch (e) {
         console.error(`Error starting ambient sound ${soundName}:`, e);
         ambientSound = null;
    }
}

export function stopAmbientSound() {
     if (ambientSound && ambientSound.isPlaying) {
        try {
            ambientSound.stop();
            ambientSound = null;
            console.log("Stopped ambient sound.");
        } catch(e){
            console.error("Error stopping ambient sound:", e);
        }
    }
}

// Fallback procedural respawn sound
function playProceduralRespawn() {
    if (!audioContext || audioContext.state !== 'running') return;
     try {
         const o = audioContext.createOscillator(); const g = audioContext.createGain();
         o.connect(g); g.connect(audioListener.gain);
         o.type = 'sawtooth';
         o.frequency.setValueAtTime(150, audioContext.currentTime);
         o.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.4); // Downward sweep
         g.gain.setValueAtTime(0.3, audioContext.currentTime);
         g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
         o.start(); o.stop(audioContext.currentTime + 0.5);
     } catch(e){ console.error("Procedural respawn sound error", e); }
}

// --- Specific Sound Event Wrappers ---
export function playJumpSound() { playSound('jump', 0.6); }
export function playLandSound(hard = false) { playSound('land', hard ? 0.7 : 0.5, hard ? -100 : 0); }
export function playClueCollectSound() { playSound('collect_clue', 0.7); }
export function playKeyClueSound() { playSound('collect_clue', 0.9, 200); } // Example variation
export function playPortalEnterSound(type = 'random') { playSound(type === 'main' ? 'teleport_main' : 'teleport_random', 0.8); }
export function playErrorSound() { playSound('error', 0.4); }
export function playObjectiveCompleteSound() { playSound('objective_complete', 0.8); }
export function playRespawnSound() {
    // Try loading buffer first
    const buffer = getSoundBuffer('respawn');
    if (buffer && audioContext && audioListener) {
        playSound('respawn', 0.7); // Use loaded sound if available
    } else {
        playProceduralRespawn(); // Fallback
    }
}
// ... add more specific wrappers ...

    
