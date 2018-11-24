const Promise = require('bluebird');
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
      .reduce((acc, [name, { ttl = defaults.ttl, methods = defaults.methods }]) => ({
        ...acc,
        [name]: { ttl, methods },
      }), {});
    const { debug = false } = options;
    this.debug = debug;
    this.cache = new Map();
  }

  log(tag, details) {
    if (!this.debug) return;
    const { args, data } = details;
    const out = details;
    if (args) {
      out.args = SequelizeSimpleCache.stringify(args);
    }
    if (data) {
      out.data = JSON.stringify(data);
    }
    console.debug(`>>> CACHE ${tag.toUpperCase()} >>>`, out); // eslint-disable-line no-console
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
    const { name } = model;
    // decorate model with interface to cache
    /* eslint-disable no-param-reassign */
    model.noCache = () => model;
    model.clearCache = () => this.clear(name);
    model.clearCacheAll = () => this.clear();
    /* eslint-enable no-param-reassign */
    // setup caching for this model
    const config = this.config[name];
    if (!config) return model; // no caching for this model
    const { ttl, methods } = config;
    this.log('init', { model: name, ttl, methods });
    // proxy for intercepting Sequelize methods
    return new Proxy(model, {
      get: (target, prop) => {
        if (!methods.includes(prop)) {
          return target[prop];
        }
        const fn = (...args) => {
          const hash = SequelizeSimpleCache.hash({ name, prop, args });
          const item = this.cache.get(hash);
          if (item) { // hit
            const { data, expires } = item;
            if (expires > Date.now()) {
              this.log('hit', {
                model: name, method: prop, args, hash, data, expires, size: this.cache.size,
              });
              return Promise.resolve(data); // resolve from cache
            }
          }
          const promise = target[prop](...args);
          assert(promise.then, `${name}.${prop}() did not return a promise but should`);
          return promise.then((data) => {
            if (data !== undefined && data !== null) {
              this.cache.set(hash, { data, expires: Date.now() + ttl * 1000, type: name });
            }
            return Promise.resolve(data); // resolve from database
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
}

module.exports = SequelizeSimpleCache;
