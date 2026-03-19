"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Confetti {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    rotation: THREE.Euler;
    rotationSpeed: THREE.Euler;
    color: THREE.Color;
    scale: number;
}

function ConfettiParticles({ count = 150 }: { count?: number }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const confettiRef = useRef<Confetti[]>([]);

    useEffect(() => {
        // Initialize confetti particles
        const confetti: Confetti[] = [];
        const colors = [
            new THREE.Color(0xff6b6b),
            new THREE.Color(0x4ecdc4),
            new THREE.Color(0xffe66d),
            new THREE.Color(0x95e1d3),
            new THREE.Color(0xf38181),
            new THREE.Color(0xaa96da),
        ];

        for (let i = 0; i < count; i++) {
            confetti.push({
                position: new THREE.Vector3(
                    (Math.random() - 0.5) * 4,
                    Math.random() * 3 + 2,
                    (Math.random() - 0.5) * 2
                ),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.02,
                    -Math.random() * 0.02 - 0.01,
                    (Math.random() - 0.5) * 0.02
                ),
                rotation: new THREE.Euler(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                ),
                rotationSpeed: new THREE.Euler(
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.1
                ),
                color: colors[Math.floor(Math.random() * colors.length)],
                scale: Math.random() * 0.05 + 0.05,
            });
        }

        confettiRef.current = confetti;

        // Set initial instance matrices
        if (meshRef.current) {
            const dummy = new THREE.Object3D();
            confetti.forEach((c, i) => {
                dummy.position.copy(c.position);
                dummy.rotation.copy(c.rotation);
                dummy.scale.setScalar(c.scale);
                dummy.updateMatrix();
                meshRef.current!.setMatrixAt(i, dummy.matrix);
                meshRef.current!.setColorAt(i, c.color);
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
            if (meshRef.current.instanceColor) {
                meshRef.current.instanceColor.needsUpdate = true;
            }
        }
    }, [count]);

    useFrame(() => {
        if (!meshRef.current) return;

        const dummy = new THREE.Object3D();
        confettiRef.current.forEach((c, i) => {
            // Update position
            c.position.add(c.velocity);
            c.rotation.x += c.rotationSpeed.x;
            c.rotation.y += c.rotationSpeed.y;
            c.rotation.z += c.rotationSpeed.z;

            // Apply gravity
            c.velocity.y -= 0.0005;

            // Reset if fallen too far
            if (c.position.y < -2) {
                c.position.y = 3;
                c.velocity.y = -Math.random() * 0.02 - 0.01;
            }

            dummy.position.copy(c.position);
            dummy.rotation.copy(c.rotation);
            dummy.scale.setScalar(c.scale);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <boxGeometry args={[0.1, 0.1, 0.02]} />
            <meshStandardMaterial />
        </instancedMesh>
    );
}

interface ConfettiAnimationProps {
    onComplete?: () => void;
}

export default function ConfettiAnimation({ onComplete }: ConfettiAnimationProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onComplete?.();
        }, 4000); // Animation duration

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="absolute inset-0 pointer-events-none z-40 animate-in fade-in duration-500">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px]">
                <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
                    <ambientLight intensity={0.8} />
                    <pointLight position={[10, 10, 10]} intensity={0.5} />
                    <ConfettiParticles count={150} />
                </Canvas>
            </div>
        </div>
    );
}
