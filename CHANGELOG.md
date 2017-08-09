# Change Log

## [Unreleased]

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
