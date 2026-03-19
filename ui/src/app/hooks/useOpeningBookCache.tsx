import { useCallback, useRef } from 'react';

interface CachedBookData {
  moves: any[];
  timestamp: number;
  accessTime: number;
}

interface CacheConfig {
  memoryMaxSize: number;
  localStorageMaxSize: number;
  ttlHours: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  memoryMaxSize: 100,
  localStorageMaxSize: 500, 
  ttlHours: 24,
};

const CACHE_KEY_PREFIX = 'opening_book_cache_';

export function useOpeningBookCache(config: Partial<CacheConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // In-memory cache using ref to persist across renders
  const memoryCache = useRef<Map<string, CachedBookData>>(new Map());
  
  // Generate cache key from FEN and filters
  const generateCacheKey = useCallback((
    fen: string,
    ratings: string[],
    speeds: string[],
    variant: string = 'standard',
    type: string = 'lichess'
  ): string => {
    // Normalize arrays for consistent key generation
    const sortedRatings = [...ratings].sort().join(',');
    const sortedSpeeds = [...speeds].sort().join(',');
    
    return `${fen}|${variant}|${type}|${sortedRatings}|${sortedSpeeds}`;
  }, []);

  // Check if data is expired
  const isExpired = useCallback((timestamp: number): boolean => {
    const now = Date.now();
    const ttlMs = finalConfig.ttlHours * 60 * 60 * 1000;
    return (now - timestamp) > ttlMs;
  }, [finalConfig.ttlHours]);

  // LRU eviction for memory cache
  const evictLRUFromMemory = useCallback(() => {
    if (memoryCache.current.size <= finalConfig.memoryMaxSize) return;
    
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, data] of memoryCache.current) {
      if (data.accessTime < oldestTime) {
        oldestTime = data.accessTime;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      memoryCache.current.delete(oldestKey);
    }
  }, [finalConfig.memoryMaxSize]);

  // Clean expired entries from localStorage
  const cleanExpiredFromLocalStorage = useCallback(() => {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (isExpired(data.timestamp)) {
              keysToRemove.push(key);
            }
          } catch (e) {
            // Corrupted data, remove it
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.warn('Error cleaning localStorage cache:', e);
    }
  }, [isExpired]);

  // LRU eviction for localStorage
  const evictLRUFromLocalStorage = useCallback(() => {
    try {
      const cacheEntries: { key: string; data: CachedBookData }[] = [];
      
      // Collect all cache entries
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            cacheEntries.push({ key, data });
          } catch (e) {
            // Remove corrupted entries
            localStorage.removeItem(key);
          }
        }
      }
      
      // If over limit, remove oldest entries
      if (cacheEntries.length > finalConfig.localStorageMaxSize) {
        const sortedEntries = cacheEntries.sort((a, b) => a.data.accessTime - b.data.accessTime);
        const toRemove = sortedEntries.slice(0, cacheEntries.length - finalConfig.localStorageMaxSize);
        
        toRemove.forEach(entry => {
          localStorage.removeItem(entry.key);
        });
      }
    } catch (e) {
      console.warn('Error managing localStorage cache size:', e);
    }
  }, [finalConfig.localStorageMaxSize]);

  // Get from cache (memory first, then localStorage)
  const getFromCache = useCallback((cacheKey: string): any[] | null => {
    const now = Date.now();
    
    // Check memory cache first
    const memoryData = memoryCache.current.get(cacheKey);
    if (memoryData && !isExpired(memoryData.timestamp)) {
      // Update access time for LRU
      memoryData.accessTime = now;
      return memoryData.moves;
    }
    
    // Check localStorage
    try {
      const localStorageKey = CACHE_KEY_PREFIX + cacheKey;
      const storedData = localStorage.getItem(localStorageKey);
      
      if (storedData) {
        const parsedData: CachedBookData = JSON.parse(storedData);
        
        if (!isExpired(parsedData.timestamp)) {
          // Update access time and move to memory cache
          parsedData.accessTime = now;
          memoryCache.current.set(cacheKey, parsedData);
          localStorage.setItem(localStorageKey, JSON.stringify(parsedData));
          
          evictLRUFromMemory();
          return parsedData.moves;
        } else {
          // Remove expired entry
          localStorage.removeItem(localStorageKey);
        }
      }
    } catch (e) {
      console.warn('Error reading from localStorage cache:', e);
    }
    
    return null;
  }, [isExpired, evictLRUFromMemory]);

  // Save to cache (both memory and localStorage)
  const saveToCache = useCallback((cacheKey: string, moves: any[]) => {
    const now = Date.now();
    const cacheData: CachedBookData = {
      moves,
      timestamp: now,
      accessTime: now,
    };
    
    // Save to memory cache
    memoryCache.current.set(cacheKey, cacheData);
    evictLRUFromMemory();
    
    // Save to localStorage
    try {
      const localStorageKey = CACHE_KEY_PREFIX + cacheKey;
      localStorage.setItem(localStorageKey, JSON.stringify(cacheData));
      evictLRUFromLocalStorage();
    } catch (e) {
      console.warn('Error saving to localStorage cache:', e);
    }
  }, [evictLRUFromMemory, evictLRUFromLocalStorage]);

  // Clear all caches
  const clearCache = useCallback(() => {
    // Clear memory cache
    memoryCache.current.clear();
    
    // Clear localStorage cache
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.warn('Error clearing localStorage cache:', e);
    }
  }, []);

  // Get cache stats
  const getCacheStats = useCallback(() => {
    const memorySize = memoryCache.current.size;
    
    let localStorageSize = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
          localStorageSize++;
        }
      }
    } catch (e) {
      console.warn('Error getting localStorage stats:', e);
    }
    
    return {
      memorySize,
      localStorageSize,
      memoryMaxSize: finalConfig.memoryMaxSize,
      localStorageMaxSize: finalConfig.localStorageMaxSize,
      ttlHours: finalConfig.ttlHours,
    };
  }, [finalConfig]);

  // Initialize: clean expired entries on first use
  const initialize = useCallback(() => {
    cleanExpiredFromLocalStorage();
  }, [cleanExpiredFromLocalStorage]);

  return {
    generateCacheKey,
    getFromCache,
    saveToCache,
    clearCache,
    getCacheStats,
    initialize,
  };
}