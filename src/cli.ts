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
import * as minimist from 'minimist';
import * as prpl from './prpl';

const defaults = {
  host: '127.0.0.1',
  port: '8080',
  root: '.',
};

const opts = {
  string: ['host', 'port', 'root'],
  boolean: ['help'],
  default: defaults,
  unknown: (arg: string) => {
    throw new Error(`unknown arg: "${arg}"`);
  },
};

const color = {
  reset: '\x1b[0m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

const help = `
${color.magenta}prpl-server${color.reset}

https://github.com/Polymer/prpl-server-node

--host	Listen on this hostname (default ${defaults.host}).
--port	Listen on this port; 0 for random (default ${defaults.port}).
--root	Serve files relative to this directory (default ${defaults.root}).
--help	Print this help text.`;

export function run(argv: string[]) {
  const args = minimist(argv.slice(2), opts);

  if (args.help) {
    console.log(help);
    return;
  }

  if (!args.host) {
    throw new Error('empty --host');
  }
  if (!args.port) {
    throw new Error('empty --port');
  }
  if (!args.root) {
    throw new Error('empty --root');
  }

  const port = Number(args.port);
  if (isNaN(port)) {
    throw new Error(`invalid --port "${args.port}"`);
  }

  const server = http.createServer(prpl.handler(args.root));

  server.listen(port, args.host, () => {
    const addr = server.address();
    let urlHost = addr.address;
    if (addr.family === 'IPv6') {
      urlHost = '[' + urlHost + ']';
    }
    console.log();
    console.log(`${color.magenta}prpl-server${color.reset}`);
    console.log(`${color.blue}http://${urlHost}:${addr.port}${color.reset}`);
    console.log(`serving ${args.root}`);
    console.log();
  });
}
