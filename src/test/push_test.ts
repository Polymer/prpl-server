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

  test('validates resources', () => {
    const valid = (t: string) => assert.doesNotThrow(
        () => new push.PushManifest({'/a.html': {[t]: {type: 'document'}}}));
    const invalid = (t: string) => assert.throws(
        () => new push.PushManifest({'/a.html': {[t]: {type: 'document'}}}));

    valid('b.html');
    valid('/b.html');
    invalid('<INVALID>');
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

  test('supports patterns', () => {
    const manifest = new push.PushManifest({
      '/foo.*': {
        '/dep.html': {type: 'document'},
      },
    });
    const expect = [
      '</dep.html>; rel=preload; as=document',
    ];
    assert.deepEqual(manifest.linkHeaders('/foo'), expect);
    assert.deepEqual(manifest.linkHeaders('/foo/'), expect);
    assert.deepEqual(manifest.linkHeaders('/foo/bar'), expect);
  });

  test('patterns are forced exact', () => {
    const manifest = new push.PushManifest({
      '/foo.html': {
        '/dep.html': {type: 'document'},
      },
    });
    assert.deepEqual(manifest.linkHeaders('/qux/foo.html'), []);
    assert.deepEqual(manifest.linkHeaders('/foo.html.x'), []);
  });

  test('explicit exact patterns work', () => {
    const manifest = new push.PushManifest(
        {
          '^/foo$': {
            '/dep.html': {type: 'document'},
          },
        },
        'subdir');
    const expect = [
      '</dep.html>; rel=preload; as=document',
    ];
    assert.deepEqual(manifest.linkHeaders('/foo'), expect);
    assert.deepEqual(manifest.linkHeaders('/foo/bar'), []);
    assert.deepEqual(manifest.linkHeaders('/qux/foo/bar'), []);
  });

  test('relative patterns work', () => {
    const manifest = new push.PushManifest(
        {
          'foo.*': {
            '/dep.html': {type: 'document'},
          },
        },
        'subdir');
    const expect = [
      '</dep.html>; rel=preload; as=document',
    ];
    assert.deepEqual(manifest.linkHeaders('/subdir/foo/bar'), expect);
  });
});
