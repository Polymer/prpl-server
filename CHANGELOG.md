# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

<!-- ## Unreleased -->
<!-- Add new, unreleased changes here. -->

## [1.4.3] 2021-09-22
- `prpl-server` is now deprecated. A warning will be printed when installing
  from NPM, as well as each time the server is launched. Please see
  https://github.com/Polymer/prpl-server#deprecation for details and recommended
  alternatives.
- Updated dependencies.
- Updated some repo links (`prpl-server-node` -> `prpl-server`).

## [1.4.2] 2020-08-12
- Update dependencies.
- Clean up unnecessary NPM package files.

## [1.4.1] 2020-08-07
- Clean up unnecessary dependencies.

## [1.4.0] 2019-01-07
- Don't cache response for SW.

## [1.3.0] 2018-12-06
- Support crossorigin setting in push-manifest.

## [1.2.0] 2018-05-22
- Add `as=fetch` as a valid value for preload headers.

## [1.1.0] 2018-04-23
- Update browser-capabilities to pick up the latest user agent information for modules and service workers. Support for dynamic `import()` and `import.meta` are now requirements for the `modules` capability.
- If a build with a push manifest is served to a browser that does not support push (according to browser-capabilities), then we will still set preload headers, but with the `nopush` attribute set.

## [1.0.0] 2017-10-31
- Add `forwardErrors` option to pass 404s and other HTTP errors down to the next Express error-handling middleware.
- Recommend `npm` instead of `yarn` and switch to `npm` lock file.
- Check file existence asynchronously so the event loop is not blocked.

## [0.11.0] 2017-10-23
- Add `unregisterMissingServiceWorkers` option (default true) which serves a tiny self-unregistering service worker for would-be 404 service worker requests, to prevent clients from getting stuck with invalid service workers indefinitely.

## [0.10.2] 2017-10-18
- Require latest browser capabilities, which removes Firefox from push capable browsers due to https://bugzilla.mozilla.org/show_bug.cgi?id=1409570.
- Bump Yarn lock dependencies.

## [0.10.1] 2017-09-12
- Check the original URL path against the push manifest in addition to the resolved filename. This allows mapping application route patterns to push resources.

## [0.10.0] 2017-09-11
- Push manifest keys are now regular expression patterns instead of exact paths.
- The `Cache-Control` header is now set to 1 minute by default (except for the entrypoint). Added the `cacheControl` config property and `--cache-control` flag to override.

## [0.9.0] 2017-08-23
- Add `--bot-proxy` flag to proxy requests from bots through [Rendertron](https://github.com/GoogleChrome/rendertron).

## [0.8.0] 2017-08-09
- Switch to https://github.com/Polymer/browser-capabilities library.
- Add `modules` capability.
- Declare TypeScript typings in package.

## [0.7.0] 2017-05-30
- Add `--version` flag.

## [0.6.0] 2017-05-23
- Relative push manifest paths are now interpreted as relative to the location of the push manifest file itself. Previously they were always interpreted as relative to the server root.
- Extra safeguard against directory traversal attacks.

## [0.5.0] 2017-05-22
- Add `serviceworker` to browser capability detection.

## [0.4.0] 2017-05-19
- Add HTTP to HTTPS redirection.

## [0.3.0] 2017-05-18
- The commandline server now compresses responses.
- Fixed Windows bugs; now tested on AppVeyor.

## [0.2.0] 2017-05-16
- Initial release.
