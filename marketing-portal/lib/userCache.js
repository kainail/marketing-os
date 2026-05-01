'use strict';

const { r2GetShared, r2PutShared } = require('./r2');

const USERS_PATH = 'users/users.json';
const TTL = 60 * 1000;

const cache = {
  users: null,
  loadedAt: null,
};

function isStale() {
  if (!cache.users || !cache.loadedAt) return true;
  return Date.now() - cache.loadedAt > TTL;
}

async function getUsers() {
  if (!isStale()) return cache.users;
  try {
    const data = await r2GetShared(USERS_PATH);
    cache.users = Array.isArray(data) ? data : [];
    cache.loadedAt = Date.now();
    return cache.users;
  } catch (err) {
    console.error('[UserCache] R2 read failed:', err.message);
    if (cache.users) {
      console.warn('[UserCache] R2 down — serving stale cache');
      return cache.users;
    }
    throw new Error('User database unavailable');
  }
}

async function saveUsers(users) {
  await r2PutShared(USERS_PATH, users);
  invalidate();
}

function invalidate() {
  cache.users = null;
  cache.loadedAt = null;
}

module.exports = { getUsers, saveUsers, invalidate };
