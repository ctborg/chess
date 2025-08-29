// src/components/Board3D.jsx
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Chess } from "chess.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import pieceModels from "../assets/pieces";

// ---------------------- Debug toggles (flip to true temporarily) ----------------------
const SHOW_AXES = false;   // shows XYZ axes at origin
const SHOW_BBOX = false;   // outlines mesh bounding boxes
const LOG_PIECES = false;  // logs placement positions

const FILES = "abcdefgh";

function squareToWorld(sq, orientation) {
  const file = FILES.indexOf(sq[0]);       // 0..7
  const rankIdx = parseInt(sq[1], 10) - 1; // 0..7
  const x = file - 3.5;
  const z = (orientation === "white" ? 7 - rankIdx : rankIdx) - 3.5;
  return new THREE.Vector3(x, 0.1, z);     // sit slightly above tile
}

// Center, scale, and sit the model on y=0
function normalizeModel(root, { targetHeight = 1.1 } = {}) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // If your GLBs are Z-up (lying on their backs), try uncommenting:
  // root.rotation.x = -Math.PI / 2;

  // Recenter to origin
  root.position.sub(center);

  // Uniform scale to target height
  const height = size.y || 1;
  const s = targetHeight / height;
  root.scale.setScalar(s);

  // After scaling, lift base to y=0
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;

  // Ensure visible materials + shadows
  root.traverse((o) => {
    if (o.isMesh) {
      // If the GLB already has good materials, you can remove this override.
      o.material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.45
      });
      o.castShadow = true;
      o.receiveShadow = true;

      if (SHOW_BBOX) {
        const helper = new THREE.Box3Helper(new THREE.Box3().setFromObject(o), 0xff00ff);
        o.add(helper);
      }
    }
  });

  return root;
}

