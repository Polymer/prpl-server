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

import * as http from 'http';
import * as send from 'send';
import * as url from 'url';

export function handler(root?: string): (
    request: http.IncomingMessage, response: http.ServerResponse) => void {
  root = root || '.';
  return function(request, response) {
    const pathname = url.parse(request.url || '').pathname || '/';
    send(request, pathname, {root: root}).pipe(response);
  }
}
