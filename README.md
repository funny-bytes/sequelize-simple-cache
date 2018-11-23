# sequelize-simple-cache

This is a simple, transparent, client-side, in-memory cache for [Sequelize](https://github.com/sequelize/sequelize) v4.
Cache invalidation is based on time-to-live (ttl).
Selectively add your Sequelize models to the cache.

[![Build Status](https://travis-ci.org/frankthelen/sequelize-simple-cache.svg?branch=master)](https://travis-ci.org/frankthelen/sequelize-simple-cache)
[![Coverage Status](https://coveralls.io/repos/github/frankthelen/sequelize-simple-cache/badge.svg?branch=master)](https://coveralls.io/github/frankthelen/sequelize-simple-cache?branch=master)
[![Dependencies Status](https://david-dm.org/frankthelen/sequelize-simple-cache.svg)](https://david-dm.org/frankthelen/sequelize-simple-cache)
[![Greenkeeper badge](https://badges.greenkeeper.io/frankthelen/sequelize-simple-cache.svg)](https://greenkeeper.io/)
[![Maintainability](https://api.codeclimate.com/v1/badges/c8bdb1fc29ef12070cac/maintainability)](https://codeclimate.com/github/frankthelen/sequelize-simple-cache/maintainability)
[![node](https://img.shields.io/node/v/sequelize-simple-cache.svg)]()
[![code style](https://img.shields.io/badge/code_style-airbnb-brightgreen.svg)](https://github.com/airbnb/javascript)
[![License Status](http://img.shields.io/npm/l/sequelize-simple-cache.svg)]()

This cache might work for you if you have a few database tables that
(1) are frequently read but very rarely written and
(2) contain only few rows of data.

In a project, we had a couple of database tables that were holding a sort of system configuration.
Something like 4 or 5 tables with some 50 rows of data.
Nearly every request needed this data, i.e., it was read all the time.
But updated only very rarely, once a day maybe.
So, pre-fetching or simple caching would work for us.

If that's not matching your scenario, better look for something more sophisticated such as Redis, memcached and alike.

## Install

```bash
npm install sequelize-simple-cache
```

## Usage

Setup the cache along with loading your Sequelize models like this:
```javascript
const Sequelize = require('sequelize');
const SequelizeSimpleCache = require('sequelize-simple-cache');

const sequelize = new Sequelize('database', 'username', 'password', { ... });

// initialize cache
const cache = new SequelizeSimpleCache({
  User: { ttl: 5 * 60 }, // 5 minutes
  Page: { }, // default ttl is 1 hour
});

// add your models to the cache
const User = cache.init(sequelize.import('./models/user'));
const Page = cache.init(sequelize.import('./models/page'));
const Balance = sequelize.import('./models/balance'); // no caching for this one

// first time resolved from database, subsequent times from local cache
const fred = User.findOne({ where: { username: 'fred' }});
```

## More Details

### Supported methods

Currently, the following methods on a Sequelize model instances are supported for caching:
`findById`, `findOne`, `findAll`, `findAndCountAll`, `count`, `min`, `max`, `sum`.

### Non-cacheable queries / bypass caching

Make sure your queries are cacheable, i.e., do not have dynamic timestamps.
```javascript
const { Op, fn } = require('sequelize');
// this is not good
Model.findOne({ where: { startDate: { [Op.lte]: new Date() }, } });
// you should do it this way
Model.findOne({ where: { startDate: { [Op.lte]: fn('NOW') }, } });
// if you don't want that to be cached, bypass the cache like this
Model.cacheNo().findOne({ where: { startDate: { [Op.lte]: fn('NOW') }, } });
```

### Clear cache

There are these ways to clear the cache.
```javascript
// clear all
cache.clear();
// clear all entries of a certain model
cache.clear('User');
// or do the same on the model
User.cacheClear();
User.cacheClearAll();
```

### Bypass caching

Caching can explicitly be bypassed like this:
```javascript
User.cacheNo().findOne(...);
```

### Debug output

You can activate debug output to `console.debug()` like this:
```javascript
const cache = new SequelizeSimpleCache({
  User: { ttl: 5 * 60 },
}, {
  debug: true,
});
```

### Unit testing your models with Sinon et al.

If you run unit tests against your Sequelize models, caching might be somewhat counterproductive.
So, either clear the cache as needed in your unit tests. For example (using Mocha):
```javascript
describe('API: GET /consent/sp/{spId}/customer/{lcId}', () => {
  beforeEach(() => {
    User.cacheClearAll();
  });
  // ...
```

Or disable the cache right from the beginning.
A quick idea... have a config value to be set in your project's `/config/test.js`
and start your unit tests with setting `NODE_ENV=test` before.
```javascript
const config = require('config');
//...
if (config.get('disablecache')) {
  cache.disable();
}
```
