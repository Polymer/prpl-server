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
import type {AddressInfo} from 'net';

import * as prpl from './prpl';

const commandLineArgs = require('command-line-args') as any;
const commandLineUsage = require('command-line-usage') as any;
const ansi = require('ansi-escape-sequences') as any;
const rendertron = require('rendertron-middleware') as any;
const prometheus = require('express-prometheus-middleware') as any;

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
  {
    name: 'bot-proxy',
    type: String,
    description: 'Proxy requests from bots/crawlers to this URL. See ' +
        'https://github.com/GoogleChrome/rendertron for more details.',
  },
  {
    name: 'cache-control',
    type: String,
    description:
        'The Cache-Control header to send for all requests except the ' +
        'entrypoint (default from config file or "max-age=60").',
  },
  {
    name: 'monitoring',
    type: Boolean,
    description: 'Enables prometheus monitoring'
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
    const p = '../polymer.json';
    if (fs.existsSync(p)) {
      args.config = p;
    } else {
      console.warn('WARNING: No config found.');
    }
  }
  let config: prpl.Config = {};
  if (args.config) {
    console.info(`Loading config from "${args.config}".`);
    config = JSON.parse(fs.readFileSync(args.config, 'utf8')) as prpl.Config;
  }

  if (args['cache-control']) {
    config.cacheControl = args['cache-control'];
  }

  const app = express();

  // Trust X-Forwarded-* headers so that when we are behind a reverse proxy,
  // our connection information is that of the original client (according to
  // the proxy), not of the proxy itself. We need this for HTTPS redirection
  // and bot rendering.
  app.set('trust proxy', true);

  // Monitoring
  if (args['monitoring']) {
    console.info(`Enabling prometheus monitoring`);
    const { monitoring } = config;
    let authProvider = (_: any): boolean => { return true };

    if (monitoring?.basicAuth) {
      const { username, password } = monitoring?.basicAuth;
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      authProvider = req => req.headers.authorization === `Basic ${token}`;
    }

    app.use(prometheus({
      metricsPath: monitoring?.scrapeEndpoint,
      authenticate: authProvider,
      metricsApp: app
    }));
  }

  if (args['https-redirect']) {
    console.info(`Redirecting HTTP requests to HTTPS.`);
    app.use((req, res, next) => {
      if (req.secure) {
        next();
        return;
      }
      res.redirect(301, `https://${req.hostname}${req.url}`);
    });
  }

  app.use(compression());

  if (args['bot-proxy']) {
    console.info(`Proxying bots to "${args['bot-proxy']}".`);
    app.use(rendertron.makeMiddleware({
      proxyUrl: args['bot-proxy'],
      injectShadyDom: true,
    }));
  }

  app.use(prpl.makeHandler(args.root, config));

  const server = app.listen(args.port, args.host, () => {
    const addr = server.address() as AddressInfo;
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
