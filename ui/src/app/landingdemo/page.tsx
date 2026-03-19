"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useSpring, useInView } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { Float, Environment, MeshTransmissionMaterial } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Brain,
  BookOpen,
  Puzzle,
  TrendingUp,
  Play,
  ChevronRight,
  Zap,
  type LucideIcon
} from "lucide-react";

// ============================================================================
// 3D CHESS PIECES COMPONENTS
// ============================================================================

function ChessPiece({
  position,
  rotation,
  scale,
  color,
  floatSpeed = 1,
  floatIntensity = 1
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  color: string;
  floatSpeed?: number;
  floatIntensity?: number;
}) {
  return (
    <Float
      speed={floatSpeed}
      rotationIntensity={0.4}
      floatIntensity={floatIntensity}
    >
      <group position={position} rotation={rotation} scale={scale}>
        {/* Pawn-like shape */}
        <mesh castShadow>
          {/* Base */}
          <cylinderGeometry args={[0.4, 0.5, 0.15, 32]} />
          <meshStandardMaterial
            color={color}
            metalness={0.8}
            roughness={0.2}
            envMapIntensity={1.5}
          />
        </mesh>
        <mesh position={[0, 0.25, 0]} castShadow>
          {/* Body */}
          <cylinderGeometry args={[0.25, 0.35, 0.4, 32]} />
          <meshStandardMaterial
            color={color}
            metalness={0.8}
            roughness={0.2}
            envMapIntensity={1.5}
          />
        </mesh>
        <mesh position={[0, 0.55, 0]} castShadow>
          {/* Neck */}
          <cylinderGeometry args={[0.15, 0.25, 0.2, 32]} />
          <meshStandardMaterial
            color={color}
            metalness={0.8}
            roughness={0.2}
            envMapIntensity={1.5}
          />
        </mesh>
        <mesh position={[0, 0.8, 0]} castShadow>
          {/* Head */}
          <sphereGeometry args={[0.2, 32, 32]} />
          <meshStandardMaterial
            color={color}
            metalness={0.8}
            roughness={0.2}
            envMapIntensity={1.5}
          />
        </mesh>
      </group>
    </Float>
  );
}

function KingPiece({
  position,
  color
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <Float speed={0.8} rotationIntensity={0.3} floatIntensity={1.2}>
      <group position={position} scale={1.5}>
        {/* Base */}
        <mesh castShadow>
          <cylinderGeometry args={[0.5, 0.6, 0.2, 32]} />
          <meshStandardMaterial
            color={color}
            metalness={0.9}
            roughness={0.1}
            envMapIntensity={2}
          />
        </mesh>
        {/* Body */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.45, 0.7, 32]} />
          <meshStandardMaterial
            color={color}
            metalness={0.9}
            roughness={0.1}
          />
        </mesh>
        {/* Crown base */}
        <mesh position={[0, 0.95, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.3, 0.2, 32]} />
          <meshStandardMaterial
            color={color}
            metalness={0.9}
            roughness={0.1}
          />
        </mesh>
        {/* Cross vertical */}
        <mesh position={[0, 1.25, 0]} castShadow>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
          <meshStandardMaterial
            color="#d4a574"
            metalness={1}
            roughness={0}
            emissive="#d4a574"
            emissiveIntensity={0.3}
          />
        </mesh>
        {/* Cross horizontal */}
        <mesh position={[0, 1.35, 0]} castShadow>
          <boxGeometry args={[0.25, 0.08, 0.08]} />
          <meshStandardMaterial
            color="#d4a574"
            metalness={1}
            roughness={0}
            emissive="#d4a574"
            emissiveIntensity={0.3}
          />
        </mesh>
      </group>
    </Float>
  );
}

function GlassOrb({ position }: { position: [number, number, number] }) {
  return (
    <Float speed={1.5} floatIntensity={2}>
      <mesh position={position}>
        <sphereGeometry args={[0.3, 64, 64]} />
        <MeshTransmissionMaterial
          backside
          samples={16}
          resolution={512}
          transmission={0.95}
          roughness={0.1}
          thickness={0.5}
          ior={1.5}
          chromaticAberration={0.06}
          anisotropy={0.1}
          distortion={0.2}
          distortionScale={0.3}
          temporalDistortion={0.5}
          color="#d4a574"
        />
      </mesh>
    </Float>
  );
}

function ChessScene() {
  return (
    <>
      <ambientLight intensity={0.2} />
      <spotLight
        position={[10, 10, 10]}
        angle={0.3}
        penumbra={1}
        intensity={2}
        castShadow
        color="#fff8e7"
      />
      <spotLight
        position={[-10, 5, -10]}
        angle={0.5}
        penumbra={1}
        intensity={1}
        color="#d4a574"
      />
      <pointLight position={[0, 5, 0]} intensity={0.5} color="#ffffff" />

      {/* Chess pieces */}
      <KingPiece position={[0, 0.5, 0]} color="#1a1a1a" />

      <ChessPiece position={[-2.5, 0, -1]} color="#e8e8e8" floatSpeed={1.2} />
      <ChessPiece position={[2.5, 0.5, -0.5]} color="#1a1a1a" floatSpeed={0.9} />
      <ChessPiece position={[-1.5, -0.5, 1.5]} color="#e8e8e8" floatSpeed={1.1} scale={0.8} />
      <ChessPiece position={[1.8, -0.3, 1]} color="#1a1a1a" floatSpeed={1.3} scale={0.9} />

      <GlassOrb position={[-3, 1, 0.5]} />
      <GlassOrb position={[3, 0, -1]} />

      <Environment preset="night" />
    </>
  );
}

// ============================================================================
// MAIN LANDING PAGE
// ============================================================================

