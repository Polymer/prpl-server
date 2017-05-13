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

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as send from 'send';
import * as url from 'url';

import * as capabilities from './capabilities';
import * as push from './push';

// The subset of the polymer.json specification that we care about for serving.
// https://www.polymer-project.org/2.0/docs/tools/polymer-json
// https://github.com/Polymer/polymer-project-config/blob/master/src/index.ts
export interface ProjectConfig {
  entrypoint?: string;
  builds?: {
    name?: string,
    browserCapabilities?: capabilities.BrowserCapability[],
  }[];
}

// Matches URLs like "/foo/bar.png" but not "/foo.png/bar".
const hasFileExtension = /\.[^/]*$/;

// TODO Service worker location should be configurable.
const isServiceWorker = /service-worker.js$/;

/**
 * Return a new HTTP handler to serve a PRPL-style application.
 */
export function makeHandler(rootDir?: string, config?: ProjectConfig): (
    request: http.IncomingMessage, response: http.ServerResponse) => void {
  const root = rootDir || '.';
  console.info(`Serving files from "${root}".`);
  const builds = loadBuilds(root, config);

  return function prplHandler(request, response) {
    // Serve the entrypoint for the root path, and for all other paths that
    // don't have a corresponding static resource on disk. As a special
    // case, paths with file extensions are always excluded because they are
    // likely to be not-found static resources rather than application
    // routes.
    const pathname = url.parse(request.url || '/').pathname || '/';
    const serveEntrypoint = pathname === '/' ||
        (!hasFileExtension.test(pathname) &&
         !fs.existsSync(path.join(root, pathname)));

    // Find the highest ranked build suitable for this user agent.
    const clientCapabilities =
        capabilities.browserCapabilities(request.headers['user-agent']);
    const build = builds.find((b) => b.canServe(clientCapabilities));

    // We warned about this at startup. You should probably provide a fallback
    // build with no capabilities, at least to nicely inform the user. Note
    // that we only return this error for the entrypoint; we always serve fully
    // qualified static resources.
    if (!build && serveEntrypoint) {
      response.writeHead(400);
      response.end('This browser is not supported.');
      return;
    }

    const fileToSend = (build && serveEntrypoint) ? build.entrypoint : pathname;

    // A service worker may only register with a scope above its own path if
    // permitted by this header.
    // https://www.w3.org/TR/service-workers-1/#service-worker-allowed
    if (isServiceWorker.test(fileToSend)) {
      response.setHeader('Service-Worker-Allowed', '/');
    }

    if (build && build.pushManifest) {
      build.pushManifest.setLinkHeaders(fileToSend, response);
    }

    send(request, fileToSend, {root}).pipe(response);
  };
}

class Build {
  constructor(
      private configOrder: number,
      public requirements: Set<capabilities.BrowserCapability>,
      public entrypoint: string,
      public pushManifest?: push.PushManifest) {
  }

  /**
   * Order builds with more capabililties first -- a heuristic that assumes
   * builds with more features are better. Ties are broken by the order the
   * build appeared in the original configuration file.
   */
  compare(that: Build): number {
    if (this.requirements.size !== that.requirements.size) {
      return that.requirements.size - this.requirements.size;
    }
    return this.configOrder - that.configOrder;
  }

  /**
   * Return whether all requirements of this build are met by the given client
   * browser capabilities.
   */
  canServe(client: Set<capabilities.BrowserCapability>): boolean {
    for (const r of this.requirements) {
      if (!client.has(r)) {
        return false;
      }
    }
    return true;
  }
}

function loadBuilds(root: string, config: ProjectConfig|undefined): Build[] {
  const builds: Build[] = [];
  const entrypoint = (config ? config.entrypoint : null) || 'index.html';

  if (!config || !config.builds || !config.builds.length) {
    // No builds were specified. Try to serve an entrypoint from the root
    // directory, with no capability requirements.
    console.warn(`WARNING: No builds configured.`);
    builds.push(new Build(0, new Set(), path.join(root, entrypoint)));

  } else {
    for (let i = 0; i < config.builds.length; i++) {
      const build = config.builds[i];
      if (!build.name) {
        console.warn(`WARNING: Build at offset ${i} has no name; skipping.`);
        continue;
      }

      // TODO Push manifest location should be configurable.
      const pushManifestPath =
          path.join(root, build.name, 'push-manifest.json');
      let pushManifest;
      if (fs.existsSync(pushManifestPath)) {
        console.info(`Detected push manifest "${pushManifestPath}".`);
        const pushManifestData =
            JSON.parse(fs.readFileSync(pushManifestPath, 'utf8')) as
            push.PushManifestData;
        // Note this constructor throws if invalid.
        pushManifest = new push.PushManifest(pushManifestData);
      }

      builds.push(new Build(
          i,
          new Set(build.browserCapabilities),
          path.join(root, build.name, entrypoint),
          pushManifest));
    }
  }

  // Sort builds by preference in case multiple builds could be served to
  // the same client.
  builds.sort((a, b) => a.compare(b));

  // Sanity check.
  let hasFallback = false;
  for (const build of builds) {
    hasFallback = hasFallback || build.requirements.size === 0;
    const requirements = Array.from(build.requirements.values());
    console.info(
        `Registered entrypoint "${build.entrypoint}" with capabilities ` +
        `[${requirements.join(',')}].`);
    if (!fs.existsSync(build.entrypoint)) {
      console.warn(`WARNING: Entrypoint "${build.entrypoint}" does not exist.`);
    }
  }
  if (!hasFallback) {
    console.warn(
        'WARNING: All builds have a capability requirement. ' +
        'Some browsers will display an error. Consider a fallback build.');
  }

  return builds;
}
