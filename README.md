[![Travis Build Status](https://travis-ci.org/Polymer/prpl-server-node.svg?branch=master)](https://travis-ci.org/Polymer/prpl-server-node)
[![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/3bfbf7fgdifebv7o/branch/master?svg=true)](https://ci.appveyor.com/project/aomarks/prpl-server-node/branch/master)

# prpl-server-node

An HTTP server for Node designed to serve [PRPL](https://developers.google.com/web/fundamentals/performance/prpl-pattern/) apps in production.

## Usage

### As a binary
```sh
$ yarn global add prpl-server
$ prpl-server --root . --config polymer.json
```

### As a library

```sh
$ yarn add prpl-server
```

```js
prpl = require('prpl-server');
express = require('express');

const app = express()

app.get('/api/launch', (req, res, next) => res.send('boom'));

app.get('/*', prpl.makeHandler('.', {
  builds: [
    {name: 'modern', browserCapabilities: ['es2015', 'push']},
    {name: 'fallback'},
  ],
}));

app.listen(8080);
```

## Differential Serving

Modern browsers offer great features that improve performance, but most applications need to support older browsers too. prpl-server can serve different versions of your application to different browsers by detecting browser capabilities using the user-agent header.

### Builds

prpl-server understands the notion of a *build*, a variant of your application optimized for a particular set of browser capabilities.

Builds are specified in a JSON configuration file. This format is compatible with [`polymer.json`](https://www.polymer-project.org/2.0/docs/tools/polymer-json), so if you are already using polymer-cli for your build pipeline, you can annotate your existing builds with browser capabilities, and copy the configuration to your server root. prpl-server will look for a file called `polymer.json` in the server root, or you can specify it directly with the `--config` flag.


In this example we define two builds, one for modern browsers that support ES2015 and HTTP/2 Push, and a fallback build for other browsers:

```
{
  "entrypoint: "index.html",
  "builds": [
    {"name": "modern", "browserCapabilities": ["es2015", "push"]},
    {"name": "fallback"}
  ]
}
```

### Capabilities

The `browserCapabilities` field defines the browser features required for that build. prpl-server analyzes the request user-agent header and picks the best build for which all capabilities are met. If multiple builds are compatible, the one with more capabilities is preferred. If there is a tie, the build that comes earlier in the configuration file wins.

You should always include a fallback build with no capability requirements. If you don't, prpl-server will warn at startup, and will return a 500 error on entrypoint requests to browsers for which no build can be served.

The following keywords are supported. See also [capabilities.ts](https://github.com/Polymer/prpl-server-node/blob/master/src/capabilities.ts) for the latest browser support matrix.

| Keyword       | Description
| :----         | :----
| es2015        | [ECMAScript 2015 (aka ES6)](https://developers.google.com/web/shows/ttt/series-2/es2015)
| push          | [HTTP/2 Server Push](https://developers.google.com/web/fundamentals/performance/http2/#server-push)
| serviceworker | [Service Worker API](https://developers.google.com/web/fundamentals/getting-started/primers/service-workers)


## Entrypoint

In the [PRPL pattern](https://developers.google.com/web/fundamentals/performance/prpl-pattern/), the *entrypoint* is a small HTML file that acts as the application bootstrap.

prpl-server will serve the entrypoint from the best compatible build from `/`, and from any path that does not have a file extension and is not an existing file.

prpl-server expects that each build subdirectory contains its own entrypoint file. By default it is `index.html`, or you can specify another name with the `entrypoint` configuration file setting.

Note that because the entrypoint is served from many URLs, and varies by user-agent, cache hits for the entrypoint will be minimal, so it should be kept as small as possible.

## Base paths

Since prpl-server serves resources from build subdirectories, your application source can't know the absolute URLs of build-specific resources upfront.

For most documents in your application, the solution is to use relative URLs to refer to other resources in the build, and absolute URLs to refer to resources outside of the build (e.g. static assets, APIs). However, since the *entrypoint* is served from URLs that do not match its location in the build tree, relative URLs will not resolve correctly.

The solution we recommend is to place a [`<base>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/base) tag in your entrypoint to anchor its relative URLs to the correct build subdirectory, regardless of the URL the entrypoint was served from. You may then use relative URLs to refer to build-specific resources from your entrypoint, as though you were in your build subdirectory. Put `<base href="/">` in your source entrypoint, so that URLs resolve when serving your source directly during development. In your build pipeline, update each entrypoint's base tag to match its build subdirectory (e.g. `<base href="/modern/">`).

If you are using polymer-cli, set `{basePath: true}` on each build configuration to perform this base tag update automatically.

Note that `<base>` tags only affect relative URLs, so to refer to resources outside of the build from your entrypoint, use absolute URLs as you normally would.

## HTTP/2 Server Push

Server Push allows an HTTP/2 server to preemptively send additional resources alongside a response. This can improve latency by eliminating subsequent round-trips for dependencies such as scripts, CSS, and HTML imports.


### Push manifest

prpl-server looks for a file called `push-manifest.json` in each build subdirectory, and uses it to map incoming request paths to the additional resources that should be pushed with it. The push manifest file format is described [here](https://github.com/GoogleChrome/http2-push-manifest). Tools for generating a push manifest include [http2-push-manifest](https://github.com/GoogleChrome/http2-push-manifest) and [polymer-cli](https://github.com/Polymer/polymer-cli).

If you are using polymer-cli, set `{basePath: true}` on your builds so that the paths in your push manifest include their build subdirectory prefixes.

### Link preload headers

prpl-server is designed to be used behind an HTTP/2 reverse proxy, and currently does not generate push responses itself. Instead it sets [preload link](https://w3c.github.io/preload/#server-push-http-2) headers, which are intercepted by cooperating reverse proxy servers and upgraded into push responses. Servers that implement this upgrading behavior include [Apache](https://httpd.apache.org/docs/trunk/mod/mod_http2.html#h2push), [nghttpx](https://github.com/nghttp2/nghttp2#nghttpx---proxy), and [Google App Engine](https://cloud.google.com/appengine/).

### Testing push locally

To confirm your push manifest is working during local development, you can look for `Link: <URL>; rel=preload` response headers in your browser dev tools.

To see genuine push locally, you will need to run a local HTTP/2 reverse proxy such as [nghttpx](https://github.com/nghttp2/nghttp2#nghttpx---proxy):

- Install nghttpx ([Homebrew](http://brewformulas.org/Nghttp2), [Ubuntu](http://packages.ubuntu.com/zesty/nghttp2), [source](https://github.com/nghttp2/nghttp2#building-from-git)).
- Generate a self-signed TLS certificate, e.g. `openssl req -newkey rsa:2048 -x509 -nodes -keyout server.key -out server.crt`
- Start prpl-server (assuming default `127.0.0.1:8080`).
- Start nghttpx: `nghttpx -f127.0.0.1,8443 -b127.0.0.1,8080 server.key server.crt --no-ocsp`
- Visit `https://localhost:8443`. In Chrome, Push responses will show up in the Network tab as Initiator: Push / Other.

Note that Chrome will not allow a service worker to be registered over HTTPS with a self-signed certificate. You can enable [chrome://flags/#allow-insecure-localhost](chrome://flags/#allow-insecure-localhost) to bypass this check. See [this page](https://www.chromium.org/blink/serviceworker/service-worker-faq) for more tips on developing service workers in Chrome.

## Service Workers

prpl-server sets the [`Service-Worker-Allowed`](https://www.w3.org/TR/service-workers-1/#service-worker-allowed) header to `/` for any request path ending with `service-worker.js`. This allows a service worker served from a build subdirectory to be registered with a scope outside of that directory, e.g. `register('service-worker.js', {scope: '/'})`.

## HTTPS

Your apps should always be served over HTTPS. It protects your user's data, and is *required* for features like service workers and HTTP/2.

If the `--https-redirect` flag is set, prpl-server will redirect all HTTP requests to HTTPS. It sends a `301 Moved Permanently` redirect to an `https://` address with the same hostname on the default HTTPS port (443).

prpl-server trusts [`X-Forwarded-Proto`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto) and [`X-Forwarded-Host`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host) headers from your reverse proxy to determine the client's true protocol and hostname. Most reverse proxies automatically set these headers, but if you encounter issues with redirect loops, missing or incorrect `X-Forwarded-*` headers may be the cause.

You should always use `--https-redirect` in production, unless your reverse proxy already performs HTTPS redirection.

## Google App Engine Quickstart

[Google App Engine](https://cloud.google.com/appengine/) is a managed server platform that [supports Node](https://cloud.google.com/nodejs/) in its [Flexible Environment](https://cloud.google.com/appengine/docs/flexible/). You can deploy prpl-server to App Engine with a few steps:

1. Follow [these instructions](https://cloud.google.com/appengine/docs/flexible/nodejs/quickstart) to set up a Google Cloud project and install the Google Cloud SDK. As instructed, run the `gcloud init` command to authenticate and choose your project ID.

2. `cd` to the directory you want to serve (e.g. your app's `build/` directory if you are using polymer-cli).

3. Run `npm init` or `yarn init` and follow the prompts to create your `package.json`.

4. Run `npm install --save prpl-server` or `yarn add prpl-server` to add prpl-server as a dependency.

5. Edit your `package.json` to add a `start` script. This is the command App Engine runs when your app starts. Configure `prpl-server` to listen on all hosts, and to redirect HTTP connections to HTTPS. You should also specify the version of Node your app requires via the `engines` section.

```json
{
  "scripts": {
    "start": "prpl-server --host 0.0.0.0 --https-redirect"
  },
  "engines": {
    "node": ">=6.0.0"
  }
}
```

6. Create an `app.yaml` file. This tells App Engine that you want to use the Node environment:

```yaml
runtime: nodejs
env: flex
```

7. Run `gcloud app deploy` to deploy to your App Engine project. `gcloud` will tell you the URL your app is being served from. For next steps, check out the Node on App Engine [documentation](https://cloud.google.com/nodejs/).
