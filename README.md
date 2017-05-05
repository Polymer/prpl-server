[![Build Status](https://travis-ci.org/Polymer/prpl-server-node.svg?branch=master)](https://travis-ci.org/Polymer/prpl-server-node)

# prpl-server-node

A Node implementation of the [PRPL](https://developers.google.com/web/fundamentals/performance/prpl-pattern/) pattern for serving Progressive Web Apps.

**(Note: This project is in early development and is not yet suitable for use.)**

## Installation

```sh
$ yarn install prpl-server -g
```

## Usage

### From the command line

```sh
$ cd my-project/
$ prpl-server
```

### As a library

```js
const server = require('prpl-server').server()
server.listen(8080);
```

## Compiling from source

```sh
$ yarn run build       # once
$ yarn run build:watch # continuous
```

## Run tests

```sh
$ yarn run test       # once
$ yarn run test:watch # continuous
```
