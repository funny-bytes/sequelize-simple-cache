const sinon = require('sinon');
const { Op, fn } = require('sequelize');
const md5 = require('md5');
const SequelizeSimpleCache = require('../..');
require('../test-helper');

describe('SequelizeSimpleCache', () => {
  let stubConsoleDebug;
  let stubDateNow;
  let nowOffset = 0;

  beforeEach(() => {
    stubConsoleDebug = sinon.stub(console, 'debug');
    nowOffset = 0; // reset
    const now = Date.now();
    stubDateNow = sinon.stub(Date, 'now').callsFake(() => now + nowOffset);
  });

  afterEach(() => {
    stubConsoleDebug.restore(); // eslint-disable-line no-console
    stubDateNow.restore();
  });

  it('should create cache without crashing / no args', () => {
    expect(() => new SequelizeSimpleCache()).to.not.throw();
  });

  it('should create cache without crashing / empty args / 1', () => {
    expect(() => new SequelizeSimpleCache({}, {})).to.not.throw();
  });

  it('should create cache without crashing / empty args / 2', () => {
    expect(() => new SequelizeSimpleCache({}, { ops: false })).to.not.throw();
  });

  it('should create cache without crashing / dummy model', () => {
    expect(() => new SequelizeSimpleCache({ User: {} }, { ops: false })).to.not.throw();
  });

  it('should generate unique hashes for Sequelize queries with ES6 symbols and functions', () => {
    const queries = [{
      where: {
        config: '07d54b5c-78d0-4315-9ffc-581a4afa6f6d',
        startDate: { [Op.lte]: fn('NOW') },
      },
      order: [['majorVersion', 'DESC'], ['minorVersion', 'DESC'], ['patchVersion', 'DESC']],
    }, {
      where: {
        config: '07d54b5c-78d0-4315-9ffc-581a4afa6f6d',
        startDate: { [Op.lte]: fn('NOW-XXX') },
      },
      order: [['majorVersion', 'DESC'], ['minorVersion', 'DESC'], ['patchVersion', 'DESC']],
    }, {
      where: {
        config: '07d54b5c-78d0-4315-9ffc-581a4afa6f6d',
        startDate: {},
      },
      order: [['majorVersion', 'DESC'], ['minorVersion', 'DESC'], ['patchVersion', 'DESC']],
    }];
    const hashes = new Set();
    const hashes2 = new Set();
    queries.forEach((q) => hashes.add(md5(SequelizeSimpleCache.key(q))));
    queries.forEach((q) => hashes2.add(md5(SequelizeSimpleCache.key(q))));
    const union = new Set([...hashes, ...hashes2]);
    expect(hashes.size).to.be.equal(queries.length);
    expect(hashes2.size).to.be.equal(queries.length);
    expect(union.size).to.be.equal(queries.length);
  });

  it('should create decorations on model / cached', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    expect(User.noCache).to.be.a('function');
    expect(User.clearCache).to.be.a('function');
    expect(User.clearCacheAll).to.be.a('function');
  });

  it('should create decorations on model / not cached', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ }, { ops: false });
    const User = cache.init(model);
    expect(User.noCache).to.be.a('function');
    expect(User.clearCache).to.be.a('function');
    expect(User.clearCacheAll).to.be.a('function');
  });

  it('should cache result and call database only once', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledOnce).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should cache result and clear cache completely (via cache)', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    cache.clear();
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should cache result and clear cache by model (via cache)', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const model2 = {
      name: 'Page',
      findOne: sinon.stub().resolves({ foo: true }),
    };
    const cache = new SequelizeSimpleCache({ User: {}, Page: {} }, { ops: false });
    const User = cache.init(model);
    const Page = cache.init(model2);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await Page.findOne({ where: { foo: true } });
    expect(cache.size()).to.be.equal(2);
    cache.clear('User');
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ foo: true });
    expect(cache.size()).to.be.equal(1);
  });

  it('should cache result and clear cache by model (via cache) / unknown model name', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const model2 = {
      name: 'Page',
      findOne: sinon.stub().resolves({ foo: true }),
    };
    const cache = new SequelizeSimpleCache({ User: {}, Page: {} }, { ops: false });
    const User = cache.init(model);
    const Page = cache.init(model2);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await Page.findOne({ where: { foo: true } });
    expect(cache.size()).to.be.equal(2);
    cache.clear('Foo');
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ foo: true });
    expect(cache.size()).to.be.equal(2);
  });

  it('should cache result and clear cache by model (via model)', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    User.clearCache();
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should cache result and clear cache completely (via model)', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    User.clearCacheAll();
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should cache but expire after ttl', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: { ttl: 1 } }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    nowOffset = 1200;
    const result3 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
    expect(result3).to.be.deep.equal({ username: 'fred' });
  });

  it('should cache forever', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: { ttl: false } }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    nowOffset = 999999999;
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledOnce).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should not cache a value of `null`', async () => {
    const stub = sinon.stub().resolves(null);
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.equal(null);
    expect(result2).to.be.equal(null);
  });

  it('should not cache a value of `undefined`', async () => {
    const stub = sinon.stub().resolves(undefined);
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.equal(undefined);
    expect(result2).to.be.equal(undefined);
  });

  it('should cache if an additional method was configured', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findFoo: stub,
    };
    const cache = new SequelizeSimpleCache({ User: { methods: ['findFoo'] } }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findFoo({ where: { username: 'fred' } });
    const result2 = await User.findFoo({ where: { username: 'fred' } });
    expect(stub.calledOnce).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should not cache if a method was de-configured', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
      findFoo: async () => {},
    };
    const cache = new SequelizeSimpleCache({ User: { methods: ['findFoo'] } }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should pass on error if db call is rejected', async () => {
    const stub = sinon.stub().rejects(new Error('foo'));
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    try {
      await User.findOne({ where: { username: 'fred' } });
      throw (new Error('bar'));
    } catch (err) {
      expect(stub.calledOnce).to.be.true;
      expect(err).to.have.property('message').to.be.equal('foo');
    }
  });

  it('should bypass cache if model is not configured to be cached', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ Foo: {} }, { ops: false });
    const User = cache.init(model); // TODO: should this issue a warning?
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should bypass cache if query with transaction', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' }, transaction: true });
    const result2 = await User.findOne({ where: { username: 'fred' }, transaction: true });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should bypass cache on model (via model decoration)', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    const result3 = await User.noCache().findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
    expect(result3).to.be.deep.equal({ username: 'fred' });
  });

  it('should bypass unknown function / cached', async () => {
    const stub = sinon.stub().resolves({ foo: true });
    const model = {
      name: 'User',
      foo: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const result = await User.foo();
    expect(stub.calledOnce).to.be.true;
    expect(result).to.be.deep.equal({ foo: true });
  });

  it('should bypass unknown function / not cached', async () => {
    const stub = sinon.stub().resolves({ foo: true });
    const model = {
      name: 'User',
      foo: stub,
    };
    const cache = new SequelizeSimpleCache({ }, { ops: false });
    const User = cache.init(model);
    const result = await User.foo();
    expect(stub.calledOnce).to.be.true;
    expect(result).to.be.deep.equal({ foo: true });
  });

  it('should print debug output if debug=true', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { debug: true, ops: false });
    cache.init(model);
    expect(stubConsoleDebug.called).to.be.true;
  });

  it('should not print debug output if debug=false', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    cache.init(model);
    expect(stubConsoleDebug.called).to.be.false;
  });

  it('should print ops output if ops>0', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { debug: false, ops: 1 });
    cache.init(model);
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1200);
    });
    clearInterval(cache.heart);
    expect(stubConsoleDebug.called).to.be.true;
  });

  it('should not print ops output if ops=false', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { debug: false, ops: false });
    cache.init(model);
    expect(stubConsoleDebug.called).to.be.false;
  });

  it('should work to stub model using Sinon in unit tests / cached / restore pattern 1', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    const stub = sinon.stub(User, 'findOne').resolves({ username: 'foo' });
    const result1 = await User.findOne({ where: { username: 'foo' } });
    const result2 = await User.findOne({ where: { username: 'foo' } });
    expect(result1).to.be.deep.equal({ username: 'foo' });
    expect(result2).to.be.deep.equal({ username: 'foo' });
    expect(stub.calledOnce).to.be.true;
    stub.restore();
  });

  it('should work to stub model using Sinon in unit tests / not cached / restore pattern 1', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ }, { ops: false });
    const User = cache.init(model);
    const stub = sinon.stub(User, 'findOne').resolves({ username: 'foo' });
    const result1 = await User.findOne({ where: { username: 'foo' } });
    const result2 = await User.findOne({ where: { username: 'foo' } });
    expect(result1).to.be.deep.equal({ username: 'foo' });
    expect(result2).to.be.deep.equal({ username: 'foo' });
    expect(stub.calledTwice).to.be.true;
    stub.restore();
  });

  it('should work to stub model using Sinon in unit tests / cached / restore pattern 2', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    sinon.stub(User, 'findOne').resolves({ username: 'foo' });
    const result1 = await User.findOne({ where: { username: 'foo' } });
    const result2 = await User.findOne({ where: { username: 'foo' } });
    expect(result1).to.be.deep.equal({ username: 'foo' });
    expect(result2).to.be.deep.equal({ username: 'foo' });
    expect(User.findOne.calledOnce).to.be.true;
    User.findOne.restore();
  });

  it('should work to stub model using Sinon in unit tests / not cached / restore pattern 2', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ }, { ops: false });
    const User = cache.init(model);
    sinon.stub(User, 'findOne').resolves({ username: 'foo' });
    const result1 = await User.findOne({ where: { username: 'foo' } });
    const result2 = await User.findOne({ where: { username: 'foo' } });
    expect(result1).to.be.deep.equal({ username: 'foo' });
    expect(result2).to.be.deep.equal({ username: 'foo' });
    expect(User.findOne.calledTwice).to.be.true;
    User.findOne.restore();
  });

  it('should throw error if model is wrongly mocked', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    sinon.stub(User, 'findOne').returns({ username: 'foo' }); // should be `resolves`
    User.findOne({ where: { username: 'foo' } })
      .should.be.rejectedWith(Error, 'User.findOne() did not return a promise but should');
  });

  it('should ensure limit is not exceeded', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ User: { limit: 3 } }, { ops: false });
    const User = cache.init(model);
    await User.findOne({ where: { username: 'john' } });
    await User.findOne({ where: { username: 'jim' } });
    await User.findOne({ where: { username: 'bob' } });
    expect(cache.size()).to.be.equal(3);
    await User.findOne({ where: { username: 'ron' } });
    expect(cache.size()).to.be.equal(3);
  });

  it('should automatically clear cache on create (default)', async () => {
    const stub = sinon.stub().resolves([{ username: 'fred' }]);
    const model = {
      name: 'User',
      findAll: stub,
      create: () => {},
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    await User.findAll();
    User.create({ username: 'jim-bob' });
    await User.findAll();
    expect(stub.calledTwice).to.be.true;
  });

  it('should automatically clear cache on update (default)', async () => {
    const stub = sinon.stub().resolves([{ username: 'fred' }]);
    const model = {
      name: 'User',
      findAll: stub,
      update: () => {},
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    await User.findAll();
    User.update();
    await User.findAll();
    expect(stub.calledTwice).to.be.true;
  });

  it('should automatically clear cache on bulkCreate (default)', async () => {
    const stub = sinon.stub().resolves([{ username: 'fred' }]);
    const model = {
      name: 'User',
      findAll: stub,
      bulkCreate: () => {},
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { ops: false });
    const User = cache.init(model);
    await User.findAll();
    User.bulkCreate();
    await User.findAll();
    expect(stub.calledTwice).to.be.true;
  });

  it('should not automatically clear cache on update if clearOnUpdate=false', async () => {
    const stub = sinon.stub().resolves([{ username: 'fred' }]);
    const model = {
      name: 'User',
      findAll: stub,
      update: () => {},
    };
    const cache = new SequelizeSimpleCache({ User: { clearOnUpdate: false } }, { ops: false });
    const User = cache.init(model);
    await User.findAll();
    User.update();
    await User.findAll();
    expect(stub.calledOnce).to.be.true;
  });
});
