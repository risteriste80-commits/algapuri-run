import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Constants & Config ---
const CANVAS_WIDTH = 800; // Virtual width for logic
const CANVAS_HEIGHT = 600; // Virtual height
const HERO_SIZE = 64;
const VILLAIN_SIZE = 64;
const GRAVITY_START = 3;
const SPAWN_RATE_START = 60; // Frames between spawns

/* 
  ASSET PATHS
  Note: We use dummy placeholders if files are missing, but code is ready for real assets.
*/
const ASSETS = {
    images: {
        hero: '/assets/hero.png',
        bg: '/assets/bg.png',
        villain1: '/assets/villain1.png',
        villain2: '/assets/villain2.png',
        villain3: '/assets/villain3.png',
    },
    audio: {
        menu: '/assets/menu-music.mp3',
        game: '/assets/game-music.mp3',
        eat: '/assets/eat.mp3',
    }
};

// --- Types ---
type GameState = 'loading' | 'menu' | 'playing' | 'gameover';

interface Hero {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
}

interface Villain {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    type: 1 | 2 | 3; // Determines image
}

// --- Helper: Asset Loader ---
// Returns a promise that resolves when all assets are processed (loaded or failed)
const loadAssets = async (
    onProgress: (loaded: number, total: number) => void
): Promise<{ images: Record<string, HTMLImageElement>; audio: Record<string, HTMLAudioElement> }> => {

    const imageKeys = Object.keys(ASSETS.images) as Array<keyof typeof ASSETS.images>;
    const audioKeys = Object.keys(ASSETS.audio) as Array<keyof typeof ASSETS.audio>;
    const total = imageKeys.length + audioKeys.length;
    let loadedCount = 0;

    const images: Record<string, HTMLImageElement> = {};
    const audio: Record<string, HTMLAudioElement> = {};

    const increment = () => {
        loadedCount++;
        onProgress(loadedCount, total);
    };

    // Load Images
    const imagePromises = imageKeys.map(key => new Promise<void>((resolve) => {
        const img = new Image();
        img.src = ASSETS.images[key];
        img.onload = () => {
            increment();
            resolve();
        };
        img.onerror = () => {
            console.warn(`Failed to load image: ${ASSETS.images[key]}`);
            increment(); // Count as handled
            resolve();
        };
        images[key] = img;
    }));

    // Load Audio
    const audioPromises = audioKeys.map(key => new Promise<void>((resolve) => {
        const sound = new Audio();
        sound.src = ASSETS.audio[key];
        // Audio loading is tricky; we'll use 'canplaythrough' or error
        // Also set a timeout in case browser prevents preloading
        let resolved = false;
        const done = () => {
            if (!resolved) {
                resolved = true;
                increment();
                resolve();
            }
        };

        sound.addEventListener('canplaythrough', done, { once: true });
        sound.addEventListener('error', done, { once: true });
        sound.load();

        // Fallback timeout for audio (e.g. if file is empty/corrupt)
        setTimeout(done, 2000);

        audio[key] = sound;
    }));

    await Promise.all([...imagePromises, ...audioPromises]);

    return { images, audio };
};

