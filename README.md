# prpl-server-node

A Node implementation of the [PRPL](https://developers.google.com/web/fundamentals/performance/prpl-pattern/) pattern for serving Progressive Web Apps.

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
$ yarn run build      # once
$ yarn run build:test # continuous
```

## Run tests

```sh
$ yarn run test       # once
$ yarn run test:watch # continuous
```
