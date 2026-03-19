#!/usr/bin/env node

/**
 * Development Server Launcher with Dynamic Port
 * 
 * Finds an available port and launches Next.js dev server on it.
 * Also sets up environment variables for the gateway URL.
 */

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT_START = parseInt(process.env.PORT_START || '3100', 10);
const PORT_END = parseInt(process.env.PORT_END || '3199', 10);
const DEV_HOST = process.env.NEXT_DEV_HOST || '0.0.0.0';
const PORT_FILE = path.join(__dirname, '..', '.port');
const DEFAULT_DIST_DIR = '.next-dev';

/**
 * Check if a port is available on both IPv4 and IPv6
 */
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (error) => resolve({ available: false, error }));
    server.once('listening', () => {
      server.close();
      resolve({ available: true });
    });

    // Bind loopback only to avoid clashes with external/network bindings.
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find the first available port in the range
 */
async function findAvailablePort() {
  let permissionError = null;

  for (let port = PORT_START; port <= PORT_END; port++) {
    const result = await checkPort(port);
    if (result.available) {
      return port;
    }
    if (result.error && result.error.code === 'EPERM') {
      permissionError = result.error;
      break;
    }
  }

  if (permissionError) {
    throw new Error(
      `Permission denied while checking local ports (${permissionError.code}). ` +
      `Verify your runtime allows binding to localhost.`
    );
  }

  throw new Error(`No available ports found in range ${PORT_START}-${PORT_END}`);
}

function readExistingPortFile() {
  try {
    if (!fs.existsSync(PORT_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(PORT_FILE, 'utf8').trim();
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function cleanupLegacyDistDirs() {
  const projectRoot = path.join(__dirname, '..');
  const legacyPrefix = '.next-dev-';
  let entries = [];

  try {
    entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(legacyPrefix)) continue;
    if (!/^\.(next-dev)-\d+$/.test(entry.name)) continue;

    try {
      fs.rmSync(path.join(projectRoot, entry.name), { recursive: true, force: true });
    } catch (_) {
      // Ignore cleanup errors.
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const existingPort = readExistingPortFile();
    if (existingPort) {
      const existingCheck = await checkPort(existingPort);
      if (!existingCheck.available) {
        console.log(`\n♻️  Next.js dev server already running on port ${existingPort}\n`);
        console.log(`   Local:   http://localhost:${existingPort}`);
        console.log(`   Port file: ${PORT_FILE}\n`);
        return;
      }
      // Stale port file from a previous run.
      try {
        fs.unlinkSync(PORT_FILE);
      } catch (_) {
        // Ignore cleanup errors.
      }
    }

    const port = await findAvailablePort();
    const distDir = process.env.NEXT_DIST_DIR || DEFAULT_DIST_DIR;
    cleanupLegacyDistDirs();

    // Write port to file for other tools (Playwright, etc.)
    fs.writeFileSync(PORT_FILE, port.toString(), 'utf8');

    console.log(`\n🚀 Starting Next.js dev server on port ${port}\n`);
    console.log(`   Local:   http://localhost:${port}`);
    console.log(`   Port file: ${PORT_FILE}\n`);

    // Turbopack can exceed file descriptor limits on some hosts; keep it opt-in.
    const useTurbopack = process.env.NEXT_USE_TURBOPACK === '1';
    const nextArgs = ['next', 'dev', '-H', DEV_HOST, '-p', port.toString()];
    if (useTurbopack) {
      nextArgs.splice(2, 0, '--turbopack');
    }

    // Launch Next.js dev server
    const nextDev = spawn('npx', nextArgs, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: port.toString(),
        NEXT_DIST_DIR: distDir,
        // Mitigate Watchpack EMFILE errors in large repos/remote filesystems.
        WATCHPACK_POLLING: process.env.WATCHPACK_POLLING || 'false',
        WATCHPACK_POLLING_INTERVAL: process.env.WATCHPACK_POLLING_INTERVAL || '1000',
        CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING || '0',
      },
    });

    nextDev.on('close', (code) => {
      // Clean up port file on exit
      try {
        fs.unlinkSync(PORT_FILE);
      } catch (e) {
        // Ignore if file doesn't exist
      }
      process.exit(code);
    });

    // Handle termination signals
    process.on('SIGINT', () => {
      nextDev.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
      nextDev.kill('SIGTERM');
    });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
