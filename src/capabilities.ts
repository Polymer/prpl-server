/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import {UAParser} from 'ua-parser-js';

/**
 * A browser feature.
 */
export type Capability =
    // ECMAScript 2015 (aka ES6).
    'es2015' |
    // HTTP/2 Server Push.
    'push';

/**
 * Return a capability map for the given user agent string.
 */
export function capabilities(userAgent: string):
    {[key in Capability]: boolean} {
  const ua = new UAParser(userAgent);
  const supports = browserCapabilities[ua.getBrowser().name];
  return {
    es2015: !!supports && supports.es2015(ua),
    push: !!supports && supports.push(ua),
  };
};

/**
 * Parse a "x.y.z" version string of any length into integer parts. Returns -1
 * for a part that doesn't parse.
 */
export function parseVersion(version: string): number[] {
  return version.split('.').map((part) => {
    const i = parseInt(part, 10);
    return isNaN(i) ? -1 : i;
  });
}

/**
 * Return whether `version` is at least as high as `requirement`.
 */
export function satisfies(requirement: number[], version: number[]): boolean {
  for (let i = 0; i < requirement.length; i++) {
    const r = requirement[i];
    const v = version.length > i ? version[i] : 0;
    if (v > r) {
      return true;
    }
    if (v < r) {
      return false;
    }
  }
  return true;
}

type CapabilityPredicate = (ua: UAParser) => boolean;

/**
 * Make a predicate that checks if the browser version is at least this high.
 */
function since(...requirement: number[]): CapabilityPredicate {
  return (ua) => satisfies(requirement, parseVersion(ua.getBrowser().version));
}

const browserCapabilities:
    {[browser: string]: {[key in Capability]: CapabilityPredicate}} = {
      'Chrome': {
        es2015: since(49),
        push: since(41),
      },
      'Chromium': {
        es2015: since(49),
        push: since(41),
      },
      'OPR': {
        es2015: since(36),
        push: since(28),
      },
      'Vivaldi': {
        es2015: since(1),
        push: () => false,  // TODO Test if Vivaldi supports push.
      },
      'Mobile Safari': {
        es2015: since(10),
        push: since(9, 2),
      },
      'Safari': {
        es2015: since(10),
        push: (ua) => {
          return satisfies([9], parseVersion(ua.getBrowser().version)) &&
              // HTTP/2 on desktop Safari requires macOS 10.11 according to
              // caniuse.com.
              satisfies([10, 11], parseVersion(ua.getOS().version));
        },
      },
      'Edge': {
        // Edge versions before 15.15063 may contain a JIT bug affecting ES6
        // constructors (https://github.com/Microsoft/ChakraCore/issues/1496).
        es2015: since(15, 15063),
        push: since(12),
      },
      'Firefox': {
        es2015: since(51),
        push: since(36),
      },
    };
