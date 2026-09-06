import { useEffect, useRef, useState } from "react";

// The assembled heart from cogs and gears, viewable in place. The Blender
// export groups every part under Stage1..Stage25 empties — one stage per
// verse of the poem — so a slider replays the assembly the site performs.

const MODEL_URL = "/models/projects/cogs-and-gears/allStages.glb";
const STAGES = 25;
const PLAY_MS = 420; // per-stage cadence during autoplay

// three.js is imported on demand: only this post pays for it
async function loadThree() {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
  return { THREE, GLTFLoader, OrbitControls };
}

function createRenderer(THREE, mount) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // setSize(w, h, false) leaves the canvas at buffer size (2× on retina):
  // pin it to the container instead so only the container decides layout
  Object.assign(renderer.domElement.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
  });
  mount.appendChild(renderer.domElement);
  return renderer;
}

function createScene(THREE) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 6, 5);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.9);
  fill.position.set(-5, -2, -4);
  scene.add(key, fill);
  return scene;
}

// the stage empties by verse number, whatever their order in the file
function collectStages(root) {
  const stages = new Map();
  root.traverse((node) => {
    const m = /^Stage(\d+)_/.exec(node.name);
    if (m) stages.set(Number(m[1]), node);
  });
  return stages;
}

// center the model and step the camera back far enough to frame all of it
function frameModel(THREE, root, camera, controls) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  root.position.sub(center);
  camera.position.set(radius * 1.1, radius * 0.45, radius * 1.9);
  controls.target.set(0, 0, 0);
  controls.update();
}

function disposeScene(scene) {
  scene.traverse((n) => {
    n.geometry?.dispose?.();
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    mats.forEach((mat) => mat?.dispose?.());
  });
}

function AssemblyControls({ status, playing, stage, onToggle, onScrub }) {
  const btn =
    "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={status !== "ready"}
        className={`${btn} bg-secondary text-[var(--accent-fill-fg)] hover:opacity-90`}
      >
        {playing ? "pause" : "▶ assemble"}
      </button>
      <input
        type="range"
        min="1"
        max={STAGES}
        value={stage}
        disabled={status !== "ready"}
        onChange={(e) => onScrub(Number(e.target.value))}
        className="min-w-32 flex-1 accent-[var(--accent)]"
        aria-label="assembly stage"
      />
      <span className="text-[11px] text-[var(--fg-3)]">drag to orbit</span>
    </div>
  );
}

export default function HeartAssembly() {
  const mountRef = useRef(null);
  const stageNodesRef = useRef(null); // Map verse number -> Object3D
  const invalidateRef = useRef(() => {});
  const [stage, setStage] = useState(STAGES);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  // scene setup — once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      let mods, renderer;
      try {
        mods = await loadThree();
        if (disposed) return;
        renderer = createRenderer(mods.THREE, mount);
      } catch {
        if (!disposed) setStatus("error");
        return;
      }
      const { THREE, GLTFLoader, OrbitControls } = mods;

      const scene = createScene(THREE);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

      // wheel keeps scrolling the page; drag rotates, pinch still zooms
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.9;

      // render only while damping/auto-rotate needs frames AND we're on screen
      let raf = 0;
      let onScreen = true;
      const loop = () => {
        raf = 0;
        if (disposed || !onScreen) return;
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      const invalidate = () => {
        if (!raf && !disposed) raf = requestAnimationFrame(loop);
      };
      invalidateRef.current = invalidate;

      const io = new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting;
        invalidate();
      });
      io.observe(mount);

      const size = () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        invalidate();
      };
      const ro = new ResizeObserver(size);
      ro.observe(mount);
      size();

      new GLTFLoader().load(
        MODEL_URL,
        (gltf) => {
          if (disposed) return;
          const root = gltf.scene;
          stageNodesRef.current = collectStages(root);
          scene.add(root);
          frameModel(THREE, root, camera, controls);
          setStatus("ready");
          invalidate();
        },
        undefined,
        () => {
          if (!disposed) setStatus("error");
        },
      );

      cleanup = () => {
        io.disconnect();
        ro.disconnect();
        if (raf) cancelAnimationFrame(raf);
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        disposeScene(scene);
      };
      if (disposed) cleanup(); // unmounted while we were setting up
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  // stage visibility — the same rule the site uses: show 1..stage
  useEffect(() => {
    const stages = stageNodesRef.current;
    if (!stages) return;
    stages.forEach((node, n) => {
      node.visible = n <= stage;
    });
    invalidateRef.current();
  }, [stage, status]);

  // autoplay: restart from one part, add a stage per beat
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStage((s) => {
        if (s >= STAGES) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, PLAY_MS);
    return () => clearInterval(id);
  }, [playing]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
    } else {
      setStage(1);
      setPlaying(true);
    }
  };

  const scrub = (v) => {
    setPlaying(false);
    setStage(v);
  };

  return (
    <div className="not-prose my-7 w-full overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--mat)] shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg-2)]">
          cogs and gears · the heart
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--fg-3)]">
          verse <span className="font-semibold text-secondary">{stage}</span>/{STAGES}
        </span>
      </div>

      <div ref={mountRef} className="relative aspect-[4/3] w-full sm:aspect-[16/9]">
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--fg-3)]">
            {status === "loading" ? "loading the heart…" : "3D isn’t available in this browser"}
          </div>
        )}
      </div>

      <AssemblyControls
        status={status}
        playing={playing}
        stage={stage}
        onToggle={toggle}
        onScrub={scrub}
      />
    </div>
  );
}
