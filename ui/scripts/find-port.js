#!/usr/bin/env node

/**
 * Dynamic Port Finder for Multi-Workspace Development
 * 
 * Scans a configurable range and finds the first available one.
 * Writes the selected port to .port file for use by other scripts.
 * 
 * Usage: node scripts/find-port.js
 * The port is written to .port in the project root.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT_START = parseInt(process.env.PORT_START || '3100', 10);
const PORT_END = parseInt(process.env.PORT_END || '3199', 10);
const PORT_FILE = path.join(__dirname, '..', '.port');

/**
 * Check if a port is available
 */
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      resolve({ available: false, error: err });
    });
    
    server.once('listening', () => {
      server.close();
      resolve({ available: true });
    });
    
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

/**
 * Main execution
 */
async function main() {
  try {
    const port = await findAvailablePort();
    
    // Write port to file
    fs.writeFileSync(PORT_FILE, port.toString(), 'utf8');
    
    // Also output to stdout for scripts that need it
    console.log(`Found available port: ${port}`);
    console.log(`Port written to: ${PORT_FILE}`);
    
    // Exit with the port number encoded (for shell scripts)
    process.exit(0);
  } catch (error) {
    console.error('Error finding available port:', error.message);
    process.exit(1);
  }
}

main();

