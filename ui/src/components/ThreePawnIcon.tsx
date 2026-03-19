"use client"

import React, { useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { useTheme } from "next-themes"

interface CheckerboardCubeProps {
    isHovered: boolean
}

function CheckerboardCube({ isHovered }: CheckerboardCubeProps) {
    const groupRef = useRef<THREE.Group>(null)
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === "dark"

    // Track rotation state for smooth animation
    const stateRef = useRef({
        time: 0,
        intensity: 0,
    })

    // Pre-allocate Euler and Quaternion to avoid GC pressure
    const tempEuler = useRef(new THREE.Euler()).current
    const tempQuaternion = useRef(new THREE.Quaternion()).current

    useFrame((_, delta) => {
        if (!groupRef.current) return

        const s = stateRef.current

        // Intensity transition (how much of the "8" pattern to apply)
        const targetIntensity = isHovered ? 1 : 0
        s.intensity += (targetIntensity - s.intensity) * 0.05

        // Phase progress
        s.time += delta * 1.2

        // "4 figure 8 loops" feel: A 3:4 Lissajous pattern
        // This creates a complex, braided path that feels more organic and continuous
        const x = Math.sin(s.time * 2.1) * 0.5 * s.intensity
        const y = Math.sin(s.time * 2.8) * 0.5 * s.intensity
        const z = Math.sin(s.time * 0.7) * 0.2 * s.intensity

        // Set the target orientation
        tempEuler.set(x, y, z)
        tempQuaternion.setFromEuler(tempEuler)

        // Slerp (Spherical Linear Interpolation) to target
        // This ensures the logo returns to (0,0,0) via the shortest possible path
        // without doing a "360 unwinding" spin.
        groupRef.current.quaternion.slerp(tempQuaternion, 0.1)
    })

    // Colors based on theme
    const whiteColor = isDark ? "#ffffff" : "#ffffff"
    const blackColor = isDark ? "#111111" : "#111111"

    const size = 0.98
    const positions: [number, number, number, boolean][] = []

    for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
            for (let z = 0; z < 2; z++) {
                const isWhite = (x + y + z) % 2 === 0
                positions.push([x - 0.5, y - 0.5, z - 0.5, isWhite])
            }
        }
    }

    return (
        <group ref={groupRef}>
            {positions.map(([x, y, z, isWhite], i) => (
                <mesh key={i} position={[x, y, z]}>
                    <boxGeometry args={[size, size, size]} />
                    <meshPhongMaterial
                        color={isWhite ? whiteColor : blackColor}
                        shininess={40}
                    />
                </mesh>
            ))}
        </group>
    )
}

export default function ThreePawnIcon() {
    const [isHovered, setIsHovered] = useState(false)
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === "dark"

    return (
        <div
            className="h-full w-full relative cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Canvas
                camera={{ position: [0, 0, 6], fov: 45 }}
                gl={{ alpha: true, antialias: true }}
                style={{ pointerEvents: "none", background: "transparent" }}
            >
                {/* Lighting */}
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 10, 7.5]} intensity={0.8} />

                <CheckerboardCube isHovered={isHovered} />
            </Canvas>
        </div>
    )
}
