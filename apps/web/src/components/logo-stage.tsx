'use client';

import { RoundedBox, useTexture } from '@react-three/drei';
import Image from 'next/image';
import { Canvas, useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import Hammer from 'hammerjs';
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import * as THREE from 'three';

type Spin = {
  userX: number;
  userY: number;
  idle: number;
  dragging: boolean;
  impulse: number;
};

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener('talkel-theme', onStoreChange);
  return () => window.removeEventListener('talkel-theme', onStoreChange);
}

function isLightTheme() {
  return document.documentElement.dataset.theme === 'light';
}

function Scene({ spin, light }: { spin: RefObject<Spin>; light: boolean }) {
  const group = useRef<THREE.Group>(null);
  const texture = useTexture('/logo-mark.png');

  const map = useMemo(() => {
    const cloned = texture.clone();
    cloned.colorSpace = THREE.SRGBColorSpace;
    cloned.anisotropy = 8;
    cloned.needsUpdate = true;
    return cloned;
  }, [texture]);

  useEffect(() => () => map.dispose(), [map]);

  useFrame((state, delta) => {
    const mark = group.current;
    const motion = spin.current;
    if (!mark || !motion) return;
    const clock = mark.userData as { idle: number; impulse: number; seen: number };
    if (clock.idle === undefined) {
      clock.idle = 0;
      clock.impulse = 0;
      clock.seen = 0;
    }
    if (!motion.dragging) clock.idle += delta * 0.55;
    if (motion.impulse !== clock.seen) {
      clock.seen = motion.impulse;
      clock.impulse = 1;
    }
    clock.impulse *= Math.exp(-delta * 3);
    const pointerX = motion.dragging ? 0 : state.pointer.x;
    const pointerY = motion.dragging ? 0 : state.pointer.y;
    mark.rotation.y = THREE.MathUtils.damp(mark.rotation.y, clock.idle * 0.45 + motion.userY + pointerX * 0.28, 5, delta);
    mark.rotation.x = THREE.MathUtils.damp(mark.rotation.x, motion.userX - pointerY * 0.16, 5, delta);
    mark.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.04;
    const scale = 1 + clock.impulse * 0.05;
    mark.scale.setScalar(THREE.MathUtils.damp(mark.scale.x, scale, 5, delta));
  });

  return (
    <>
      <ambientLight intensity={light ? 2.4 : 0.45} />
      <directionalLight position={[2.6, 3.4, 4.2]} intensity={light ? 1.15 : 2.2} />
      <directionalLight position={[-3.2, -1, 2]} intensity={light ? 0.2 : 0.65} color="#8aa4ff" />
      <spotLight position={[0, 1.8, 3.4]} angle={0.55} penumbra={0.85} intensity={light ? 2 : 16} color="#b7c6ff" />
      <group ref={group}>
        <RoundedBox args={[2.05, 2.05, 0.2]} radius={0.46} smoothness={8}>
          <meshPhysicalMaterial
            color={light ? '#ffffff' : '#161a24'}
            roughness={light ? 0.42 : 0.22}
            metalness={light ? 0 : 0.48}
            clearcoat={light ? 0.35 : 1}
            clearcoatRoughness={0.2}
          />
        </RoundedBox>
        <mesh position={[0, 0, 0.12]}>
          <planeGeometry args={[1.22, 1.22]} />
          <meshBasicMaterial map={map} transparent toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.12]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.22, 1.22]} />
          <meshBasicMaterial map={map} transparent toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

function StaticMark() {
  return (
    <div className="grid h-full place-items-center">
      <Image src="/logo-mark.png" alt="" width={220} height={220} className="h-auto w-[42%] max-w-[180px] drop-shadow-[0_18px_30px_rgba(20,32,64,0.28)]" />
    </div>
  );
}

/** A draggable, tap-to-pulse Talkel mark. Falls back to a still image when motion is reduced. */
export function LogoStage() {
  const wrap = useRef<HTMLDivElement>(null);
  const spin = useRef<Spin>({ userX: 0, userY: 0, idle: 0, dragging: false, impulse: 0 });
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [onScreen, setOnScreen] = useState(true);
  const light = useSyncExternalStore(subscribeTheme, isLightTheme, () => false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(motion.matches);
    apply();
    motion.addEventListener('change', apply);
    return () => motion.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const node = wrap.current;
    if (!node || reduced !== false) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false), { threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced]);

  useEffect(() => {
    const node = wrap.current;
    if (!node || reduced !== false) return;
    const hammer = new Hammer(node, { touchAction: 'pan-y' });
    hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL, threshold: 4 });
    const motion = spin.current;

    const onStart = () => {
      motion.dragging = true;
      gsap.killTweensOf(motion);
    };
    const onPan = (event: HammerInput) => {
      motion.userY = event.deltaX * 0.012;
      motion.userX = Math.max(-0.65, Math.min(0.65, event.deltaY * 0.005));
    };
    const onEnd = () => {
      motion.dragging = false;
      gsap.to(motion, { userX: 0, userY: 0, duration: 1.4, ease: 'elastic.out(1, 0.55)' });
    };
    const onTap = () => {
      motion.impulse += 1;
    };

    hammer.on('panstart', onStart);
    hammer.on('pan', onPan);
    hammer.on('panend', onEnd);
    hammer.on('pancancel', onEnd);
    hammer.on('tap', onTap);

    return () => {
      gsap.killTweensOf(motion);
      hammer.destroy();
    };
  }, [reduced]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const motion = spin.current;
    if (event.key === 'ArrowRight') motion.userY += 0.35;
    if (event.key === 'ArrowLeft') motion.userY -= 0.35;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      motion.impulse += 1;
    }
    gsap.killTweensOf(motion);
    gsap.to(motion, { userX: 0, userY: 0, duration: 1.2, ease: 'elastic.out(1, 0.6)', delay: 0.05 });
  }

  return (
    <div
      ref={wrap}
      tabIndex={reduced === false ? 0 : undefined}
      role="img"
      aria-label={reduced === false ? 'Talkel logo. Drag to turn it.' : 'Talkel logo'}
      onKeyDown={reduced === false ? onKeyDown : undefined}
      className="relative h-full w-full touch-pan-y outline-none select-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ cursor: reduced === false ? 'grab' : undefined }}
    >
      {reduced === false ? (
        <Canvas
          flat
          frameloop={onScreen ? 'always' : 'never'}
          dpr={[1, 1.6]}
          camera={{ position: [0, 0, 5.4], fov: 28 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        >
          <Suspense fallback={null}>
            <Scene spin={spin} light={light} />
          </Suspense>
        </Canvas>
      ) : (
        <StaticMark />
      )}
    </div>
  );
}
