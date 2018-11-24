const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const { Op, fn } = require('sequelize');
const SequelizeSimpleCache = require('..');

chai.use(chaiAsPromised);
chai.use(sinonChai);

global.chai = chai;
global.sinon = sinon;
global.expect = chai.expect;
global.should = chai.should();

describe('SequelizeSimpleCache', () => {
  let stubConsoleDebug;

  beforeEach(() => {
    stubConsoleDebug = sinon.stub(console, 'debug');
  });

  afterEach(() => {
    stubConsoleDebug.restore(); // eslint-disable-line no-console
  });

  it('should create cache without crashing / no args', () => {
    expect(() => new SequelizeSimpleCache()).to.not.throw();
  });

  it('should create cache without crashing / empty args', () => {
    expect(() => new SequelizeSimpleCache({})).to.not.throw();
  });

  it('should create cache without crashing / dummy model', () => {
    expect(() => new SequelizeSimpleCache({ User: {} })).to.not.throw();
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
    queries.forEach(q => hashes.add(SequelizeSimpleCache.hash(q)));
    queries.forEach(q => hashes2.add(SequelizeSimpleCache.hash(q)));
    const union = new Set([...hashes, ...hashes2]);
    expect(hashes.size).to.be.equal(queries.length);
    expect(hashes2.size).to.be.equal(queries.length);
    expect(union.size).to.be.equal(queries.length);
  });

  it('should create decorations on model', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} });
    const User = cache.init(model);
    expect(User).to.have.property('noCache').which.is.a('function');
    expect(User).to.have.property('clearCache').which.is.a('function');
    expect(User).to.have.property('clearCacheAll').which.is.a('function');
  });

  it('should cache result and call database only once', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} });
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
    const cache = new SequelizeSimpleCache({ User: {} });
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
    const cache = new SequelizeSimpleCache({ User: {}, Page: {} });
    const User = cache.init(model);
    const Page = cache.init(model2);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await Page.findOne({ where: { foo: true } });
    expect(cache.cache.size).to.be.equal(2);
    cache.clear('User');
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ foo: true });
    expect(cache.cache.size).to.be.equal(1);
  });

  it('should cache result and clear cache by model (via model)', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} });
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
    const cache = new SequelizeSimpleCache({ User: {} });
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
    const cache = new SequelizeSimpleCache({ User: { ttl: 1 } });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    await new Promise(resolve => setTimeout(() => resolve(), 1000));
    const result3 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
    expect(result3).to.be.deep.equal({ username: 'fred' });
  });

  it('should not cache a value of `null`', async () => {
    const stub = sinon.stub().resolves(null);
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} });
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
    const cache = new SequelizeSimpleCache({ User: {} });
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
    const cache = new SequelizeSimpleCache({ User: { methods: ['findFoo'] } });
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
    const cache = new SequelizeSimpleCache({ User: { methods: ['findFoo'] } });
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
    const cache = new SequelizeSimpleCache({ User: {} });
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
    const cache = new SequelizeSimpleCache({ Foo: {} });
    const User = cache.init(model); // TODO: should this issue a warning?
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
  });

  it('should bypass cache on model (via model decoration', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} });
    const User = cache.init(model);
    const result1 = await User.findOne({ where: { username: 'fred' } });
    const result2 = await User.findOne({ where: { username: 'fred' } });
    const result3 = await User.noCache().findOne({ where: { username: 'fred' } });
    expect(stub.calledTwice).to.be.true;
    expect(result1).to.be.deep.equal({ username: 'fred' });
    expect(result2).to.be.deep.equal({ username: 'fred' });
    expect(result3).to.be.deep.equal({ username: 'fred' });
  });

  it('should print debug output if debug=true', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} }, { debug: true });
    cache.init(model);
    expect(stubConsoleDebug.called).to.be.true;
  });

  it('should not print debug output if debug=false', async () => {
    const stub = sinon.stub().resolves({ username: 'fred' });
    const model = {
      name: 'User',
      findOne: stub,
    };
    const cache = new SequelizeSimpleCache({ User: {} });
    cache.init(model);
    expect(stubConsoleDebug.called).to.be.false;
  });

  it('should work to stub model using Sinon in unit tests / pattern 1', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ User: {} });
    const User = cache.init(model);
    const stub = sinon.stub(User, 'findOne').resolves({ username: 'foo' });
    const result1 = await User.findOne({ where: { username: 'foo' } });
    const result2 = await User.findOne({ where: { username: 'foo' } });
    expect(result1).to.be.deep.equal({ username: 'foo' });
    expect(result2).to.be.deep.equal({ username: 'foo' });
    expect(stub.calledOnce).to.be.true;
    stub.restore();
  });

  it('should work to stub model using Sinon in unit tests / pattern 2', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ User: {} });
    const User = cache.init(model);
    sinon.stub(User, 'findOne').resolves({ username: 'foo' });
    const result1 = await User.findOne({ where: { username: 'foo' } });
    const result2 = await User.findOne({ where: { username: 'foo' } });
    expect(result1).to.be.deep.equal({ username: 'foo' });
    expect(result2).to.be.deep.equal({ username: 'foo' });
    expect(User.findOne.calledOnce).to.be.true;
    User.findOne.restore();
  });

  it('should throw error if model is wrongly mocked', async () => {
    const model = {
      name: 'User',
      findOne: async () => ({ username: 'fred' }),
    };
    const cache = new SequelizeSimpleCache({ User: {} });
    const User = cache.init(model);
    sinon.stub(User, 'findOne').returns({ username: 'foo' }); // should be `resolves`
    expect(() => User.findOne({ where: { username: 'foo' } }))
      .to.throw('User.findOne() did not return a promise but should');
  });
});
