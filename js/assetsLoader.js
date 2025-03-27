import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { showLoading } from './ui.js';
import * as Constants from './constants.js';

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const audioLoader = new THREE.AudioLoader();
// const fontLoader = new FontLoader();

const loadedAssets = {
    textures: {},
    models: {},
    sounds: {},
    fonts: {}
};

// List of assets to preload
const assetsToLoad = [
    // Textures
    { type: 'texture', name: 'tardis_floor', path: Constants.TEXTURE_PATH + 'tardis_floor.jpg' },
    { type: 'texture', name: 'cave_floor', path: Constants.TEXTURE_PATH + 'cave_floor.png' },
    { type: 'texture', name: 'volcanic_ground', path: Constants.TEXTURE_PATH + 'volcanic_ground.jpg' },
    { type: 'texture', name: 'grid_lines', path: Constants.TEXTURE_PATH + 'grid_lines.png' },
    { type: 'texture', name: 'grass_moss', path: Constants.TEXTURE_PATH + 'grass_moss.png' },

    // Models
    { type: 'model', name: 'console', path: Constants.MODEL_PATH + 'console.glb' },
    // { type: 'model', name: 'crystal_large', path: Constants.MODEL_PATH + 'crystal_large.glb' },

    // Sounds
    { type: 'sound', name: 'teleport_random', path: Constants.SOUND_PATH + 'teleport_random.wav' }, // Corrected extension
    { type: 'sound', name: 'teleport_main', path: Constants.SOUND_PATH + 'teleport_main.wav' },
    { type: 'sound', name: 'collect_clue', path: Constants.SOUND_PATH + 'collect_clue.wav' },
    { type: 'sound', name: 'jump', path: Constants.SOUND_PATH + 'jump.wav' },
    { type: 'sound', name: 'land', path: Constants.SOUND_PATH + 'land.wav' },
    { type: 'sound', name: 'error', path: Constants.SOUND_PATH + 'error.wav' },
    { type: 'sound', name: 'objective_complete', path: Constants.SOUND_PATH + 'objective_complete.wav' },
    { type: 'sound', name: 'respawn', path: Constants.SOUND_PATH + 'respawn.wav' }, // Added respawn sound
    { type: 'sound', name: 'ambient_main', path: Constants.SOUND_PATH + 'ambient_main.mp3' },
    { type: 'sound', name: 'ambient_crystal', path: Constants.SOUND_PATH + 'ambient_crystal.mp3' },
    { type: 'sound', name: 'ambient_volcanic', path: Constants.SOUND_PATH + 'ambient_volcanic.mp3' },
    // --- ADDED MISSING AMBIENT SOUNDS ---
    { type: 'sound', name: 'ambient_windy', path: Constants.SOUND_PATH + 'ambient_windy.mp3' },
    { type: 'sound', name: 'ambient_techno', path: Constants.SOUND_PATH + 'ambient_techno.mp3' },
    { type: 'sound', name: 'ambient_random_default', path: Constants.SOUND_PATH + 'ambient_random_default.mp3' },
    // --- END ADDED SOUNDS ---
];

export async function preloadAllAssets() {
    showLoading(true);
    console.log("Starting asset preloading...");

    const promises = assetsToLoad.map(assetInfo => {
        const loadPromise = (() => { // Wrap loader calls in an immediately invoked function expression
            switch (assetInfo.type) {
                case 'texture':
                    return textureLoader.loadAsync(assetInfo.path).then(texture => {
                        texture.encoding = THREE.sRGBEncoding;
                        if(assetInfo.name.includes('floor') || assetInfo.name.includes('ground')) {
                             texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                        }
                        loadedAssets.textures[assetInfo.name] = texture;
                        // console.log(`Loaded texture: ${assetInfo.name}`); // Reduce console spam
                    });
                case 'model':
                     return gltfLoader.loadAsync(assetInfo.path).then(gltf => {
                        loadedAssets.models[assetInfo.name] = gltf;
                        console.log(`Loaded model: ${assetInfo.name}`);
                    });
                case 'sound':
                     return audioLoader.loadAsync(assetInfo.path).then(buffer => {
                        loadedAssets.sounds[assetInfo.name] = buffer;
                        // console.log(`Loaded sound: ${assetInfo.name}`); // Reduce console spam
                    });
                default:
                    console.warn(`Unknown asset type: ${assetInfo.type}`);
                    return Promise.resolve(); // Resolve immediately for unknown types
            }
        })(); // Immediately invoke the function

        // Add catch block to each individual promise
        return loadPromise.catch(err => {
             console.error(`Failed to load ${assetInfo.type} ${assetInfo.name}:`, err);
        });
    });

    try {
        await Promise.all(promises);
        console.log("All asset loading attempts finished.");
    } catch (error) {
        console.error("Unexpected error during Promise.all for asset loading:", error);
    } finally {
        showLoading(false);
    }
}

// Function to get a loaded asset
export function getAsset(type, name) {
    if (loadedAssets[type] && loadedAssets[type][name]) {
        return loadedAssets[type][name];
    } else {
        // Warning logged during load attempt if failed
        return null;
    }
}

// Specific getters
export function getTexture(name) { return getAsset('textures', name); }
export function getModel(name) { return getAsset('models', name); }
export function getSoundBuffer(name) { return getAsset('sounds', name); }
