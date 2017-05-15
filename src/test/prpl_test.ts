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

import * as capabilities from '../capabilities';
import * as prpl from '../prpl';

const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36';

suite('prpl server', function() {
  let server: http.Server;
  let host: string;
  let port: number;

  suiteSetup((done) => {
    const config = {
      builds: [
        {
          name: 'fallback',
        },
        {
          name: 'es2015',
          browserCapabilities: ['es2015' as capabilities.BrowserCapability],
        },
      ],
    };
    server = http.createServer(prpl.makeHandler('src/test/static', config));
    server.listen(/* random */ 0, () => {
      host = server.address().address;
      port = server.address().port;
      done();
    });
  });

  suiteTeardown((done) => {
    server.close(done);
  });

  const get =
      (path: string, ua?: string): Promise<{code: number, data: string}> => {
        return new Promise((resolve) => {
          http.get(
              {host, port, path, headers: {'user-agent': ua || ''}},
              (response) => {
                const code = response.statusCode;
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => resolve({code, data}));
              });
        });
      };

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
  });
});
