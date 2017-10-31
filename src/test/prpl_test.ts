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
import {assert} from 'chai';
import * as express from 'express';
import * as http from 'http';
import * as httpErrors from 'http-errors';
import * as path from 'path';

import * as prpl from '../prpl';

const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36';

suite('prpl server', function() {
  let server: http.Server;
  let host: string;
  let port: number;

  const startServer = (root: string, config?: prpl.Config): Promise<void> => {
    const handler = prpl.makeHandler(root, config);
    server = http.createServer(
        (request: http.IncomingMessage, response: http.ServerResponse) => {
          // To help test caching behavior, if the request URL includes this
          // magic string, we'll set the cache-control header to something
          // custom before calling prpl-handler. This is how we allow users to
          // take over control of the cache-control header.
          if (request.url && request.url.includes('custom-cache')) {
            response.setHeader('Cache-Control', 'custom-cache');
          }
          handler(request, response);
        });
    return new Promise<void>((resolve) => {
      server.listen(/* random */ 0, '127.0.0.1', () => {
        host = server.address().address;
        port = server.address().port;
        resolve();
      });
    });
  };

  const get =
      (path: string, ua?: string, headers?: {[key: string]: string}): Promise<{
        code: number | undefined,
        data: string,
        headers: {[key: string]: string}
      }> => {
        return new Promise((resolve) => {
          const getHeaders = Object.assign({'user-agent': ua || ''}, headers);
          http.get({host, port, path, headers: getHeaders}, (response) => {
            const code = response.statusCode;
            const headers = response.headers;
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => resolve({code, data, headers}));
          });
        });
      };

  suite('configured with multiple builds', () => {
    suiteSetup(async () => {
      await startServer(path.join('src', 'test', 'static'), {
        builds: [
          {
            name: 'fallback',
          },
          {
            name: 'es2015',
            browserCapabilities: ['es2015' as capabilities.BrowserCapability],
          },
        ],
      });
    });

    suiteTeardown((done) => {
      server.close(done);
    });

    suite('with low capability user agent', () => {
      test('serves entrypoint from root', async () => {
        const {code, data} = await get('/');
        assert.equal(code, 200);
        assert.include(data, 'fallback entrypoint');
      });

      test('serves entrypoint for application route', async () => {
        const {code, data} = await get('/foo/bar');
        assert.equal(code, 200);
        assert.include(data, 'fallback entrypoint');
      });

      test('serves a fragment resource', async () => {
        const {code, data} = await get('/fallback/fragment.html');
        assert.equal(code, 200);
        assert.include(data, 'fallback fragment');
      });

      test('serves a 404 for missing file with extension', async () => {
        const {code} = await get('/foo.png');
        assert.equal(code, 404);
      });

      test('forbids traversal outside root', async () => {
        const {code, data} = await get('/../secrets');
        assert.equal(code, 403);
        assert.equal(data, 'Forbidden');
      });

      test('forbids traversal outside root with matching prefix', async () => {
        // Edge case where the resolved request path naively matches the root
        // directory by prefix even though it's actually a sibling, not a child
        // ("/static-secrets" begins with "/static").
        const {code, data} = await get('/../static-secrets');
        assert.equal(code, 403);
        assert.equal(data, 'Forbidden');
      });
    });

    suite('with high capability user agent', () => {
      test('serves entrypoint from root', async () => {
        const {code, data} = await get('/', chrome);
        assert.equal(code, 200);
        assert.include(data, 'es2015 entrypoint');
      });

      test('serves entrypoint for application route', async () => {
        const {code, data} = await get('/foo/bar', chrome);
        assert.equal(code, 200);
        assert.include(data, 'es2015 entrypoint');
      });

      test('serves a fragment resource', async () => {
        const {code, data} = await get('/es2015/fragment.html', chrome);
        assert.equal(code, 200);
        assert.include(data, 'es2015 fragment');
      });

      test('serves a 404 for missing file with extension', async () => {
        const {code} = await get('/foo.png', chrome);
        assert.equal(code, 404);
      });

      test('sets push headers for fragment', async () => {
        const {headers} = await get('/es2015/fragment.html', chrome);
        assert.equal(
            headers['link'], '</es2015/baz.html>; rel=preload; as=document');
      });

      test('sets push headers for explicit entrypoint', async () => {
        const {headers} = await get('/es2015/index.html', chrome);
        assert.equal(
            headers['link'],
            ('</es2015/fragment.html>; rel=preload; as=document, ' +
             '</es2015/serviceworker.js>; rel=preload; as=script'));
      });

      test('sets push headers for application route', async () => {
        const {headers} = await get('/foo/bar', chrome);
        assert.equal(
            headers['link'],
            // Note these headers are both those defined for the entrypoint by
            // filename, and by application route.
            ('</es2015/foo.html>; rel=preload; as=document, ' +
             '</es2015/fragment.html>; rel=preload; as=document, ' +
             '</es2015/serviceworker.js>; rel=preload; as=script'));
      });

      test('sets service-worker-allowed header', async () => {
        const {headers} = await get('/es2015/service-worker.js', chrome);
        assert.equal(headers['service-worker-allowed'], '/');
      });

      test('automatically unregister missing service workers', async () => {
        const {code, data, headers} = await get('/service-worker.js', chrome);
        assert.equal(code, 200);
        assert.equal(headers['content-type'], 'application/javascript');
        assert.equal(headers['service-worker-allowed'], '/');
        assert.include(data, 'registration.unregister');
      });

      test('sets default cache header on static file', async () => {
        const {headers} = await get('/es2015/fragment.html', chrome);
        assert.equal(headers['cache-control'], 'max-age=60');
      });

      test('sets zero cache header on entrypoint', async () => {
        const {headers} = await get('/foo/bar', chrome);
        assert.equal(headers['cache-control'], 'max-age=0');
      });

      test('doesn\'t set cache header if already set', async () => {
        // See above explanation of `custom-cache` magic.
        const {headers} = await get('/foo/bar?custom-cache', chrome);
        assert.equal(headers['cache-control'], 'custom-cache');
      });

      test('sends etag response header', async () => {
        const {headers} = await get('/es2015/fragment.html', chrome);
        assert.isNotEmpty(headers['etag']);
      });

      test('respects etag request header', async () => {
        const {headers} = await get('/es2015/fragment.html', chrome);
        const {code, data} = await get('/es2015/fragment.html', chrome, {
          'If-None-Match': headers['etag'],
        });
        assert.equal(code, 304);
        assert.equal(data, '');
      });
    });
  });

  suite('configured with no fallback build', () => {
    suiteSetup(async () => {
      await startServer(path.join('src', 'test', 'static'), {
        builds: [
          {
            name: 'es2015',
            browserCapabilities: ['es2015' as capabilities.BrowserCapability],
          },
        ],
      });
    });

    suiteTeardown((done) => {
      server.close(done);
    });

    test('serves 500 error to unsupported browser', async () => {
      const {code, data} = await get('/');
      assert.equal(code, 500);
      assert.include(data, 'not supported');
    });
  });

  suite('configured with unregisterMissingServiceWorkers disabled', () => {
    suiteSetup(async () => {
      await startServer(path.join('src', 'test', 'static'), {
        builds: [
          {
            name: 'es2015',
            browserCapabilities: ['es2015' as capabilities.BrowserCapability],
          },
        ],
        unregisterMissingServiceWorkers: false,
      });
    });

    suiteTeardown((done) => {
      server.close(done);
    });

    test('sends 404 for missing service worker', async () => {
      const {code} = await get('/service-worker.js', chrome);
      assert.equal(code, 404);
    });
  });

  suite('standalone with no builds', () => {
    suiteSetup(async () => {
      await startServer(path.join('src', 'test', 'static', 'standalone'));
    });

    suiteTeardown((done) => {
      server.close(done);
    });

    test('serves index.html by default', async () => {
      const {code, data} = await get('/');
      assert.equal(code, 200);
      assert.include(data, 'standalone entrypoint');
    });

    test('services static files', async () => {
      const {code, data} = await get('/fragment.html');
      assert.equal(code, 200);
      assert.include(data, 'standalone fragment');
    });

    test('sets push manifest link headers', async () => {
      const {headers} = await get('/', chrome);
      assert.equal(
          headers['link'], '</fragment.html>; rel=preload; as=document');
    });
  });

  suite('configured with express error forwarding', () => {
    suiteSetup((done) => {
      const app = express();

      app.use(prpl.makeHandler(path.join('src', 'test', 'static'), {
        forwardErrors: true,
        builds: [
          {
            name: 'es2015',
            browserCapabilities: ['es2015' as capabilities.BrowserCapability],
          },
        ]
      }));

      app.use(
          (error: httpErrors.HttpError,
           _request: any,
           response: any,
           _next: express.NextFunction) => {
            response.statusCode = error.status;
            response.end(`custom ${error.status}: ${error.message}`);
          });

      server = app.listen(/* random */ 0, '127.0.0.1', () => {
        host = server.address().address;
        port = server.address().port;
        done();
      });
    });

    suiteTeardown((done) => {
      server.close(done);
    });

    test('forwards error for 404 not found', async () => {
      const {code, data} = await get('/fragment/error.html');
      assert.equal(code, 404);
      assert.equal(data, 'custom 404: Not Found');
    });

    test('forwards error for directory traversal 403', async () => {
      const {code, data} = await get('/../secrets');
      assert.equal(code, 403);
      assert.equal(data, 'custom 403: Forbidden');
    });

    test('forwards error for unsupported browser 500', async () => {
      const {code, data} = await get('/');
      assert.equal(code, 500);
      assert.equal(data, 'custom 500: This browser is not supported.');
    });
  });
});
