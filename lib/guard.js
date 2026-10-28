'use strict';

const crypto = require('crypto');

function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const hash = (salt, value) => crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');

/**
 * Checks a code or PIN; after wrong tries it locks for a minute, doubling up to a day.
 * check() throws an error with status 403 (wrong) or 429 (locked).
 */
class PinGuard {

  constructor() {
    this.failures = 0;
    this.lockedUntil = 0;
  }

  check(expected, given) {
    const now = Date.now();
    if (now < this.lockedUntil) throw Object.assign(new Error('Too many wrong tries, wait a moment'), { status: 429 });
    if (expected && sameText(expected, given || '')) {
      this.failures = 0;
      return true;
    }
    this.failures += 1;
    if (this.failures >= 5) {
      const minutes = Math.min(2 ** (this.failures - 5), 24 * 60);
      this.lockedUntil = now + minutes * 60000;
    }
    throw Object.assign(new Error('Wrong code'), { status: 403 });
  }

}

module.exports = { PinGuard, sameText, hash };
