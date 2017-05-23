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
import * as push from '../push';

suite('PushManifest', function() {
  test('validates types', () => {
    assert.doesNotThrow(() => {
      new push.PushManifest({'/a.html': {'/b.html': {type: 'document'}}});
      new push.PushManifest({'/a.js': {'/b.js': {type: 'script'}}});
    });
    assert.throws(() => {
      new push.PushManifest({'/a.html': {'/b.html': {type: 'INVALID'}}});
    });
  });

  test('validates source resources', () => {
    const valid = (s: string) => assert.doesNotThrow(
        () => new push.PushManifest({[s]: {'/b.html': {type: 'document'}}}));
    const invalid = (s: string) => assert.throws(
        () => new push.PushManifest({[s]: {'/b.html': {type: 'document'}}}));

    valid('a.html');
    valid('/a.html');
    invalid('<INVALID>');
  });

  test('validates target resources', () => {
    const valid = (t: string) => assert.doesNotThrow(
        () => new push.PushManifest({'/a.html': {[t]: {type: 'document'}}}));
    const invalid = (t: string) => assert.throws(
        () => new push.PushManifest({'/a.html': {[t]: {type: 'document'}}}));

    valid('b.html');
    valid('/b.html');
    invalid('<INVALID>');
  });

  test('sets link headers with types', () => {
    const manifest = new push.PushManifest({
      '/a.html': {
        '/b.html': {type: 'document'},
        '/c.js': {type: 'script'},
        '/d.html': {type: ''},
      },
    });
    const expect = [
      '</b.html>; rel=preload; as=document',
      '</c.js>; rel=preload; as=script',
      '</d.html>; rel=preload',
    ];

    let calls = 0;
    manifest.setLinkHeaders('/a.html', {
      setHeader(name: string, value: string[]) {
        calls++;
        assert.equal(name, 'Link');
        assert.deepEqual(value, expect);
      },
    } as http.ServerResponse);
    assert.equal(calls, 1);
  });

  test('normalizes leading slashes', () => {
    const manifest = new push.PushManifest({
      'a.html': {
        'b.html': {type: 'document'},
      },
    });
    const expect = [
      '</b.html>; rel=preload; as=document',
    ];
    assert.deepEqual(manifest.linkHeaders('/a.html'), expect);
    assert.deepEqual(manifest.linkHeaders('a.html'), expect);
  });

  test('respects base path', () => {
    const manifest = new push.PushManifest(
        {
          '/abs.html': {
            'rel.html': {type: 'document'},
            '/abs.html': {type: 'document'},
          },
          'rel.html': {
            'rel.html': {type: 'document'},
            '/abs.html': {type: 'document'},
          },
        },
        'subdir');

    assert.deepEqual(manifest.linkHeaders('/subdir/abs.html'), []);
    assert.deepEqual(manifest.linkHeaders('/abs.html'), [
      '</subdir/rel.html>; rel=preload; as=document',
      '</abs.html>; rel=preload; as=document',
    ]);

    assert.deepEqual(manifest.linkHeaders('/rel.html'), []);
    assert.deepEqual(manifest.linkHeaders('/subdir/rel.html'), [
      '</subdir/rel.html>; rel=preload; as=document',
      '</abs.html>; rel=preload; as=document',
    ]);
  });
});
