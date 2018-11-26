const md5 = require('md5');
const { inspect } = require('util');
const assert = require('assert');

class SequelizeSimpleCache {
  constructor(config = {}, options = {}) {
    const defaults = {
      ttl: 60 * 60, // 1 hour
      methods: ['findById', 'findOne', 'findAll', 'findAndCountAll', 'count', 'min', 'max', 'sum'],
    };
    this.config = Object.entries(config)
      .reduce((acc, [type, { ttl = defaults.ttl, methods = defaults.methods }]) => ({
        ...acc,
        [type]: { ttl, methods },
      }), {});
    const {
      debug = false, // eslint-disable-next-line no-console
      delegate = (event, details) => console.debug(`CACHE ${event.toUpperCase()}`, details),
    } = options;
    this.debug = debug;
    this.delegate = delegate;
    this.cache = new Map();
    this.stats = { hit: 0, miss: 0, load: 0 };
  }

  static stringify(obj) {
    // Unfortunately, there seam to be no stringifyers or object hashers that work correctly
    // with ES6 symbols and function objects. But this is important for Sequelize queries.
    // This is the only solution that seams to be working.
    return inspect(obj, { depth: Infinity, maxArrayLength: Infinity, breakLength: Infinity });
  }

  static hash(obj) {
    return md5(SequelizeSimpleCache.stringify(obj));
  }

  init(model) { // Sequelize model object
    const { name: type } = model;
    // decorate model with interface to cache
    /* eslint-disable no-param-reassign */
    model.noCache = () => model;
    model.clearCache = () => this.clear(type);
    model.clearCacheAll = () => this.clear();
    /* eslint-enable no-param-reassign */
    // setup caching for this model
    const config = this.config[type];
    if (!config) return model; // no caching for this model
    const { ttl, methods } = config;
    this.log('init', { type, ttl, methods });
    // proxy for intercepting Sequelize methods
    return new Proxy(model, {
      get: (target, prop) => {
        if (!methods.includes(prop)) {
          return target[prop];
        }
        const fn = async (...args) => {
          const hash = SequelizeSimpleCache.hash({ type, prop, args });
          const item = this.cache.get(hash);
          if (item) { // hit
            const { data, expires } = item;
            if (expires > Date.now()) {
              this.log('hit', {
                type, method: prop, args, hash, data, expires,
              });
              return data; // resolve from cache
            }
          }
          this.log('miss', {
            type, method: prop, args, hash,
          });
          const promise = target[prop](...args);
          assert(promise.then, `${type}.${prop}() did not return a promise but should`);
          return promise.then((data) => {
            if (data !== undefined && data !== null) {
              const expires = Date.now() + ttl * 1000;
              this.cache.set(hash, { data, expires, type });
              this.log('load', {
                type, method: prop, args, hash, data, expires,
              });
            }
            return data; // resolve from database
          });
        };
        // proxy for supporting Sinon-decorated properties on mocked model functions
        return new Proxy(fn, {
          get: (_, deco) => { // eslint-disable-line consistent-return
            if (Reflect.has(target, prop) && Reflect.has(target[prop], deco)) {
              return target[prop][deco]; // e.g., `User.findOne.restore`
            }
          },
        });
      },
    });
  }

  clear(...modelnames) {
    if (!modelnames.length) {
      this.cache.clear();
      return;
    }
    this.cache.forEach(({ type }, key) => {
      if (modelnames.includes(type)) {
        this.cache.delete(key);
      }
    });
  }

  log(event, details) {
    // stats
    if (['hit', 'miss', 'load'].includes(event)) {
      this.stats[event] += 1;
    }
    // debug logging
    if (!this.debug) return;
    const { args, data } = details;
    const out = details;
    if (args) {
      out.args = SequelizeSimpleCache.stringify(args);
    }
    if (data) {
      out.data = JSON.stringify(data);
    }
    out.stats = { ...this.stats, ratio: this.stats.hit / (this.stats.hit + this.stats.miss) };
    out.size = this.cache.size;
    this.delegate(event, out);
  }
}

module.exports = SequelizeSimpleCache;
