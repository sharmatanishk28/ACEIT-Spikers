/**
 * Simple in-memory response cache for high-traffic read operations
 */
const cacheStore = new Map();

function apiCache(ttlSeconds = 15) {
  return (req, res, next) => {
    // Only cache GET requests without authorization headers
    if (req.method !== 'GET' || req.headers.authorization || req.cookies?.token || req.cookies?.auth_token) {
      return next();
    }

    const key = '__cache__' + (req.originalUrl || req.url);
    const cachedItem = cacheStore.get(key);

    if (cachedItem && Date.now() < cachedItem.expiry) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}, stale-while-revalidate=300`);
      return res.json(cachedItem.data);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheStore.set(key, {
          data: body,
          expiry: Date.now() + (ttlSeconds * 1000)
        });
        res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}, stale-while-revalidate=300`);
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

function clearApiCache(prefix = '') {
  if (!prefix) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.includes(prefix)) {
      cacheStore.delete(key);
    }
  }
}

module.exports = {
  apiCache,
  clearApiCache
};
