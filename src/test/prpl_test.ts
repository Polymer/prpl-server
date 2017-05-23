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

import {assert} from 'chai';
import * as http from 'http';
import * as path from 'path';

import * as capabilities from '../capabilities';
import * as prpl from '../prpl';

const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36';

suite('prpl server', function() {
  let server: http.Server;
  let host: string;
  let port: number;

  const startServer =
      (root: string, config?: prpl.ProjectConfig): Promise<void> => {
        server = http.createServer(prpl.makeHandler(root, config));
        return new Promise<void>((resolve) => {
          server.listen(/* random */ 0, '127.0.0.1', () => {
            host = server.address().address;
            port = server.address().port;
            resolve();
          });
        });
      };

  const get = (path: string, ua?: string): Promise<
      {code: number, data: string, headers: {[key: string]: string}}> => {
    return new Promise((resolve) => {
      http.get(
          {host, port, path, headers: {'user-agent': ua || ''}}, (response) => {
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

      test('sets push manifest link headers', async () => {
        const {headers} = await get('/foo/bar', chrome);
        assert.equal(
            headers['link'],
            ('</es2015/fragment.html>; rel=preload; as=document, ' +
             '</es2015/serviceworker.js>; rel=preload; as=script'));
      });

      test('sets service-worker-allowed header', async () => {
        const {headers} = await get('/es2015/service-worker.js', chrome);
        assert.equal(headers['service-worker-allowed'], '/');
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
});