export default function Board3D({
  fen,
  orientation = "white",
  selected,
  legalTargets = new Set(),
  lastMove,
  onSquareClick
}) {
  const wrapRef = useRef(null);

  // Three.js refs
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);

  // Tiles and pieces
  const tilesRef = useRef({});           // square -> tile mesh
  const piecesGroupRef = useRef(null);   // group for all piece instances

  // Loading + cache
  const loaderRef = useRef(new GLTFLoader());
  const cacheRef = useRef({});           // { k: normalizedScene, q: ..., ... }
  const [modelsReady, setModelsReady] = useState(0); // bump as models load

  // Raycasting
  const raycaster = useRef(new THREE.Raycaster()).current;
  const pointer = useRef(new THREE.Vector2()).current;

  // ---------------------- Scene setup (once) ----------------------
  useEffect(() => {
    const wrap = wrapRef.current;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const size = Math.min(wrap.clientWidth, wrap.clientHeight || wrap.clientWidth);
    renderer.setSize(size, size);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // compatibility for older three versions:
    // renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    wrap.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(10, 12, 10);
    cameraRef.current = camera;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 28;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(8, 16, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    scene.add(dir);

    if (SHOW_AXES) scene.add(new THREE.AxesHelper(3));

    // Ground (nice contact shadows outside the board)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshPhongMaterial({ color: 0xffffff })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // Board tiles (8x8)
    const tiles = {};
    const board = new THREE.Group();
    const tileGeo = new THREE.BoxGeometry(1, 0.1, 1);

    for (let r = 1; r <= 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = `${FILES[f]}${r}`;
        const isDark = (f + r) % 2 === 0;
        const tile = new THREE.Mesh(
          tileGeo,
          new THREE.MeshPhongMaterial({ color: isDark ? 0xb58863 : 0xf0d9b5 })
        );
        tile.position.set(f - 3.5, 0, r - 3.5);
        tile.receiveShadow = true;
        tile.userData = { fileIdx: f, rankIdx: r - 1 };
        board.add(tile);
        tiles[sq] = tile;
      }
    }
    scene.add(board);
    tilesRef.current = tiles;

    // Pieces group
    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);
    piecesGroupRef.current = piecesGroup;

    // Resize (keep square)
    const onResize = () => {
      const s = Math.min(wrap.clientWidth, wrap.clientHeight || wrap.clientWidth);
      renderer.setSize(s, s, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Click picking: intersect tiles, map to algebraic based on orientation
    const handlePointer = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(board.children, true);
      const hit = intersects[0];
      if (!hit) return;

      const { fileIdx, rankIdx } = hit.object.userData || {};
      if (fileIdx == null || rankIdx == null) return;

      const file = FILES[fileIdx];
      const rank = orientation === "white" ? 8 - rankIdx : rankIdx + 1;
      const square = `${file}${rank}`;
      onSquareClick(square);
    };
    renderer.domElement.addEventListener("pointerdown", handlePointer);

    // Render loop
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (wrap.contains(renderer.domElement)) wrap.removeChild(renderer.domElement);
    };
  }, [onSquareClick]);

  // Camera orientation
  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (orientation === "white") camera.position.set(10, 12, 10);
    else camera.position.set(-10, 12, -10);

    controls.target.set(0, 0, 0);
    controls.update();
  }, [orientation]);

  // Load & cache GLBs
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const entries = Object.entries(pieceModels);
      for (const [key, url] of entries) {
        if (cancelled) return;
        if (cacheRef.current[key]) continue;

        try {
          const gltf = await loaderRef.current.loadAsync(url);
          const root = gltf.scene || gltf.scenes?.[0];
          if (!root) continue;

          cacheRef.current[key] = normalizeModel(root, { targetHeight: 1.1 });

          // bump to re-run placement once this model is ready
          setModelsReady((v) => v + 1);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Failed to load GLB:", key, url, err);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Build pieces whenever FEN/orientation/modelsReady changes
  useEffect(() => {
    const piecesGroup = piecesGroupRef.current;
    if (!piecesGroup) return;

    // Clear previous instances
    while (piecesGroup.children.length) {
      const child = piecesGroup.children.pop();
      if (child) piecesGroup.remove(child);
    }

    const chess = new Chess(fen);
    const squares = chess.SQUARES || [];

    squares.forEach((sq) => {
      const piece = chess.get(sq);
      if (!piece) return;

      const base = cacheRef.current[piece.type];
      if (!base) return; // not loaded yet; will appear once modelsReady increments again

      // Clone normalized model
      const instance = cloneSkeleton(base);

      // Tint by side (clone material so both sides differ)
      instance.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone();
          o.material.color.set(piece.color === "w" ? 0xfafafa : 0x111111);
        }
      });

      const pos = squareToWorld(sq, orientation);
      instance.position.set(pos.x, pos.y, pos.z);
      piecesGroup.add(instance);

      if (LOG_PIECES) {
        // eslint-disable-next-line no-console
        console.log("Placed", piece.type, piece.color, "at", sq, "->", instance.position);
      }
    });

    if (LOG_PIECES) {
      // eslint-disable-next-line no-console
      console.log("pieces count:", piecesGroup.children.length, "modelsReady:", modelsReady);
    }
  }, [fen, orientation, modelsReady]);

  // Highlight tiles (selected, targets, last move)
  useEffect(() => {
    const tiles = tilesRef.current;
    if (!tiles) return;

    // Reset emissive on all tiles
    Object.values(tiles).forEach((mesh) => {
      if (mesh && mesh.material) {
        mesh.material.emissive = new THREE.Color(0x000000);
      }
    });

    const getTile = (sq) => tiles[sq];

    if (lastMove) {
      const a = getTile(lastMove.from);
      const b = getTile(lastMove.to);
      if (a?.material) a.material.emissive = new THREE.Color(0x9ccc65); // greenish
      if (b?.material) b.material.emissive = new THREE.Color(0x9ccc65);
    }

    if (selected) {
      const sel = getTile(selected);
      if (sel?.material) sel.material.emissive = new THREE.Color(0xfff176); // yellow
    }

    legalTargets.forEach((sq) => {
      const t = getTile(sq);
      if (t?.material) t.material.emissive = new THREE.Color(0x81c784); // target green
    });
  }, [selected, legalTargets, lastMove]);

  return (
    <div
      className="board3d"
      ref={wrapRef}
      aria-label="3D Chess Board"
      style={{ width: "calc(var(--square, 68px) * 8)", height: "calc(var(--square, 68px) * 8)" }}
    />
  );
}
