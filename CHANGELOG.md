# Change Log

## [Unreleased]

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
