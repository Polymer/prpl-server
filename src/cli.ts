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

import * as fs from 'fs';
import * as http from 'http';
import * as http2 from 'http2';
import * as koa from 'koa';
import * as compress from 'koa-compress';
import * as path from 'path';

import * as prpl from './prpl';

const commandLineArgs = require('command-line-args') as any;
const commandLineUsage = require('command-line-usage') as any;
const ansi = require('ansi-escape-sequences') as any;
const rendertron = require('rendertron-middleware') as any;

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
    name: 'https-port',
    type: Number,
    defaultValue: 8443,
    description:
        'Listen (HTTP/2 secure) on this port; 0 for random (default 8443).'
  },
  {
    name: 'http-port',
    type: Number,
    defaultValue: 8080,
    description: 'Listen (HTTP/1) on this port; 0 for random (default 8080).'
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
    name: 'tls-key',
    type: String,
    description: 'Path to a TLS certificate key. TODO',
  },
  {
    name: 'tls-cert',
    type: String,
    description: 'Path to a TLS certificate file. TODO',
  },
  {
    name: 'https-redirect',
    type: Boolean,
    defaultValue: true,
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
];

interface argDefs {
  help: boolean;
  version: boolean;
  host: string;
  'https-port': number;
  'http-port': number;
  root: string;
  config: string;
  'tls-key': string;
  'tls-cert': string;
  'https-redirect': boolean;
  'bot-proxy': string;
  'cache-control': string;
}

export function run(argv: string[]) {
  const args = commandLineArgs(argDefs, {argv}) as argDefs;

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
    console.log(require(path.join('..', 'package.json')).version);
    return;
  }

  if (!args['tls-key'] || !args['tls-cert']) {
    throw new Error('--tls-key and --tls-cert are required');
  }
  if (!args.host) {
    throw new Error('invalid --host');
  }
  if (isNaN(args['https-port'])) {
    throw new Error('invalid --https-port');
  }
  if (isNaN(args['http-port'])) {
    throw new Error('invalid --http-port');
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
  let config: prpl.Config = {};
  if (args.config) {
    console.info(`Loading config from "${args.config}".`);
    config = JSON.parse(fs.readFileSync(args.config, 'utf8')) as prpl.Config;
  }

  if (args['cache-control']) {
    config.cacheControl = args['cache-control'];
  };

  // TODO --https-redirect=false doesn't work?
  console.log(args['https-redirect'], typeof args['https-redirect']);
  if (args['https-redirect']) {
    const h1App = new koa();

    // Trust X-Forwarded-* headers so that when we are behind a reverse proxy,
    // our connection information is that of the original client (according to
    // the proxy), not of the proxy itself. We need this for HTTPS redirection
    // and bot rendering.
    h1App.proxy = true;

    console.info(`Redirecting HTTP requests to HTTPS.`);
    h1App.use(async (ctx) => {
      ctx.status = 301;
      ctx.redirect(`https://${ctx.hostname}:${args['https-port']}${ctx.url}`);
    });

    const h1Server = http.createServer(h1App.callback());
    h1Server.listen(args['http-port'], args.host, () => {
      const addr = h1Server.address();
      let urlHost = addr.address;
      if (addr.family === 'IPv6') {
        urlHost = '[' + urlHost + ']';
      }
      console.log();
      console.log(ansi.format('[green bold]{prpl-server} listening'));
      console.log(ansi.format(`[blue]{http://${urlHost}:${addr.port}}`));
      console.log();
    });
  }

  const h2App = new koa();

  h2App.use(compress());

  if (args['bot-proxy']) {
    console.info(`Proxying bots to "${args['bot-proxy']}".`);
    h2App.use(rendertron.makeMiddleware({
      proxyUrl: args['bot-proxy'],
      injectShadyDom: true,
    }));
  }

  h2App.use(prpl.makeHandler(args.root, config));

  const h2ServerOpts = {
    allowHTTP1: true,
    cert: fs.readFileSync(args['tls-cert']),
    key: fs.readFileSync(args['tls-key']),
  };

  const h2Server = http2.createSecureServer(
      h2ServerOpts,
      h2App.callback() as any as
          (request: http2.Http2ServerRequest,
           response: http2.Http2ServerResponse) => void);

  h2Server.listen(args['https-port'], args.host, () => {
    const addr = h2Server.address();
    let urlHost = addr.address;
    if (addr.family === 'IPv6') {
      urlHost = '[' + urlHost + ']';
    }
    console.log();
    console.log(ansi.format('[magenta bold]{prpl-server} listening'));
    console.log(ansi.format(`[blue]{https://${urlHost}:${addr.port}}`));
    console.log();
  });
}