export default function LandingDemoPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 0.2], [0, -50]);

  const smoothMouseX = useSpring(mousePosition.x, { stiffness: 50, damping: 20 });
  const smoothMouseY = useSpring(mousePosition.y, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      setMousePosition({
        x: (clientX / innerWidth - 0.5) * 2,
        y: (clientY / innerHeight - 0.5) * 2
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const features = [
    {
      icon: Brain,
      title: "AI-Powered Analysis",
      description: "Get deep insights into every move with our advanced neural network trained on millions of grandmaster games."
    },
    {
      icon: BookOpen,
      title: "Opening Explorer",
      description: "Master any opening with our comprehensive database featuring win rates, popular lines, and expert annotations."
    },
    {
      icon: Puzzle,
      title: "Tactical Training",
      description: "Sharpen your tactics with personalized puzzles that adapt to your skill level and identify your weaknesses."
    },
    {
      icon: TrendingUp,
      title: "Progress Tracking",
      description: "Monitor your improvement with detailed statistics, performance graphs, and milestone achievements."
    },
    {
      icon: Play,
      title: "Game Review",
      description: "Upload your games and receive move-by-move analysis with suggestions for improvement and key moments."
    },
    {
      icon: Zap,
      title: "Instant Insights",
      description: "Real-time evaluation powered by Stockfish 16, delivering professional-grade analysis in milliseconds."
    }
  ];

  return (
    <div ref={containerRef} className="relative min-h-screen bg-[#0a0a0a] overflow-hidden">
      <h1 className="sr-only">ChessVector Landing Demo</h1>
      {/* Custom cursor glow */}
      <motion.div
        className="fixed w-[600px] h-[600px] rounded-full pointer-events-none z-0"
        style={{
          background: "radial-gradient(circle, rgba(212,165,116,0.08) 0%, transparent 70%)",
          x: useTransform(smoothMouseX, [-1, 1], [-300, typeof window !== 'undefined' ? window.innerWidth - 300 : 1000]),
          y: useTransform(smoothMouseY, [-1, 1], [-300, typeof window !== 'undefined' ? window.innerHeight - 300 : 1000]),
        }}
      />

      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ========== HERO SECTION ========== */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
        className="relative min-h-screen flex flex-col items-center justify-center px-4"
      >
        {/* Background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

        {/* 3D Canvas */}
        <div className="absolute inset-0 z-0">
          <Canvas
            camera={{ position: [0, 0, 8], fov: 45 }}
            gl={{ antialias: true, alpha: true }}
            dpr={[1, 2]}
          >
            <Suspense fallback={null}>
              <ChessScene />
            </Suspense>
          </Canvas>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 text-center max-w-5xl mx-auto">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-8"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI-Powered Chess Mastery</span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6"
          >
            <span className="block text-white">Elevate Your</span>
            <span className="block bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">
              Chess Vision
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Harness the power of advanced AI to analyze your games,
            discover new openings, and accelerate your chess journey.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link href="/analyze">
              <Button
                size="lg"
                className="group relative bg-amber-500 hover:bg-amber-400 text-black font-semibold text-base px-8 h-12 rounded-xl shadow-[0_0_30px_rgba(212,165,116,0.3)] hover:shadow-[0_0_40px_rgba(212,165,116,0.5)] transition-all duration-300"
              >
                Start Analyzing
                <ChevronRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="text-base px-8 h-12 rounded-xl border-zinc-700 hover:border-amber-500/50 hover:bg-amber-500/5 text-white transition-all duration-300"
              >
                Sign In
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-6 h-10 rounded-full border-2 border-zinc-700 flex justify-center pt-2"
          >
            <motion.div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          </motion.div>
        </motion.div>
      </motion.section>

      {/* ========== FEATURES SECTION ========== */}
      <section className="relative py-32 px-4">
        {/* Section background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/[0.02] to-transparent" />

        <div className="relative max-w-6xl mx-auto">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
              Everything You Need to
              <span className="block bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                Master the Game
              </span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Professional-grade tools designed to accelerate your chess improvement
            </p>
          </motion.div>

          {/* Features grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={index * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section className="relative py-32 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto text-center"
        >
          {/* Decorative orb */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl" />

          <div className="relative">
            <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-6">
              Ready to Transform
              <span className="block">Your Chess?</span>
            </h2>
            <p className="text-zinc-400 text-lg mb-10 max-w-xl mx-auto">
              Join thousands of players who are already using ChessVector to reach new heights in their chess journey.
            </p>
            <Link href="/analyze">
              <Button
                size="lg"
                className="group bg-white hover:bg-zinc-100 text-black font-semibold text-base px-10 h-14 rounded-xl shadow-[0_0_50px_rgba(255,255,255,0.1)] hover:shadow-[0_0_60px_rgba(255,255,255,0.2)] transition-all duration-300"
              >
                Get Started Free
                <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

// ============================================================================
// ANIMATED FEATURE CARD
// ============================================================================

function FeatureCard({
  icon: Icon,
  title,
  description,
  delay = 0
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="group relative"
    >
      {/* Glow effect on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 via-amber-300/10 to-amber-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Card */}
      <div className="relative p-8 rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/5 hover:border-amber-500/20 transition-all duration-500">
        {/* Icon container */}
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
          <Icon className="w-7 h-7 text-amber-400" />
        </div>

        <h3 className="text-xl font-semibold text-white mb-3 tracking-tight">
          {title}
        </h3>
        <p className="text-zinc-400 leading-relaxed">
          {description}
        </p>

        {/* Subtle corner accent */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/5 to-transparent rounded-tr-2xl" />
      </div>
    </motion.div>
  );
}