const App: React.FC = () => {
    // --- Refs & State ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>();
    const [gameState, setGameState] = useState<GameState>('loading');
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [level, setLevel] = useState(1);
    const [highScore, setHighScore] = useState(0); // Optional but nice

    // Game Logic Refs (Mutable state outside React render cycle)
    const assetsRef = useRef<{ images: Record<string, HTMLImageElement>; audio: Record<string, HTMLAudioElement> } | null>(null);
    const heroRef = useRef<Hero>({ x: 0, y: 0, width: HERO_SIZE, height: HERO_SIZE, speed: 7 }); // Speed scaled for 60fps
    const villainsRef = useRef<Villain[]>([]);
    const frameCountRef = useRef(0);
    const scoreRef = useRef(0);
    const livesRef = useRef(3);
    const levelRef = useRef(1);
    const keysRef = useRef<{ [key: string]: boolean }>({});

    // Audio state
    const isMusicPlaying = useRef(false);

    // --- Initialization ---
    useEffect(() => {
        // 1. Asset Loading
        loadAssets((loaded, total) => {
            setLoadingProgress(Math.floor((loaded / total) * 100));
        }).then((loadedAssets) => {
            assetsRef.current = loadedAssets;
            // Initialize basic positions
            setTimeout(() => setGameState('menu'), 500); // Small delay for UX
        });

        // 2. Input Listeners
        const handleKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true; };
        const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            cancelAnimationFrame(requestRef.current!);
        };
    }, []);

    // --- Audio Helpers ---
    const playSound = useCallback((key: string, loop = false) => {
        if (!assetsRef.current) return;
        const sound = assetsRef.current.audio[key];
        if (sound) {
            sound.currentTime = 0;
            sound.loop = loop;
            sound.play().catch(() => { }); // Ignore interaction errors
        }
    }, []);

    const stopMusic = useCallback(() => {
        if (!assetsRef.current) return;
        ['menu', 'game'].forEach(k => {
            assetsRef.current!.audio[k].pause();
            assetsRef.current!.audio[k].currentTime = 0;
        });
    }, []);

    // --- Game Loop Methods ---

    const spawnVillain = () => {
        // Difficulty logic
        const currentLev = levelRef.current;

        // Spawn rate: Decreases as level increases (faster spawns)
        // Level 1: 60 frames (~1s), Level 100: ~20 frames
        const spawnRate = Math.max(20, SPAWN_RATE_START - Math.floor(currentLev * 0.4));

        if (frameCountRef.current % spawnRate === 0) {
            const type = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
            const speedBase = GRAVITY_START + (currentLev * 0.1);
            const speed = speedBase + Math.random() * 2; // Add variance

            villainsRef.current.push({
                id: Date.now() + Math.random(),
                x: Math.random() * (CANVAS_WIDTH - VILLAIN_SIZE),
                y: -VILLAIN_SIZE, // Start above screen
                width: VILLAIN_SIZE,
                height: VILLAIN_SIZE,
                speed: speed,
                type: type,
            });
        }
    };

    const update = () => {
        if (!canvasRef.current) return;

        // 1. Hero Movement
        const hero = heroRef.current;
        if ((keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) && hero.x > 0) {
            hero.x -= hero.speed;
        }
        if ((keysRef.current['ArrowRight'] || keysRef.current['KeyD']) && hero.x < CANVAS_WIDTH - hero.width) {
            hero.x += hero.speed;
        }

        // 2. Villains Movement & Logic
        for (let i = villainsRef.current.length - 1; i >= 0; i--) {
            const v = villainsRef.current[i];
            v.y += v.speed;

            // Collision Detection
            if (
                hero.x < v.x + v.width &&
                hero.x + hero.width > v.x &&
                hero.y < v.y + v.height &&
                hero.height + hero.y > v.y
            ) {
                // Eaten!
                villainsRef.current.splice(i, 1);
                scoreRef.current += 1;
                playSound('eat');

                // Level Up
                const newLevel = 1 + Math.floor(scoreRef.current / 10);
                if (newLevel > levelRef.current) {
                    levelRef.current = newLevel;
                }

                continue;
            }

            // Missed (Fell off screen)
            if (v.y > CANVAS_HEIGHT) {
                villainsRef.current.splice(i, 1);
                livesRef.current -= 1;
                if (livesRef.current <= 0) {
                    setGameState('gameover');
                    setHighScore(h => Math.max(h, scoreRef.current));
                    return; // Stop updating
                }
            }
        }

        // 3. Spawning
        spawnVillain();

        frameCountRef.current++;
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
        // Clear
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw BG
        const bgImg = assetsRef.current?.images.bg;
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            ctx.drawImage(bgImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else {
            ctx.fillStyle = '#0a0a2a'; // Space Blue fallback
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        // Draw Hero
        const hero = heroRef.current;
        const heroImg = assetsRef.current?.images.hero;
        if (heroImg && heroImg.complete && heroImg.naturalWidth > 0) {
            ctx.drawImage(heroImg, hero.x, hero.y, hero.width, hero.height);
        } else {
            ctx.fillStyle = '#FFD700'; // Gold fallback
            ctx.beginPath();
            ctx.arc(hero.x + hero.width / 2, hero.y + hero.height / 2, hero.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Villains
        villainsRef.current.forEach(v => {
            const vKey = `villain${v.type}`;
            const vImg = assetsRef.current?.images[vKey];

            if (vImg && vImg.complete && vImg.naturalWidth > 0) {
                ctx.drawImage(vImg, v.x, v.y, v.width, v.height);
            } else {
                // Fallback colors for different villains
                ctx.fillStyle = v.type === 1 ? '#00FF00' : v.type === 2 ? '#FF0000' : '#8800FF';
                ctx.fillRect(v.x, v.y, v.width, v.height);
            }
        });
    };

    const loop = () => {
        if (gameState !== 'playing') return;

        update();

        // Sync React state with refs for UI (throttled normally, but 60fps React update is heavy? 
        // Optimization: Only update React state on changes or low freq, BUT for Score/Lives we want instant feedback.
        // We'll update the refs in `update` and just use React state for the wrapper UI.
        // To show HUD, we can draw text on canvas OR use React overlay.
        // Let's use Canvas text for performance, keeping React state minimal during game loop.

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                draw(ctx);
                // Draw HUD
                ctx.fillStyle = 'white';
                ctx.font = '20px "Press Start 2P", sans-serif'; // Fallback font
                ctx.fillText(`SCORE: ${scoreRef.current}`, 20, 40);
                ctx.fillText(`LEVEL: ${levelRef.current}`, 20, 70);
                ctx.fillText(`LIVES: ${livesRef.current}`, 20, 100);
            }
        }

        if (livesRef.current > 0) {
            requestRef.current = requestAnimationFrame(loop);
        }
    };

    // --- State Effects ---

    useEffect(() => {
        if (gameState === 'menu') {
            stopMusic();
            playSound('menu', true);
            // Draw one frame of menu bg?
        } else if (gameState === 'playing') {
            stopMusic();
            playSound('game', true);

            // Reset Game Data
            scoreRef.current = 0;
            livesRef.current = 3;
            levelRef.current = 1;
            villainsRef.current = [];
            heroRef.current = {
                x: CANVAS_WIDTH / 2 - HERO_SIZE / 2,
                y: CANVAS_HEIGHT - HERO_SIZE - 20,
                width: HERO_SIZE,
                height: HERO_SIZE,
                speed: 7
            };
            frameCountRef.current = 0;

            // Start Loop
            cancelAnimationFrame(requestRef.current!);
            requestRef.current = requestAnimationFrame(loop);
        } else if (gameState === 'gameover') {
            stopMusic();
            // Sync final stats to React for the Game Over screen
            setScore(scoreRef.current);
            setLevel(levelRef.current);
            setLives(0);
        }

        return () => cancelAnimationFrame(requestRef.current!);
    }, [gameState]);

    // Handle Resize used for responsiveness?
    // We use fixed logical resolution, scaled via CSS to fit screen.

    return (
        <div style={{
            position: 'relative',
            width: '100vw',
            height: '100vh',
            background: '#000',
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        }}>

            {/* GAME CANVAS */}
            <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`,
                    display: 'block',
                    boxShadow: '0 0 50px rgba(0,0,0,0.5)',
                    imageRendering: 'pixelated'
                }}
                // Touch Controls
                onTouchStart={(e) => {
                    const touchX = e.touches[0].clientX;
                    const width = window.innerWidth;
                    if (touchX < width / 2) keysRef.current['ArrowLeft'] = true;
                    else keysRef.current['ArrowRight'] = true;
                }}
                onTouchEnd={() => {
                    keysRef.current['ArrowLeft'] = false;
                    keysRef.current['ArrowRight'] = false;
                }}
            />

            {/* UI OVERLAY */}
            <div style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%', height: '100%',
                pointerEvents: 'none', // Allow clicks to pass to canvas when playing
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                fontFamily: 'monospace',
                color: '#fff',
                textShadow: '2px 2px #000'
            }}>

                {gameState === 'loading' && (
                    <h2 className="animate-pulse">LOADING ASSETS... {loadingProgress}%</h2>
                )}

                {gameState === 'menu' && (
                    <div style={{ pointerEvents: 'auto', textAlign: 'center', background: 'rgba(0,0,0,0.8)', padding: 40, borderRadius: 20, border: '4px solid gold' }}>
                        <h1 style={{ fontSize: '3rem', color: 'gold', marginBottom: 20 }}>ALGAPURI RUN</h1>
                        <p>Catch the falling monsters!</p>
                        <p>Controls: Arrow Keys or Tap Sides</p>
                        <button
                            onClick={() => setGameState('playing')}
                            style={{
                                marginTop: 20,
                                padding: '15px 40px',
                                fontSize: '1.5rem',
                                background: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: 10,
                                cursor: 'pointer'
                            }}
                        >
                            START GAME
                        </button>
                    </div>
                )}

                {gameState === 'gameover' && (
                    <div style={{ pointerEvents: 'auto', textAlign: 'center', background: 'rgba(50,0,0,0.9)', padding: 40, borderRadius: 20, border: '4px solid red' }}>
                        <h1 style={{ fontSize: '3rem', color: 'red', marginBottom: 10 }}>GAME OVER</h1>
                        <div style={{ fontSize: '1.5rem', marginBottom: 20 }}>
                            <p>SCORE: {score}</p>
                            <p>LEVEL: {level}</p>
                        </div>
                        <button
                            onClick={() => setGameState('menu')}
                            style={{
                                padding: '15px 40px',
                                fontSize: '1.2rem',
                                background: '#fff',
                                color: '#000',
                                border: 'none',
                                borderRadius: 10,
                                cursor: 'pointer'
                            }}
                        >
                            MAIN MENU
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
