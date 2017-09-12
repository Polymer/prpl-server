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

import * as capabilities from 'browser-capabilities';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as send from 'send';
import * as url from 'url';

import * as push from './push';

export interface Config {
  // The Cache-Control header to send for all requests except the entrypoint.
  // Defaults to `max-age=60`.
  cacheControl?: string;

  // Below is the subset of the polymer.json specification that we care about
  // for serving. https://www.polymer-project.org/2.0/docs/tools/polymer-json
  // https://github.com/Polymer/polymer-project-config/blob/master/src/index.ts
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
export function makeHandler(root?: string, config?: Config): (
    request: http.IncomingMessage, response: http.ServerResponse) => void {
  const absRoot = path.resolve(root || '.');
  console.info(`Serving files from "${absRoot}".`);
  const builds = loadBuilds(absRoot, config);
  const cacheControl = (config && config.cacheControl) || 'max-age=60';

  return function prplHandler(request, response) {
    const urlPath = url.parse(request.url || '/').pathname || '/';

    // Let's be extra careful about directory traversal attacks, even though
    // the `send` library should already ensure we don't serve any file outside
    // our root. This should also prevent the `fs.existsSync` check we do next
    // from leaking any file existence information (whether you got the
    // entrypoint or a 403 from `send` might tell you if a file outside our
    // root exists). Add the trailing path separator because otherwise "/foo"
    // is a prefix of "/foo-secrets".
    const absFilepath = path.normalize(path.join(absRoot, urlPath));
    if (!absFilepath.startsWith(addTrailingPathSep(absRoot))) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    // Serve the entrypoint for the root path, and for all other paths that
    // don't have a corresponding static resource on disk. As a special
    // case, paths with file extensions are always excluded because they are
    // likely to be not-found static resources rather than application
    // routes.
    const serveEntrypoint = urlPath === '/' ||
        (!hasFileExtension.test(urlPath) && !fs.existsSync(absFilepath));

    // Find the highest ranked build suitable for this user agent.
    const clientCapabilities =
        capabilities.browserCapabilities(request.headers['user-agent']);
    const build = builds.find((b) => b.canServe(clientCapabilities));

    // We warned about this at startup. You should probably provide a fallback
    // build with no capabilities, at least to nicely inform the user. Note
    // that we only return this error for the entrypoint; we always serve fully
    // qualified static resources.
    if (!build && serveEntrypoint) {
      response.writeHead(500);
      response.end('This browser is not supported.');
      return;
    }

    const fileToSend = (build && serveEntrypoint) ? build.entrypoint : urlPath;

    // A service worker may only register with a scope above its own path if
    // permitted by this header.
    // https://www.w3.org/TR/service-workers-1/#service-worker-allowed
    if (isServiceWorker.test(fileToSend)) {
      response.setHeader('Service-Worker-Allowed', '/');
    }

    // Don't set the Cache-Control header if it's already set. This way another
    // middleware can control caching, and we won't touch it.
    if (!response.getHeader('Cache-Control')) {
      response.setHeader(
          'Cache-Control', serveEntrypoint ? 'max-age=0' : cacheControl);
    }

    if (build && build.pushManifest) {
      const linkHeaders = build.pushManifest.linkHeaders(urlPath);
      if (urlPath !== fileToSend) {
        // Also check the filename against the push manifest. In the case of
        // the entrypoint, these will be different (e.g. "/my/app/route" vs
        // "/es2015/index.html"), and we want to support configuring pushes in
        // terms of both.
        linkHeaders.push(...build.pushManifest.linkHeaders(fileToSend));
      }
      response.setHeader('Link', linkHeaders);
    }

    const sendOpts = {
      root: absRoot,
      // We handle the caching header ourselves.
      cacheControl: false,
    };
    send(request, fileToSend, sendOpts).pipe(response);
  };
}

function addTrailingPathSep(p: string): string {
  return p.endsWith(path.sep) ? p : p + path.sep;
}

class Build {
  public pushManifest?: push.PushManifest;

  constructor(
      private configOrder: number,
      public requirements: Set<capabilities.BrowserCapability>,
      public entrypoint: string,
      buildDir: string,
      serverRoot: string) {
    // TODO Push manifest location should be configurable.
    const pushManifestPath = path.join(buildDir, 'push-manifest.json');
    const relPath = path.relative(serverRoot, pushManifestPath);
    if (fs.existsSync(pushManifestPath)) {
      console.info(`Detected push manifest "${relPath}".`);
      // Note this constructor throws if invalid.
      this.pushManifest = new push.PushManifest(
          JSON.parse(fs.readFileSync(pushManifestPath, 'utf8')) as
              push.PushManifestData,
          path.relative(serverRoot, buildDir));
    }
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

function loadBuilds(root: string, config: Config|undefined): Build[] {
  const builds: Build[] = [];
  const entrypoint = (config ? config.entrypoint : null) || 'index.html';

  if (!config || !config.builds || !config.builds.length) {
    // No builds were specified. Try to serve an entrypoint from the root
    // directory, with no capability requirements.
    console.warn(`WARNING: No builds configured.`);
    builds.push(new Build(0, new Set(), entrypoint, root, root));

  } else {
    for (let i = 0; i < config.builds.length; i++) {
      const build = config.builds[i];
      if (!build.name) {
        console.warn(`WARNING: Build at offset ${i} has no name; skipping.`);
        continue;
      }
      builds.push(new Build(
          i,
          new Set(build.browserCapabilities),
          path.posix.join(build.name, entrypoint),
          path.join(root, build.name),
          root));
    }
  }

  // Sort builds by preference in case multiple builds could be served to
  // the same client.
  builds.sort((a, b) => a.compare(b));

  // Sanity check.
  for (const build of builds) {
    const requirements = Array.from(build.requirements.values());
    console.info(
        `Registered entrypoint "${build.entrypoint}" with capabilities ` +
        `[${requirements.join(',')}].`);
    // Note `build.entrypoint` is relative to the server root, but that's not
    // neccessarily our cwd.
    // TODO Refactor to make filepath vs URL path and relative vs absolute
    // values clearer.
    if (!fs.existsSync(path.join(root, build.entrypoint))) {
      console.warn(`WARNING: Entrypoint "${build.entrypoint}" does not exist.`);
    }
  }
  if (!builds.find((b) => b.requirements.size === 0)) {
    console.warn(
        'WARNING: All builds have a capability requirement. ' +
        'Some browsers will display an error. Consider a fallback build.');
  }

  return builds;
}
