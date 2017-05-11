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
import * as prpl from '../prpl';

suite('prpl server', function() {
  let server: http.Server;
  let host: string;

  suiteSetup((done) => {
    server = http.createServer(prpl.handler('src/test/static'));
    server.listen(/* random */ 0, () => {
      host = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  suiteTeardown((done) => {
    server.close(done);
  });

  test('serves a static file', (done) => {
    http.get(host + '/index.html', (response) => {
      assert.equal(response.statusCode, 200);
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        assert.include(data, 'index stuff');
        done();
      });
    });
  });
});
