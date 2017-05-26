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

import * as compression from 'compression';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';

import * as prpl from './prpl';

const commandLineArgs = require('command-line-args') as any;
const commandLineUsage = require('command-line-usage') as any;
const ansi = require('ansi-escape-sequences') as any;

const argDefs = [
  {
    name: 'help',
    type: Boolean,
    description: 'Print this help text.',
  },
  {
    name: 'version',
    type: Boolean,
    description: 'Print the installed version.',
  },
  {
    name: 'host',
    type: String,
    defaultValue: '127.0.0.1',
    description: 'Listen on this hostname (default 127.0.0.1).',
  },
  {
    name: 'port',
    type: Number,
    defaultValue: 8080,
    description: 'Listen on this port; 0 for random (default 8080).'
  },
  {
    name: 'root',
    type: String,
    defaultValue: '.',
    description: 'Serve files relative to this directory (default ".").',
  },
  {
    name: 'config',
    type: String,
    description:
        'JSON configuration file (default "<root>/polymer.json" if exists).',
  },
  {
    name: 'https-redirect',
    type: Boolean,
    description:
        'Redirect HTTP requests to HTTPS with a 301. Assumes same hostname ' +
        'and default port (443). Trusts X-Forwarded-* headers for detecting ' +
        'protocol and hostname.',
  },
];

export function run(argv: string[]) {
  const args = commandLineArgs(argDefs, {argv});

  if (args.help) {
    console.log(commandLineUsage([
      {
        header: `[magenta]{prpl-server}`,
        content: 'https://github.com/Polymer/prpl-server-node',
      },
      {
        header: `Options`,
        optionList: argDefs,
      }
    ]));
    return;
  }

  if (args.version) {
    console.log(require('../package.json').version);
    return;
  }

  if (!args.host) {
    throw new Error('invalid --host');
  }
  if (isNaN(args.port)) {
    throw new Error('invalid --port');
  }
  if (!args.root) {
    throw new Error('invalid --root');
  }

  // If specified explicitly, a missing config file will error. Otherwise, try
  // the default location and only warn when it's missing.
  if (!args.config) {
    const p = path.join(args.root, 'polymer.json');
    if (fs.existsSync(p)) {
      args.config = p;
    } else {
      console.warn('WARNING: No config found.');
    }
  }
  let config;
  if (args.config) {
    console.info(`Loading config from "${args.config}".`);
    config =
        JSON.parse(fs.readFileSync(args.config, 'utf8')) as prpl.ProjectConfig;
  }

  const app = express();

  if (args['https-redirect']) {
    // Trust X-Forwaded-* headers so that when we are behind a reverse proxy,
    // our connection information is that of the original client (according to
    // the proxy), not of the proxy itself.
    app.set('trust proxy', true);

    app.use((req, res, next) => {
      if (req.secure) {
        next();
        return;
      }
      res.redirect(301, `https://${req.hostname}${req.url}`);
    });
  }

  app.use(compression());

  app.use(prpl.makeHandler(args.root, config));

  const server = app.listen(args.port, args.host, () => {
    const addr = server.address();
    let urlHost = addr.address;
    if (addr.family === 'IPv6') {
      urlHost = '[' + urlHost + ']';
    }
    console.log();
    console.log(ansi.format('[magenta bold]{prpl-server} listening'));
    console.log(ansi.format(`[blue]{http://${urlHost}:${addr.port}}`));
    console.log();
  });
}
