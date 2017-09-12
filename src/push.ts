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

import * as path from 'path';
import * as validUrl from 'valid-url';

/**
 * JSON format for a multi-file push manifest.
 */
export interface PushManifestData {
  [pattern: string]: {[resource: string]: {type: string; weight?: number;}}
}

/**
 * Maps from an HTTP request path to the set of additional resources that
 * should be pre-emptively pushed to the client via HTTP/2 server push.
 */
export class PushManifest {
  private mapping = new Array<[RegExp, Map<string, {type: string}>]>();

  /**
   * Create a new `PushManifest` from a JSON object which is expected to match
   * the multi-file variant of the format described at
   * https://github.com/GoogleChrome/http2-push-manifest.
   *
   * The keys of this object are exact-match regular expression patterns that
   * will be tested against the request URL path.
   *
   * If `basePath` is set, relative paths in the push manifest (both patterns
   * and resources) will be interpreted as relative to this directory.
   * Typically it should be set to the path from the server file root to the
   * push manifest file.
   *
   * Throws an exception if the given object does not match the manifest
   * format, if a resource is not a valid URI path, or if `type` is not one of
   * the valid request destinations
   * (https://fetch.spec.whatwg.org/#concept-request-destination).
   *
   * Note that this class does not validate that resources exist on disk, since
   * we can't assume if or how the server maps resources to disk.
   */
  constructor(manifest: PushManifestData, basePath: string = '/') {
    for (const pattern of Object.keys(manifest)) {
      const resources = new Map();
      for (const resource of Object.keys(manifest[pattern])) {
        validatePath(resource);
        const t = manifest[pattern][resource].type || '';
        if (!requestDestinations.has(t)) {
          throw new Error(`invalid type: ${t}`);
        }
        resources.set(normalizePath(resource, basePath), {type: t});
      }
      if (resources.size) {
        let normalizedPattern;
        if (pattern.startsWith('^')) {
          normalizedPattern = pattern;
        } else {
          normalizedPattern = '^' + normalizePath(pattern, basePath);
          if (!normalizedPattern.endsWith('$')) {
            normalizedPattern += '$';
          }
        }
        this.mapping.push([new RegExp(normalizedPattern), resources]);
      }
    }
  }

  /**
   * Generate `Link: rel=preload` headers for each push resource associated
   * with `path`.
   *
   * A cooperating HTTP/2 server may intercept these headers and intiate a
   * server push for each resource.
   *
   * See https://w3c.github.io/preload/#server-push-http-2.
   */
  linkHeaders(path: string): string[] {
    const headers = [];
    const normalizedPattern = addLeadingSlash(path);
    for (const [pattern, resources] of this.mapping) {
      if (!resources || !pattern.test(normalizedPattern)) {
        continue;
      }
      for (const [resource, {type}] of resources.entries()) {
        let header = `<${resource}>; rel=preload`;
        if (type) {
          header += `; as=${type}`;
        }
        headers.push(header);
      }
    }
    return headers;
  }
}

function normalizePath(s: string, basePath: string) {
  return s.startsWith('/') ? s : path.posix.join(addLeadingSlash(basePath), s);
}

function addLeadingSlash(s: string) {
  return s.startsWith('/') ? s : '/' + s;
}

function validatePath(s: string) {
  if (!validUrl.isUri('http://example.com' + addLeadingSlash(s))) {
    throw new Error(`invalid resource: ${s}`);
  }
}

// From https://fetch.spec.whatwg.org/#concept-request-destination.
const requestDestinations = new Set([
  '',
  'audio',
  'document',
  'embed',
  'font',
  'image',
  'manifest',
  'object',
  'report',
  'script',
  'serviceworker',
  'sharedworker',
  'style',
  'track',
  'video',
  'worker',
  'xslt'
]);
