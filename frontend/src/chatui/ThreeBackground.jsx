import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';

/* ── Gold particle field ─────────────────────────────────── */
function ParticleField() {
  const ref = useRef(null);

  const positions = useMemo(() => {
    const count = 2600;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 0.028;
    ref.current.rotation.x = Math.sin(t * 0.015) * 0.12;
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#D4AF37"
        size={0.04}
        sizeAttenuation
        depthWrite={false}
        opacity={0.55}
      />
    </Points>
  );
}

/* ── White/silver star layer ─────────────────────────────── */
function StarField() {
  const ref = useRef(null);

  const positions = useMemo(() => {
    const count = 800;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 40;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 40;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = -t * 0.012;
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#ffffff"
        size={0.025}
        sizeAttenuation
        depthWrite={false}
        opacity={0.3}
      />
    </Points>
  );
}

/* ── Gold wireframe torus ring ───────────────────────────── */
function GoldRing() {
  const ref = useRef(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.z = t * 0.055;
    ref.current.rotation.x = t * 0.022;
  });

  return (
    <mesh ref={ref} position={[3.5, -1, -7]}>
      <torusGeometry args={[3.2, 0.012, 2, 90]} />
      <meshBasicMaterial color="#D4AF37" transparent opacity={0.2} />
    </mesh>
  );
}

/* ── Darker gold outer ring ──────────────────────────────── */
function OuterRing() {
  const ref = useRef(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 0.038;
    ref.current.rotation.z = -t * 0.018;
  });

  return (
    <mesh ref={ref} position={[-4, 2, -9]}>
      <torusGeometry args={[2.6, 0.01, 2, 80]} />
      <meshBasicMaterial color="#B8922F" transparent opacity={0.13} />
    </mesh>
  );
}

/* ── Wireframe sphere (subtle) ───────────────────────────── */
function GlowSphere() {
  const ref = useRef(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = Math.sin(t * 0.25) * 0.35;
    ref.current.position.x = Math.cos(t * 0.18) * 0.25;
  });

  return (
    <mesh ref={ref} position={[0, 0, -11]}>
      <sphereGeometry args={[2.4, 32, 32]} />
      <meshBasicMaterial color="#D4AF37" transparent opacity={0.03} wireframe />
    </mesh>
  );
}

/* ── Export ──────────────────────────────────────────────── */
export default function ThreeBackground() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(135deg, #030712 0%, #060c1a 50%, #08101e 100%)',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 70 }}
        gl={{ antialias: false, alpha: true }}
        dpr={[1, 1.5]}
        style={{ width: '100%', height: '100%' }}
      >
        <ParticleField />
        <StarField />
        <GoldRing />
        <OuterRing />
        <GlowSphere />
      </Canvas>
    </div>
  );
}
