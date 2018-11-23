const Promise = require('bluebird');
const md5 = require('md5');
const { inspect } = require('util');
const assert = require('assert');

class SequelizeSimpleCache {
  constructor(config = {}, options = {}) {
    this.config = config;
    this.methods = [
      'findById', 'findOne', 'findAll', 'findAndCountAll',
      'count', 'min', 'max', 'sum',
    ];
    const { debug = false } = options;
    this.cache = new Map();
    this.debug = (...args) => debug && console.debug(...args); // eslint-disable-line no-console
    this.disabled = new Set();
  }

  init(model) { // Sequelize model object
    const { name } = model;
    // decorate model with interface to cache
    /* eslint-disable no-param-reassign */
    model.cacheNo = () => model; // bypass
    model.cacheClear = () => this.clear(name);
    model.cacheClearAll = () => this.clear();
    model.cacheDisable = () => this.disable(name);
    model.cacheDisableAll = () => this.disable();
    model.cacheEnable = () => this.enable(name);
    model.cacheEnableAll = () => this.enable();
    /* eslint-enable no-param-reassign */
    // setup caching for this model
    const config = this.config[name];
    if (!config) return model; // no caching
    const { ttl = 60 * 60, methods = this.methods } = config;
    // setup Proxy for caching
    this.debug('>>> CACHE INIT >>>', { name, config });
    const interceptor = {
      get: (target, prop) => {
        if (this.disabled.has(name) || !methods.includes(prop)) {
          return target[prop];
        }
        const fn = (...args) => {
          const key = `${name}.${prop}.${inspect(args, { depth: null })}`;
          const hash = md5(key);
          const item = this.cache.get(hash);
          if (item) { // hit
            const { data, expires } = item;
            if (expires > Date.now()) {
              this.debug('>>> CACHE RESOLVE >>>', {
                key, hash, data: JSON.stringify(data), expires, size: this.cache.size,
              });
              return Promise.resolve(data); // resolve from cache
            }
          }
          const promise = target[prop](...args);
          assert(promise.then, `${name}.${prop} did not return a promise`);
          return promise.then((data) => {
            if (data !== undefined && data !== null) {
              this.cache.set(hash, { data, expires: Date.now() + ttl * 1000, type: name });
            }
            return Promise.resolve(data); // resolve from database
          });
        };
        fn.restore = () => target[prop].restore(); // TODO: Sinon support
        return fn;
      },
    };
    return new Proxy(model, interceptor);
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

  disable(...modelnames) {
    const names = modelnames.length ? modelnames : Object.keys(this.config);
    names.forEach(name => this.disabled.add(name));
  }

  enable(...modelnames) {
    const names = modelnames.length ? modelnames : Object.keys(this.config);
    names.forEach(name => this.disabled.delete(name));
  }
}

module.exports = SequelizeSimpleCache;
