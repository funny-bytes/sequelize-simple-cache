# sequelize-simple-cache

This is a simple, transparent, client-side, in-memory cache for [Sequelize](https://github.com/sequelize/sequelize).
Cache invalidation is based on time-to-live (ttl).
Selectively add your Sequelize models to the cache.
Works with all storage engines supported by Sequelize.

[![Build Status](https://travis-ci.org/frankthelen/sequelize-simple-cache.svg?branch=master)](https://travis-ci.org/frankthelen/sequelize-simple-cache)
[![Coverage Status](https://coveralls.io/repos/github/frankthelen/sequelize-simple-cache/badge.svg?branch=master)](https://coveralls.io/github/frankthelen/sequelize-simple-cache?branch=master)
[![Dependencies Status](https://david-dm.org/frankthelen/sequelize-simple-cache.svg)](https://david-dm.org/frankthelen/sequelize-simple-cache)
[![Maintainability](https://api.codeclimate.com/v1/badges/c8bdb1fc29ef12070cac/maintainability)](https://codeclimate.com/github/frankthelen/sequelize-simple-cache/maintainability)
[![node](https://img.shields.io/node/v/sequelize-simple-cache.svg)]()
[![code style](https://img.shields.io/badge/code_style-airbnb-brightgreen.svg)](https://github.com/airbnb/javascript)
[![License Status](http://img.shields.io/npm/l/sequelize-simple-cache.svg)]()

This cache might work for you if you have database tables that
(1) are frequently read but very rarely written and
(2) contain only few rows of data.

In a project, we had a couple of database tables with a sort of configuration.
Something like 4 or 5 tables with some 10 rows of data.
Nearly every request needed this data, i.e., it was read all the time.
But updated only very rarely, e.g, once a day.
So, pre-fetching or simple in-memory caching would work for us.

If that's not matching your scenario,
better look for something more sophisticated such as Redis or Memcached.

Tested with

* Sequelize 6, Node 12/14/15, integration tested with Postgres 11/12 (via pg 8) and sqlite3 v5 (memory)
* Sequelize 5, Node 10/12/13, integration tested with Postgres 10/11 (via pg 7) and sqlite3 v4 (memory)

## Install

```bash
npm install sequelize-simple-cache
```

## Usage

Setup the cache along with loading your Sequelize models like this:

```javascript
const Sequelize = require('sequelize');
const SequelizeSimpleCache = require('sequelize-simple-cache');

// create db connection
const sequelize = new Sequelize('database', 'username', 'password', { ... });

// initialize cache
const cache = new SequelizeSimpleCache({
  User: { ttl: 5 * 60 }, // 5 minutes
  Page: { }, // default ttl is 1 hour
});

// assuming you have your models in separate files with "model definers"
// -- e.g, see below or https://github.com/sequelize/express-example --
// add your models to the cache like this
const User = cache.init(require('./models/user')(sequelize));
const Page = cache.init(require('./models/page')(sequelize));

// no caching for this one (because it's not configured to be cached)
// will only add dummy decorators to the model for a homogeneous interface to all models
const Order = cache.init(require('./models/order')(sequelize));

// the Sequelize model API is fully transparent, no need to change anything.
// first time resolved from database, subsequent times from local cache.
const fred = User.findOne({ where: { username: 'fred' }});
```

`./models/user.js` might look like this:

```javascript
const { Model } = require('sequelize');
class User extends Model {}
module.exports = (sequelize) => User.init({ /* attributes */ }, { sequelize });
```

## More Details

### Supported methods

The following methods on Sequelize model instances are supported for caching:
`findOne`, `findAndCountAll`, `findByPk`, `findAll`, `count`, `min`, `max`, `sum`.
In addition, for Sequelize v4: `find`, `findAndCount`, `findById`, `findByPrimary`, `all`.

### Non-cacheable queries / bypass caching

You need to avoid non-cacheable queries, e.g., queries containing dynamic timestamps.

```javascript
const { Op, fn } = require('sequelize');
// this is not good
Model.findAll({ where: { startDate: { [Op.lte]: new Date() }, } });
// you should do it this way
Model.findAll({ where: { startDate: { [Op.lte]: fn('NOW') }, } });
// if you don't want a query to be cached, you may explicitly bypass the cache like this
Model.noCache().findAll(...);
// transactions enforce bypassing the cache, e.g.:
Model.findOne({ where: { name: 'foo' }, transaction: t, lock: true });
```

### Time-to-live (ttl)

Each model has its individual time-to-live (ttl), i.e.,
all database requests on a model are cached for a particular number of seconds.
Default is one hour.
For eternal caching, i.e., no automatic cache invalidation, simply set the model's `ttl` to `false` (or any number less or equals `0`).

```javascript
const cache = new SequelizeSimpleCache({
  User: { ttl: 5 * 60 }, // 5 minutes
  Page: { }, // default ttl is 1 hour
  Foo: { ttl: false } // cache forever
});
```

### Clear cache

There are these ways to clear the cache.

```javascript
const cache = new SequelizeSimpleCache({...});
// clear all
cache.clear();
// clear all entries of specific models
cache.clear('User', 'Page');
// or do the same on any model
Model.clearCache(); // only model
Model.clearCacheAll(); // entire cache
```

By default, the model's cache is automatically cleared if these methods are called:
`update`, `create`, `upsert`, `destroy`, `findOrBuild`.
In addition, for Sequelize v4: `insertOrUpdate`, `findOrInitialize`, `updateAttributes`.

You can change this default behavior like this:

```javascript
const cache = new SequelizeSimpleCache({
  User: { }, // default clearOnUpdate is true
  Page: { clearOnUpdate: false },
});
```

If you run multiple instances (clients or containers or PODs or alike),
be aware that cache invalidation is more complex that the above simple approach.

### Bypass caching

Caching can explicitly be bypassed like this:

```javascript
Model.noCache().findOne(...);
```

### Limit

This cache is meant as a simple in-memory cache for a very limited amount of data.
So, you should be able to control the size of the cache.

```javascript
const cache = new SequelizeSimpleCache({
  User: { }, // default limit is 50
  Page: { limit: 30 },
});
```

### Logging

There is "debug" and "ops" logging -- both are off by default.
Logging goes to `console.debug()` unless you set `delegate` to log somewhere else.
`event` is one of: `init`, `hit`, `miss`, `load`, `purge` or `ops`.

```javascript
const cache = new SequelizeSimpleCache({
  // ...
}, {
  debug: true,
  ops: 60, // seconds
  delegate: (event, details) => { ... },
});
```

### Unit testing

If you are mocking your Sequelize models in unit tests with [Sinon](https://sinonjs.org/) et al.,
caching might be somewhat counterproductive.
So, either clear the cache as needed in your unit tests. For example (using [mocha](https://mochajs.org/)):

```javascript
describe('My Test Suite', () => {
  beforeEach(() => {
    Model.clearCacheAll(); // on any model with the same effect
  });
  // ...
```

Or disable the cache right from the beginning.
A quick idea... have a specific config value in your project's `/config/default.js`
and `/config/test.js` to enable or disable the cache respectively.
And start your unit tests with setting `NODE_ENV=test` before.
This is actually the way I am doing it; plus a few extra unit tests for caching.

```javascript
const config = require('config');
const useCache = config.get('database.cache');
// initializing the cache
const cache = useCache ? new SequelizeSimpleCache({...}) : undefined;
// loading the models
const model = require('./models/model')(sequelize);
const Model = useCache ? cache.init(model) : model;
```


# Completely Transparent Cache

Below is an example of a project that uses SequelizeSimpleCache as a completely transparent cache, we will be replacing the default models on sequelize with the functions from SequelizeSimpleCache. SequelizeSimpleCache will sit as a layer between the database access object (DAO) and the sequelize models, accessing and checking the cache before querying the database. Anytime you wish to use sequelize in the project, it would be imported from `/lib/sequelize.js`


### Project Structure

```
```
project
│  `package.json` 
│
└──src
│   │   `app.js`
│   │   `server.js`
│   │
│   └─────lib
│       │   `sequelize.js`
│       │
│   └─────models
│       │    `User.js`
│       │
```
```

## Getting started

### project/app.js

Initialise a HTTP server

```javascript
const express = require('express');
const app = express();
const { sequelize } = require('./lib/sequelize');
// set up middleware
module.exports = { app };
```

### project/server.js

The entry point for the application, this is the file that node will run with `node /src/server.js`

```javascript
const { createServer } = require('http');
const { app } = require('./app');
const { sequelize } = require('./lib/sequelize');

// run server
(async () => {
	// test we are connected to the database
	await sequelize.authenticate();
	
	// start the server on port 3000
	createServer(app).listen(3000, () =>  console.log(`Server running on http://localhost:3000`));
})();
```

### project/models/User.js

A template for how models can be set up

```javascript
const { Model, DataTypes } = require('sequelize')

class User extends Model {
	// The table model [Left blank]
}

// The function that will either create a table or synchronize sequelize with the database
const sync = async (sequelize, options = { force:  false }) => {
	User.init({
		'userID': {
			'type':  DataTypes.INTEGER.UNSIGNED,
			'autoIncrement':  true,
			'primaryKey':  true
		},
		'firstName': {
			'type':  DataTypes.STRING,
			'allowNull':  false
		},
		'lastName': {
			'type':  DataTypes.STRING,
			'allowNull':  false
		},
		'email': {
			'type':  DataTypes.STRING,
			'allowNull':  false,
			'unique':  true,	
			'validate': {
				'isEmail':  true
			}
		}
	}, {
		'tableName':  'USER',
		'sequelize':  sequelize,
	});
	
	// Sync the table to the database
	await User.sync(options);

	// Add Hooks Here
	// example User.beforeCreate(() => {})

	return User;
}

const assosciate = async (sequelize) => {
	// Add table assosciations
	// eg. User.belongsTo(Group);
	return User;
}

// Export
module.exports = {
	User,
	sync,
	assosciate
}
```

### project/lib/sequelize.js

Where we swap out the default sequelize model for the cache layer, the cache layer will hold the methods for the database, all instances of sequelize used in the project will import it from this file

```javascript
const { Sequelize } = require('sequelize');
const SequelizeSimpleCache = require('sequelize-simple-cache');

// Import all models
let User = require('../models/User');

// Create a Sequelize Cache object and assign it the Sequelize prototype
const SequelizeCache = Object.assign(Sequelize);

// Assign the Sequelize constructor to the Sequelize Cache object
SequelizeCache.prototype.constructor = Sequelize;

// Create the database access object
const sequelize = new SequelizeCache(
	'DATABASE', // DATABASE NAME
	'root', // DATABASE USERNAME
	'example', // DATABASE PASSWORD
	{
		'dialect':  'mysql', // DATABASE ENGINE
		'host':  'localhost', // DATABASE HOST
		'port':  '3306', // DATABASE PORT
	}
);

// Immediately Invoked Function Expression (IIFE)
(async() => {
	// Sync all Models
	await User.sync(sequelize, { force:  true });

	// Create foreign key constraints on all models
	await User.assosciate(sequelize);

	// Assign the model to the variable
	User = User.User;

	// Register the SequelizeSimpleCache and add our models
	// then add the cache to our sequelize object
	// so we can access the cache from other files
	// 5 * 60 = 5 Minutes with a maximum cache capacity of 50 Users
	sequelize._cache = new SequelizeSimpleCache({
		User: { ttl:  5 * 60, limit:  50 },
	}, {
		debug: true  // console.log debug output
	});

	// All of the models that are registered with sequelize
	// are added to the sequelize.models object,
	// here we replace the models that were registered with Model.init() [In the model files]
	// with the models in the cache, in the one line
	// we add the model to the cache by completeing the right hand
	// assignment first, then replace the default Model with the cachable model
	sequelize.models['User'] = sequelize._cache.init(sequelize.modelManager.addModel(User));
  

	// Create a fake user for testing
	try {
		await  User.create({
			'email':  'root@admin.com',
			'password':  'password1',
			'firstName':  'admin',
			'lastName':  'admin'
		});
	} catch (err) {
		console.error(err);
	}

	// Try to retrieve the test user
	console.log(await sequelize.models.User.findAll());
})();

module.exports = {
	sequelize,
};
```
