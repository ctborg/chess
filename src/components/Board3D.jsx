import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Chess } from "chess.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import pieceModels from "../assets/pieces";

const FILES = "abcdefgh";

export default function Board3D({ fen, orientation = "white", onSquareClick }) {
  const mountRef = useRef();
  const sceneRef = useRef();
  const rendererRef = useRef();
  const cameraRef = useRef();
  const boardSquares = useRef([]);
  const piecesGroupRef = useRef(new THREE.Group());
  const loaderRef = useRef(new GLTFLoader());
  const cacheRef = useRef({}); // { k: GLTF.scene, q: ..., ... }

  // Load all models once
  const loadAllModels = useMemo(() => {
    return async () => {
      const entries = Object.entries(pieceModels);
      const promises = entries.map(async ([key, url]) => {
        if (!cacheRef.current[key]) {
          const gltf = await loaderRef.current.loadAsync(url);
          // Normalize pivot / scale if needed (depends on your GLBs)
          const root = gltf.scene;
          root.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          cacheRef.current[key] = root;
        }
      });
      await Promise.all(promises);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 12, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(8, 16, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    scene.add(dir);

    // Ground (receive shadow)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshPhongMaterial({ color: 0xffffff })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // Chessboard
    const squareSize = 1;
    const board = new THREE.Group();
    boardSquares.current = [];

    for (let ix = 0; ix < 8; ix++) {
      for (let iz = 0; iz < 8; iz++) {
        const isDark = (ix + iz) % 2 === 1;
        const color = isDark ? 0xb58863 : 0xf0d9b5;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(squareSize, 0.1, squareSize),
          new THREE.MeshPhongMaterial({ color })
        );
        m.position.set(ix - 3.5, 0, iz - 3.5);

        const file = FILES[ix];
        const rank = orientation === "white" ? 8 - iz : iz + 1;
        m.userData = { square: `${file}${rank}` };

        m.receiveShadow = true;
        board.add(m);
        boardSquares.current.push(m);
      }
    }
    scene.add(board);

    // Group for pieces
    piecesGroupRef.current = new THREE.Group();
    scene.add(piecesGroupRef.current);

    // Render loop
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const { clientWidth, clientHeight } = mount;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [orientation]);

  // Place realistic pieces according to FEN
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadAllModels();
      if (cancelled) return;

      const scene = sceneRef.current;
      const piecesGroup = piecesGroupRef.current;
      // Clear previous
      while (piecesGroup.children.length) piecesGroup.remove(piecesGroup.children[0]);

      const game = new Chess(fen);

      game.SQUARES.forEach((sq) => {
        const piece = game.get(sq);
        if (!piece) return;

        const file = FILES.indexOf(sq[0]);
        const rankIdx = parseInt(sq[1], 10) - 1;
        const x = file - 3.5;
        const z = (orientation === "white" ? 7 - rankIdx : rankIdx) - 3.5;

        const base = cacheRef.current[piece.type];
        if (!base) return;

        // Clone the loaded model
        const instance = cloneSkeleton(base);

        // Normalize scale/height if your GLBs differ; tweak if needed:
        const uniformScale = 0.7;
        instance.scale.setScalar(uniformScale);

        // Lift piece slightly above squares
        // (Assumes model is roughly height ~1.2; adjust Y if needed)
        instance.position.set(x, 0.1, z);

        // Recolor/tint (override materials)
        instance.traverse((o) => {
          if (o.isMesh) {
            // If your GLBs already have nice materials, remove this override.
            o.material = new THREE.MeshPhysicalMaterial({
              color: piece.color === "w" ? 0xfafafa : 0x111111,
              metalness: 0.1,
              roughness: 0.4,
            });
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });

        piecesGroup.add(instance);
      });
    })();

    return () => { cancelled = true; };
  }, [fen, orientation, loadAllModels]);

  // Click detection (raycasting)
  useEffect(() => {
    const mount = mountRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function handleClick(e) {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(boardSquares.current, false);
      if (intersects.length > 0) {
        const square = intersects[0].object.userData.square;
        onSquareClick(square);
      }
    }

    mount.addEventListener("click", handleClick);
    return () => mount.removeEventListener("click", handleClick);
  }, [onSquareClick]);

  return (
    <div
      ref={mountRef}
      style={{ width: "480px", height: "480px" }}
      aria-label="3D Chess Board"
    />
  );
}
