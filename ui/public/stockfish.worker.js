self.Module = {
  onRuntimeInitialized: function() {
    const stockfish = STOCKFISH();
    
    stockfish.onmessage = (e) => {
      postMessage(e.data);
    };

    onmessage = (e) => {
      stockfish.postMessage(e.data);
    };
    
    postMessage('ready');
    
    stockfish.postMessage('uci');
  },

  locateFile: function(path, prefix) {
    if (path.endsWith('.wasm')) {
      return '/stockfish.wasm';
    }
    return prefix + path;
  },
};

self.importScripts("/stockfish.js");