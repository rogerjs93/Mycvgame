import * as THREE from 'three';
import { getSoundBuffer } from './assetsLoader.js'; // Assuming assetsLoader handles loading

let audioListener;
let audioContext;
let soundSources = {}; // To manage playing sounds (positional, effects)
let ambientSound = null; // Manage background music

export function initAudio(camera) {
    try {
        audioListener = new THREE.AudioListener();
        camera.add(audioListener); // Attach listener to the camera
        audioContext = audioListener.context; // Get context from listener
        console.log("Audio system initialized.");
    } catch (e) {
        console.warn("Web Audio API could not be initialized:", e);
    }
}

// Play a non-positional sound effect (UI, teleport)
export function playSound(soundName, volume = 0.5, detune = 0) {
    if (!audioContext || !audioListener) return;
    const buffer = getSoundBuffer(soundName);
    if (!buffer) {
        console.warn(`Sound buffer not found: ${soundName}`);
        // Optionally play a fallback procedural sound
        playProceduralBeep();
        return;
    }

    const source = audioListener.context.createBufferSource();
    source.buffer = buffer;
    source.connect(audioListener.gain); // Connect to main listener gain
    source.detune.value = detune;
    // Create a separate gain node for volume control per sound is better practice
    const gainNode = audioListener.context.createGain();
    gainNode.gain.setValueAtTime(volume, audioListener.context.currentTime);
    source.connect(gainNode);
    gainNode.connect(audioListener.gain);

    source.start(0);
}

// Play positional sound (e.g., NPC step, object interaction)
export function playPositionalSound(soundName, meshToAttach, volume = 1.0, refDistance = 1, rolloffFactor = 1) {
     if (!audioContext || !audioListener) return;
     const buffer = getSoundBuffer(soundName);
     if (!buffer) {
         console.warn(`Positional sound buffer not found: ${soundName}`);
         return;
     }

    // Use PositionalAudio for 3D sound
    const sound = new THREE.PositionalAudio(audioListener);
    sound.setBuffer(buffer);
    sound.setRefDistance(refDistance); // Distance where volume is 1
    sound.setRolloffFactor(rolloffFactor); // How quickly volume drops off
    sound.setVolume(volume);
    // sound.setLoop(false); // Default is false

    meshToAttach.add(sound); // Attach sound source to the object
    sound.play();

    // Optional: Manage sound sources if you need to stop them later
    // soundSources[soundName + meshToAttach.id] = sound; // Example key
}


// Start/Stop Ambient Background Music/Sound
export function startAmbientSound(soundName) {
    if (!audioContext || !audioListener) return;
    const buffer = getSoundBuffer(soundName);
    if (!buffer) {
        console.warn(`Ambient sound buffer not found: ${soundName}`);
        return;
    }

    // Stop previous ambient sound if playing
    if (ambientSound && ambientSound.isPlaying) {
        ambientSound.stop();
    }

    // Create new ambient sound
    ambientSound = new THREE.Audio(audioListener); // Use non-positional Audio
    ambientSound.setBuffer(buffer);
    ambientSound.setLoop(true);
    ambientSound.setVolume(0.3); // Adjust ambient volume
    ambientSound.play();
    console.log(`Started ambient sound: ${soundName}`);
}

export function stopAmbientSound() {
     if (ambientSound && ambientSound.isPlaying) {
        ambientSound.stop();
        ambientSound = null;
        console.log("Stopped ambient sound.");
    }
}

// Fallback procedural beep
function playProceduralBeep() {
    if (!audioContext) return;
     try {
         const o = audioContext.createOscillator(); const g = audioContext.createGain();
         o.connect(g); g.connect(audioListener.gain);
         o.type = 'triangle'; o.frequency.setValueAtTime(440, audioContext.currentTime);
         g.gain.setValueAtTime(0.2, audioContext.currentTime);
         g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
         o.start(); o.stop(audioContext.currentTime + 0.2);
     } catch(e){ console.error("Procedural sound error", e); }
}

// --- Specific Sound Event Wrappers ---
export function playJumpSound() { playSound('jump', 0.6); }
export function playLandSound(hard = false) { playSound('land', hard ? 0.7 : 0.5, hard ? -100 : 0); }
export function playClueCollectSound() { playSound('collect_clue', 0.7); }
export function playKeyClueSound() { playSound('collect_clue', 0.9, 200); } // Example variation
export function playPortalEnterSound(type = 'random') { playSound(type === 'main' ? 'teleport_main' : 'teleport_random', 0.8); }
export function playErrorSound() { playSound('error', 0.4); } // Need an 'error.wav'
export function playObjectiveCompleteSound() { playSound('objective_complete', 0.8); } // Need 'objective_complete.wav'
// ... add more specific wrappers ...
