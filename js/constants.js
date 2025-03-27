// Player
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_BASE_SPEED = 5.0;
export const JUMP_VELOCITY = 8.0;
export const BASE_GRAVITY = -20.0; // Base gravity, can be modified by biome
export const DEFAULT_FRICTION = 0.98; // Multiplier for velocity when grounded and not moving
export const RESPAWN_Y_THRESHOLD = -20.0; // Y level below which player respawns

// Universe
export const UNIVERSE_RADIUS = 35; // Slightly larger
export const MAIN_UNIVERSE_RADIUS = 15;

// Interaction
export const PORTAL_INTERACTION_DISTANCE = 3.0;
export const CLUE_INTERACTION_DISTANCE = 2.5;
export const NPC_HINT_INTERACTION_DISTANCE = 3.0;
export const OBJECTIVE_ITEM_INTERACTION_DISTANCE = 2.0;
export const CLUE_DISPLAY_TIMEOUT = 6000; // Longer display
export const TEMP_MESSAGE_TIMEOUT = 2500; // Duration for temp messages

// Controls
export const defaultControlMap = { KeyW: 'forward', KeyS: 'backward', KeyA: 'left', KeyD: 'right' };
export const controlActions = ['forward', 'backward', 'left', 'right'];

// Paths
export const ASSETS_PATH = './assets/';
export const TEXTURE_PATH = ASSETS_PATH + 'textures/';
export const SOUND_PATH = ASSETS_PATH + 'sounds/';
export const MODEL_PATH = ASSETS_PATH + 'models/';

// Gameplay Tuning
export const CONTROL_RANDOM_CHANCE = 0.5; // 50% chance per random universe
export const MINI_OBJECTIVE_CHANCE = 0.4; // 40% chance per random universe
export const PLAYER_SPAWN_CLEARANCE_RADIUS = 1.5; // Radius to check around player spawn
export const PLACEMENT_CLEARANCE_RADIUS_MULTIPLIER = 1.2; // Check slightly larger area for object placement
export const MAX_PLACEMENT_ATTEMPTS = 15;
export const HARD_LANDING_VELOCITY_THRESHOLD = -12.0; // Y-velocity threshold for hard landing sound/effect
