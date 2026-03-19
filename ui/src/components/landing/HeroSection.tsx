"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Zap, ArrowRight, TrendingUp } from "lucide-react";

const ThreePawnIcon = dynamic(() => import("@/components/ThreePawnIcon"), {
    ssr: false,
    loading: () => <div className="h-24 w-24" />
});

// --- Perspective Grid Background ---
function ClassicGrid() {
    const meshRef = useRef<THREE.Mesh>(null);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uColor: { value: isDark ? new THREE.Color(0.12, 0.12, 0.12) : new THREE.Color(0.85, 0.85, 0.85) }
    }), [isDark]);

    useFrame((state) => {
        if (meshRef.current) {
            const mat = meshRef.current.material as THREE.ShaderMaterial;
            mat.uniforms.uTime.value = state.clock.getElapsedTime();
            // Smoothly lerp color when theme changes
            mat.uniforms.uColor.value.lerp(
                isDark ? new THREE.Color(0.12, 0.12, 0.12) : new THREE.Color(0.85, 0.85, 0.85),
                0.1
            );
        }
    });

    return (
        <mesh ref={meshRef} position={[0, 1.5, -5]} rotation={[-Math.PI / 2.2, 0, 0]}>
            <planeGeometry args={[100, 100, 1, 1]} />
            <shaderMaterial
                transparent
                uniforms={uniforms}
                vertexShader={`
                    varying vec3 vPos;
                    void main() {
                        vPos = position;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `}
                fragmentShader={`
                    uniform float uTime;
                    uniform vec3 uColor;
                    varying vec3 vPos;
                    void main() {
                        // Increase grid line width slightly for better visibility
                        vec2 grid = abs(fract(vPos.xy * 0.5 - 0.5) - 0.5) / (fwidth(vPos.xy * 0.5) * 1.2);
                        float line = min(grid.x, grid.y);
                        float gridMask = 1.0 - smoothstep(0.0, 1.0, line);
                        vec3 color = uColor * gridMask;
                        float fade = smoothstep(30.0, 0.0, length(vPos.xy));
                        gl_FragColor = vec4(color, gridMask * fade);
                    }
                `}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}

import { MovingBorder } from "@/components/ui/moving-border";

// --- Interactive Button Component ---
function InteractiveButton({ children, primary = false, href }: { children: React.ReactNode; primary?: boolean; href: string }) {
    const baseClasses = "group relative flex items-center justify-center font-bold uppercase tracking-widest text-[13px] rounded-[1.5rem] transition-all duration-300";

    const themeClasses = primary
        ? "bg-foreground text-background"
        : "bg-neutral-800/40 border border-white/10 text-white hover:bg-neutral-800/60";

    return (
        <Link href={href} className={`${baseClasses} p-[1px] overflow-hidden`}>
            {/* Moving border highlight - visible on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <MovingBorder duration={3000} rx="1.5rem" ry="1.5rem">
                    <div className={cn(
                        "h-24 w-24 opacity-60 blur-xl",
                        primary ? "bg-[radial-gradient(circle,white_0%,transparent_70%)] dark:bg-[radial-gradient(circle,black_0%,transparent_70%)]" : "bg-[radial-gradient(circle,white_0%,transparent_70%)]"
                    )} />
                </MovingBorder>
            </div>

            <motion.div
                className={cn(
                    "relative z-10 flex items-center justify-center gap-3 px-12 py-5 w-full h-full rounded-[calc(1.5rem-1px)]",
                    themeClasses
                )}
                initial={false}
            >
                <span className="transition-transform duration-300 group-hover:-translate-x-1">
                    {children}
                </span>
                <motion.div
                    className="opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                >
                    <ArrowRight size={18} />
                </motion.div>
            </motion.div>
        </Link>
    );
}

export function HeroSection() {
    return (
        <section className="relative min-h-screen flex flex-col items-center justify-center px-8 text-center overflow-hidden">
            {/* 3D Grid Background */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <Canvas camera={{ position: [0, 5, 10], fov: 60 }}>
                    <ClassicGrid />
                </Canvas>
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-background via-transparent to-background" />
            </div>

            {/* Content */}
            <div className="relative z-10">
                {/* 3D Icon */}
                <div className="flex justify-center mb-6">
                    <div className="h-24 w-24 transform hover:scale-110 transition-transform duration-300">
                        <ThreePawnIcon />
                    </div>
                </div>

                {/* Animated Badge */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-3 px-6 py-2 border border-border rounded-full backdrop-blur-md mb-12 shadow-2xl bg-background/50"
                >
                    <Zap size={14} className="fill-current" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                        AI-Powered Analysis
                    </span>
                </motion.div>

                {/* Headlines */}
                <h2 className="text-5xl md:text-[7rem] lg:text-[8rem] font-bold leading-[1.0] tracking-tighter mb-16 transition-colors duration-500">
                    <span className="block mb-4">Master Chess with</span>
                    <span className="block font-display italic text-muted-foreground/80">
                        Vector Analysis
                    </span>
                </h2>

                {/* Subtitle */}
                <p className="max-w-2xl mx-auto text-base md:text-xl font-light mb-16 leading-relaxed tracking-tight text-muted-foreground">
                    Harness elite ML models and elevate your ELO with personalized, deep-learning driven insights.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                    <InteractiveButton primary href="/analyze">
                        START ANALYSIS
                    </InteractiveButton>
                    <InteractiveButton href="#pricing">VIEW PRICING</InteractiveButton>
                </div>
            </div>
        </section>
    );
}